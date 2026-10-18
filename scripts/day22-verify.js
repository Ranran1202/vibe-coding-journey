// scripts/day22-verify.js —— Day 22 四类操作闭环验证 + 证据生成
//
// 流程：GET 列表 → 取一条未被收藏的热搜 → POST 新增 → PATCH 改备注 → GET 确认新值
//       → DELETE（软删除）→ GET 确认消失 → 落地两个证据 HTML（PATCH 前后对比 / DELETE 前后对比）
//
// 用法（在仓库根目录执行）：
//   node scripts/day22-verify.js
//
// 依赖：Node 22 自带 fetch；环境 ID 从 cloudbaserc.json 读取（不打印）。

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "tmp");
fs.mkdirSync(OUT, { recursive: true });

const envId = require(path.join(ROOT, "cloudbaserc.json")).envId;
const BASE = "https://" + envId + ".service.tcloudbase.com";

function save(name, obj) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2));
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function jblock(obj) {
  return "<pre class='json'>" + esc(JSON.stringify(obj, null, 2)) + "</pre>";
}
function ts() {
  return new Date().toISOString();
}

async function call(method, sub, body) {
  const url = BASE + sub;
  const opts = { method: method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  let json = null;
  try { json = await r.json(); } catch (e) { json = null; }
  return { status: r.status, json: json };
}

async function getFavs() {
  const r = await call("GET", "/api/favorites");
  return r.json && r.json.data ? r.json.data : [];
}
async function getHot() {
  // 当天（2026-10-18）没有同步数据，固定取有数据的 2026-10-16 批次来做 CRUD 演示
  const r = await call("GET", "/api/hot?date=2026-10-16&limit=100");
  return r.json && r.json.data ? r.json.data : [];
}

function buildPatchHtml(steps) {
  const s = steps;
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>
 body{font-family:system-ui,"Microsoft YaHei",sans-serif;margin:24px;color:#1f2937;background:#f8fafc}
 h1{font-size:22px;margin:0 0 4px} .sub{color:#64748b;margin:0 0 18px;font-size:13px}
 .card{border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:14px 0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.04)}
 .tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4338ca;margin-bottom:8px}
 table{border-collapse:collapse;width:100%;margin:10px 0;font-size:14px}
 td,th{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;vertical-align:top}
 th{background:#f1f5f9;width:120px}
 .before{color:#b91c1c} .after{color:#15803d;font-weight:600}
 .ok{color:#15803d;font-weight:700} .json{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;overflow:auto;max-height:320px}
 .note{font-size:12px;color:#64748b;margin-top:6px}
</style></head><body>
<h1>Day 22 证据① · PATCH 修改一条数据生效</h1>
<p class="sub">收藏记录 ${esc(s.favId)} ｜ 时间 ${esc(s.time)} ｜ 环境 ${esc("service.tcloudbase.com")}</p>
<div class="card">
  <span class="tag">改之前</span>
  <table><tr><th>note（修改前）</th><td class="before">${esc(s.noteBefore)}</td></tr></table>
  ${jblock(s.patchResp)}
  <p class="note">PATCH ${esc("/api/favorites/" + s.favId)} 请求体 {"note":"${esc(s.noteAfter)}"} → HTTP ${s.patchStatus}</p>
</div>
<div class="card">
  <span class="tag">改之后</span>
  <table>
    <tr><th>note（修改后）</th><td class="after">${esc(s.noteAfter)}</td></tr>
    <tr><th>updatedAt</th><td>${esc(s.updatedAtAfter)}</td></tr>
  </table>
  ${jblock(s.getAfter)}
  <p class="note">GET /api/favorites 中该条记录的 note 已变为修改后的值 → <span class="ok">PATCH 生效 ✔</span></p>
</div>
</body></html>`;
}

function buildDeleteHtml(steps) {
  const s = steps;
  const present = s.getBefore.data.some(function (x) { return x.id === s.favId; });
  const gone = !s.getAfter.data.some(function (x) { return x.id === s.favId; });
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>
 body{font-family:system-ui,"Microsoft YaHei",sans-serif;margin:24px;color:#1f2937;background:#f8fafc}
 h1{font-size:22px;margin:0 0 4px} .sub{color:#64748b;margin:0 0 18px;font-size:13px}
 .card{border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:14px 0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.04)}
 .tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4338ca;margin-bottom:8px}
 table{border-collapse:collapse;width:100%;margin:10px 0;font-size:14px}
 td,th{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;vertical-align:top}
 th{background:#f1f5f9;width:160px}
 .ok{color:#15803d;font-weight:700} .json{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;overflow:auto;max-height:320px}
 .note{font-size:12px;color:#64748b;margin-top:6px}
 .muted{color:#94a3b8}
</style></head><body>
<h1>Day 22 证据② · DELETE 后该条不再返回</h1>
<p class="sub">收藏记录 ${esc(s.favId)} ｜ 时间 ${esc(s.time)} ｜ 软删除（数据不真删，可恢复）</p>
<div class="card">
  <span class="tag">删除前</span>
  <p>GET /api/favorites 中<b>包含</b>该条（${present ? "<span class='ok'>存在 ✔</span>" : "<span class='muted'>不存在</span>"}）：
    在 ${s.getBefore.count} 条里能找到 id=${esc(s.favId)}</p>
  ${jblock(s.getBefore)}
</div>
<div class="card">
  <span class="tag">删除后</span>
  <p>DELETE ${esc("/api/favorites/" + s.favId)} → HTTP ${s.deleteStatus} ${jblock(s.deleteResp)}</p>
  <p>GET /api/favorites 中<b>已不含</b>该条（${gone ? "<span class='ok'>消失 ✔</span>" : "<span class='muted'>仍在，异常</span>"}）：
     列表从 ${s.getBefore.count} 条变为 ${s.getAfter.count} 条，且找不到 id=${esc(s.favId)}</p>
  ${jblock(s.getAfter)}
</div>
</body></html>`;
}

async function main() {
  const result = { ok: true, steps: {}, errors: [] };
  try {
    // 1) 取一个还没被收藏的热搜，避免业务判重 409
    const favs = await getFavs();
    const favTrendIds = new Set(favs.map(function (f) { return f.trendId; }));
    const hot = await getHot();
    const trend = hot.find(function (t) { return !favTrendIds.has(t.id); });
    if (!trend) throw new Error("找不到未被收藏的热搜用于测试（收藏可能已占满前 100 条）");
    result.steps.pickedTrend = trend;

    // 2) POST 新增（初始备注带明显标记，方便看 PATCH 前后对比）
    const noteBefore = "（初始）待修改的备注";
    const post = await call("POST", "/api/favorites", {
      trendId: trend.id, title: trend.title, platform: trend.platform, note: noteBefore,
    });
    result.steps.post = post;
    if (!post.json || !post.json.ok || post.status !== 201) {
      throw new Error("POST 新增失败：" + JSON.stringify(post));
    }
    const favId = post.json.data.id;
    result.steps.favId = favId;
    save("day22-post.json", post);

    // 3) PATCH 改备注
    const noteAfter = "Day22-已修改备注-测试-" + Date.now().toString().slice(-4);
    const patch = await call("PATCH", "/api/favorites/" + favId, { note: noteAfter });
    result.steps.patch = patch;
    save("day22-patch.json", patch);
    if (!patch.json || !patch.json.ok || patch.status !== 200) {
      throw new Error("PATCH 修改失败：" + JSON.stringify(patch));
    }

    // 4) GET 确认新值
    const getAfter = await call("GET", "/api/favorites");
    result.steps.getAfterPatch = getAfter;
    save("day22-get-after-patch.json", getAfter);
    const patchedRow = (getAfter.json.data || []).find(function (x) { return x.id === favId; });
    if (!patchedRow || patchedRow.note !== noteAfter) {
      throw new Error("PATCH 后 GET 未读到新值");
    }

    // 5) 生成 PATCH 证据 HTML
    const patchHtml = buildPatchHtml({
      favId: favId, time: ts(), noteBefore: noteBefore, noteAfter: noteAfter,
      patchStatus: patch.status, patchResp: patch.json, updatedAtAfter: patchedRow.updatedAt,
      getAfter: getAfter.json,
    });
    fs.writeFileSync(path.join(OUT, "day22-patch.html"), patchHtml);

    // 6) DELETE（软删除）
    const del = await call("DELETE", "/api/favorites/" + favId);
    result.steps.delete = del;
    save("day22-delete.json", del);
    if (!del.json || !del.json.ok || del.status !== 200) {
      throw new Error("DELETE 失败：" + JSON.stringify(del));
    }

    // 7) GET 确认消失（先取删除前的列表用于对比）
    const getBeforeDelete = getAfter; // 删除前最近一次 GET
    const getAfterDelete = await call("GET", "/api/favorites");
    result.steps.getAfterDelete = getAfterDelete;
    save("day22-get-after-delete.json", getAfterDelete);
    const stillThere = (getAfterDelete.json.data || []).some(function (x) { return x.id === favId; });
    if (stillThere) {
      throw new Error("DELETE 后 GET 仍返回该条（异常）");
    }

    // 8) 生成 DELETE 证据 HTML
    const deleteHtml = buildDeleteHtml({
      favId: favId, time: ts(),
      getBefore: getBeforeDelete.json, getAfter: getAfterDelete.json,
      deleteStatus: del.status, deleteResp: del.json,
    });
    fs.writeFileSync(path.join(OUT, "day22-delete.html"), deleteHtml);

    // 把目标 id 留给外层 bash 做「软删除可恢复」的库内核查
    fs.writeFileSync(path.join(OUT, "day22-target-id.txt"), favId);

    result.ok = true;
    result.summary = {
      favId: favId, trendId: trend.id,
      noteBefore: noteBefore, noteAfter: noteAfter,
      patchStatus: patch.status, deleteStatus: del.status,
      countBeforeDelete: getBeforeDelete.json.count, countAfterDelete: getAfterDelete.json.count,
    };
  } catch (err) {
    result.ok = false;
    result.errors.push(String(err && err.message ? err.message : err));
  }
  save("day22-result.json", result);
  console.log(JSON.stringify(result.summary || { ok: false, errors: result.errors }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main();
