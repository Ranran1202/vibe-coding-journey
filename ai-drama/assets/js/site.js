/* ============================================================
   《我的AI不预测股价，它预测人性》站点脚本
   纯原生 JavaScript，无框架、无后端
   数据来自 data/episodes.json 和 data/story.json
   注意：因为用了 fetch 读 JSON，必须通过本地服务器打开页面
   ============================================================ */

/* ---------- 小工具 ---------- */

// 快速创建元素
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

// 把内容塞进某个 id 的容器（容器不存在就安静跳过）
function mount(id, ...nodes) {
  const box = document.getElementById(id);
  if (!box) return;
  nodes.forEach(function (n) { box.appendChild(n); });
}

// 统一展示友好错误
function showError(message) {
  const box = document.getElementById('error-box');
  if (!box) return;
  box.hidden = false;
  box.textContent = message;
}

/* ---------- 读取数据 ---------- */

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('读取 ' + path + ' 失败（HTTP ' + res.status + '）');
  return res.json();
}

async function loadData() {
  const results = await Promise.all([
    loadJSON('data/episodes.json'),
    loadJSON('data/story.json')
  ]);
  return { data: results[0], story: results[1] };
}

/* ---------- 各页面的渲染逻辑 ---------- */

// 剧集卡片（isFull=true 时带播放区）
function episodeCard(item, isFull) {
  const card = el('article', 'card');

  const meta = el('div', 'meta');
  meta.appendChild(el('span', 'no', '第 ' + item.no + ' 集'));
  meta.appendChild(el('span', 'tag', item.status));
  meta.appendChild(el('span', null, item.duration));
  card.appendChild(meta);

  card.appendChild(el('h3', null, item.title));
  card.appendChild(el('p', null, item.summary));

  if (isFull) {
    const player = el('div', 'player');

    if (item.videoUrl) {
      // 有视频地址就用 iframe 嵌入（视频本身放在外站，不进仓库）
      const frame = document.createElement('iframe');
      frame.src = item.videoUrl;
      frame.title = item.title;
      frame.loading = 'lazy';
      frame.allowFullscreen = true;
      player.textContent = '';
      player.appendChild(frame);
    } else {
      // 还没成片：先给一个占位说明，等以后填 videoUrl
      player.textContent = '视频制作中 —— 等第 2～3 周生成后，把地址填进 data/episodes.json 的 videoUrl 就会自动播放';
    }

    card.appendChild(player);
  }

  return card;
}

// 首页
function renderHome(data, story) {
  mount('home-episodes', ...data.episodes.slice(0, 3).map(function (e) { return episodeCard(e, false); }));
  mount('home-characters', ...data.characters.map(characterCard));

  const dl = el('dl', 'kv');
  story.settings.forEach(function (row) {
    dl.appendChild(el('dt', null, row.label));
    dl.appendChild(el('dd', null, row.value));
  });
  mount('home-settings', dl);
}

// 剧集页
function renderEpisodes(data) {
  mount('episode-list', ...data.episodes.map(function (e) { return episodeCard(e, true); }));
}

// 角色卡片
function characterCard(person) {
  const card = el('article', 'card');
  card.appendChild(el('div', 'avatar', person.avatar));
  card.appendChild(el('h3', null, person.name));
  card.appendChild(el('div', 'tag', person.role));
  card.appendChild(el('p', null, person.desc));
  return card;
}

// 角色页（角色 + 剧情设定 + 时间线）
function renderCharacters(data, story) {
  mount('character-list', ...data.characters.map(characterCard));

  const dl = el('dl', 'kv');
  story.settings.forEach(function (row) {
    dl.appendChild(el('dt', null, row.label));
    dl.appendChild(el('dd', null, row.value));
  });
  mount('story-settings', dl);

  const ul = el('ul', 'timeline');
  story.timeline.forEach(function (row) {
    const li = el('li');
    li.appendChild(el('span', 'stage', row.stage));
    li.appendChild(el('span', null, row.point));
    ul.appendChild(li);
  });
  mount('story-timeline', ul);
}

// 制作花絮页
function renderMaking(data, story) {
  mount('tool-list', ...data.tools.map(function (tool) {
    const card = el('article', 'card');
    card.appendChild(el('h3', null, tool.name));
    card.appendChild(el('p', null, tool.use));
    return card;
  }));

  // 免责声明文字统一从 story.json 取，改一处全站同步
  mount('maker-note', el('p', null, story.disclaimer));
}

/* ---------- 启动 ---------- */

async function init() {
  const page = document.body.dataset.page || 'home';

  try {
    const { data, story } = await loadData();

    if (page === 'home') renderHome(data, story);
    if (page === 'episodes') renderEpisodes(data);
    if (page === 'characters') renderCharacters(data, story);
    if (page === 'making') renderMaking(data, story);
  } catch (err) {
    // 最常见的两种原因：没开本地服务器（直接双击 HTML），或 JSON 路径写错
    showError(
      '数据加载失败：' + err.message +
      '　　解决：请在 ai-drama 目录下执行 python -m http.server 8000，' +
      '再用浏览器打开 http://localhost:8000/ ，不要直接双击 HTML 文件。'
    );
  }
}

init();
