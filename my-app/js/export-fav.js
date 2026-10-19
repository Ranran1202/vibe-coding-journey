// my-app/js/export-fav.js
// 余力加练：导出「我的收藏」为 JSON 文件（纯前端，读 localStorage，不碰任何后端接口）。
// 独立脚本，不修改 app.js 主逻辑；仅在「我的收藏」视图（hash 以 #/fav 开头）显示按钮。
(function () {
  "use strict";
  var KEY = "hotsrch:fav:v1";
  var btn = document.getElementById("btnExportFav");

  function syncVisibility() {
    if (!btn) return;
    var onFav = location.hash.indexOf("/fav") === 0;
    btn.hidden = !onFav;
  }

  function exportFav() {
    var raw = localStorage.getItem(KEY);
    var all = raw ? JSON.parse(raw) : {};
    var rows = Object.keys(all)
      .filter(function (k) { return all[k] && all[k].fav; })
      .map(function (k) {
        var p = k.split("|");
        return { platform: p[0], title: p.slice(1).join("|"), note: all[k].note || "", exportedAt: new Date().toISOString() };
      });
    var blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "我的收藏-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (window.showToast) window.showToast("已导出 " + rows.length + " 条收藏 ✓");
    else alert("已导出 " + rows.length + " 条收藏");
  }

  if (btn) {
    btn.addEventListener("click", exportFav);
    window.addEventListener("hashchange", syncVisibility);
    syncVisibility();
  }
})();
