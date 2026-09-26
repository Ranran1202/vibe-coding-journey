// my-app/js/data.js
// 示例热搜数据（当前为静态假数据，第 5 步会替换为真实数据源）。
// HotItem 字段：
//   rank     排名（数字）
//   title    标题
//   heat     热度（字符串，含单位，例如 "523 万"）
//   platform 来源平台 key，对应 config.js 里的 PLATFORMS
//   url      去原平台查看的链接（占位，第 4 步会用到）
window.HOT_DATA = [
  { rank: 1, title: "示例热搜一：某地迎来初雪刷屏", heat: "523 万", platform: "weibo", url: "https://s.weibo.com/top/summary" },
  { rank: 2, title: "示例热搜二：新款手机今日正式发布", heat: "412 万", platform: "baidu", url: "https://top.baidu.com/board" },
  { rank: 3, title: "示例热搜三：这部剧大结局引热议", heat: "388 万", platform: "douyin", url: "https://www.douyin.com/hot" },
  { rank: 4, title: "示例热搜四：周末周边游攻略走红", heat: "301 万", platform: "weibo", url: "https://s.weibo.com/top/summary" },
  { rank: 5, title: "示例热搜五：一杯奶茶的热量真相", heat: "276 万", platform: "baidu", url: "https://top.baidu.com/board" }
];
