// my-app/tests/fav-filter-verify.cjs
// 真实加载 my-app（jsdom），验证「我的收藏」视图的关键词筛选交互：
// 正常（有结果）/ 无结果（显示「没有找到相关内容」）/ 清空恢复 三种情况 +
// 我的收藏页特有的「标题或备注」匹配 + 无收藏空态 + 可访问性。
// 运行：NODE_PATH=<managed workspace node_modules> node my-app/tests/fav-filter-verify.cjs
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
    const emptyBox = () => doc.querySelector("#hotList .empty-box");

    const setKw = (kw) => {
      input.value = kw;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    };
    const enterFav = () => {
      // Day 13：通过 hash 路由进入「我的收藏」视图（替代原 #btnFav 切换）
      window.location.hash = "#/fav";
      window.dispatchEvent(new window.Event("hashchange"));
    };

    // 选取两条真实数据作为「我的收藏」
    const data = window.HOT_DATA || [];
    const itemA = data.find((d) => d.title.indexOf("初雪") !== -1);          // 示例热搜一
    const itemB = data.find((d) => d.title.indexOf("剧") !== -1);            // 示例热搜三
    ok("前置：能取到两条用于收藏的示例数据", !!itemA && !!itemB,
      "itemA=" + (itemA && itemA.title) + "；itemB=" + (itemB && itemB.title));

    // 收藏 itemA、itemB，并给 itemA 写一条备注（我的数据对象的一部分）
    window.FavStore.toggleFav(itemA);
    window.FavStore.toggleFav(itemB);
    window.FavStore.setNote(itemA, "年度必看清单");
    const favCount = window.FavStore.getAllFavIds().length;
    ok("前置：已收藏 2 条", favCount === 2, "收藏数=" + favCount);

    // 进入「我的收藏」视图
    enterFav();
    const inFav = list().length;
    ok("正常：进入我的收藏后只显示收藏项", inFav === 2, "当前 " + inFav + " 条（期望 2）");
    ok("正常：结果数量显示收藏总数", /共\s*2\s*条/.test(countEl.textContent), "数量：" + countEl.textContent);

    // 情况一：有结果（按标题命中）
    setKw("初雪");
    const r1 = list();
    const t1 = Array.from(r1).map((li) => li.querySelector(".title").textContent);
    ok("有结果：按标题「初雪」只留匹配收藏项", r1.length === 1 && t1[0] === itemA.title,
      "匹配 " + r1.length + " 条：" + JSON.stringify(t1));
    ok("有结果：结果数量为 1", /共\s*1\s*条/.test(countEl.textContent), "数量：" + countEl.textContent);

    // 我的收藏页特有：按「备注」命中（标题不含该词也能搜到）
    setKw("年度必看");
    const r2 = list();
    ok("我的收藏：按备注「年度必看」命中 itemA（标题不含该词）", r2.length === 1 && r2[0].querySelector(".title").textContent === itemA.title,
      "匹配 " + r2.length + " 条，标题=" + (r2[0] && r2[0].querySelector(".title").textContent));

    // 情况二：无结果（关键词在收藏项标题/备注中都不存在）
    setKw("zzz不存在的组合词");
    const r3 = list();
    ok("无结果：列表为空", r3.length === 0, "当前 " + r3.length + " 条");
    ok("无结果：显示「没有找到相关内容」", !!emptyBox() && emptyBox().textContent.indexOf("没有找到相关内容") !== -1,
      emptyBox() ? "提示：" + emptyBox().textContent : "无空状态节点");
    ok("无结果：结果数量为 0", /共\s*0\s*条/.test(countEl.textContent), "数量：" + countEl.textContent);

    // 情况三：清空恢复（保留在「我的收藏」视图内，恢复全部收藏项）
    setKw("");
    const r4 = list();
    ok("清空恢复：恢复全部收藏项", r4.length === 2, "当前 " + r4.length + " 条（期望 2）");
    ok("清空恢复：结果数量回到收藏总数", /共\s*2\s*条/.test(countEl.textContent), "数量：" + countEl.textContent);

    // 边界：无任何收藏时进入我的收藏 → 显示专属空态文案
    window.FavStore.toggleFav(itemA);   // 取消收藏
    window.FavStore.toggleFav(itemB);   // 取消收藏
    setKw("");                          // 触发重新渲染（favOnly 仍为 true）
    const emptyNoFav = emptyBox();
    ok("边界：无收藏时显示「还没有收藏任何热搜。」",
      !!emptyNoFav && emptyNoFav.textContent.indexOf("还没有收藏任何热搜") !== -1,
      emptyNoFav ? "提示：" + emptyNoFav.textContent : "无空状态节点");

    // 可访问性（保持已调用的设计 Skill 要求）
    ok("可访问性：我的收藏视图下搜索框 aria-label 含「我的收藏」",
      (input.getAttribute("aria-label") || "").indexOf("我的收藏") !== -1,
      "aria-label=" + input.getAttribute("aria-label"));
    ok("可访问性：结果数量带 aria-live=polite", countEl && countEl.getAttribute("aria-live") === "polite",
      "aria-live=" + (countEl && countEl.getAttribute("aria-live")));

    return results;
  });
}

run().then((results) => {
  console.log("===== 我的收藏视图 · 筛选交互验证 =====");
  let failed = 0;
  results.forEach((r) => {
    const tag = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failed++;
    console.log("[" + tag + "] " + r.name + (r.detail ? "  —— " + r.detail : ""));
  });
  console.log("--------------------------------------------------------");
  console.log("合计 " + results.length + " 项，通过 " + (results.length - failed) + "，失败 " + failed);
  console.log(failed === 0 ? "结论：我的收藏筛选（有结果/无结果/清空恢复 + 备注匹配 + 无收藏空态 + 可访问性）全部通过 ✅" : "结论：存在失败项 ❌");
  process.exit(failed === 0 ? 0 : 1);
});
