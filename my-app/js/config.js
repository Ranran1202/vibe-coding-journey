// my-app/js/config.js
// 平台清单。第 3 步的平台切换标签将读取这里，目前仅作数据来源定义。
window.PLATFORMS = [
  { key: "weibo", name: "微博" },
  { key: "baidu", name: "百度" },
  { key: "douyin", name: "抖音" },
  // Day 17 补：同步云函数按附录 F 用的是 B站（bilibili），这里补上平台项，
  // 否则同步进来的 B站数据在平台切换与筛选里显示不出来。
  { key: "bilibili", name: "B站" }
];
