/* ============================================================
   《我的AI不预测股价，它预测人性》— 单页应用逻辑
   纯原生 JS，无框架、无后端、无 fetch：数据来自 window.DRAMA_DATA
   视图通过 hash 路由独立访问：
     #/home       首页
     #/episodes   剧集列表（数据对象 = 剧集，带四态）
     #/characters 角色与设定
     #/making     制作花絮
     #/episode/:no 单集详情（可独立分享）
   四态触发（仅作用于剧集列表的数据加载）：
     ?slow=1   模拟「加载中」（延时约 2s）
     ?fail=1   模拟「请求失败」
     ?empty=1  模拟「加载成功但 0 条」
     默认       模拟「加载成功」
   ============================================================ */

(function () {
  "use strict";

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- 四态渲染辅助 ---------- */
  function showLoading(container) {
    container.innerHTML = "";
    var box = el("div", "loading-box");
    box.appendChild(el("span", "spinner"));
    box.appendChild(el("span", null, "加载中…"));
    container.appendChild(box);
  }

  function showError(container, message) {
    container.innerHTML = "";
    var box = el("div", "error-box");
    box.appendChild(el("div", null, message || "数据加载失败，请稍后重试。"));
    var btn = el("button", "btn-retry", "重试");
    btn.type = "button";
    btn.addEventListener("click", function () { bootstrap(); });
    box.appendChild(btn);
    container.appendChild(box);
  }

  function showEmpty(container, message) {
    container.innerHTML = "";
    container.appendChild(el("div", "empty-box", message || "暂无内容。"));
  }

  /* ---------- 卡片渲染 ---------- */
  function episodeCard(item, isFull) {
    var card = el("article", "card episode-card");
    card.setAttribute("data-no", String(item.no));

    var meta = el("div", "meta");
    meta.appendChild(el("span", "no", "第 " + item.no + " 集"));
    meta.appendChild(el("span", "tag", item.status || "制作中"));
    meta.appendChild(el("span", null, item.duration || ""));
    card.appendChild(meta);

    card.appendChild(el("h3", "episode-title", item.title));
    card.appendChild(el("p", null, item.summary));

    if (isFull) {
      var extra = el("p", "episode-extra");
      extra.appendChild(el("span", null, "场景：" + (item.scene || "—")));
      card.appendChild(extra);

      var player = el("div", "player");
      if (item.videoUrl) {
        var frame = document.createElement("iframe");
        frame.src = item.videoUrl;
        frame.title = item.title;
        frame.loading = "lazy";
        frame.allowFullscreen = true;
        player.appendChild(frame);
      } else {
        player.textContent = "视频制作中 —— 等生成后把地址填进数据文件的 videoUrl 就会自动播放";
      }
      card.appendChild(player);

      var link = el("a", "btn ghost episode-open", "查看详情");
      link.href = "#/episode/" + item.no;
      card.appendChild(link);
    }
    return card;
  }

  function characterCard(person) {
    var card = el("article", "card character-card");
    card.appendChild(el("div", "avatar", person.avatar));
    card.appendChild(el("h3", null, person.name));
    card.appendChild(el("div", "tag", person.role));
    card.appendChild(el("p", null, person.desc));
    if (person.arc) {
      var arc = el("p", "character-arc");
      arc.appendChild(el("strong", null, "人物弧光："));
      arc.appendChild(document.createTextNode(person.arc));
      card.appendChild(arc);
    }
    return card;
  }

  function toolCard(tool) {
    var card = el("article", "card tool-card");
    card.appendChild(el("h3", null, tool.name));
    card.appendChild(el("p", null, tool.use));
    return card;
  }

  function settingRow(row) {
    var dt = el("dt", null, row.label);
    var dd = el("dd", null, row.value);
    return [dt, dd];
  }

  function timelineRow(row) {
    var li = el("li");
    li.appendChild(el("span", "stage", row.stage));
    li.appendChild(el("span", null, row.point));
    return li;
  }

  /* ---------- 各视图渲染 ---------- */
  function renderHome(state) {
    // 前 3 集
    var box = $("home-episodes");
    if (state.status === "loading") { showLoading(box); return; }
    if (state.status === "error") { showError(box, state.errorMsg); return; }

    $("home-title").textContent = state.data.site.title;
    $("home-tagline").textContent = state.data.site.tagline;
    $("footer-disclaimer").textContent = state.data.site.disclaimer;

    box.innerHTML = "";
    state.episodes.slice(0, 3).forEach(function (e) {
      var card = episodeCard(e, false);
      var link = el("a", "btn ghost episode-open", "查看详情");
      link.href = "#/episode/" + e.no;
      card.appendChild(link);
      box.appendChild(card);
    });

    // 故事前提
    var dl = $("home-settings");
    dl.innerHTML = "";
    state.data.story.settings.forEach(function (row) {
      settingRow(row).forEach(function (n) { dl.appendChild(n); });
    });

    // 主要角色
    var cl = $("home-characters");
    cl.innerHTML = "";
    state.data.characters.forEach(function (p) { cl.appendChild(characterCard(p)); });
  }

  function renderEpisodes(state) {
    var box = $("episodeList");
    if (state.status === "loading") { showLoading(box); return; }
    if (state.status === "error") { showError(box, state.errorMsg); return; }
    if (state.episodes.length === 0) {
      showEmpty(box, "还没有上线的剧集，敬请期待～");
      return;
    }
    box.innerHTML = "";
    state.episodes.forEach(function (e) { box.appendChild(episodeCard(e, true)); });
  }

  function renderCharacters(state) {
    var box = $("character-list");
    if (state.status === "loading") { showLoading(box); return; }
    if (state.status === "error") { showError(box, state.errorMsg); return; }
    box.innerHTML = "";
    state.data.characters.forEach(function (p) { box.appendChild(characterCard(p)); });

    var dl = $("story-settings");
    dl.innerHTML = "";
    state.data.story.settings.forEach(function (row) {
      settingRow(row).forEach(function (n) { dl.appendChild(n); });
    });

    var ul = $("story-timeline");
    ul.innerHTML = "";
    state.data.story.timeline.forEach(function (row) { ul.appendChild(timelineRow(row)); });
  }

  function renderMaking(state) {
    var box = $("tool-list");
    if (state.status === "loading") { showLoading(box); return; }
    if (state.status === "error") { showError(box, state.errorMsg); return; }
    box.innerHTML = "";
    state.data.tools.forEach(function (t) { box.appendChild(toolCard(t)); });
    $("making-note").textContent = state.data.site.disclaimer;
  }

  function renderEpisodeDetail(state) {
    var box = $("episodeDetail");
    if (state.status === "loading") { showLoading(box); return; }
    if (state.status === "error") { showError(box, state.errorMsg); return; }

    var item = state.episodes.filter(function (e) { return String(e.no) === String(state.episodeNo); })[0];
    if (!item) {
      showEmpty(box, "没有找到这条剧集（可能链接已失效）。");
      return;
    }
    box.innerHTML = "";
    var wrap = el("div", "episode-detail card");
    var meta = el("div", "meta");
    meta.appendChild(el("span", "no", "第 " + item.no + " 集"));
    meta.appendChild(el("span", "tag", item.status || "制作中"));
    meta.appendChild(el("span", null, item.duration || ""));
    wrap.appendChild(meta);
    wrap.appendChild(el("h2", "detail-title", item.title));
    wrap.appendChild(el("p", null, item.summary));
    wrap.appendChild(el("p", "episode-extra", "场景：" + (item.scene || "—")));

    var back = el("a", "btn ghost", "← 返回剧集列表");
    back.href = "#/episodes";
    wrap.appendChild(back);
    box.appendChild(wrap);
  }

  function renderActiveView(state) {
    switch (state.view) {
      case "episodes": renderEpisodes(state); break;
      case "characters": renderCharacters(state); break;
      case "making": renderMaking(state); break;
      case "episode": renderEpisodeDetail(state); break;
      case "home":
      default: renderHome(state); break;
    }
  }

  /* ---------- 路由 ---------- */
  function parseRoute() {
    var hash = location.hash || "#/home";
    var m = hash.match(/^#\/episode\/(\d+)/);
    if (m) return { view: "episode", episodeNo: m[1] };
    if (hash.indexOf("#/episodes") === 0) return { view: "episodes", episodeNo: null };
    if (hash.indexOf("#/characters") === 0) return { view: "characters", episodeNo: null };
    if (hash.indexOf("#/making") === 0) return { view: "making", episodeNo: null };
    return { view: "home", episodeNo: null };
  }

  var VIEWS = ["home", "episodes", "characters", "making", "episode"];

  function applyChrome(state) {
    VIEWS.forEach(function (v) {
      var view = $("view-" + v);
      if (view) view.classList.toggle("hidden", v !== state.view);
    });
    var links = document.querySelectorAll(".nav-link");
    links.forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("data-view") === state.view);
    });
    var label = $("routeLabel");
    if (label) label.textContent = "当前地址：" + location.href;
  }

  /* ---------- 启动 / 数据加载（带四态模拟） ---------- */
  var state = {
    view: "home",
    episodeNo: null,
    data: null,
    episodes: [],
    status: "idle",
    errorMsg: ""
  };

  function readParams() {
    var p = new URLSearchParams(location.search);
    return {
      slow: p.get("slow") === "1",
      fail: p.get("fail") === "1",
      empty: p.get("empty") === "1"
    };
  }

  async function bootstrap() {
    var params = readParams();
    var route = parseRoute();
    state.view = route.view;
    state.episodeNo = route.episodeNo;
    state.status = "loading";
    applyChrome(state);
    renderActiveView(state);

    try {
      if (params.slow) await sleep(2000);
      if (params.fail) throw new Error("暂时拿不到剧集数据，请稍后重试。");

      var d = window.DRAMA_DATA;
      if (!d) throw new Error("站点数据未加载，请确认 assets/js/data.js 已引入。");

      state.data = d;
      state.episodes = (params.empty ? [] : (d.episodes || []).slice());
      state.status = "success";
    } catch (e) {
      state.status = "error";
      state.errorMsg = (e && e.message) ? e.message : "数据加载失败，请稍后重试。";
    }
    applyChrome(state);
    renderActiveView(state);
  }

  function onRouteChange() {
    var route = parseRoute();
    state.view = route.view;
    state.episodeNo = route.episodeNo;
    applyChrome(state);
    renderActiveView(state);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
  window.addEventListener("hashchange", onRouteChange);
})();
