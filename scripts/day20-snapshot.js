// scripts/day20-snapshot.js —— Day 20 重构的「重构前/后」逐字节对比回归
//
// 用法（Git Bash）：
//   node scripts/day20-snapshot.js before   # 部署重构前代码时抓基线
//   node scripts/day20-snapshot.js after    # 部署重构后代码时重放，并逐项与基线对比
//
// 原理：
//   13 个「确定性」请求（同样输入必出同样输出，且不产生新写入）各存一份响应原文；
//   after 阶段逐项对比 HTTP 状态码 + 响应体，任何一项不一致就退出码 1。
//   唯一的写库动作发生在 before 之前的「准备步」：固定幂等键 day20-regression-01 建一行（见 README §9）。
//
// 注意：case 08 依赖 fav-idem-day20-regression-01 这一行已存在（准备步建好），
//       两个阶段都应返回 200 + 同一条数据；若返回 201/409 说明前置数据被动过，对比会失败——这是故意的。

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENV = JSON.parse(fs.readFileSync(path.join(ROOT, "cloudbaserc.json"), "utf8")).envId;
const BASE = "https://" + ENV + ".service.tcloudbase.com";
const OUT = path.join(ROOT, "tmp", "day20-regression");
const HEADERS = { Referer: BASE + "/", "Content-Type": "application/json" };

// 13 个确定性用例：正常分支 + 关键错误分支，全部不产生新写入
//
// ignore：对比时要剔除的**时钟字段**（每次请求必然不同，不算行为变化）。
//   health 的 time 是服务器当前时间；它在本次重构里一个字都没改，剔除后其余字段必须一致。
const CASES = [
  { id: "01-health", method: "GET", path: "/api/health", ignore: ["time"] },
  { id: "02-hot-2026-10-06", method: "GET", path: "/api/hot?date=2026-10-06" },
  { id: "03-hot-bad-date-400", method: "GET", path: "/api/hot?date=not-a-date" },
  { id: "04-favorites-list", method: "GET", path: "/api/favorites" },
  {
    id: "05-fav-dup-409", method: "POST", path: "/api/favorites",
    body: { trendId: "baidu-2", title: "重复收藏探测", platform: "baidu" },
  },
  {
    id: "06-fav-missing-400", method: "POST", path: "/api/favorites",
    body: { trendId: "baidu-5", platform: "baidu" },
  },
  {
    id: "07-fav-trend-404", method: "POST", path: "/api/favorites",
    body: { trendId: "weibo-9999", title: "不存在", platform: "weibo" },
  },
  {
    id: "08-fav-idem-200", method: "POST", path: "/api/favorites",
    headers: { "Idempotency-Key": "day20-regression-01" },
    body: { trendId: "baidu-4", title: "年轻人婚礼 不早起不请司仪不办仪式", platform: "baidu", note: "Day 20 回归固定行" },
  },
  { id: "09-fav-put-405", method: "PUT", path: "/api/favorites", body: {} },
  { id: "10-sync-bad-source-400", method: "POST", path: "/api/sync", body: { source: "not-a-source" } },
  { id: "11-episodes", method: "GET", path: "/api/drama/episodes" },
  { id: "12-episodes-bad-limit-400", method: "GET", path: "/api/drama/episodes?limit=abc" },
  { id: "13-watch-logs", method: "GET", path: "/api/drama/watch-logs" },
];

async function callOne(c) {
  const headers = Object.assign({}, HEADERS, c.headers || {});
  const resp = await fetch(BASE + c.path, {
    method: c.method,
    headers: headers,
    body: c.body === undefined ? undefined : JSON.stringify(c.body),
  });
  const text = await resp.text();
  return { status: resp.status, text: text };
}

function pretty(c, r) {
  let body = r.text;
  try {
    body = JSON.stringify(JSON.parse(r.text), null, 1);
  } catch (e) { /* 非 JSON 原样存 */ }
  return "HTTP " + r.status + "\n" + body + "\n";
}

/**
 * 对比前的归一化：把声明要忽略的时钟字段删掉再比。
 * 例如 /api/health 返回体里的 time 是服务器当前时间，两次请求必然不同，不属于行为变化。
 */
function normalizeForCompare(text, ignoreKeys) {
  if (!ignoreKeys || !ignoreKeys.length) return text;
  try {
    const json = JSON.parse(text.replace(/^HTTP \d+\n/, ""));
    ignoreKeys.forEach(function (k) {
      if (json && typeof json === "object" && json.data && typeof json.data === "object") delete json.data[k];
      if (json && typeof json === "object") delete json[k];
    });
    return JSON.stringify(json, null, 1);
  } catch (e) {
    return text;
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "before" && mode !== "after") {
    console.error("用法：node scripts/day20-snapshot.js before|after");
    process.exit(2);
  }
  const dir = path.join(OUT, mode);
  fs.mkdirSync(dir, { recursive: true });

  console.log("Day 20 回归快照 · " + mode + " · 目标：" + BASE + "\n");
  const captured = [];
  for (const c of CASES) {
    const r = await callOne(c);
    fs.writeFileSync(path.join(dir, c.id + ".txt"), pretty(c, r), "utf8");
    captured.push({ id: c.id, status: r.status, bytes: r.text.length });
    console.log("  " + c.id.padEnd(28) + "HTTP " + r.status + "  " + r.text.length + " B");
  }

  if (mode === "before") {
    console.log("\n基线已存：" + dir);
    return;
  }

  // ---- after：逐项对比 ----
  const beforeDir = path.join(OUT, "before");
  if (!fs.existsSync(beforeDir)) {
    console.error("\n找不到基线目录 " + beforeDir + "，先跑 before");
    process.exit(2);
  }
  console.log("\n—— 与重构前基线逐项对比 ——");
  let diffCount = 0;
  for (const c of CASES) {
    const a = normalizeForCompare(fs.readFileSync(path.join(beforeDir, c.id + ".txt"), "utf8"), c.ignore);
    const b = normalizeForCompare(fs.readFileSync(path.join(dir, c.id + ".txt"), "utf8"), c.ignore);
    const same = a === b;
    if (!same) diffCount++;
    const note = c.ignore ? "（已剔除时钟字段 " + c.ignore.join("/") + "）" : "";
    console.log("  " + (same ? "一致 ✓  " : "不一致 ✗ ") + c.id + note + (same ? "" : "  ← 重构前后返回不同！"));
  }
  console.log(
    "\n结果：" + (CASES.length - diffCount) + " 一致 / " + diffCount + " 不一致（共 " + CASES.length + " 项）" +
    (diffCount === 0 ? "  行为零变化 ✅" : "  ⚠️ 有行为变化，禁止收尾！")
  );
  if (diffCount > 0) process.exit(1);
}

main().catch(function (err) {
  console.error("快照脚本自身出错：" + String((err && err.message) || err));
  process.exit(1);
});
