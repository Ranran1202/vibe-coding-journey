// my-app/js/store.js
// 收藏 / 备注的本地存储层（localStorage 实现，无后端、无登录）。
// 第 5 步引入：每条热搜可收藏（★）、可写备注，刷新后依然保留。
(function () {
  "use strict";

  var KEY = "hotsrch:fav:v1";

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function writeAll(obj) {
    try {
      localStorage.setItem(KEY, JSON.stringify(obj));
    } catch (e) {
      /* 隐私模式或容量满时静默失败，不影响主流程 */
    }
  }

  // 用「平台 + 标题」作为一条热搜的稳定标识（数据里没有独立 id 字段）。
  function idOf(item) {
    return item.platform + "|" + item.title;
  }

  function get(id) {
    var all = readAll();
    return all[id] || { fav: false, note: "" };
  }

  function set(id, patch) {
    var all = readAll();
    all[id] = Object.assign({}, all[id] || {}, patch);
    writeAll(all);
  }

  function isFav(item) {
    return !!get(idOf(item)).fav;
  }

  function toggleFav(item) {
    var cur = get(idOf(item));
    set(idOf(item), { fav: !cur.fav });
    return !cur.fav; // 返回切换后的状态
  }

  function getNote(item) {
    return get(idOf(item)).note || "";
  }

  function setNote(item, text) {
    set(idOf(item), { note: text });
  }

  function getAllFavIds() {
    var all = readAll();
    return Object.keys(all).filter(function (k) {
      return all[k] && all[k].fav;
    });
  }

  window.FavStore = {
    idOf: idOf,
    isFav: isFav,
    toggleFav: toggleFav,
    getNote: getNote,
    setNote: setNote,
    getAllFavIds: getAllFavIds
  };
})();
