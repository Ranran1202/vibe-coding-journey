// my-app/js/app.js
// 第 2 步：把 js/data.js 的 HOT_DATA 渲染成列表（排名 / 标题 / 热度）。
// 第 3 步：平台标签可点击切换 + 按 platform 过滤 + 当前高亮（含「全部」）。
// 第 4 步：点列表项进入详情页，含「去原平台查看」外链（新标签打开）。
// 第 5 步：收藏 / 备注（localStorage，刷新不丢）+ 加载失败显示提示不白屏。
// 第 6 步（Day 12）：关键词筛选——search 输入框按标题实时过滤；
// 与平台筛选组合生效；无匹配统一显示「没有找到相关内容」（含结果数量朗读、可访问性标签）。
// 我的收藏视图：关键词同时匹配「标题」与「我的备注」，让「我的数据对象」更易检索（见 syncSearchScope / filteredItems）。
// Day 13：三个视图（今日热搜 / 我的收藏 / 关于）用 hash 路由切换；列表数据补齐 正常/加载/错误/空 四态。
// Day 14：按 PRD 实现 3 个可独立访问视图（首页 / 平台列表页 / 热搜详情页），列表数据补齐
//         加载中 / 加载成功 / 没有结果 / 请求失败 四种状态；详情页由弹窗改为独立路由视图。
(function () {
  "use strict";

  var state = {
    items: [],
    platform: "all",     // 当前选中的平台 key，"all" 表示全部
    favOnly: false,      // 是否只看收藏（由视图路由推导：view==="fav"）
    keyword: "",         // Day 12：关键词筛选（按标题/备注实时过滤）
    view: "home",        // 当前视图：home / fav / platforms / detail / about
    detailId: null,      // 详情页对应的热搜 id（platform-rank）
    loading: false,      // 首页/收藏列表是否正在加载
    error: false,        // 首页/收藏列表是否加载失败
    dataSource: "live",  // Day 17：数据来自哪里 —— live（云端真实接口）/ seed（本地示例兜底）
    sourceDate: "",      // 接口返回的数据日期（YYYY-MM-DD）
    sourceNote: "",      // 退回示例数据时的原因（用于页面提示）
    lastUpdatedAt: ""    // Day 20 余力加练：这批数据的「最后更新时间」（取列表里最新的 createdAt）
  };

  // 平台列表页独立的数据状态（与首页列表互不干扰，便于各自演示四态）
  var pState = { loading: false, error: false, items: [] };

  // 每个榜单卡片显示多少条。三个平台各取这么多，页面共 3×N 条。
  var PER_BOARD_LIMIT = 10;

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

  // 数据加载：Day 17 起改读**云端真实接口** GET /api/hot（此前是本地静态 HOT_DATA）。
  // 演示用的地址栏参数仍然保留，方便随时复现四种状态：
  //   ?fail=1  模拟加载失败（错误态）  ?empty=1 模拟成功但 0 条（空态）  ?slow=1 延长加载时间（便于观察加载态）
  // 取不到数据时**不再退回任何内置假数据**（原 js/data.js 已删除）：直接进错误态 + 重试按钮。
  // 理由：页面一旦能显示假数据，就分不清「接口通了」和「页面兜底了」——验收必须一眼辨真假。
  function currentApiBase() {
    // ★ 静态站与接口不在同一个域！
    //   静态站：https://<envId>-<租户号>.tcloudbaseapp.com   （CloudBase 静态托管）
    //   接口  ：https://<envId>.service.tcloudbase.com       （HTTP 访问服务，/api/*）
    // 直接 fetch("/api/hot") 会打到静态托管自己 → 404 → 页面退回示例数据（Day 17 实测踩过）。
    // 平台会自动在接口响应里带 access-control-allow-origin = 静态站域名，跨域由平台兜底，无需手配。
    // 规则：从当前主机名反推环境 ID，再拼出接口域名；识别不出（file:// 本地预览等）返回空串走兜底。
    var host = location.hostname || "";
    var m = host.match(/^(.+?)-\d+\.tcloudbaseapp\.com$/);
    if (m) return "https://" + m[1] + ".service.tcloudbase.com";
    if (host.indexOf(".service.tcloudbase.com") !== -1) return location.origin;
    return "";
  }

  /**
   * 带超时的 JSON GET。云函数有执行上限，上游卡住必须主动放弃，否则页面会一直转圈。
   * timeoutMs 到了就 abort，AbortError 会被上层翻成中文提示。
   */
  function getJson(url, timeoutMs) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, timeoutMs);
    return fetch(url, { signal: ctl.signal })
      .then(function (resp) {
        if (!resp || !resp.ok) throw new Error("HTTP " + (resp ? resp.status : "未响应"));
        return resp.json();
      })
      .then(function (json) {
        if (!json || json.ok !== true) {
          // 后端 error 有两种形状：新版是**中文字符串**，旧版是 {code,message} 对象。
          // 两种都认，避免只认一种时把真实原因吞成一句空泛的「接口返回 ok:false」。
          var errText =
            typeof json.error === "string"
              ? json.error
              : json.error && json.error.message;
          throw new Error(errText || "接口返回 ok:false");
        }
        return json;
      })
      .then(function (json) {
        clearTimeout(timer);
        return json;
      }, function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  function loadData() {
    var params = new URLSearchParams(location.search);
    var fail = params.get("fail") === "1";
    var empty = params.get("empty") === "1";
    var slow = params.get("slow") === "1";

    // 演示开关优先：这两个是纯前端造的假状态，不该真去打扰后端。
    if (fail) {
      return new Promise(function (_r, reject) {
        setTimeout(function () { reject(new Error("模拟加载失败")); }, slow ? 2000 : 120);
      });
    }
    if (empty) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          state.lastUpdatedAt = ""; // 空态没有数据行，同样清掉残留
          resolve({ items: [], source: "empty" });
        }, slow ? 2000 : 120);
      });
    }

    var base = currentApiBase();
    // 识别不出接口域名（本地 file:// 预览等）就没法取数 —— 明确报错，不再退回任何内置假数据。
    if (!base || typeof fetch !== "function") {
      return new Promise(function (_r, reject) {
        setTimeout(function () {
          reject(new Error("未连接到云端接口（请通过静态托管的公网地址访问）"));
        }, slow ? 2000 : 120);
      });
    }

    // 三个平台**并行**各取一份：这样每个榜单卡片都有该平台自己的数据，
    // 不会因为「全网混合排序」把某个平台整个挤掉（单个平台失败不影响其它两个）。
    var boards = window.BOARDS || window.PLATFORMS || [];
    var timeoutMs = slow ? 12000 : 6000;
    var jobs = boards.map(function (b) {
      var url = base + "/api/hot?platform=" + encodeURIComponent(b.key) + "&limit=" + PER_BOARD_LIMIT;
      // 单平台失败降级为「该平台 0 条」，不让一个源的问题拖垮整页
      return getJson(url, timeoutMs).catch(function () { return null; });
    });

    // slow=1 时人为垫 2 秒：真实接口太快会让「加载中」一闪而过，观察不到（Day 13 起的演示语义）
    var slowDelay = slow
      ? new Promise(function (resolve) { setTimeout(resolve, 2000); })
      : Promise.resolve();

    return Promise.all([slowDelay].concat(jobs)).then(function (results) {
      var items = [];
      var date = "";
      var okCount = 0;
      results.slice(1).forEach(function (json) {
        if (!json) return;                       // 该平台取数失败，跳过
        okCount++;
        if (json.date) date = json.date;
        items = items.concat(Array.isArray(json.data) ? json.data : []);
      });
      if (okCount === 0) throw new Error("三个平台的热搜接口都没有返回数据");

      state.sourceDate = date;
      // 更新时间 = 这批数据里最新的入库时间（接口返回的 createdAt，即真实抓取时间），
      // 不是「页面打开时间」——右上角显示的就是它。
      state.lastUpdatedAt = latestCreatedAtOf(items);
      return { items: items, source: "live" };
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

  // Day 14：视图路由（hash 路由，无需后端 / 路由库）。3 个可独立访问视图：
  //   #/home        首页（热搜列表）
  //   #/platforms   平台列表页
  //   #/detail/:id  热搜详情页（id = 平台-排名，如 weibo-1）
  //   #/fav         我的收藏   #/about  关于
  // 切换视图即切换 hash，地址栏可见、可直接分享、可用浏览器后退——满足「页面之间怎么切换」。
  function itemId(it) { return it.platform + "-" + it.rank; }
  // 详情页按 id 找条目。**数据源只有接口返回的 state.items**（原内置假数据已移除）；
  // 直接用地址打开详情页时数据可能还没回来，调用方会先触发加载再重渲染。
  function findItemById(id) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id || itemId(state.items[i]) === id) return state.items[i];
    }
    return null;
  }

  function currentRoute() {
    var h = (location.hash || "#/home").replace(/^#/, "");
    if (h.indexOf("/detail/") === 0) return "detail";
    if (h.indexOf("/fav") === 0) return "fav";
    if (h.indexOf("/platforms") === 0) return "platforms";
    if (h.indexOf("/check") === 0) return "check";
    if (h.indexOf("/about") === 0) return "about";
    return "home";
  }

  function toggleView(id, show) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", !show);
  }

  function applyRoute() {
    var view = currentRoute();
    state.view = view;
    state.favOnly = (view === "fav");   // 我的收藏视图 = 仅看收藏
    if (view === "detail") {
      var m = (location.hash || "").match(/\/detail\/([^?#]+)/);
      state.detailId = m ? decodeURIComponent(m[1]) : null;
    }

    // 同一时刻只显示一个视图容器
    toggleView("view-list", view === "home" || view === "fav");
    toggleView("view-platforms", view === "platforms");
    toggleView("view-detail", view === "detail");
    toggleView("view-check", view === "check");
    toggleView("view-about", view === "about");

    // 平台标签仅「首页」视图显示（我的收藏不显示平台切换）
    var tabs = document.getElementById("platformTabs");
    if (tabs) tabs.classList.toggle("hidden", view !== "home");

    // 主导航高亮（可访问导航标签）
    Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function (a) {
      a.classList.toggle("is-active", a.getAttribute("data-view") === view);
    });

    // 地址栏指示（页面内可见的完整地址，便于核对视图与状态参数）
    var routeLabel = document.getElementById("routeLabel");
    if (routeLabel) routeLabel.textContent = location.href;

    // 按视图分发渲染
    if (view === "detail") {
      renderDetail();
    } else if (view === "platforms") {
      // 首次进入且无数据时触发加载；否则直接渲染已有状态（含四态）
      if (pState.items.length === 0 && !pState.loading && !pState.error) refreshPlatforms();
      else renderPlatforms();
    } else if (view === "check") {
      renderCheck();            // 立即画出检查台骨架
      checkHealth();            // 再异步探测健康接口
      if (state.items.length === 0 && !state.loading && !state.error) refresh();
    } else {
      syncSearchScope();   // 搜索框范围提示随视图切换
      renderList();        // 重新渲染当前列表视图
    }
  }

  // 数据来源标注：数据只可能来自云端接口，拿到就标注「数据来自云端数据库 · <平台> · <日期>」；
  // 拿不到（加载中 / 接口失败 / 空结果）就**不标注**，绝不写「示例数据」——避免真假难辨。
  // 把数据里**实际出现**的 platform key 翻成中文名（读 config.js 的 PLATFORMS，不写死）
  function platformNamesOf(items) {
    var seen = {};
    (items || []).forEach(function (it) {
      if (it.platform) seen[it.platform] = 1;
    });
    var names = (window.PLATFORMS || [])
      .filter(function (p) { return seen[p.key]; })
      .map(function (p) { return p.name; });
    return names.length ? names.join("、") : "公开榜单";
  }

  // Day 20 余力加练：取列表里最新的 createdAt（ISO 字符串，统一格式可直接比大小；
  // 用 Date.parse 比更稳，兼容个别网关把它折叠成小写键的情况——行里字段由接口保证，直接读即可）。
  // 返回 "" 表示没有可用的时间（空列表 / 行上没有 createdAt）。
  function latestCreatedAtOf(items) {
    var latest = "";
    (items || []).forEach(function (it) {
      var t = it && it.createdAt ? Date.parse(it.createdAt) : NaN;
      if (!Number.isNaN(t)) {
        var cur = latest === "" ? -Infinity : Date.parse(latest);
        if (t > cur) latest = it.createdAt;
      }
    });
    return latest;
  }

  // 把 ISO 时间转成页面友好的本地写法：2026-10-08T19:51:34+08:00 → 10-08 19:51
  function formatUpdatedAt(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return (
      pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  function renderDataSourceBadge() {
    var el = document.getElementById("dataSourceBadge");
    if (!el) return;
    if (state.loading || state.error) { el.textContent = ""; el.className = "data-source"; return; }
    if (state.items.length === 0) { el.textContent = ""; el.className = "data-source"; return; }

    // 来源不写死：榜单来自哪几个平台是动态的，标注必须跟着**实际返回的数据**走，否则就是假标注。
    el.textContent =
      "数据来自云端数据库 · " + platformNamesOf(state.items) +
      (state.sourceDate ? " · " + state.sourceDate : "");
    el.className = "data-source is-live";
  }

  /**
   * 右上角「数据更新时间」：显示接口返回的真实抓取时间（数据行里最新的 createdAt）。
   * 注意它不是「页面打开时间」——刷新页面后只要库里没新数据，这个时间就不会变。
   */
  function renderUpdatedAt() {
    var el = document.getElementById("updateTime");
    if (!el) return;
    if (!state.lastUpdatedAt) {
      el.textContent = state.loading ? "数据更新中…" : "";
      return;
    }
    el.textContent = "数据更新于 " + formatUpdatedAt(state.lastUpdatedAt);
  }

  /** 单条热搜：<li>序号 · 标题 · 热度（序号在前，热度靠右） */
  function buildHotItem(it) {
    var li = document.createElement("li");
    li.className = "hot-item";

    // 收藏按钮（带「处理中 / 已收藏 / 失败」状态）
    var favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "btn-fav-card";
    favBtn.setAttribute("aria-label", "收藏");
    setFavBtnState(favBtn, it);
    favBtn.addEventListener("click", function (e) {
      e.stopPropagation();   // 避免触发整条进入详情
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
    li.addEventListener("click", function () { goDetail(it); });
    return li;
  }

  /** 一个平台的榜单卡片：栏头（平台名 + 榜单名）+ 栏内条目 */
  function buildBoardCard(board, list) {
    var sec = document.createElement("section");
    sec.className = "board-card";
    sec.setAttribute("data-platform", board.key);

    var head = document.createElement("div");
    head.className = "board-head";

    var name = document.createElement("span");
    name.className = "board-name";
    name.textContent = board.name;

    var boardTitle = document.createElement("span");
    boardTitle.className = "board-title";
    boardTitle.textContent = board.board || "热榜";

    var count = document.createElement("span");
    count.className = "board-count";
    count.textContent = list.length + " 条";

    head.appendChild(name);
    head.appendChild(boardTitle);
    head.appendChild(count);

    var ul = document.createElement("ul");
    ul.className = "hot-list";
    if (list.length === 0) {
      // 用独立的 .board-empty（不是 .empty-box）：后者是「整页无结果」的语义，
      // 单平台没数据时不能让整页看起来像空态。
      var empty = document.createElement("li");
      empty.className = "board-empty";
      empty.textContent = "暂无数据";
      ul.appendChild(empty);
    } else {
      list.forEach(function (it) { ul.appendChild(buildHotItem(it)); });
    }

    sec.appendChild(head);
    sec.appendChild(ul);
    return sec;
  }

  function renderList() {
    var root = document.getElementById("hotList");
    if (!root) return;
    renderDataSourceBadge();
    renderUpdatedAt();

    // Day 13：加载中状态（spinner），优先于其余分支
    if (state.loading) {
      root.innerHTML = "";
      var loadingBox = document.createElement("div");
      loadingBox.className = "loading-box";
      loadingBox.innerHTML = '<span class="spinner" aria-hidden="true"></span> 加载中…';
      root.appendChild(loadingBox);
      setResultCount(0);
      return;
    }

    // 加载失败：显示提示 + 重试，不白屏
    if (state.error) {
      root.innerHTML = "";
      var box = document.createElement("div");
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
      root.appendChild(box);
      return;
    }

    var items = filteredItems();
    root.innerHTML = "";
    setResultCount(items.length);   // Day 12：先更新数量（含空结果与有结果两种）

    if (items.length === 0) {
      var empty = document.createElement("div");
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
      root.appendChild(empty);
      return;
    }

    // 三平台并列：按 window.BOARDS 的顺序画卡片；
    // 平台标签选中某一个时只画那一张（与「平台筛选」的既有语义保持一致）。
    var boards = window.BOARDS || window.PLATFORMS || [];
    boards.forEach(function (b) {
      if (state.platform !== "all" && state.platform !== b.key) return;
      var list = items.filter(function (it) { return it.platform === b.key; });
      // 收藏视图下不画空卡片（没有该平台的收藏时不占位）
      if (list.length === 0 && state.favOnly) return;
      root.appendChild(buildBoardCard(b, list));
    });
  }

  // 进入热搜详情页（独立路由视图，替代原弹窗）
  function goDetail(it) {
    location.hash = "#/detail/" + encodeURIComponent(itemId(it));
  }

  // 热搜详情页渲染（#/detail/:id 可直接访问，数据来自接口返回的 state.items）
  function renderDetail() {
    var root = document.getElementById("detailContent");
    if (!root) return;
    root.innerHTML = "";

    var it = state.detailId ? findItemById(state.detailId) : null;

    // 找不到该条热搜（链接失效 / id 错误）→ 明确反馈，不白屏
    if (!it) {
      var nf = document.createElement("p");
      nf.className = "empty-box";
      nf.textContent = "没有找到这条热搜（可能链接已失效）。";
      root.appendChild(nf);
      return;
    }

    var card = document.createElement("div");
    card.className = "detail-card";

    var back = document.createElement("a");
    back.className = "detail-back";
    back.href = "#/home";
    back.textContent = "← 返回热搜列表";
    card.appendChild(back);

    var rank = document.createElement("p");
    rank.className = "detail-rank";
    rank.textContent = "排名第 " + it.rank;
    card.appendChild(rank);

    var h = document.createElement("h2");
    h.className = "detail-title";
    h.textContent = it.title;
    card.appendChild(h);

    var meta = document.createElement("p");
    meta.className = "detail-meta";
    meta.textContent = "热度 " + it.heat + " · 来源 " + platformName(it.platform);
    card.appendChild(meta);

    // 去原平台查看（新标签打开外链）
    var actions = document.createElement("div");
    actions.className = "detail-actions";
    var go = document.createElement("a");
    go.className = "btn-go";
    go.href = it.url;
    go.target = "_blank";
    go.rel = "noopener";
    go.textContent = "去原平台查看";
    actions.appendChild(go);

    // 收藏切换
    var fav = window.FavStore.isFav(it);
    var favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "btn-fav-toggle" + (fav ? " is-fav" : "");
    favBtn.textContent = fav ? "★ 已收藏" : "☆ 收藏";
    favBtn.addEventListener("click", function () {
      var wasFav = window.FavStore.isFav(it);
      window.FavStore.toggleFav(it);
      showToast(!wasFav ? "已收藏 ✓ " + it.title : "已取消收藏 " + it.title);
      renderDetail();        // 刷新详情页状态
      if (state.view === "home" || state.view === "fav") renderList();
    });
    actions.appendChild(favBtn);
    card.appendChild(actions);

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

    root.appendChild(card);
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
    loadData().then(function (r) {
      state.items = r.items || [];
      state.error = false;
      state.loading = false;
      renderList();
      if (state.view === "check") renderCheck();   // 检查台的核心表数据跟着一起刷新
      // 直接用地址打开详情页时，路由先于数据到达；数据回来后补渲染一次。
      if (state.view === "detail") renderDetail();
      refreshing = false;
      setRefreshBtn(false);                         // 恢复按钮
      showToast("已刷新 ✓ 共 " + state.items.length + " 条");
    }).catch(function () {
      state.error = true;
      state.loading = false;
      renderList();                                 // 显示失败提示（错误框 + 重试）
      if (state.view === "check") renderCheck();
      refreshing = false;
      setRefreshBtn(false);                         // 恢复按钮
      showToast("刷新失败，请稍后重试", true);
    });
  }

  // 平台列表页数据加载（与首页列表独立；支持 ?slow / ?fail / ?empty 触发四态）
  function loadPlatforms() {
    return new Promise(function (resolve, reject) {
      var params = new URLSearchParams(location.search);
      var fail = params.get("fail") === "1";
      var empty = params.get("empty") === "1";
      var slow = params.get("slow") === "1";
      var delay = slow ? 2000 : 120;
      setTimeout(function () {
        if (fail) { reject(new Error("模拟加载失败")); return; }
        resolve(empty ? [] : (window.PLATFORMS || []));
      }, delay);
    });
  }

  function refreshPlatforms() {
    pState.loading = true;
    pState.error = false;
    renderPlatforms();                  // 立即显示「加载中」
    loadPlatforms()
      .then(function (data) {
        pState.items = data;
        pState.error = false;
        pState.loading = false;
        renderPlatforms();
      })
      .catch(function () {
        pState.error = true;
        pState.loading = false;
        renderPlatforms();              // 显示错误框 + 重试
      });
  }

  function renderPlatforms() {
    var ul = document.getElementById("platformList");
    if (!ul) return;

    // 加载中状态
    if (pState.loading) {
      ul.innerHTML = "";
      var loadingBox = document.createElement("li");
      loadingBox.className = "loading-box";
      loadingBox.innerHTML = '<span class="spinner" aria-hidden="true"></span> 加载中…';
      ul.appendChild(loadingBox);
      return;
    }

    // 请求失败状态
    if (pState.error) {
      ul.innerHTML = "";
      var box = document.createElement("li");
      box.className = "error-box";
      var p = document.createElement("p");
      p.textContent = "暂时拿不到平台数据，请稍后重试。";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-retry";
      btn.textContent = "重试";
      btn.addEventListener("click", function () { refreshPlatforms(); });
      box.appendChild(p);
      box.appendChild(btn);
      ul.appendChild(box);
      return;
    }

    var items = pState.items;
    ul.innerHTML = "";

    // 没有结果状态
    if (items.length === 0) {
      var empty = document.createElement("li");
      empty.className = "empty-box";
      empty.textContent = "没有结果";
      ul.appendChild(empty);
      return;
    }

    // 加载成功状态
    items.forEach(function (pl) {
      var li = document.createElement("li");
      li.className = "platform-card";

      var a = document.createElement("a");
      a.className = "platform-link";
      a.href = "#/home";
      // 点击后进入首页，并预选该平台（在 hashchange 前写入 state，applyRoute 渲染时生效）
      a.addEventListener("click", function () { state.platform = pl.key; });

      var name = document.createElement("span");
      name.className = "platform-name";
      name.textContent = pl.name;

      var count = document.createElement("span");
      count.className = "platform-count";
      var n = state.items.filter(function (d) { return d.platform === pl.key; }).length;
      count.textContent = n + " 条热搜";

      a.appendChild(name);
      a.appendChild(count);
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  // ============================================================
  // 检查台（#/check）：三项自证「页面 → 公网接口 → 数据库」链路真的通
  //   ① 健康状态：GET /api/health
  //   ② 核心表真实数据：trends 表经 GET /api/hot 读回来的前几条
  //   ③ 收藏写入测试：POST /api/favorites 真写一条，看服务端回什么
  // ============================================================

  function renderCheck() {
    var ul = document.getElementById("checkList");
    if (!ul) return;
    ul.innerHTML = "";

    function line(text, cls) {
      var li = document.createElement("li");
      li.className = "check-item" + (cls ? " " + cls : "");
      li.textContent = text;
      return li;
    }

    if (state.loading) { ul.appendChild(line("加载中…")); return; }
    if (state.error) { ul.appendChild(line("读取失败，请回首页重试。", "is-bad")); return; }
    if (!state.items.length) { ul.appendChild(line("核心表 trends 暂无当日数据。")); return; }

    state.items.slice(0, 5).forEach(function (it) {
      var li = document.createElement("li");
      li.className = "check-item";

      var plat = document.createElement("span");
      plat.className = "check-plat";
      plat.textContent = platformName(it.platform);

      var title = document.createElement("span");
      title.className = "check-title-text";
      title.textContent = it.title;

      var heat = document.createElement("span");
      heat.className = "check-heat";
      heat.textContent = it.heat;

      li.appendChild(plat);
      li.appendChild(title);
      li.appendChild(heat);
      ul.appendChild(li);
    });

    var more = document.createElement("li");
    more.className = "check-item is-muted";
    more.textContent = "共读到 " + state.items.length + " 条（此处显示前 5 条），数据日期 " + (state.sourceDate || "-");
    ul.appendChild(more);
  }

  function checkHealth() {
    var el = document.getElementById("checkHealth");
    if (!el) return;
    var base = currentApiBase();
    if (!base) {
      el.textContent = "✗ 未连接到云端接口（请通过静态托管的公网地址访问）";
      el.className = "check-line is-bad";
      return;
    }
    el.textContent = "检测中…";
    el.className = "check-line";
    getJson(base + "/api/health", 6000)
      .then(function (j) {
        var t = j && j.time ? formatUpdatedAt(j.time) : "";
        el.textContent =
          "✓ 正常 · service=" + (j && j.service ? j.service : "-") +
          (t ? " · 服务端时间 " + t : "");
        el.className = "check-line is-ok";
      })
      .catch(function (err) {
        el.textContent = "✗ 健康检查失败：" + String((err && err.message) || err);
        el.className = "check-line is-bad";
      });
  }

  // ③ 写入测试：拿列表第一条真实热搜写一次收藏。
  // 再点一次会命中服务端判重（409「已经收藏过了」）—— 这恰好证明写入真的落到库里了。
  function runWriteTest() {
    var out = document.getElementById("checkWriteOut");
    var btn = document.getElementById("btnWriteTest");
    if (!out || !btn) return;

    var base = currentApiBase();
    if (!base) { out.textContent = "未连接到云端接口"; return; }
    if (!state.items.length) { out.textContent = "还没有读到真实热搜，请先回首页加载一次。"; return; }

    var it = state.items[0];
    btn.disabled = true;
    btn.textContent = "写入中…";
    out.textContent = "POST /api/favorites …";

    fetch(base + "/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trendId: it.id || itemId(it),
        title: it.title,
        platform: it.platform,
        note: "检查台写入测试"
      })
    })
      .then(function (r) {
        return r.text().then(function (t) { return { status: r.status, text: t }; });
      })
      .then(function (res) {
        var pretty = res.text;
        try { pretty = JSON.stringify(JSON.parse(res.text), null, 2); } catch (e) { /* 非 JSON 原样展示 */ }
        out.textContent = "HTTP " + res.status + "\n" + pretty;
      })
      .catch(function (err) {
        out.textContent = "写入失败：" + String((err && err.message) || err);
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "写入一条收藏测试";
      });
  }

  // ④ 删除测试：删除比新增更容易出事，所以加二次确认。
  //   先 GET 列表找到「写入测试」留下的那条（note 含“检查台”）→ 弹窗讲清删哪条 → 确认后才 DELETE
  //   → 删完再 GET 一次，证明它真的不再返回。
  function runDeleteTest() {
    var out = document.getElementById("checkDeleteOut");
    var btn = document.getElementById("btnDeleteTest");
    if (!out || !btn) return;

    var base = currentApiBase();
    if (!base) { out.textContent = "未连接到云端接口（请通过静态托管的公网地址访问）"; return; }

    btn.disabled = true;
    btn.textContent = "查找中…";
    out.textContent = "GET /api/favorites …（找写入测试留下的那条）";

    getJson(base + "/api/favorites", 8000)
      .then(function (j) {
        var list = (j && j.data) || [];
        var target = null;
        for (var i = 0; i < list.length; i++) {
          if (String(list[i].note || "").indexOf("检查台") !== -1) { target = list[i]; break; }
        }
        if (!target) {
          out.textContent = "没找到写入测试留下的收藏（note 含“检查台”）。请先点上面的「写入一条收藏测试」。";
          return null;
        }
        // 二次确认：把要删的是哪一条讲清楚，防止误删
        var msg =
          "确认删除这条收藏吗？\n\n" +
          "id：" + target.id + "\n" +
          "标题：" + target.title + "\n" +
          "平台：" + target.platform + "\n" +
          "备注：" + (target.note || "") + "\n\n" +
          "（软删除：数据仍在库里，可用 db/recover_favorite.sql 找回）";
        if (!window.confirm(msg)) {
          out.textContent = "已取消删除（未调用 DELETE 接口）。";
          return null;
        }
        out.textContent = "DELETE /api/favorites/" + target.id + " …";
        btn.textContent = "删除中…";
        return fetch(base + "/api/favorites/" + encodeURIComponent(target.id), { method: "DELETE" })
          .then(function (r) {
            return r.text().then(function (t) { return { status: r.status, text: t }; });
          })
          .then(function (res) {
            var pretty = res.text;
            try { pretty = JSON.stringify(JSON.parse(res.text), null, 2); } catch (e) { /* 非 JSON 原样展示 */ }
            out.textContent = "HTTP " + res.status + "\n" + pretty;
            // 删完再拉一次列表，确认它真的不再返回
            return getJson(base + "/api/favorites", 8000).then(function (j2) {
              var still = ((j2 && j2.data) || []).some(function (x) { return x.id === target.id; });
              out.textContent +=
                "\n\n删除后复查 GET /api/favorites：该条" +
                (still ? "仍在列表中（异常）" : "已不再返回 ✓") +
                "，当前共 " + ((j2 && j2.count) || 0) + " 条。";
            });
          });
      })
      .catch(function (err) {
        out.textContent = "删除失败：" + String((err && err.message) || err);
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "删除测试（需二次确认）";
      });
  }

  function init() {
    var refreshBtn = document.getElementById("btnRefresh");
    if (refreshBtn) refreshBtn.addEventListener("click", function () { refresh(); });

    // 检查台：收藏写入测试入口
    var writeBtn = document.getElementById("btnWriteTest");
    if (writeBtn) writeBtn.addEventListener("click", function () { runWriteTest(); });

    // 检查台：收藏删除测试入口（带二次确认）
    var deleteBtn = document.getElementById("btnDeleteTest");
    if (deleteBtn) deleteBtn.addEventListener("click", function () { runDeleteTest(); });

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

    // Day 14：hash 路由——点击导航的 #/xxx 链接即切换视图
    window.addEventListener("hashchange", applyRoute);

    renderTabs();
    applyRoute();   // 按初始 hash 决定显示哪个视图并触发对应数据加载
    // 首页 / 我的收藏 走 refresh 加载热搜列表（平台列表页由 applyRoute 内部惰性加载）
    if (state.view !== "platforms") refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
