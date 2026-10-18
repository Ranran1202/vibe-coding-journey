// scripts/day23-verify.js
// Day 23 安全审计验证脚本（两条线）：
//   Part 1 密钥取证：工作区 + git 全历史搜索特征词，人工规则分类「真密钥 vs 误报」；
//          另查 .env 跟踪/忽略状态、环境 ID 在被跟踪文件中的残留。
//   Part 2 三类错误实测：
//          ① 用户输入错 400 —— 公网真实请求（hot 的 date、episodes 的 limit）；
//          ② 记录不存在 404 —— 公网真实请求（favorites PATCH / watch-logs DELETE）；
//          ③ 服务端错 500 / 上游错 502 —— 本地注入故障（mock SDK + mock fetch），
//             验证「用户看到通用人话、原文只进日志」。
// 产出：tmp/day23-secret-scan.json + .html（截图1用）、tmp/day23-error-classes.json + .html（截图2用）。
// ⚠️ 所有对外文本中的环境 ID 一律打码成 <env-id>，截图不进仓库泄露。

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "tmp");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const envId = require(path.join(ROOT, "cloudbaserc.json")).envId;
const BASE = "https://" + envId + ".service.tcloudbase.com";
const BASE_MASKED = "https://<env-id>.service.tcloudbase.com";

function save(name, obj) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2));
}
function mask(s) {
  return String(s).split(envId).join("<env-id>");
}
function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return e.stdout || ""; // git grep 无命中时退出码为 1，stdout 仍可取
  }
}

// ============================================================
// Part 1 密钥取证
// ============================================================
const SECRET_PATTERN =
  "password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|AKID|credential";
const CONN_PATTERN = "(postgres|postgresql|mysql|mongodb|redis|amqp)://[^/ ]*:[^/ ]*@";

// 「像真密钥」的判定：行里出现 20 位以上的高熵串 / 云密钥前缀 / 带凭据连接串
function looksLikeSecret(line) {
  return (
    /AKID[0-9A-Za-z]{16,}/.test(line) ||
    /sk-[A-Za-z0-9]{16,}/.test(line) ||
    /(postgres|postgresql|mysql|mongodb|redis|amqp):\/\/[^/ :\s]+:[^/ @\s]+@/.test(line) ||
    /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'][^"'\s]{20,}["']/i.test(line) ||
    /Bearer\s+[A-Za-z0-9._-]{20,}/.test(line)
  );
}

function classify(raw) {
  const lines = String(raw).split("\n").filter(Boolean);
  const benign = [];
  const suspicious = [];
  lines.forEach(function (l) {
    const file = l.replace(/^[0-9a-f]+:/, "").split(":")[0];
    if (looksLikeSecret(l)) suspicious.push(mask(l).slice(0, 160));
    else benign.push(mask(l).slice(0, 160));
  });
  return { total: lines.length, benign: benign, suspicious: suspicious };
}

const workTree = classify(run('git grep -n -I -E "' + SECRET_PATTERN + '"'));
const revs = run("git rev-list --all").trim().split(/\s+/).filter(Boolean);
const history = classify(run('git grep -n -I -E "' + SECRET_PATTERN + '" ' + revs.join(" ")));
const connWork = String(run('grep -rn -I -E "' + CONN_PATTERN + '" . --exclude-dir=.git 2>/dev/null')).trim();

// .env 与忽略规则
const envTracked = run("git ls-files").split("\n").filter(function (f) { return /(^|\/)\.env$/.test(f); });
const envIgnore = run("git check-ignore .env ai-drama/.env .env.production").trim().split("\n").filter(Boolean);
const rcIgnore = run("git check-ignore cloudbaserc.json").trim();

// 环境 ID 在被跟踪文件中的残留（修复后应为 0）
const envIdResidual = run('git grep -l "' + envId + '"').trim().split("\n").filter(Boolean);

const secretScan = {
  generatedAt: new Date().toISOString(),
  patterns: SECRET_PATTERN,
  workTree: workTree,
  history: { commitsSearched: revs.length, total: history.total, benign: history.benign, suspicious: history.suspicious },
  connectionStrings: connWork ? connWork.split("\n") : [],
  envFile: { tracked: envTracked, ignored: envIgnore, cloudbasercIgnored: Boolean(rcIgnore) },
  envIdResidualInTrackedFiles: envIdResidual,
  verdict: {
    realSecrets: workTree.suspicious.length + history.suspicious.length,
    note: "特征词命中逐条过「像真密钥」规则；命中项全部为文档/规则行/提示词术语，判误报",
  },
};
save("day23-secret-scan.json", secretScan);

// ============================================================
// Part 2 三类错误实测
// ============================================================
async function call(method, urlPath, body) {
  const r = await fetch(BASE + urlPath, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* 保持 null */ }
  return { method: method, path: mask(urlPath), status: r.status, body: json };
}

// ---- 本地注入故障：mock @cloudbase/node-sdk（真实错误路径，不留调试后门）----
let DB_MODE = "throw"; // throw = 数据库故障；empty = 查无数据
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@cloudbase/node-sdk") {
    return {
      init: function () {
        return {
          rdb: function () {
            return {
              from: function () {
                const chain = {};
                ["select", "eq", "order", "limit", "insert", "update", "delete", "single"].forEach(function (m) {
                  chain[m] = function () { return chain; };
                });
                // PostgREST 形状：{data, error}；error 非空时 Repository 会抛中文 Error
                chain.then = function (onFulfilled, onRejected) {
                  const value =
                    DB_MODE === "throw"
                      ? { data: null, error: { message: "Simulated DB failure: connection reset by peer" } }
                      : { data: [], error: null };
                  return Promise.resolve(value).then(onFulfilled, onRejected);
                };
                return chain;
              },
            };
          },
        };
      },
    };
  }
  return origLoad.apply(this, arguments);
};

// 捕获 console.error：证明「原文只进日志、不进响应」
const loggedErrors = [];
const origError = console.error;
console.error = function () {
  loggedErrors.push(Array.prototype.join.call(arguments, " "));
};

async function main() {
  const result = { generatedAt: new Date().toISOString(), base: BASE_MASKED, cases: [], logs: [] };

  // ① 用户输入错（公网实测）
  result.cases.push({ cls: "输入错 400", title: "date 写成 13-45（hot）", live: await call("GET", "/api/hot?date=13-45") });
  result.cases.push({ cls: "输入错 400", title: "limit=abc（drama-episodes）", live: await call("GET", "/api/drama/episodes?limit=abc") });
  result.cases.push({ cls: "输入错 400", title: "progress=999（watch-logs，公网实测）", live: await call("PATCH", "/api/drama/watch-logs/log-no-such-999", { progress: 999 }) });

  // ② 记录不存在（公网实测）
  result.cases.push({ cls: "不存在 404", title: "PATCH 不存在的收藏 id", live: await call("PATCH", "/api/favorites/fav-no-such-999", { note: "x" }) });
  result.cases.push({ cls: "不存在 404", title: "DELETE 不存在的观看记录 id", live: await call("DELETE", "/api/drama/watch-logs/log-no-such-999") });

  // ③ 服务端错 500（本地 mock：数据库故障）
  DB_MODE = "throw";
  const hot = require(path.join(ROOT, "cloudfunctions/hot/index.js"));
  const r500 = await hot.main({ httpMethod: "GET", queryStringParameters: { date: "2026-10-16" } }, { namespace: "mock-env" });
  result.cases.push({
    cls: "服务端错 500",
    title: "数据库故障（mock 注入：connection reset by peer）",
    live: null,
    mocked: { status: r500.statusCode, body: JSON.parse(r500.body) },
  });

  // ③ 上游错 502（本地 mock：全部数据源网络失败）
  DB_MODE = "empty";
  const sync = require(path.join(ROOT, "cloudfunctions/sync/index.js"));
  const realFetch = globalThis.fetch;
  globalThis.fetch = function () {
    return Promise.reject(new Error("Simulated upstream failure: connect ETIMEDOUT 1.2.3.4:443"));
  };
  const r502 = await sync.main({ source: "weibo", date: "2026-10-16", force: true }, { namespace: "mock-env" });
  globalThis.fetch = realFetch;
  result.cases.push({
    cls: "上游错 502",
    title: "全部数据源不可达（mock 注入：connect ETIMEDOUT）",
    live: null,
    mocked: { status: r502.statusCode, body: JSON.parse(r502.body) },
  });

  // 响应体绝不出现英文原文 / 堆栈关键词
  const leakWords = ["Simulated", "ETIMEDOUT", "connection reset", "Error:", "at async"];
  result.leakCheck = result.cases.map(function (c) {
    const bodyText = c.live ? JSON.stringify(c.live.body) : c.mocked ? JSON.stringify(c.mocked.body) : "";
    const hits = leakWords.filter(function (w) { return bodyText.indexOf(w) !== -1; });
    return { title: c.title, leaked: hits };
  });
  result.logs = loggedErrors.map(function (l) { return mask(l).slice(0, 300); });

  save("day23-error-classes.json", result);

  // 断言汇总（退出码非 0 即验证失败）
  const failures = [];
  result.cases.forEach(function (c) {
    const resp = c.live || c.mocked;
    if (!resp) return;
    let expected;
    if (c.cls.indexOf("400") !== -1) expected = 400;
    else if (c.cls.indexOf("404") !== -1) expected = 404;
    else if (c.cls.indexOf("500") !== -1) expected = 500;
    else expected = 502;
    if (resp.status !== expected) failures.push(c.title + " 期望 " + expected + " 实得 " + resp.status);
    if (!resp.body || resp.body.ok !== false || resp.body.data !== null || typeof resp.body.error !== "string") {
      failures.push(c.title + " 响应形状不符 {ok:false,data:null,error:string}");
    }
    if (!/[\u4e00-\u9fa5]/.test(resp.body.error || "")) failures.push(c.title + " error 不是中文");
  });
  result.leakCheck.forEach(function (l) {
    if (l.leaked.length) failures.push(l.title + " 响应体泄漏原文：" + l.leaked.join(","));
  });
  if (secretScan.verdict.realSecrets !== 0) failures.push("发现疑似真实密钥 " + secretScan.verdict.realSecrets + " 处");
  if (envIdResidual.length) failures.push("被跟踪文件仍含环境 ID：" + envIdResidual.join(","));

  console.error = origError;
  console.log("===== Day 23 验证汇总 =====");
  console.log("密钥：真实密钥 " + secretScan.verdict.realSecrets + " 处（工作区特征词命中 " + secretScan.workTree.total + " 处全部误报，历史命中 " + secretScan.history.total + " 行全部误报）");
  console.log("环境 ID 残留：" + (envIdResidual.length ? envIdResidual.join(",") : "0 个文件"));
  console.log(".env 被跟踪：" + (envTracked.length ? envTracked.join(",") : "无") + "；忽略规则命中 " + envIgnore.length + " 条");
  result.cases.forEach(function (c) {
    const resp = c.live || c.mocked;
    console.log((resp ? resp.status : "??") + "  " + c.cls + "  " + c.title + "  →  " + (resp && resp.body ? resp.body.error : ""));
  });
  console.log("日志捕获 " + result.logs.length + " 条（原文只进日志的证明）");
  if (failures.length) {
    console.log("FAIL:\n" + failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("ALL PASS");
  }
}

main().catch(function (e) {
  console.error = origError;
  console.error("验证脚本异常：" + String((e && e.stack) || e));
  process.exitCode = 1;
});
