// my-app/js/app.js
// 第 2 步：把 js/data.js 的 HOT_DATA 渲染成列表（排名 / 标题 / 热度）。
// 第 3 步：平台标签可点击切换 + 按 platform 过滤 + 当前高亮（含「全部」）。
// 第 4 步：点列表项弹详情，含「去原平台查看」外链（新标签打开）。
// 第 5 步：收藏 / 备注（localStorage，刷新不丢）+ 加载失败显示提示不白屏。
(function () {
  "use strict";

  var state = {
    items: [],
    platform: "all",     // 当前选中的平台 key，"all" 表示全部
    favOnly: false,      // 是否只看收藏
    error: false         // 数据是否加载失败
  };

  function platformName(key) {
    var list = window.PLATFORMS || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i].name;
    }
    return key;
  }

  // 数据加载：真实环境会换成 fetch(...)。演示用静态数据，支持 ?fail=1 模拟失败。
  function loadData() {
    return new Promise(function (resolve, reject) {
      var fail = /[?&]fail=1\b/.test(location.search);
      setTimeout(function () {
        if (fail) {
          reject(new Error("模拟加载失败"));
          return;
        }
        resolve(window.HOT_DATA || []);
      }, 120);
    });
  }

  function renderTabs() {
    var nav = document.getElementById("platformTabs");
    if (!nav) return;
    nav.innerHTML = "";

    var tabs = [{ key: "all", name: "全部" }].concat(window.PLATFORMS || []);
    tabs.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tab" + (state.platform === t.key ? " is-active" : "");
      b.textContent = t.name;
      b.addEventListener("click", function () {
        state.platform = t.key;   // 切换平台
        renderTabs();             // 重新高亮
        renderList();             // 重新过滤
      });
      nav.appendChild(b);
    });
  }

  function filteredItems() {
    return state.items.filter(function (it) {
      if (state.platform !== "all" && it.platform !== state.platform) return false;
      if (state.favOnly && !window.FavStore.isFav(it)) return false;
      return true;
    });
  }

  function renderList() {
    var ul = document.getElementById("hotList");
    if (!ul) return;

    // 加载失败：显示提示 + 重试，不白屏
    if (state.error) {
      ul.innerHTML = "";
      var box = document.createElement("li");
      box.className = "error-box";
      var p = document.createElement("p");
      p.textContent = "暂时拿不到数据，请稍后重试。";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-retry";
      btn.textContent = "重试";
      btn.addEventListener("click", function () { refresh(); });
      box.appendChild(p);
      box.appendChild(btn);
      ul.appendChild(box);
      return;
    }

    var items = filteredItems();
    ul.innerHTML = "";

    if (items.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty-box";
      empty.textContent = state.favOnly ? "还没有收藏任何热搜。" : "暂无数据。";
      ul.appendChild(empty);
      return;
    }

    items.forEach(function (it) {
      var li = document.createElement("li");
      li.className = "hot-item";

      // 收藏星标
      var fav = window.FavStore.isFav(it);
      var star = document.createElement("button");
      star.type = "button";
      star.className = "star" + (fav ? " is-fav" : "");
      star.textContent = fav ? "★" : "☆";
      star.setAttribute("aria-label", "收藏");
      star.addEventListener("click", function (e) {
        e.stopPropagation();
        window.FavStore.toggleFav(it);
        renderList();
      });

      var rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = it.rank;

      var title = document.createElement("span");
      title.className = "title";
      title.textContent = it.title;

      var heat = document.createElement("span");
      heat.className = "heat";
      heat.textContent = it.heat;

      li.appendChild(star);
      li.appendChild(rank);
      li.appendChild(title);
      li.appendChild(heat);
      li.addEventListener("click", function () { openDetail(it); });

      ul.appendChild(li);
    });

    // 收藏入口高亮态
    var favLink = document.getElementById("btnFav");
    if (favLink) favLink.classList.toggle("is-active", state.favOnly);
  }

  function openDetail(it) {
    var root = document.getElementById("modalRoot");
    if (!root) return;
    root.innerHTML = "";

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    var card = document.createElement("div");
    card.className = "modal-card";

    var close = document.createElement("button");
    close.type = "button";
    close.className = "modal-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "关闭");
    close.addEventListener("click", closeModal);

    var h = document.createElement("h2");
    h.className = "modal-title";
    h.textContent = it.title;

    var meta = document.createElement("p");
    meta.className = "modal-meta";
    meta.textContent = "排名 " + it.rank + " · 热度 " + it.heat + " · 来源 " + platformName(it.platform);

    // 去原平台查看（新标签打开外链）
    var go = document.createElement("a");
    go.className = "btn-go";
    go.href = it.url;
    go.target = "_blank";
    go.rel = "noopener";
    go.textContent = "去原平台查看";

    card.appendChild(close);
    card.appendChild(h);
    card.appendChild(meta);
    card.appendChild(go);

    // 收藏切换
    var fav = window.FavStore.isFav(it);
    var favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "btn-fav-toggle" + (fav ? " is-fav" : "");
    favBtn.textContent = fav ? "★ 已收藏" : "☆ 收藏";
    favBtn.addEventListener("click", function () {
      window.FavStore.toggleFav(it);
      closeModal();
      renderList();
    });
    card.appendChild(favBtn);

    // 备注输入（localStorage 持久化）
    var noteWrap = document.createElement("div");
    noteWrap.className = "note-wrap";
    var noteLabel = document.createElement("label");
    noteLabel.className = "note-label";
    noteLabel.textContent = "我的备注";
    var note = document.createElement("textarea");
    note.className = "note-input";
    note.placeholder = "给这条热搜写点备注…";
    note.value = window.FavStore.getNote(it);
    note.addEventListener("input", function () {
      window.FavStore.setNote(it, note.value);
    });
    noteWrap.appendChild(noteLabel);
    noteWrap.appendChild(note);
    card.appendChild(noteWrap);

    overlay.appendChild(card);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    root.appendChild(overlay);
    root.classList.remove("hidden");
  }

  function closeModal() {
    var root = document.getElementById("modalRoot");
    if (root) {
      root.innerHTML = "";
      root.classList.add("hidden");
    }
  }

  function refresh() {
    state.error = false;
    loadData().then(function (data) {
      state.items = data;
      state.error = false;
      renderList();
    }).catch(function () {
      state.error = true;
      renderList();
    });
  }

  function init() {
    var refreshBtn = document.getElementById("btnRefresh");
    if (refreshBtn) refreshBtn.addEventListener("click", function () { refresh(); });

    var favLink = document.getElementById("btnFav");
    if (favLink) {
      favLink.addEventListener("click", function (e) {
        e.preventDefault();
        state.favOnly = !state.favOnly;
        renderList();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    renderTabs();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
