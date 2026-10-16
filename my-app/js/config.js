// my-app/js/config.js
// 平台清单：页面按这里渲染三平台并列榜单；key 必须与数据库 trends.platform 取值一致。
//
// Day 20 收尾：百度（baidu）已从清单移除——附录 F 没给百度的公开接口，
// 同步云函数只接微博 / 抖音 / B站 三个源，留着 baidu 只会多出一个永远空着的栏目。
window.PLATFORMS = [
  { key: "weibo", name: "微博", board: "微博热搜榜" },
  { key: "douyin", name: "抖音", board: "抖音热点榜" },
  { key: "bilibili", name: "B站", board: "B站热门榜" }
];

// 首页主体：三个平台并列的榜单卡片，顺序即页面从上到下（窄屏）/左到右（宽屏）的展示顺序。
window.BOARDS = window.PLATFORMS;
