// my-app/js/app.js
// 第 2 步：把 js/data.js 的 HOT_DATA 渲染成列表（排名 / 标题 / 热度）。
// 第 3 步：平台标签可点击切换 + 按 platform 过滤 + 当前高亮（含「全部」）。
// 第 4 步：点列表项弹详情，含「去原平台查看」外链（新标签打开）。
// 第 5 步：收藏 / 备注（localStorage，刷新不丢）+ 加载失败显示提示不白屏。
// 第 6 步（Day 12）：关键词筛选——search 输入框按标题实时过滤；
// 与平台筛选组合生效；无匹配统一显示「没有找到相关内容」（含结果数量朗读、可访问性标签）。
// 我的收藏视图：关键词同时匹配「标题」与「我的备注」，让「我的数据对象」更易检索（见 syncSearchScope / filteredItems）。
// Day 13：三个视图（今日热搜 / 我的收藏 / 关于）用 hash 路由切换；列表数据补齐 正常/加载/错误/空 四态。
(function () {
  "use strict";

  var state = {
    items: [],
    platform: "all",     // 当前选中的平台 key，"all" 表示全部
    favOnly: false,      // 是否只看收藏（由视图路由推导：view==="fav"）
    keyword: "",         // Day 12：关键词筛选（按标题/备注实时过滤）
    view: "hot",        // Day 13：当前视图（hot / fav / about）
    loading: false,      // Day 13：列表是否正在加载
    error: false         // 数据是否加载失败
  };

  function platformName(key) {
    var list = window.PLATFORMS || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i].name;
    }
    return key;
  }

  // Day 11：复制文本（优先 clipboard API，附带 execCommand 兜底，纯前端不依赖后端）
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("copy failed"));
      } catch (err) { reject(err); }
    });
  }

  // Day 11：复制成功提示（停留约 1.6 秒后淡出，连续点击会重置，不堆叠）
  var toastTimer = null;
  function showToast(msg, isError) {
    var root = document.getElementById("toastRoot");
    if (!root) return;
    root.innerHTML = "";
    var t = document.createElement("div");
    t.className = "toast" + (isError ? " error" : "");
    t.textContent = msg;
    root.appendChild(t);
    void t.offsetWidth;        // 强制重排以触发进入动画
    t.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
    }, 1600);
  }

  // 收藏交互（前端临时状态：状态保存在浏览器端，无后端、无数据库）。
  // 用异步包装模拟未来的接口调用，使「处理中 / 禁用 / 失败」状态现在就能体现；
  // 后续接入真实接口时，只需替换 toggleFavAsync 内部实现，UI 保持不变。
  var favLoading = {};  // 每条正在处理中的收藏，防止重复点击
  var forceFavError = /[?&]favfail=1\b/.test(location.search); // ?favfail=1 模拟失败，便于测试

  function toggleFavAsync(it) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (forceFavError) { reject(new Error("simulated fav failure")); return; }
        var faved = window.FavStore.toggleFav(it); // 实际仍走本地存储，未来替换为接口
        resolve(faved);
      }, 600);
    });
  }

  function setFavBtnState(btn, it) {
    if (favLoading[window.FavStore.idOf(it)]) {
      btn.classList.add("is-loading");
      btn.disabled = true;
      btn.textContent = "处理中…";
      return;
    }
    btn.classList.remove("is-loading");
    btn.disabled = false;
    var fav = window.FavStore.isFav(it);
    btn.classList.toggle("is-fav", fav);
    btn.textContent = fav ? "★ 已收藏" : "☆ 收藏";
  }

  // 数据加载：真实环境会换成 fetch(...)。演示用静态数据，支持地址栏参数触发不同状态：
  //   ?fail=1  模拟加载失败（错误态）  ?empty=1 模拟成功但 0 条（空态）  ?slow=1 延长加载时间（便于观察加载态）
  function loadData() {
    return new Promise(function (resolve, reject) {
      var params = new URLSearchParams(location.search);
      var fail = params.get("fail") === "1";
      var empty = params.get("empty") === "1";
      var slow = params.get("slow") === "1";
      var delay = slow ? 2000 : 120;
      setTimeout(function () {
        if (fail) {
          reject(new Error("模拟加载失败"));
          return;
        }
        resolve(empty ? [] : (window.HOT_DATA || []));
      }, delay);
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
    var kw = (state.keyword || "").toLowerCase();
    return state.items.filter(function (it) {
      if (state.platform !== "all" && it.platform !== state.platform) return false;
      if (state.favOnly && !window.FavStore.isFav(it)) return false;
      // Day 12：关键词为空时不拦截；有关键词时按标题（不区分大小写）过滤
      if (kw) {
        var titleHit = it.title.toLowerCase().indexOf(kw) !== -1;
        // 我的收藏页：关键词同时匹配「我的备注」，让「我的数据对象」更易检索；
        // 主列表（非收藏）仍只按标题匹配，保持 Day 12 已确认行为不变。
        var noteHit = state.favOnly && window.FavStore.getNote(it).toLowerCase().indexOf(kw) !== -1;
        if (!titleHit && !noteHit) return false;
      }
      return true;
    });
  }

  // 我的收藏页：搜索框范围随视图切换（结果规则的可见提示）。
  // 进入「我的收藏」后，占位文案与可访问名称提示「标题或备注」；退出恢复默认。
  function syncSearchScope() {
    var input = document.getElementById("filterInput");
    if (!input) return;
    if (state.favOnly) {
      input.placeholder = "在我的收藏中搜索（标题或备注）…";
      input.setAttribute("aria-label", "在我的收藏中按标题或备注筛选");
    } else {
      input.placeholder = "按标题筛选…";
      input.setAttribute("aria-label", "按标题筛选热搜");
    }
  }

  // Day 12：更新结果数量（供屏幕阅读器朗读，aria-live 实时播报）
  function setResultCount(n) {
    var el = document.getElementById("resultCount");
    if (el) el.textContent = "共 " + n + " 条";
  }

  // Day 13：视图路由（hash 路由，无需后端 / 路由库）。切换视图即切换 hash，
  // 地址栏可见、可直接分享、可用浏览器后退返回——满足「页面之间怎么切换」的最小可行方案。
  function currentRoute() {
    var h = (location.hash || "#/hot").replace(/^#/, "");
    if (h.indexOf("/fav") === 0) return "fav";
    if (h.indexOf("/about") === 0) return "about";
    return "hot";
  }

  function applyRoute() {
    var view = currentRoute();
    state.view = view;
    state.favOnly = (view === "fav");   // 我的收藏视图 = 仅看收藏

    var listView = document.getElementById("view-list");
    var aboutView = document.getElementById("view-about");
    var tabs = document.getElementById("platformTabs");
    if (listView) listView.classList.toggle("hidden", view === "about");
    if (aboutView) aboutView.classList.toggle("hidden", view !== "about");
    if (tabs) tabs.classList.toggle("hidden", view !== "hot");   // 平台标签仅「今日热搜」视图显示

    // 主导航高亮（可访问导航标签）
    Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function (a) {
      a.classList.toggle("is-active", a.getAttribute("data-view") === view);
    });

    // 面包屑 / 当前路由指示（让「地址栏」信息在页面内可见，便于核对视图与状态参数）
    var routeLabel = document.getElementById("routeLabel");
    if (routeLabel) routeLabel.textContent = location.href;

    syncSearchScope();   // 搜索框范围提示随视图切换
    renderList();        // 重新渲染当前视图
  }

  function renderList() {
    var ul = document.getElementById("hotList");
    if (!ul) return;

    // Day 13：加载中状态（spinner），优先于其余分支
    if (state.loading) {
      ul.innerHTML = "";
      var loadingBox = document.createElement("li");
      loadingBox.className = "loading-box";
      loadingBox.innerHTML = '<span class="spinner" aria-hidden="true"></span> 加载中…';
      ul.appendChild(loadingBox);
      setResultCount(0);
      return;
    }

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
    setResultCount(items.length);   // Day 12：先更新数量（含空结果与有结果两种）

    if (items.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty-box";
      // 关键词 / 平台筛选无匹配时，统一显示规范文案「没有找到相关内容」；
      // 收藏空态保持原提示，其余（纯数据缺失）显示「暂无数据」。
      if (state.favOnly && !state.keyword && state.platform === "all") {
        empty.textContent = "还没有收藏任何热搜。";
      } else if (state.keyword || state.platform !== "all") {
        empty.textContent = "没有找到相关内容";
      } else {
        empty.textContent = "暂无数据。";
      }
      ul.appendChild(empty);
      return;
    }

    items.forEach(function (it) {
      var li = document.createElement("li");
      li.className = "hot-item";

      // 收藏按钮（带「处理中 / 已收藏 / 失败」状态，前端临时状态）
      var favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "btn-fav-card";
      favBtn.setAttribute("aria-label", "收藏");
      setFavBtnState(favBtn, it);
      favBtn.addEventListener("click", function (e) {
        e.stopPropagation();   // 避免触发整条详情弹窗
        if (favLoading[window.FavStore.idOf(it)]) return;   // 处理中不可重复点击
        favLoading[window.FavStore.idOf(it)] = true;
        setFavBtnState(favBtn, it);            // 进入「处理中…」并禁用
        toggleFavAsync(it)
          .then(function (faved) {
            favLoading[window.FavStore.idOf(it)] = false;
            setFavBtnState(favBtn, it);
            showToast(faved ? "已收藏 ✓ " + it.title : "已取消收藏 " + it.title);
          })
          .catch(function () {
            favLoading[window.FavStore.idOf(it)] = false;
            setFavBtnState(favBtn, it);        // 失败回退到原状态，按钮恢复可点
            showToast("收藏失败，请稍后重试", true);
          });
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

      li.appendChild(favBtn);
      li.appendChild(rank);
      li.appendChild(title);
      li.appendChild(heat);

      // 复制标题按钮（Day 11：点击复制 + 成功提示，不依赖后端）
      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn-copy";
      copyBtn.textContent = "复制";
      copyBtn.setAttribute("aria-label", "复制标题");
      copyBtn.addEventListener("click", function (e) {
        e.stopPropagation();   // 避免触发整条详情弹窗
        copyText(it.title).then(function () {
          showToast("已复制 ✓ " + it.title);
        }).catch(function () {
          showToast("复制失败，请手动复制");
        });
      });
      li.appendChild(copyBtn);

      li.addEventListener("click", function () { openDetail(it); });

      ul.appendChild(li);
    });
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

  // 手动刷新：带「加载中 / 禁用 / 成功 / 失败」状态的全局交互
  // 前端临时状态（演示用静态数据），不依赖后端；后续接真实接口只需替换 loadData 内部。
  var refreshing = false;
  function setRefreshBtn(loading) {
    var btn = document.getElementById("btnRefresh");
    if (!btn) return;
    btn.classList.toggle("is-loading", loading);
    btn.disabled = loading;                         // 处理期间禁用，防重复点击
    btn.setAttribute("aria-busy", loading ? "true" : "false");
    btn.textContent = loading ? "刷新中…" : "手动刷新";
  }

  function refresh() {
    if (refreshing) return;                         // 处理中禁止重复触发
    refreshing = true;
    state.loading = true;
    setRefreshBtn(true);                            // 进入「刷新中…」并禁用
    renderList();                                  // Day 13：立即显示「加载中」状态
    loadData().then(function (data) {
      state.items = data;
      state.error = false;
      state.loading = false;
      renderList();
      refreshing = false;
      setRefreshBtn(false);                         // 恢复按钮
      showToast("已刷新 ✓ 共 " + data.length + " 条");
    }).catch(function () {
      state.error = true;
      state.loading = false;
      renderList();                                 // 显示失败提示（错误框 + 重试）
      refreshing = false;
      setRefreshBtn(false);                         // 恢复按钮
      showToast("刷新失败，请稍后重试", true);
    });
  }

  function init() {
    var refreshBtn = document.getElementById("btnRefresh");
    if (refreshBtn) refreshBtn.addEventListener("click", function () { refresh(); });

    // 余力加练：返回上一页（浏览器历史后退）
    var backBtn = document.getElementById("btnBack");
    if (backBtn) backBtn.addEventListener("click", function () { history.back(); });

    // Day 12：关键词筛选（实时按标题/备注过滤，清空后恢复全部）
    var filterInput = document.getElementById("filterInput");
    if (filterInput) {
      filterInput.addEventListener("input", function () {
        state.keyword = filterInput.value.trim();
        renderList();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    // Day 13：hash 路由——点击导航的 #/xxx 链接即切换视图
    window.addEventListener("hashchange", applyRoute);

    renderTabs();
    refresh();
    applyRoute();   // 按初始 hash 决定显示哪个视图
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
