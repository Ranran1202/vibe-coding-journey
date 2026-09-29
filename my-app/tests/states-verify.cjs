// my-app/tests/states-verify.cjs
// 验证 Day 14 的列表数据「四种状态」与「三视图独立访问」：
//   首页热搜列表：加载中（?slow=1）/ 加载成功（默认）/ 没有结果（?empty=1）/ 请求失败（?fail=1）
//   平台列表页：同样具备上述四态
//   视图独立访问：#/home #/platforms #/detail/:id #/fav #/about 均可直接打开、互不干扰
// 运行：NODE_PATH=<managed workspace node_modules> node my-app/tests/states-verify.cjs
// 退出码 0 = 全部通过；非 0 = 有失败项。

const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const APP_DIR = path.resolve(__dirname, "..");
const INDEX = path.join(APP_DIR, "index.html");

// 用指定查询参数 + hash 构建一份全新的 my-app（每个场景独立，互不干扰）
function buildApp(query, hash) {
  let html = fs.readFileSync(INDEX, "utf8").replace(/<script[^>]*src=[^>]*><\/script>/g, "");
  const url = "https://localhost/my-app/" + (query || "") + (hash || "#/home");
  const dom = new JSDOM(html, { runScripts: "dangerously", url, pretendToBeVisual: true });
  const { window } = dom;
  const doc = window.document;
  ["config.js", "data.js", "store.js", "app.js"].forEach((f) => {
    window.eval(fs.readFileSync(path.join(APP_DIR, "js", f), "utf8"));
  });
  return { window, doc };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run() {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

  return Promise.resolve()
    // ===== 首页热搜列表：四种状态 =====
    .then(() => {
      const { doc } = buildApp("");
      return sleep(350).then(() => {
        const items = doc.querySelectorAll("#hotList .hot-item");
        const loading = doc.querySelector("#hotList .loading-box");
        const err = doc.querySelector("#hotList .error-box");
        const empty = doc.querySelector("#hotList .empty-box");
        ok("首页·加载成功：默认加载后渲染出 5 条且无其他状态",
          items.length === 5 && !loading && !err && !empty, "items=" + items.length);
      });
    })
    .then(() => {
      const { doc } = buildApp("?slow=1");
      return sleep(150).then(() => {
        const loading = doc.querySelector("#hotList .loading-box");
        const items = doc.querySelectorAll("#hotList .hot-item");
        ok("首页·加载中：?slow=1 期间显示「加载中」状态",
          !!loading && items.length === 0, loading ? "文本：" + loading.textContent.trim() : "无加载态");
      });
    })
    .then(() => {
      const { doc } = buildApp("?fail=1");
      return sleep(350).then(() => {
        const err = doc.querySelector("#hotList .error-box");
        const btn = err && err.querySelector(".btn-retry");
        const items = doc.querySelectorAll("#hotList .hot-item");
        ok("首页·请求失败：?fail=1 显示错误框与重试按钮",
          !!err && !!btn && items.length === 0, err ? "文本：" + err.textContent.trim() : "无错误框");
      });
    })
    .then(() => {
      const { doc } = buildApp("?empty=1");
      return sleep(350).then(() => {
        const empty = doc.querySelector("#hotList .empty-box");
        const items = doc.querySelectorAll("#hotList .hot-item");
        ok("首页·没有结果：?empty=1 成功但 0 条，显示空态",
          !!empty && items.length === 0, empty ? "文本：" + empty.textContent : "无空态");
      });
    })
    // ===== 平台列表页：四种状态 =====
    .then(() => {
      const { doc } = buildApp("", "#/platforms");
      return sleep(350).then(() => {
        const cards = doc.querySelectorAll("#platformList .platform-card");
        const loading = doc.querySelector("#platformList .loading-box");
        const err = doc.querySelector("#platformList .error-box");
        const empty = doc.querySelector("#platformList .empty-box");
        ok("平台页·加载成功：默认列出全部平台卡片",
          cards.length === 3 && !loading && !err && !empty, "cards=" + cards.length);
      });
    })
    .then(() => {
      const { doc } = buildApp("?slow=1", "#/platforms");
      return sleep(150).then(() => {
        const loading = doc.querySelector("#platformList .loading-box");
        ok("平台页·加载中：?slow=1 期间显示「加载中」",
          !!loading, loading ? "文本：" + loading.textContent.trim() : "无加载态");
      });
    })
    .then(() => {
      const { doc } = buildApp("?fail=1", "#/platforms");
      return sleep(350).then(() => {
        const err = doc.querySelector("#platformList .error-box");
        const btn = err && err.querySelector(".btn-retry");
        ok("平台页·请求失败：?fail=1 显示错误框与重试按钮",
          !!err && !!btn, err ? "文本：" + err.textContent.trim() : "无错误框");
      });
    })
    .then(() => {
      const { doc } = buildApp("?empty=1", "#/platforms");
      return sleep(350).then(() => {
        const empty = doc.querySelector("#platformList .empty-box");
        ok("平台页·没有结果：?empty=1 显示「没有结果」",
          !!empty && empty.textContent.indexOf("没有结果") !== -1, empty ? "文本：" + empty.textContent : "无空态");
      });
    })
    // ===== 热搜详情页：独立访问 =====
    .then(() => {
      const { window, doc } = buildApp("", "#/detail/weibo-1");
      return sleep(60).then(() => {
        const detailVisible = !doc.getElementById("view-detail").classList.contains("hidden");
        const listHidden = doc.getElementById("view-list").classList.contains("hidden");
        const title = doc.querySelector("#detailContent .detail-title");
        const expect = (window.HOT_DATA || []).find((d) => d.platform === "weibo" && d.rank === 1);
        ok("详情页·独立访问：#/detail/weibo-1 直接打开且视图可见、列表隐藏",
          detailVisible && listHidden && !!title, "detailVisible=" + detailVisible + " listHidden=" + listHidden);
        ok("详情页·内容正确：渲染出对应热搜标题",
          !!title && expect && title.textContent === expect.title,
          title ? "标题：" + title.textContent : "无标题节点");
      });
    })
    .then(() => {
      const { doc } = buildApp("", "#/detail/nope-9");
      return sleep(60).then(() => {
        const nf = doc.querySelector("#detailContent .empty-box");
        ok("详情页·异常：无效 id 显示「没有找到这条热搜」",
          !!nf && nf.textContent.indexOf("没有找到这条热搜") !== -1, nf ? "文本：" + nf.textContent : "无提示");
      });
    })
    // ===== 三视图切换互不干扰（home / fav / about） =====
    .then(() => {
      const { window, doc } = buildApp("");
      return sleep(350).then(() => {
        window.location.hash = "#/about";
        window.dispatchEvent(new window.Event("hashchange"));
        const aboutVisible = !doc.getElementById("view-about").classList.contains("hidden");
        const listHidden = doc.getElementById("view-list").classList.contains("hidden");
        const routeAbout = doc.getElementById("routeLabel").textContent;

        window.location.hash = "#/fav";
        window.dispatchEvent(new window.Event("hashchange"));
        const navActive = doc.querySelector(".nav-link.is-active");
        const routeFav = doc.getElementById("routeLabel").textContent;

        window.location.hash = "#/hot";
        window.dispatchEvent(new window.Event("hashchange"));
        const listVisible = !doc.getElementById("view-list").classList.contains("hidden");
        const tabsVisible = !doc.getElementById("platformTabs").classList.contains("hidden");

        ok("视图切换：about 显示/列表隐藏，route 更新为 #/about",
          aboutVisible && listHidden && routeAbout.indexOf("#/about") !== -1,
          "aboutVisible=" + aboutVisible + " listHidden=" + listHidden + " route=" + routeAbout);
        ok("视图切换：fav 时导航高亮且 route 为 #/fav",
          navActive && navActive.getAttribute("data-view") === "fav" && routeFav.indexOf("#/fav") !== -1,
          "active=" + (navActive && navActive.getAttribute("data-view")) + " route=" + routeFav);
        ok("视图切换：回到 home 时列表与平台标签恢复可见",
          listVisible && tabsVisible,
          "listVisible=" + listVisible + " tabsVisible=" + tabsVisible);
      });
    })
    .then(() => results);
}

run().then((results) => {
  console.log("===== Day 14 · 列表四态 + 三视图独立访问验证 =====");
  let failed = 0;
  results.forEach((r) => {
    const tag = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failed++;
    console.log("[" + tag + "] " + r.name + (r.detail ? "  —— " + r.detail : ""));
  });
  console.log("--------------------------------------------------------");
  console.log("合计 " + results.length + " 项，通过 " + (results.length - failed) + "，失败 " + failed);
  console.log(failed === 0 ? "结论：四种状态 + 三视图独立访问 全部通过 ✅" : "结论：存在失败项 ❌");
  process.exit(failed === 0 ? 0 : 1);
});
