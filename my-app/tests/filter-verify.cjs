// my-app/tests/filter-verify.cjs
// Day 12：用 jsdom 加载真实的 my-app，真实驱动「关键词筛选」交互，
// 验证三种情况（有结果 / 无结果 / 清空恢复）并检查可访问性。
// 运行：NODE_PATH=<managed workspace node_modules> node my-app/tests/filter-verify.cjs
// 退出码 0 = 全部通过；非 0 = 有失败项。标准输出即「调用记录」。

const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const APP_DIR = path.resolve(__dirname, "..");
const INDEX = path.join(APP_DIR, "index.html");

// 1) 读取页面，去掉外链 <script src>，改为手动按序注入（避免文件协议加载问题）
let html = fs.readFileSync(INDEX, "utf8");
html = html.replace(/<script[^>]*src=[^>]*><\/script>/g, "");

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://localhost/my-app/",
  pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;

// 2) 按 index.html 中的顺序注入脚本：config -> data -> store -> app
["config.js", "data.js", "store.js", "app.js"].forEach((f) => {
  const code = fs.readFileSync(path.join(APP_DIR, "js", f), "utf8");
  window.eval(code);
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 3) 等 init() 完成 + 数据加载（app.js 内 loadData 用 setTimeout 120ms）
function run() {
  return sleep(350).then(() => {
    const results = [];
    const ok = (name, cond, detail) =>
      results.push({ name, pass: !!cond, detail: detail || "" });

    const list = () => doc.querySelectorAll("#hotList .hot-item");
    const input = doc.getElementById("filterInput");
    const countEl = doc.getElementById("resultCount");
    const setKw = (kw) => {
      input.value = kw;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    };

    // 初始状态（清空恢复后的期望基准）
    const initial = list().length;
    ok("初始渲染全部条目", initial === 5, "当前 " + initial + " 条");

    // 情况一：有结果
    setKw("初雪");
    const r1 = list();
    const r1titles = Array.from(r1).map((li) => li.querySelector(".title").textContent);
    ok(
      "有结果：输入「初雪」后只剩匹配项",
      r1.length >= 1 && r1titles.every((t) => t.indexOf("初雪") !== -1),
      "匹配 " + r1.length + " 条：" + JSON.stringify(r1titles)
    );
    ok("有结果：结果数量已更新", /共\s*1\s*条/.test(countEl.textContent), "数量文本：" + countEl.textContent);

    // 情况二：无结果
    setKw("zzz不存在的关键词");
    const r2 = list();
    const emptyBox = doc.querySelector("#hotList .empty-box");
    ok("无结果：列表为空", r2.length === 0, "当前 " + r2.length + " 条");
    ok(
      "无结果：显示「没有匹配」提示",
      !!emptyBox && emptyBox.textContent.indexOf("没有匹配") !== -1,
      emptyBox ? "提示：" + emptyBox.textContent : "未找到空状态节点"
    );
    ok("无结果：结果数量为 0", /共\s*0\s*条/.test(countEl.textContent), "数量文本：" + countEl.textContent);

    // 情况三：清空恢复
    setKw("");
    const r3 = list();
    ok("清空恢复：恢复全部条目", r3.length === 5, "当前 " + r3.length + " 条");
    ok("清空恢复：结果数量回到总数", /共\s*5\s*条/.test(countEl.textContent), "数量文本：" + countEl.textContent);

    // 可访问性（余力加练）
    const ariaName =
      input.getAttribute("aria-label") ||
      doc.querySelector('label[for="filterInput"]') !== null;
    ok("可访问性：输入框有可访问名称(aria-label 或 label[for])", !!ariaName, "aria-label=" + input.getAttribute("aria-label"));
    ok(
      "可访问性：结果数量带 aria-live=polite",
      countEl && countEl.getAttribute("aria-live") === "polite",
      "aria-live=" + (countEl && countEl.getAttribute("aria-live"))
    );

    return results;
  });
}

run().then((results) => {
  console.log("===== 筛选交互验证（filter-interaction Skill 调用记录）=====");
  let failed = 0;
  results.forEach((r) => {
    const tag = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failed++;
    console.log("[" + tag + "] " + r.name + (r.detail ? "  —— " + r.detail : ""));
  });
  console.log("--------------------------------------------------------");
  console.log("合计 " + results.length + " 项，通过 " + (results.length - failed) + "，失败 " + failed);
  console.log(failed === 0 ? "结论：三种情况 + 可访问性 全部通过 ✅" : "结论：存在失败项 ❌");
  process.exit(failed === 0 ? 0 : 1);
});
