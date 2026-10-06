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
    sourceNote: ""       // 退回示例数据时的原因（用于页面提示）
  };

  // 平台列表页独立的数据状态（与首页列表互不干扰，便于各自演示四态）
  var pState = { loading: false, error: false, items: [] };

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
  // 兜底策略：接口不可用时**不白屏**，退回本地 data.js 并标记为「示例数据」，
  //          对应 Day 17 清单里的降级要求（数据源不可用 → 保留 seed 并标注）。
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

  function fallbackToSeed(reason) {
    state.dataSource = "seed";
    state.sourceNote = reason;
    return { items: (window.HOT_DATA || []), source: "seed" };
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
        setTimeout(function () { resolve({ items: [], source: "empty" }); }, slow ? 2000 : 120);
      });
    }

    var base = currentApiBase();
    // fetch 不可用（极老浏览器 / jsdom 测试环境）时同样退回示例数据，保证页面可用不白屏。
    // slow=1 的语义是「延长加载时间便于观察加载态」，兜底路径同样要遵守（测试断言依赖这一点）。
    if (!base || typeof fetch !== "function") {
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(fallbackToSeed("本地预览，未连接云端接口")); }, slow ? 2000 : 120);
      });
    }

    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, slow ? 12000 : 6000);
    // slow=1 时人为垫 2 秒：真实接口太快会让「加载中」一闪而过，观察不到（Day 13 起的演示语义）
    var slowDelay = slow
      ? new Promise(function (resolve) { setTimeout(resolve, 2000); })
      : Promise.resolve();
    return Promise.all([slowDelay, fetch(base + "/api/hot", { signal: ctl.signal })])
      .then(function (results) {
        // ⚠️ Promise.all 的结果是个数组：[slowDelay 的结果(undefined), fetch 的 Response]。
        //   必须按下标取出 Response —— 第一版直接把整个数组当 Response 用（resp.ok === undefined），
        //   导致接口明明是通的、页面却永远退回示例数据（Day 17 真机验证抓到的）。
        var resp = results[1];
        if (!resp || !resp.ok) throw new Error("HTTP " + (resp ? resp.status : "未响应"));
        return resp.json();
      })
      .then(function (json) {
        if (!json || json.ok !== true) {
          throw new Error((json && json.error && json.error.message) || "接口返回 ok:false");
        }
        // 接口会告诉我们这批数据是「今天同步的真实数据」还是「历史 seed 兜底数据」
        state.dataSource = json.source === "seed" ? "seed" : "live";
        state.sourceDate = json.date || "";
        return { items: Array.isArray(json.data) ? json.data : [], source: json.source || "live" };
      })
      .catch(function (err) {
        // 连不上接口：退回示例数据，让页面仍有内容可看（不白屏）
        return fallbackToSeed(String((err && err.message) || err));
      })
      .then(function (r) {
        clearTimeout(timer);
        return r;
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
  function findItemById(id) {
    var data = window.HOT_DATA || [];
    for (var i = 0; i < data.length; i++) if (itemId(data[i]) === id) return data[i];
    return null;
  }

  function currentRoute() {
    var h = (location.hash || "#/home").replace(/^#/, "");
    if (h.indexOf("/detail/") === 0) return "detail";
    if (h.indexOf("/fav") === 0) return "fav";
    if (h.indexOf("/platforms") === 0) return "platforms";
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
    } else {
      syncSearchScope();   // 搜索框范围提示随视图切换
      renderList();        // 重新渲染当前列表视图
    }
  }

  // Day 17：数据来源标注。
  //   连上云端接口且拿到当日同步的真实数据 → 显示「真实数据 · 来源：百度热搜榜 · <日期>」
  //   退回本地示例数据（接口不可用 / 本地预览）→ 显示「示例数据」并带原因
  //   —— 这一行就是完成标准里「页面上显示的真实数据」的自证：截图里一眼能看出真假。
  function renderDataSourceBadge() {
    var el = document.getElementById("dataSourceBadge");
    if (!el) return;
    if (state.loading) { el.textContent = ""; el.className = "data-source"; return; }

    if (state.dataSource === "seed") {
      el.textContent = "示例数据" + (state.sourceNote ? "（" + state.sourceNote + "）" : "");
      el.className = "data-source is-seed";
    } else if (state.dataSource === "empty") {
      el.textContent = "";
      el.className = "data-source";
    } else {
      el.textContent = "真实数据 · 来源：百度热搜榜" + (state.sourceDate ? " · " + state.sourceDate : "");
      el.className = "data-source is-live";
    }
  }

  function renderList() {
    var ul = document.getElementById("hotList");
    if (!ul) return;
    renderDataSourceBadge();   // Day 17：先更新「真实数据 / 示例数据」来源标注

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

      li.addEventListener("click", function () { goDetail(it); });

      ul.appendChild(li);
    });
  }

  // 进入热搜详情页（独立路由视图，替代原弹窗）
  function goDetail(it) {
    location.hash = "#/detail/" + encodeURIComponent(itemId(it));
  }

  // 热搜详情页渲染（#/detail/:id 可直接访问，数据来自静态 HOT_DATA）
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
      window.FavStore.toggleFav(it);
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
      refreshing = false;
      setRefreshBtn(false);                         // 恢复按钮
      showToast("已刷新 ✓ 共 " + state.items.length + " 条");
    }).catch(function () {
      state.error = true;
      state.loading = false;
      renderList();                                 // 显示失败提示（错误框 + 重试）
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
      var n = (window.HOT_DATA || []).filter(function (d) { return d.platform === pl.key; }).length;
      count.textContent = n + " 条热搜";

      a.appendChild(name);
      a.appendChild(count);
      li.appendChild(a);
      ul.appendChild(li);
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
