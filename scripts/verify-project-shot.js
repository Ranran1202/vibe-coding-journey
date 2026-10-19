// scripts/verify-project-shot.js
// 读取 tmp/vp-records.txt（verify-project.sh 的逐项记录），渲染取证页：
//   tmp/verify-project-shot.html —— 发布前检查结果（每项 PASS/FAIL + 通过标准 + 证据）
// 用法：先 bash scripts/verify-project.sh，再 node scripts/verify-project-shot.js
// 取证页用无头 Edge 截图，即「发布前检查跑出来的结果」那张证据图。
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const US = String.fromCharCode(31);

const recs = fs
  .readFileSync(path.join(ROOT, "tmp", "vp-records.txt"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split(US));

const metaRec = recs.find((r) => r[0] === "META") || [];
const items = recs.filter((r) => r[0] !== "META" && r.length >= 5);
// META 字段：META / 时间 / 套件 / 接口基址(打码) / 静态托管(打码) / PASS / FAIL / 未执行 / 已知待修项
const meta = {
  time: metaRec[1] || "",
  suite: metaRec[2] || "",
  api: metaRec[3] || "",
  staticHost: metaRec[4] || "",
  pass: metaRec[5] || "0",
  fail: metaRec[6] || "0",
  skip: metaRec[7] || "0",
  known: metaRec[8] || "",
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLE = `
body{font-family:system-ui,"Microsoft YaHei",sans-serif;margin:24px;color:#1f2937;background:#f8fafc}
h1{font-size:22px;margin:0 0 4px} .sub{color:#64748b;margin:0 0 18px;font-size:13px}
.summary{display:flex;gap:14px;margin:14px 0 20px}
.pill{border:1px solid #e2e8f0;border-radius:10px;background:#fff;padding:10px 18px;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.pill b{font-size:22px;margin-right:6px}
.pill.pass b{color:#15803d} .pill.fail b{color:#b91c1c} .pill.skip b{color:#a16207}
.card{border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:12px 0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.card.fail{border-color:#fca5a5;background:#fff7f7}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:2px 10px;border-radius:999px;margin-right:10px;vertical-align:middle}
.badge.PASS{background:#dcfce7;color:#15803d} .badge.FAIL{background:#fee2e2;color:#b91c1c}
.badge.未执行{background:#fef9c3;color:#a16207}
.name{font-weight:600;font-size:15px}
.row{font-size:13px;margin-top:8px}
.row .k{display:inline-block;min-width:76px;color:#64748b;font-weight:600}
.ev{font-family:Consolas,monospace;font-size:12px;color:#374151;white-space:pre-wrap;word-break:break-all}
.known{font-size:12px;color:#a16207;margin-top:4px}
.concl{font-size:14px;font-weight:700;margin:16px 0 6px}
.concl.ok{color:#15803d} .concl.bad{color:#b91c1c}
.note{font-size:12px;color:#64748b;margin-top:6px}
`;

const cards = items
  .map((r) => {
    const [id, status, name, criteria, evidence] = r;
    return `<div class="card ${status === "FAIL" ? "fail" : ""}">
  <div><span class="badge ${status}">${status}</span><span class="name">${esc(id)} ${esc(name)}</span></div>
  <div class="row"><span class="k">通过标准</span>${esc(criteria)}</div>
  <div class="row"><span class="k">证据</span><span class="ev">${esc(evidence)}</span></div>
</div>`;
  })
  .join("\n");

const knownNote =
  meta.known && meta.fail !== "0"
    ? `<p class="known">已知待修项（Day 24 记录，修复后该项转绿）：${esc(meta.known)}</p>`
    : meta.known
      ? `<p class="known">已知待修项（Day 24 记录）：${esc(meta.known)}</p>`
      : "";

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
<h1>verify-project · 发布前检查结果</h1>
<p class="sub">运行时间 ${esc(meta.time)} ｜ 套件 ${esc(meta.suite)} ｜ 接口基址 ${esc(meta.api)} ｜ 静态托管 ${esc(meta.staticHost)}（环境 ID 已打码）</p>
<div class="summary">
  <div class="pill pass"><b>${esc(meta.pass)}</b>PASS</div>
  <div class="pill fail"><b>${esc(meta.fail)}</b>FAIL</div>
  <div class="pill skip"><b>${esc(meta.skip)}</b>未执行</div>
</div>
${cards}
<p class="concl ${meta.fail === "0" ? "ok" : "bad"}">${meta.fail === "0" ? "结论：无 FAIL，可以发布（退出码 0）" : "结论：有 " + esc(meta.fail) + " 项 FAIL，先修再发（退出码 1）"}</p>
${knownNote}
<p class="note">每项证据均为脚本实测值（HTTP 码 / count / source / error 原文），无模糊表述。执行体：scripts/verify-project.sh ｜ 定义：.workbuddy/skills/verify-project/SKILL.md</p>
</body></html>`;

const out = path.join(ROOT, "tmp", "verify-project-shot.html");
fs.writeFileSync(out, html, "utf8");
console.log("已生成 " + path.relative(ROOT, out) + "（PASS " + meta.pass + " · FAIL " + meta.fail + " · 未执行 " + meta.skip + "）");
