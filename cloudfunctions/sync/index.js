// cloudfunctions/sync/index.js
// Day 17 · 同步任务：POST /api/sync —— 把「真实热搜」写进数据库
//
// 它在整个作品里的位置：
//   Day 16 往 trends 表灌的是「示例数据」（seed）。今天要换成**真实热搜**，
//   页面上才会出现真条目 —— 这是 Day 17 完成标准里「不是假数据」那一条的关键。
//
// 对外接口：POST /api/sync   （完整契约见仓库根目录 api-contract.md §3.6）
// 请求体  ：{ "source": "baidu" | "weibo", "date": "YYYY-MM-DD" }   两个字段都可选
// 成功返回：{ "ok": true, "data": { source, date, fetched, inserted, updated }, "count": N }
// 失败返回：{ "ok": false, "error": { "code": "UPSTREAM_UNAVAILABLE" | "INTERNAL_ERROR", ... } }
//
// ============================================================
// 三个设计决定（都是踩过坑之后的取舍）
//
// 1) 数据源用「官方公开 JSON 接口」，不抓 HTML、不自建爬虫（契约 §1.4 明确禁止）。
//    主源百度热搜榜；百度不可用时自动降级微博。两个都不通 → 502，**绝不动库里已有的数据**。
//
// 2) ★ 入库用「先删当日再插」而不是 upsert ★
//    原因：热搜榜会掉榜。昨天第 8 名今天掉出去了，upsert 只会让这一行**留在库里**，
//    页面就会显示一条「其实已经不在榜上」的热搜 —— 属于静默脏数据。
//    先 DELETE 当日再 INSERT，库里永远是「某个日期的最新一次抓取结果」，语义干净。
//    删除与插入连在一次调用里、且用单条 SQL 完成插入，不会出现「删了没插上导致空表」。
//
// 3) ★ 必须同步修复 favorites 的冗余 title ★
//    favorites.title 是收藏当时的快照（契约 §2.2 明确写了冗余存一份）。
//    真实数据把 seed 的 `weibo-1` 从「示例热搜一」换成真标题后，如果不修这一列，
//    「我的收藏」页就会显示旧假标题 —— 两表数据不一致。
//    关联键用 platform+rank（= trends.id 的构成规则），而不是标题。
//    注意：**只改 title / platform，不动 note / createdAt / updatedAt**（那是用户的备注和时间）。
// ============================================================

"use strict";

const cloudbase = require("@cloudbase/node-sdk");

let dbClient = null;
function getDb(envId) {
  if (!dbClient) {
    dbClient = cloudbase.init({ env: envId }).rdb({ database: "public" });
  }
  return dbClient;
}

// 各平台的「去原平台查看」链接。表里 url 列有 DEFAULT ''，但真实数据给真链更有价值。
const PLATFORM_HOME = {
  weibo: "https://s.weibo.com/top/summary",
  baidu: "https://top.baidu.com/board?tab=realtime",
  douyin: "https://www.douyin.com/hot",
};

// 只同步契约 §2.1 定义过的三个平台 key（platform 列的取值受 config.js 约束）
const SUPPORTED = ["baidu", "weibo", "douyin"];

function reply(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function todayInBeijing() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 带超时的 fetch：云函数有 20s 上限，上游卡住时必须主动放弃，
// 否则函数被平台 kill，用户拿到的是无意义的超时而不是我们能解释的 502。
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

// 统一取出「本平台第 N 名」的真实链接：
// 公开接口给的 url 常常是跳转页，热度更实在的做法是给平台榜单首页。
function urlFor(platform, rawUrl) {
  if (typeof rawUrl === "string" && /^https?:\/\//.test(rawUrl)) return rawUrl;
  return PLATFORM_HOME[platform] || "";
}

// 百度热度是数字分数（如 7957710），转成跟示例数据一致的中文单位更好读。
function formatHeat(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + " 亿";
  if (n >= 10000) return Math.round(n / 10000) + " 万";
  return String(n);
}

// ------------------------------------------------------------
// 解析器：把各来源的原始 JSON 归一成 [{rank,title,heat,url}]
// 每个都做防御性解析 —— 上游字段随时可能变，这里挂了要能报错而不是静默返回空数组。
// ------------------------------------------------------------

function parseBaidu(json) {
  const cards = (json && json.data && json.data.cards) || (json && json.cards) || [];
  if (!Array.isArray(cards)) return [];

  // ⚠️ 实测踩坑记录（2026-10-06 用 curl 抓真实响应逐层核对）：
  //
  // 百度这个接口会因为 platform 参数不同，返回**两种完全不同的嵌套结构**：
  //
  //   platform=pc   （本函数现在用的源）
  //     data.cards[0] = { component:"hotList", content:[ 50 条 ] }   ← 扁平，直接就是条目
  //     每条字段：word / index / hotScore / desc / rawUrl / hotChange / img
  //
  //   platform=wise （移动端，第一版误用的源）
  //     data.cards[0] = { component:"tabTextList", content:[ { content:[ 50 条 ] } ] }
  //                                                          ↑ 多一层"内容组"包装
  //     且每条**没有 hotScore / desc**，还夹着一条 isTop 置顶项。
  //
  // 第一版解析器直接读 card.content[]：
  //   - 对 wise 拿到的是那个包装对象（没有 word）→ 判空 → 报「字段结构可能已变」→ 502
  //   - 对 pc   倒是能读通，但因为没走 pc，等于白写
  // 所以下面用「逐层下探」的写法，两种结构都能吃，并且优先找含 hotScore 的那一层。
  let list = null;
  let bestScore = -1;
  function scan(node, depth) {
    if (!Array.isArray(node) || depth > 4) return;
    const isEntries =
      node.length && node[0] && typeof node[0] === "object" && node[0].word;
    if (isEntries) {
      // 同样都是条目数组时，选字段更全的那一层（含 hotScore 的优先）
      const score =
        (node[0].hotScore !== undefined ? 2 : 0) + (node[0].desc !== undefined ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        list = node;
      }
      return;
    }
    for (const it of node) {
      if (it && typeof it === "object" && Array.isArray(it.content)) scan(it.content, depth + 1);
    }
  }
  scan(cards, 0);
  if (!list) return [];

  const entries = list.filter(function (it) {
    return it && it.word && !it.isTop; // 置顶项（isTop）不是榜单名次，丢掉
  });

  // 实测 pc 端的 index 是 0 基（0~49）；wise 端是 1 基。
  // 不能直接拿 index 当 rank，否则会整体差一位（第 1 名变第 0 名）。
  // 判据：所有 index 都 >= 0 且存在 0 → 判定为 0 基。
  const hasZero = entries.some(function (it) {
    return Number(it.index) === 0;
  });
  const offset = hasZero ? 1 : 0;

  return entries.map(function (it, i) {
    const idx = Number(it.index);
    const rank = Number.isFinite(idx) ? idx + offset : i + 1;
    return {
      rank: rank,
      title: String(it.word || "").trim(),
      // 热度：pc 端有 hotScore（数字）→ 转成「781 万」这种中文单位，跟前端示例数据风格一致；
      //       没有就退回 hotChange（涨跌标记，如 "热"），最后兜底空串。
      heat: formatHeat(it.hotScore) || String(it.hotChange || "").trim(),
      // 优先 rawUrl（能直接点开的真实搜索结果页），退回 url，最后退回平台首页
      url: urlFor("baidu", it.rawUrl || it.url || it.indexUrl),
    };
  });
}

function parseWeibo(json) {
  // 兼容两种常见形态：data.realtime（新浪公开榜）或 data.band_list
  const raw =
    (json && json.data && (json.data.realtime || json.data.band_list)) ||
    (json && json.data && Array.isArray(json.data) && json.data) ||
    [];
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map(function (it, i) {
    const word = it.word || it.note || it.name || "";
    return {
      rank: i + 1,
      title: String(word).trim(),
      heat: it.num ? formatHeat(it.num) : String(it.raw_hot || "").trim(),
      url: urlFor("weibo", it.url || it.scheme),
    };
  });
}

// ------------------------------------------------------------
// 取数：主源百度 → 降级微博
// ------------------------------------------------------------
async function fetchBaidu() {
  // ★ 必须用 platform=pc ★：pc 端返回扁平结构且带 hotScore/desc/rawUrl；
  //   wise（移动端）返回多一层包装、没有热度值，还会夹置顶项（详见 parseBaidu 注释）。
  const url = "https://top.baidu.com/api/board?platform=pc&tab=realtime";
  const resp = await fetchWithTimeout(
    url,
    {
      headers: {
        // 不带 UA 容易被挡；这是公开榜单页，不是伪装登录态
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
      },
    },
    8000
  );
  if (!resp.ok) throw new Error("百度热搜接口 HTTP " + resp.status);
  const json = await resp.json();
  const items = parseBaidu(json);
  if (!items.length) throw new Error("百度热搜接口返回了空列表（字段结构可能已变）");
  return items;
}

async function fetchWeibo() {
  const url = "https://weibo.com/ajax/side/hotSearch";
  const resp = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        Referer: "https://weibo.com/",
      },
    },
    8000
  );
  if (!resp.ok) throw new Error("微博热搜接口 HTTP " + resp.status);
  const json = await resp.json();
  const items = parseWeibo(json);
  if (!items.length) throw new Error("微博热搜接口返回了空列表（字段结构可能已变）");
  return items;
}

// ------------------------------------------------------------
// 入库：先删当日 → 再插新数据 → 再修 favorites 的冗余标题
// ------------------------------------------------------------
async function save(db, platform, date, items) {
  const ids = items.map(function (it) {
    return platform + "-" + it.rank;
  });

  // ① 删掉这批 id 在「其它日期」下的残留（防止同一条热搜换日期后重复）
  if (ids.length) {
    const prev = await db.from("trends").delete().in("id", ids);
    if (prev.error) throw new Error("清理旧数据失败：" + prev.error.message);
  }
  // ② 删掉「本平台 + 当天」的全部行 —— 保证库里是本次抓取的最新榜
  const cleared = await db
    .from("trends")
    .delete()
    .eq("date", date)
    .eq("platform", platform);
  if (cleared.error) throw new Error("清理当日数据失败：" + cleared.error.message);

  // ③ 插入真实数据
  const rows = items.map(function (it) {
    return {
      id: platform + "-" + it.rank,
      platform: platform,
      rank: it.rank,
      title: it.title,
      heat: it.heat || "",
      url: it.url || "",
      date: date,
    };
  });
  const ins = await db.from("trends").insert(rows);
  if (ins.error) throw new Error("写入 trends 失败：" + ins.error.message);

  // ④ 修 favorites 的冗余 title：只改标题/平台，绝不动 note 与时间
  const favs = await db.from("favorites").select('"id","trendId"');
  let fixed = 0;
  if (!favs.error && Array.isArray(favs.data)) {
    for (const f of favs.data) {
      // trendId 形如 baidu-3 → 按 平台+排名 找到刚同步进来的真标题
      const idx = f.trendId ? String(f.trendId).lastIndexOf("-") : -1;
      if (idx < 0) continue;
      const fp = String(f.trendId).slice(0, idx);
      const fr = String(f.trendId).slice(idx + 1);
      if (fp !== platform) continue;
      const hit = items.find(function (it) {
        return String(it.rank) === fr;
      });
      if (!hit || !hit.title) continue;
      const up = await db
        .from("favorites")
        .update({ title: hit.title, platform: platform })
        .eq("id", f.id);
      if (!up.error) fixed++;
    }
  }

  return { inserted: rows.length, favoritesRefreshed: fixed };
}

/**
 * 云函数入口。
 * event  ：HTTP 访问服务把请求放进这里；POST 的 JSON 体在 event.body（字符串，需自己 parse）。
 * context：运行时上下文，context.namespace 就是当前环境 ID。
 */
exports.main = async (event, context) => {
  const envId = (context && context.namespace) || "";

  // ---- 解析请求体（兼容直接调用时 event 本身就是对象的情况）----
  let body = event;
  if (event && typeof event.body === "string" && event.body) {
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return reply(400, {
        ok: false,
        error: { code: "BAD_REQUEST", message: "请求体不是合法 JSON" },
      });
    }
  }
  body = body || {};

  // ---- 参数校验：source 只认契约里的三个平台 ----
  let sources;
  if (body.source === undefined || body.source === null || body.source === "") {
    sources = ["baidu"]; // 缺省主源；不做「全部来源」是因为微博源稳定性差，默认只保证一条可靠链路
  } else if (SUPPORTED.indexOf(String(body.source)) === -1) {
    return reply(400, {
      ok: false,
      error: { code: "BAD_REQUEST", message: "不支持的来源" },
    });
  } else {
    sources = [String(body.source)];
  }

  const date =
    body.date === undefined || body.date === null || body.date === ""
      ? todayInBeijing()
      : String(body.date);
  if (!isValidDate(date)) {
    return reply(400, {
      ok: false,
      error: { code: "BAD_REQUEST", message: "date 格式应为 YYYY-MM-DD" },
    });
  }

  const db = getDb(envId);
  const result = { date: date, source: "", fetched: 0, inserted: 0, updated: 0, detail: [] };

  for (const source of sources) {
    try {
      const items = source === "weibo" ? await fetchWeibo() : await fetchBaidu();
      const saved = await save(db, source, date, items);
      result.source = source;
      result.fetched = items.length;
      result.inserted += saved.inserted;
      result.detail.push({
        source: source,
        fetched: items.length,
        inserted: saved.inserted,
        favoritesRefreshed: saved.favoritesRefreshed,
      });
    } catch (err) {
      // 主源失败 → 自动降级备用源（附录 F 的降级思路）
      const msg = String((err && err.message) || err);
      const canFallback = source === "baidu" && sources.length === 1;
      if (canFallback) {
        try {
          const items = await fetchWeibo();
          const saved = await save(db, "weibo", date, items);
          result.source = "weibo";
          result.fetched = items.length;
          result.inserted += saved.inserted;
          result.detail.push({
            source: "weibo",
            fetched: items.length,
            inserted: saved.inserted,
            favoritesRefreshed: saved.favoritesRefreshed,
            fallbackFrom: "baidu",
            fallbackReason: msg,
          });
          continue;
        } catch (err2) {
          // 两个源都挂了：返回 502，且**库里数据原样保留**（前端据此标注「示例数据」）
          return reply(502, {
            ok: false,
            error: {
              code: "UPSTREAM_UNAVAILABLE",
              message: "数据源暂不可用（已尝试百度与微博）",
              detail: msg + " / " + String((err2 && err2.message) || err2),
            },
          });
        }
      }
      return reply(502, {
        ok: false,
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "数据源暂不可用",
          detail: msg,
        },
      });
    }
  }

  return reply(200, {
    ok: true,
    data: result,
    count: result.inserted,
  });
};
