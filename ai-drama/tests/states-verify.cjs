// ai-drama/tests/states-verify.cjs
// 验证「我的AI漫」单页应用的：剧集列表四态 + 四个独立视图 + 剧集详情独立访问
//   剧集列表（数据对象 = 剧集）：加载中（?slow=1）/ 加载成功（默认）/ 没有结果（?empty=1）/ 请求失败（?fail=1）
//   视图独立访问：#/home #/episodes #/characters #/making #/episode/:no 均可直接打开、互不干扰
// 运行：NODE_PATH=<managed workspace node_modules> node ai-drama/tests/states-verify.cjs
// 退出码 0 = 全部通过；非 0 = 有失败项。

const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const APP_DIR = path.resolve(__dirname, "..");
const INDEX = path.join(APP_DIR, "index.html");

// 用指定查询参数 + hash 构建一份全新的应用（每个场景独立，互不干扰）
function buildApp(query, hash) {
  let html = fs.readFileSync(INDEX, "utf8").replace(/<script[^>]*src=[^>]*><\/script>/g, "");
  const url = "https://localhost/ai-drama/" + (query || "") + (hash || "#/home");
  const dom = new JSDOM(html, { runScripts: "dangerously", url, pretendToBeVisual: true });
  const { window } = dom;
  // 先注入数据，再注入逻辑（与 index.html 的引入顺序一致）
  ["assets/js/data.js", "assets/js/app.js"].forEach((f) => {
    window.eval(fs.readFileSync(path.join(APP_DIR, f), "utf8"));
  });
  return { window, doc: window.document };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run() {
  const results = [];
  const ok = (name, cond, detail) => results.push({ name, pass: !!cond, detail: detail || "" });

  // 剧集列表（数据对象）四种状态
  return Promise.resolve()
    .then(() => {
      const { doc } = buildApp("", "#/episodes");
      return sleep(350).then(() => {
        const cards = doc.querySelectorAll("#episodeList .episode-card");
        const loading = doc.querySelector("#episodeList .loading-box");
        const err = doc.querySelector("#episodeList .error-box");
        const empty = doc.querySelector("#episodeList .empty-box");
        ok("剧集页·加载成功：默认加载后渲染 6 集且无其他状态",
          cards.length === 6 && !loading && !err && !empty, "cards=" + cards.length);
      });
    })
    .then(() => {
      const { doc } = buildApp("?slow=1", "#/episodes");
      return sleep(150).then(() => {
        const loading = doc.querySelector("#episodeList .loading-box");
        const cards = doc.querySelectorAll("#episodeList .episode-card");
        ok("剧集页·加载中：?slow=1 期间显示「加载中」",
          !!loading && cards.length === 0, loading ? "文本：" + loading.textContent.trim() : "无加载态");
      });
    })
    .then(() => {
      const { doc } = buildApp("?fail=1", "#/episodes");
      return sleep(350).then(() => {
        const err = doc.querySelector("#episodeList .error-box");
        const btn = err && err.querySelector(".btn-retry");
        const cards = doc.querySelectorAll("#episodeList .episode-card");
        ok("剧集页·请求失败：?fail=1 显示错误框与重试按钮",
          !!err && !!btn && cards.length === 0, err ? "文本：" + err.textContent.trim() : "无错误框");
      });
    })
    .then(() => {
      const { doc } = buildApp("?empty=1", "#/episodes");
      return sleep(350).then(() => {
        const empty = doc.querySelector("#episodeList .empty-box");
        const cards = doc.querySelectorAll("#episodeList .episode-card");
        ok("剧集页·没有结果：?empty=1 成功但 0 条，显示空态",
          !!empty && cards.length === 0, empty ? "文本：" + empty.textContent.trim() : "无空态");
      });
    })

    // 各视图正常渲染
    .then(() => {
      const { doc } = buildApp("", "#/home");
      return sleep(350).then(() => {
        const eps = doc.querySelectorAll("#home-episodes .episode-card");
        const chars = doc.querySelectorAll("#home-characters .character-card");
        const settings = doc.querySelectorAll("#home-settings dt");
        ok("首页：前 3 集 + 2 角色 + 设定表均渲染",
          eps.length === 3 && chars.length === 2 && settings.length >= 3,
          "eps=" + eps.length + " chars=" + chars.length + " settings=" + settings.length);
      });
    })
    .then(() => {
      const { doc } = buildApp("", "#/characters");
      return sleep(350).then(() => {
        const chars = doc.querySelectorAll("#character-list .character-card");
        const tl = doc.querySelectorAll("#story-timeline li");
        const settings = doc.querySelectorAll("#story-settings dt");
        ok("角色页：2 角色 + 6 条时间线 + 设定表渲染",
          chars.length === 2 && tl.length === 6 && settings.length >= 3,
          "chars=" + chars.length + " timeline=" + tl.length + " settings=" + settings.length);
      });
    })
    .then(() => {
      const { doc } = buildApp("", "#/making");
      return sleep(350).then(() => {
        const tools = doc.querySelectorAll("#tool-list .tool-card");
        const note = doc.getElementById("making-note").textContent;
        ok("花絮页：4 个工具卡片 + 免责声明渲染",
          tools.length === 4 && note.indexOf("虚构") !== -1,
          "tools=" + tools.length);
      });
    })

    // 剧集详情：独立访问
    .then(() => {
      const { window, doc } = buildApp("", "#/episode/1");
      return sleep(80).then(() => {
        const viewVisible = !doc.getElementById("view-episode").classList.contains("hidden");
        const homeHidden = doc.getElementById("view-home").classList.contains("hidden");
        const title = doc.querySelector("#episodeDetail .detail-title");
        const expect = (window.DRAMA_DATA || { episodes: [] }).episodes.find((e) => String(e.no) === "1");
        ok("详情页·独立访问：#/episode/1 直接打开且视图可见、首页隐藏",
          viewVisible && homeHidden && !!title, "viewVisible=" + viewVisible + " homeHidden=" + homeHidden);
        ok("详情页·内容正确：渲染出第 1 集标题",
          !!title && expect && title.textContent === expect.title,
          title ? "标题：" + title.textContent : "无标题节点");
      });
    })
    .then(() => {
      const { doc } = buildApp("", "#/episode/99");
      return sleep(80).then(() => {
        const nf = doc.querySelector("#episodeDetail .empty-box");
        ok("详情页·异常：无效 id 显示「没有找到这条剧集」",
          !!nf && nf.textContent.indexOf("没有找到这条剧集") !== -1, nf ? "文本：" + nf.textContent.trim() : "无提示");
      });
    })

    // 视图切换互不干扰
    .then(() => {
      const { window, doc } = buildApp("", "#/home");
      return sleep(350).then(() => {
        window.location.hash = "#/characters";
        window.dispatchEvent(new window.Event("hashchange"));
        const charsVisible = !doc.getElementById("view-characters").classList.contains("hidden");
        const homeHidden = doc.getElementById("view-home").classList.contains("hidden");
        const navActive = doc.querySelector(".nav-link.is-active");
        const routeChars = doc.getElementById("routeLabel").textContent;

        window.location.hash = "#/making";
        window.dispatchEvent(new window.Event("hashchange"));
        const makingVisible = !doc.getElementById("view-making").classList.contains("hidden");
        const routeMaking = doc.getElementById("routeLabel").textContent;

        window.location.hash = "#/home";
        window.dispatchEvent(new window.Event("hashchange"));
        const homeVisible = !doc.getElementById("view-home").classList.contains("hidden");

        ok("视图切换：characters 显示/首页隐藏，nav 高亮且 route 更新",
          charsVisible && homeHidden && navActive && navActive.getAttribute("data-view") === "characters" && routeChars.indexOf("#/characters") !== -1,
          "charsVisible=" + charsVisible + " route=" + routeChars);
        ok("视图切换：making 直接可达且 route 更新",
          makingVisible && routeMaking.indexOf("#/making") !== -1,
          "makingVisible=" + makingVisible + " route=" + routeMaking);
        ok("视图切换：回到 home 首页恢复可见",
          homeVisible, "homeVisible=" + homeVisible);
      });
    })
    // 状态演示按钮（最小修复）：非技术测试者免改 URL 即可看四态
    .then(() => {
      const { window, doc } = buildApp("", "#/episodes");
      return sleep(350).then(() => {
        const demo = doc.getElementById("stateDemo");
        const btns = demo ? demo.querySelectorAll("button[data-state]") : [];
        ok("演示按钮：剧集页存在 4 个状态演示按钮", btns.length === 4, "btns=" + btns.length);

        demo.querySelector('button[data-state="error"]').click();
        const errBox = doc.querySelector("#episodeList .error-box");
        ok("演示按钮·失败：点击后显示错误框与重试按钮",
          !!errBox && !!errBox.querySelector(".btn-retry"), errBox ? "文本：" + errBox.textContent.trim() : "无错误框");
        ok("演示按钮·失败：地址同步为 ?fail=1#/episodes（截图/分享可复现）",
          window.location.search === "?fail=1" && window.location.hash === "#/episodes",
          "url=" + window.location.href);

        demo.querySelector('button[data-state="empty"]').click();
        const emptyBox = doc.querySelector("#episodeList .empty-box");
        ok("演示按钮·空：点击后显示空态",
          !!emptyBox && emptyBox.textContent.indexOf("敬请期待") !== -1, emptyBox ? "文本：" + emptyBox.textContent.trim() : "无空态");

        demo.querySelector('button[data-state="loading"]').click();
        const loadingBox = doc.querySelector("#episodeList .loading-box");
        ok("演示按钮·加载中：点击后显示加载态",
          !!loadingBox, loadingBox ? "文本：" + loadingBox.textContent.trim() : "无加载态");

        demo.querySelector('button[data-state="loaded"]').click();
        const cards = doc.querySelectorAll("#episodeList .episode-card");
        ok("演示按钮·成功：点击后恢复 6 集列表",
          cards.length === 6 && !doc.querySelector("#episodeList .error-box"), "cards=" + cards.length);
        ok("演示按钮·成功：地址参数被清空（回到默认成功态地址）",
          window.location.search === "", "search=" + window.location.search);
      });
    })

    .then(() => results);
}

run().then((results) => {
  console.log("===== 我的AI漫 · 列表四态 + 多视图独立访问验证 =====");
  let failed = 0;
  results.forEach((r) => {
    const tag = r.pass ? "PASS" : "FAIL";
    if (!r.pass) failed++;
    console.log("[" + tag + "] " + r.name + (r.detail ? "  —— " + r.detail : ""));
  });
  console.log("--------------------------------------------------------");
  console.log("合计 " + results.length + " 项，通过 " + (results.length - failed) + "，失败 " + failed);
  console.log(failed === 0 ? "结论：四种状态 + 多视图独立访问 全部通过 ✅" : "结论：存在失败项 ❌");
  process.exit(failed === 0 ? 0 : 1);
});
