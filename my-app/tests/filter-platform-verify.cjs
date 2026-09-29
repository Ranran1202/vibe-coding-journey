// my-app/tests/filter-platform-verify.cjs
// 真实加载 my-app（jsdom），验证「关键词搜索 + 平台筛选」组合交互：
// 正常 / 无结果（显示「没有找到相关内容」）/ 清空恢复 三种情况 + 平台单独生效 + 可访问性。
// 运行：NODE_PATH=<managed workspace node_modules> node my-app/tests/filter-platform-verify.cjs
// 退出码 0 = 全部通过；非 0 = 有失败项。

const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const APP_DIR = path.resolve(__dirname, "..");
const INDEX = path.join(APP_DIR, "index.html");

let html = fs.readFileSync(INDEX, "utf8").replace(/<script[^>]*src=[^>]*><\/script>/g, "");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://localhost/my-app/",
  pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;

["config.js", "data.js", "store.js", "app.js"].forEach((f) => {
  window.eval(fs.readFileSync(path.join(APP_DIR, "js", f), "utf8"));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run() {
  return sleep(350).then(() => {
    const results = [];
    const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

    const list = () => doc.querySelectorAll("#hotList .hot-item");
    const input = doc.getElementById("filterInput");
    const countEl = doc.getElementById("resultCount");
    const setKw = (kw) => {
      input.value = kw;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    };
    const clickTab = (name) => {
      const tabs = Array.from(doc.querySelectorAll("#platformTabs .tab"));
      const t = tabs.find((b) => b.textContent.trim() === name);
      if (t) t.click();
      return !!t;
    };

    // 基准：初始完整列表
    const initial = list().length;
    ok("正常：初始渲染出条目", initial > 0, "共 " + initial + " 条");
    ok("正常：结果数量显示总数", new RegExp("共\\s*" + initial + "\\s*条").test(countEl.textContent), "数量：" + countEl.textContent);

    // 情况一：有结果（关键词）
    setKw("初雪");
    const r1 = list();
    const t1 = Array.from(r1).map((li) => li.querySelector(".title").textContent);
    ok("有结果：关键词「初雪」只留匹配项", r1.length >= 1 && t1.every((x) => x.indexOf("初雪") !== -1), "匹配 " + r1.length + " 条：" + JSON.stringify(t1));

    // 平台筛选单独生效（用数据层交叉验证数量）
    setKw("");
    const plt = (window.PLATFORMS && window.PLATFORMS[0]) || null;
    const clicked = clickTab(plt ? plt.name : "微博");
    const expected = plt ? window.HOT_DATA.filter((d) => d.platform === plt.key).length : -1;
    const r2 = list();
    ok("平台筛选：点击「" + (plt ? plt.name : "微博") + "」后只显示该平台", clicked && r2.length === expected && expected > 0 && expected < initial, "期望 " + expected + "，实际 " + r2.length + "（总 " + initial + "）");

    // 情况二：无结果（平台 + 关键词组合，必无匹配）
    setKw("zzz不存在的组合词");
    const r3 = list();
    const emptyBox = doc.querySelector("#hotList .empty-box");
    ok("无结果：列表为空", r3.length === 0, "当前 " + r3.length + " 条");
    ok("无结果：显示「没有找到相关内容」", !!emptyBox && emptyBox.textContent.indexOf("没有找到相关内容") !== -1, emptyBox ? "提示：" + emptyBox.textContent : "无空状态节点");
    ok("无结果：结果数量为 0", /共\s*0\s*条/.test(countEl.textContent), "数量：" + countEl.textContent);

    // 回到「全部」平台，验证仅关键词无结果也显示该文案
    clickTab("全部");
    setKw("zzz不存在的关键词");
    const r4 = list();
    const emptyBox2 = doc.querySelector("#hotList .empty-box");
    ok("无结果（仅关键词）：显示「没有找到相关内容」", r4.length === 0 && !!emptyBox2 && emptyBox2.textContent.indexOf("没有找到相关内容") !== -1, emptyBox2 ? "提示：" + emptyBox2.textContent : "");

    // 情况三：清空恢复（当前平台=全部，清空关键词恢复完整列表）
    setKw("");
    const r5 = list();
    ok("清空恢复：恢复完整列表", r5.length === initial, "当前 " + r5.length + " 条（期望 " + initial + "）");
    ok("清空恢复：结果数量回到总数", new RegExp("共\\s*" + initial + "\\s*条").test(countEl.textContent), "数量：" + countEl.textContent);

    // 可访问性（保持已调用的设计 Skill 要求）
    const ariaName = input.getAttribute("aria-label") || doc.querySelector('label[for="filterInput"]') !== null;
    ok("可访问性：搜索框有可访问名称", !!ariaName, "aria-label=" + input.getAttribute("aria-label"));
    ok("可访问性：结果数量带 aria-live=polite", countEl && countEl.getAttribute("aria-live") === "polite", "aria-live=" + (countEl && countEl.getAttribute("aria-live")));

    return results;
  });
}

run().then((results) => {
  console.log("===== 筛选交互验证（关键词 + 平台组合）=====");
  let failed = 0;
  results.forEach((r) => {
    const tag = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failed++;
    console.log("[" + tag + "] " + r.name + (r.detail ? "  —— " + r.detail : ""));
  });
  console.log("--------------------------------------------------------");
  console.log("合计 " + results.length + " 项，通过 " + (results.length - failed) + "，失败 " + failed);
  console.log(failed === 0 ? "结论：三种情况 + 平台组合 + 可访问性 全部通过 ✅" : "结论：存在失败项 ❌");
  process.exit(failed === 0 ? 0 : 1);
});
