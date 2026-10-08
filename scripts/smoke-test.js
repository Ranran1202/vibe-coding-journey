// scripts/smoke-test.js —— 全接口回归（冒烟测试）
//
// 干什么：把已经上线的 7 个接口的**正常分支 + 关键错误分支**全部打一遍，断言返回，
//         用来证明「重构之后，对外行为一个都没变」。
//
// 怎么用（Git Bash，tcb 不在 PATH 里也无所谓，这个脚本不需要 tcb）：
//   node scripts/smoke-test.js
//
// 约定：
//   · 环境 ID 从本地 cloudbaserc.json 读（不写死、不进仓库）；
//   · **不写业务数据**：唯一会写库的是 /api/favorites 的新增收藏（写入 baidu-2 一条），
//     它带固定幂等键，重复跑第二次会命中判重返回 409 —— 两种结果都算通过，所以脚本可反复运行；
//   · **不触发真实同步**：/api/sync 只测「非法来源 → 400」这条分支。
//     原因：真实同步会按「先删当日旧数据再插入」执行，而 favorites 上的外键还是
//     ON DELETE CASCADE（Day 17 遗留），会把指向这些热搜的收藏连带删掉；
//     等 db/fix_favorites_fk.sql 执行后再放开真同步回归。
//
// 退出码：全部通过 0；有失败 1。

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENV = JSON.parse(fs.readFileSync(path.join(ROOT, "cloudbaserc.json"), "utf8")).envId;
const BASE = "https://" + ENV + ".service.tcloudbase.com";

// CloudBase 测试域名首次访问会弹「确定访问」确认页，带 Referer 可绕过
const HEADERS = { Referer: BASE + "/", "Content-Type": "application/json" };

const results = [];

async function call(method, pathAndQuery, body) {
  const resp = await fetch(BASE + pathAndQuery, {
    method: method,
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }
  return { status: resp.status, json: json, text: text };
}

function check(name, actual, expected, extra) {
  const pass = actual === expected;
  results.push({ name: name, pass: pass, detail: (extra || "") + " 期望 " + expected + "，实际 " + actual });
  console.log(
    (pass ? "  PASS  " : "  FAIL  ") + name.padEnd(46) + (extra || "")
  );
  return pass;
}

async function main() {
  console.log("全接口回归 · 目标环境：" + BASE + "\n");

  // ---- 1. 健康检查（唯一不查库的探针）----
  let r = await call("GET", "/api/health");
  check("GET /api/health", r.status, 200, "service=" + (r.json && r.json.service));
  check("  └ service 标识", r.json && r.json.service, "hot-search-demo");

  // ---- 2. 今日热搜线 · 读 ----
  // 注意：库里最新的真实数据是 2026-10-06，默认查「当天」会是空列表，所以回归固定带日期
  r = await call("GET", "/api/hot?date=2026-10-06");
  check("GET /api/hot?date=2026-10-06", r.status, 200, "count=" + (r.json && r.json.count));
  check("  └ 返回 20 条", r.json && r.json.count, 20);
  const heats = (r.json && r.json.data ? r.json.data : []).map(function (x) {
    return x.heatNum;
  });
  const desc = heats.every(function (v, i) {
    return i === 0 || heats[i - 1] >= v;
  });
  check("  └ 热度倒序", desc, true, "首条=" + heats[0]);

  r = await call("GET", "/api/hot?date=not-a-date");
  check("GET /api/hot 日期非法 → 400", r.status, 400);

  // ---- 3. 今日热搜线 · 收藏读 ----
  r = await call("GET", "/api/favorites");
  const favCountBefore = r.json && r.json.count;
  check("GET /api/favorites", r.status, 200, "count=" + favCountBefore);
  check("  └ ok=true 且 data 是数组", !!(r.json && r.json.ok && Array.isArray(r.json.data)), true);

  // ---- 4. 今日热搜线 · 收藏写（含判重与错误分支）----
  const payload = {
    trendId: "baidu-2",
    title: "回归测试用的一条收藏",
    platform: "baidu",
    note: "smoke-test",
  };
  r = await call("POST", "/api/favorites", payload);
  const firstWrite = r.status;
  check(
    "POST /api/favorites 正常写入",
    firstWrite === 201 || firstWrite === 409 ? true : firstWrite,
    true,
    "HTTP " + firstWrite + (firstWrite === 409 ? "（已存在 → 判重生效，同样算通过）" : "")
  );

  r = await call("POST", "/api/favorites", payload);
  check("POST /api/favorites 重复 → 409", r.status, 409, r.json && r.json.error);

  r = await call("POST", "/api/favorites", { trendId: "baidu-5", platform: "baidu" });
  check("POST /api/favorites 缺字段 → 400", r.status, 400, r.json && r.json.error);

  r = await call("POST", "/api/favorites", {
    trendId: "weibo-9999",
    title: "不存在",
    platform: "weibo",
  });
  check("POST /api/favorites 热搜不存在 → 404", r.status, 404, r.json && r.json.error);

  r = await call("PUT", "/api/favorites", {});
  check("PUT /api/favorites → 405", r.status, 405, r.json && r.json.error);

  // ---- 5. 今日热搜线 · 同步（只测错误分支，原因见文件头）----
  r = await call("POST", "/api/sync", { source: "not-a-source" });
  check("POST /api/sync 来源非法 → 400", r.status, 400, r.json && r.json.error);

  // ---- 6. AI 漫剧线 ----
  r = await call("GET", "/api/drama/episodes");
  check("GET /api/drama/episodes", r.status, 200, "count=" + (r.json && r.json.count));
  check("  └ 返回 6 集", r.json && r.json.count, 6);
  check("  └ 第 1 集 order=1", r.json && r.json.data && r.json.data[0].order, 1);

  r = await call("GET", "/api/drama/episodes?limit=abc");
  check("GET /api/drama/episodes limit 非法 → 400", r.status, 400);

  r = await call("GET", "/api/drama/watch-logs");
  check("GET /api/drama/watch-logs", r.status, 200, "count=" + (r.json && r.json.count));
  check("  └ 返回 6 条", r.json && r.json.count, 6);

  // ---- 汇总 ----
  const failed = results.filter(function (x) {
    return !x.pass;
  });
  console.log(
    "\n结果：" + (results.length - failed.length) + " 通过 / " + failed.length + " 失败（共 " + results.length + " 项）"
  );
  if (failed.length) {
    failed.forEach(function (x) {
      console.log("  FAIL " + x.name + " → " + x.detail);
    });
    process.exit(1);
  }
  console.log("全部通过 ✅");
}

main().catch(function (err) {
  console.error("回归脚本自身出错：" + String((err && err.message) || err));
  process.exit(1);
});
