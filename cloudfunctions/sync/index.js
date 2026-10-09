// cloudfunctions/sync/index.js
// POST /api/sync —— 从公开榜单拉取真实热搜，写入 trends 表
//
// 来源与字段映射**严格按附录 F「同步提示词模板」**实现，三个平台各一个公开 JSON 接口。
//
// ============================================================
// 一、三个平台的具体来源、必需请求头、字段映射（附录 F）
//
// | 平台 | 接口 | 取数路径 | 标题 | 热度 | 名次 | 必需请求头 |
// |---|---|---|---|---|---|---|
// | 微博 weibo | https://weibo.com/ajax/side/hotSearch | data.realtime[] | word | num | realpos | 桌面 UA + Referer: https://weibo.com/ |
// | B站 bilibili | https://api.bilibili.com/x/web-interface/search/square?limit=50 | data.trending.list[] | keyword | heat_score | 数组下标+1 | 桌面 UA（B站还要 Referer: https://www.bilibili.com/） |
// | 抖音 douyin | https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383 | data.word_list[] | word | hot_value | position | 桌面 UA + Referer: https://www.douyin.com/ |
//
// 附录 F 实测的三个「请求头缺一不可」：
//   · 微博缺 Referer   → 403
//   · B站缺桌面 UA     → 412（B站的经典风控码）
//   · 抖音缺 Referer   → HTTP 200 但列表为空（最坑：不报错，静默返回 0 条）
// 所以每个源的 headers 都按上表原样带齐，且**不用第三方依赖**，只用 Node 18 内置 fetch。
//
// ============================================================
// 二、判重规则（附录 F：(platform, title, date) 唯一）
//
// 同一平台、同一天、同一标题**只保留一条**：已存在就更新热度与名次，不存在才插入。
//
// ⚠️ 本环境的现实约束：trends 表现在只有主键 id(= platform-rank)，
// **没有** (platform,title,date) 唯一索引，也没有 fetched_at 列（Day 17 不改表结构）。
// 因此这里做**等价的应用层 upsert**：
//   ① 先按 (platform, date) 参数化查出当天已有行，按 title 建索引；
//   ② 命中 title → 更新 heat/rank/url；未命中 → 插入新行；
//   ③ 插入若撞上主键（跨天存在相同 platform-rank 的行），**跳过并计数**，不中断整批。
// 若后续授权改表，把上面的应用层判断换成数据库的
//   ON CONFLICT ("platform","title","date") DO UPDATE 即可，语义完全等价。
// 改表 SQL 见 cloudfunctions/README.md「可选增强」。
//
// ============================================================
// 三、不绕过任何反爬 / 登录 / 频率限制
//
// · 只用**无需登录**的公开榜单接口，不抓 HTML、不解析签名参数、不模拟登录态；
// · 不带 Cookie / Authorization，UA 只是常规桌面浏览器标识（访问公开榜单的正常行为）；
// · 单源单次请求、8 秒超时，**失败不重试**（避免对上游形成高频冲击）；
// · 自带 60 秒同步节流：同一平台 60 秒内重复触发直接拒绝（?force=1 可强制，仅限手动补数）；
// · 全部失败 → 返回明确中文说明，**且不动库里已有数据**。
//
// ============================================================
// 四、响应形状（与 /api/hot 一致）
//   成功：{ "ok": true,  "data": { ... }, "count": N }
//   失败：{ "ok": false, "error": "人能看懂的中文说明" }
// ============================================================

"use strict";

// 数据访问层（Day 20 按表拆分）：trends 表的读写都在 shared/trendsRepository.js（复制到 lib/ 下）。
// 本文件只留：上游取数（HTTP）、字段映射、判重决策（业务）、节流策略。
const trendsRepository = require("./lib/trendsRepository");

// 桌面 UA：三个源都必需（B站缺它直接 412）
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 各平台配置：接口、请求头、取数路径与字段映射都集中在这里，改源只动这张表
const SOURCES = {
  weibo: {
    name: "微博",
    url: "https://weibo.com/ajax/side/hotSearch",
    headers: { Referer: "https://weibo.com/" },
    // 返回 data.realtime[]，字段 word / num / realpos
    pickList: function (json) {
      const list = json && json.data && json.data.realtime;
      return Array.isArray(list) ? list : [];
    },
    mapItem: function (it, i) {
      return {
        title: String(it.word || "").trim(),
        heat: it.num,
        rank: Number(it.realpos) > 0 ? Number(it.realpos) : i + 1,
        url: "https://s.weibo.com/weibo?q=" + encodeURIComponent("#" + (it.word || "") + "#"),
      };
    },
  },
  bilibili: {
    name: "B站",
    url: "https://api.bilibili.com/x/web-interface/search/square?limit=50",
    headers: { Referer: "https://www.bilibili.com/" },
    // 返回 data.trending.list[]，字段 keyword / heat_score（没有位置字段，用下标）
    pickList: function (json) {
      const list = json && json.data && json.data.trending && json.data.trending.list;
      return Array.isArray(list) ? list : [];
    },
    mapItem: function (it, i) {
      return {
        title: String(it.keyword || "").trim(),
        heat: it.heat_score,
        rank: i + 1,
        url: "https://search.bilibili.com/all?keyword=" + encodeURIComponent(it.keyword || ""),
      };
    },
  },
  douyin: {
    name: "抖音",
    url: "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383",
    headers: { Referer: "https://www.douyin.com/" },
    // 返回 data.word_list[]，字段 word / hot_value / position
    pickList: function (json) {
      const list = json && json.data && json.data.word_list;
      return Array.isArray(list) ? list : [];
    },
    mapItem: function (it, i) {
      return {
        title: String(it.word || "").trim(),
        heat: it.hot_value,
        rank: Number(it.position) > 0 ? Number(it.position) : i + 1,
        url: "https://www.douyin.com/search/" + encodeURIComponent(it.word || ""),
      };
    },
  },
};

const SUPPORTED = Object.keys(SOURCES); // ['weibo','bilibili','douyin']

function ok(payload) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(Object.assign({ ok: true }, payload)),
  };
}

function fail(statusCode, message) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ok: false, error: message }),
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

// 带超时的 fetch：云函数有 20s 上限，上游卡住必须主动放弃
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

// 热度统一成与既有数据一致的中文单位（'523 万'），纯数字也原样保留
function formatHeat(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, "") + " 亿";
  if (n >= 1e4) return Math.round(n / 1e4) + " 万";
  return String(n);
}

/**
 * 拉一个平台的榜单并归一成 [{rank,title,heat,url}]。
 * 只带附录 F 规定的必需请求头，失败给出能定位原因的中文说明（不重试）。
 */
async function fetchSource(key) {
  const cfg = SOURCES[key];
  const resp = await fetchWithTimeout(
    cfg.url,
    {
      headers: Object.assign(
        { "User-Agent": DESKTOP_UA, Accept: "application/json, text/plain, */*" },
        cfg.headers
      ),
    },
    8000
  );

  if (!resp.ok) {
    // 把附录 F 记录的特征码翻成中文，便于一眼定位
    let hint = "";
    if (key === "bilibili" && resp.status === 412) hint = "（B站风控 412，通常是缺少桌面 UA）";
    if (key === "weibo" && resp.status === 403) hint = "（微博 403，通常是缺少 Referer）";
    throw new Error(cfg.name + "接口返回 HTTP " + resp.status + hint);
  }

  const json = await resp.json();
  const raw = cfg.pickList(json);
  if (!raw.length) {
    // 抖音的典型症状：Referer 缺失时 200 但列表为空
    throw new Error(cfg.name + "接口返回了空列表（可能为风控或字段结构变化）");
  }

  const items = [];
  raw.forEach(function (it, i) {
    const m = cfg.mapItem(it, i);
    if (!m.title) return; // 标题为空的条目直接丢弃
    items.push({
      rank: m.rank,
      title: m.title,
      heat: formatHeat(m.heat),
      url: m.url,
    });
  });

  if (!items.length) throw new Error(cfg.name + "接口没有解析出有效条目");
  return items;
}

/**
 * 应用层 upsert（判重键：platform + title + date，等价于附录 F 的唯一索引约束）。
 * 返回 { inserted, updated, skipped }。
 */
async function upsert(envId, platform, date, items) {
  // ① 取当天该平台已有行（查询在 trendsRepository，参数化，无 SQL 字符串拼接）
  const existing = await trendsRepository.findTrendsByPlatformDate(envId, platform, date);

  const byTitle = {};
  existing.forEach(function (r) {
    byTitle[r.title] = r;
  });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const it of items) {
    const hit = byTitle[it.title];
    if (hit) {
      // ② 命中标题 → 只更新热度/名次/链接，主键与入库时间不动
      const up = await trendsRepository.updateTrend(envId, hit.id, {
        rank: it.rank,
        heat: it.heat,
        url: it.url,
      });
      if (!up.ok) skipped++;
      else updated++;
    } else {
      // ③ 未命中 → 插入
      const ins = await trendsRepository.insertTrend(envId, {
        id: platform + "-" + it.rank,
        platform: platform,
        rank: it.rank,
        title: it.title,
        heat: it.heat,
        url: it.url,
        date: date,
      });
      if (!ins.ok) {
        // 主键撞车（跨天存在相同 platform-rank）时跳过，不让整批失败
        skipped++;
      } else {
        inserted++;
        byTitle[it.title] = { id: platform + "-" + it.rank }; // 防同批次内标题重复
      }
    }
  }

  return { inserted: inserted, updated: updated, skipped: skipped };
}

// 60 秒节流用的「该平台当天最近一次入库时间」——查询本身在 trendsRepository
// （latestTrendCreatedAt），这里直接用它做「要不要打上游」的业务判断。

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
      return fail(400, "请求体不是合法的 JSON");
    }
  }
  body = body || {};

  // ---- 参数校验 ----
  const sourceRaw = body.source;
  let sources;
  if (sourceRaw === undefined || sourceRaw === null || sourceRaw === "") {
    sources = ["weibo"]; // 缺省只同步微博（最稳的一条链路，也避免一次请求打三个上游）
  } else if (SUPPORTED.indexOf(String(sourceRaw)) === -1) {
    return fail(400, "不支持的来源，目前只支持：" + SUPPORTED.join(" / "));
  } else {
    sources = [String(sourceRaw)];
  }

  const date =
    body.date === undefined || body.date === null || body.date === ""
      ? todayInBeijing()
      : String(body.date);
  if (!isValidDate(date)) {
    return fail(400, "date 格式不对，应该写成 YYYY-MM-DD，例如 2026-10-06");
  }

  const force = body.force === true || body.force === 1 || body.force === "1";

  const detail = [];

  for (const source of sources) {
    const cfg = SOURCES[source];

    // ---- 频率自我保护：同一平台 60 秒内不重复打上游 ----
    if (!force) {
      const last = await trendsRepository.latestTrendCreatedAt(envId, source, date);
      if (last && Date.now() - last < 60 * 1000) {
        detail.push({
          source: source,
          status: "skipped",
          reason: "距上次同步不足 60 秒，已跳过（如需强制请传 force=1）",
        });
        continue;
      }
    }

    try {
      const items = await fetchSource(source);
      const saved = await upsert(envId, source, date, items);
      detail.push(
        Object.assign({ source: source, name: cfg.name, status: "ok", fetched: items.length }, saved)
      );
    } catch (err) {
      // 单个源失败不影响其它源；库里已有数据保持原样
      detail.push({
        source: source,
        name: cfg.name,
        status: "failed",
        reason: String((err && err.message) || err),
      });
    }
  }

  const failed = detail.filter(function (d) {
    return d.status === "failed";
  });
  const total = detail.reduce(function (n, d) {
    return n + (d.inserted || 0) + (d.updated || 0);
  }, 0);

  if (failed.length === detail.length) {
    return fail(502, "数据源暂不可用：" + failed.map(function (d) { return d.reason; }).join("；"));
  }

  return ok({
    data: { date: date, detail: detail, changed: total },
    count: total,
  });
};
