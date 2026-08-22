const icons = {
  menu: '<svg class="relief-icon" viewBox="0 0 24 24"><path d="M5 6h14M5 12h14M5 18h14"/></svg>',
  back: '<svg class="relief-icon" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
  scan: '<svg class="relief-icon" viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path d="M8 8h8v8H8z"/></svg>',
  more: '<svg class="relief-icon" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  search: '<svg class="relief-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  plus: '<svg class="relief-icon" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"/></svg>',
  home: '<svg class="relief-icon" viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v9H3z"/><path d="M9 20v-6h6v6"/></svg>',
  recipe: '<svg class="relief-icon" viewBox="0 0 24 24"><path d="M5 4h14v16H5zM9 4v16M15 4v16"/></svg>',
  cart: '<svg class="relief-icon" viewBox="0 0 24 24"><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.5 11h10l2-7H7"/></svg>',
  user: '<svg class="relief-icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
};

let surfaceCounter = 0;

function surfacePalette(target) {
  if (target.classList.contains('button--danger')) {
    return { face: '#d68c78', light: '#fff1e8', mid: '#e5aa92', dark: '#8f5648', shadow: '#b97562' };
  }
  if (target.classList.contains('button--primary') || target.classList.contains('css-raised--coffee')) {
    return { face: '#d6b087', light: '#fff7e7', mid: '#e5bb91', dark: '#956842', shadow: '#ad805d' };
  }
  if (target.classList.contains('capsule')) {
    return { face: '#efddc9', light: '#fff5e8', mid: '#f2e0cc', dark: '#a6876a', shadow: '#d6bda2' };
  }
  return { face: '#f2ece3', light: '#fffdf8', mid: '#faf5ed', dark: '#b29f89', shadow: '#d7c6b2' };
}

function surfaceRadius(target) {
  if (target.classList.contains('capsule')) return 42;
  if (target.classList.contains('button') || target.classList.contains('css-raised')) return 42;
  if (target.classList.contains('icon-tile')) return 18;
  return 16;
}

function schemeBSurface(target) {
  const palette = surfacePalette(target);
  const radius = surfaceRadius(target);
  const id = `scheme-b-${surfaceCounter += 1}`;
  return `<span class="scheme-b-surface" aria-hidden="true"><svg viewBox="-22 -18 384 150" preserveAspectRatio="none">
    <defs>
      <linearGradient id="${id}-shell" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${palette.light}"/>
        <stop offset=".08" stop-color="${palette.mid}"/>
        <stop offset=".18" stop-color="${palette.face}" stop-opacity=".96"/>
        <stop offset=".30" stop-color="${palette.face}"/>
        <stop offset=".72" stop-color="${palette.face}"/>
        <stop offset=".84" stop-color="${palette.dark}" stop-opacity=".72"/>
        <stop offset="1" stop-color="${palette.dark}"/>
      </linearGradient>
      <linearGradient id="${id}-direction" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".24"/>
        <stop offset=".38" stop-color="#ffffff" stop-opacity=".05"/>
        <stop offset=".74" stop-color="${palette.dark}" stop-opacity=".04"/>
        <stop offset="1" stop-color="${palette.dark}" stop-opacity=".18"/>
      </linearGradient>
      <radialGradient id="${id}-light" cx=".12" cy=".10" r=".92">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".48"/>
        <stop offset=".28" stop-color="#ffffff" stop-opacity=".18"/>
        <stop offset=".60" stop-color="#ffffff" stop-opacity=".03"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${id}-dark" cx=".96" cy=".96" r=".85">
        <stop offset="0" stop-color="${palette.dark}" stop-opacity=".28"/>
        <stop offset=".34" stop-color="${palette.dark}" stop-opacity=".09"/>
        <stop offset=".72" stop-color="${palette.dark}" stop-opacity="0"/>
      </radialGradient>
      <filter id="${id}-face-blur" x="-20%" y="-30%" width="140%" height="160%">
        <feGaussianBlur stdDeviation="3"/>
      </filter>
      <mask id="${id}-face-mask">
        <rect x="-30" y="-30" width="400" height="170" fill="black"/>
        <rect x="14" y="13" width="312" height="82" rx="28" fill="white" filter="url(#${id}-face-blur)"/>
      </mask>
      <filter id="${id}-shadow" x="-30%" y="-50%" width="160%" height="220%">
        <feDropShadow dx="0" dy="12" stdDeviation="7" flood-color="${palette.shadow}" flood-opacity=".34"/>
      </filter>
    </defs>
    <rect x="0" y="0" width="340" height="108" rx="${radius}" fill="${palette.shadow}" filter="url(#${id}-shadow)"/>
    <rect x="0" y="0" width="340" height="108" rx="${radius}" fill="url(#${id}-shell)"/>
    <rect x="0" y="0" width="340" height="108" rx="${radius}" fill="url(#${id}-direction)"/>
    <rect x="0" y="0" width="340" height="108" rx="${radius}" fill="url(#${id}-light)"/>
    <rect x="0" y="0" width="340" height="108" rx="${radius}" fill="url(#${id}-dark)"/>
    <rect x="0" y="0" width="340" height="108" rx="${radius}" fill="${palette.face}" mask="url(#${id}-face-mask)"/>
  </svg></span>`;
}

function decorateSchemeBSurfaces() {
  document.querySelectorAll('.capsule, .button, .css-raised, .list-row, .icon-tile').forEach((target) => {
    if (target.dataset.schemeBSurface === 'true') return;
    target.insertAdjacentHTML('afterbegin', schemeBSurface(target));
    target.dataset.schemeBSurface = 'true';
  });
}

const pages = {
  home: {
    label: '首页', title: '厨房冰箱', left: icons.menu, leftLabel: '全部物品', right: icons.scan, rightLabel: '扫码', titleControl: true, footer: 'nav', activeNav: 'home',
    content: `<div class="page-stack">
      <label class="inset-control inset-control--search">${icons.search}<input aria-label="搜索所有物品" placeholder="搜索所有物品"></label>
      <div class="home-preview"><span>冰箱位置、占比和布局由程序全局控制，本原型只验证周围共享控件。</span></div>
      <button class="button button--primary" type="button">${icons.plus}<span>添加物品</span></button>
    </div>`,
  },
  recipe: {
    label: '食谱', title: '每周食谱', left: icons.menu, leftLabel: '全部物品', right: icons.more, rightLabel: '更多', footer: 'nav', activeNav: 'recipe',
    content: `<div class="page-stack">
      <div class="segment-track" role="tablist" aria-label="选择周次"><button class="is-active" type="button" role="tab" aria-selected="true">本周</button><button type="button" role="tab" aria-selected="false">下周</button></div>
      <section class="section-stack"><div class="section-title"><h2>周一 · 8月24日</h2><small>2 道菜</small></div><div class="list">
        <button class="list-row" type="button"><span class="list-icon">🍅</span><span class="list-copy"><strong>番茄炒蛋</strong><small>番茄、鸡蛋、葱</small></span><span class="list-arrow">›</span></button>
        <button class="list-row" type="button"><span class="list-icon">🍗</span><span class="list-copy"><strong>香煎鸡胸</strong><small>鸡胸肉、黑胡椒</small></span><span class="list-arrow">›</span></button>
      </div></section>
      <section class="section-stack"><div class="section-title"><h2>周二 · 8月25日</h2><small>1 道菜</small></div><div class="list"><button class="list-row" type="button"><span class="list-icon">🍄</span><span class="list-copy"><strong>菌菇汤</strong><small>香菇、口蘑、牛奶</small></span><span class="list-arrow">›</span></button></div></section>
      <button class="button button--secondary" type="button">${icons.plus}<span>添加食谱</span></button>
    </div>`,
  },
  edit: {
    label: '编辑', title: '编辑物品', left: icons.back, leftLabel: '返回', right: '', rightLabel: '', footer: 'actions',
    content: `<form class="page-stack" id="editForm">
      <div class="field"><label for="itemName">物品名称</label><div class="inset-control"><input id="itemName" value="鲜牛奶"></div></div>
      <div class="field"><label>分类</label><button class="inset-control" type="button"><span>乳制品 · 牛奶</span><span class="control-end">›</span></button></div>
      <div class="field"><label>数量</label><div class="inset-control"><span>1 盒</span><span class="stepper"><button type="button" aria-label="减少">−</button><button type="button" aria-label="增加">＋</button></span></div></div>
      <div class="field"><label>存放位置</label><button class="inset-control" type="button"><span>冰箱门 · 第 1 格</span><span class="control-end">›</span></button></div>
      <div class="field"><label for="bestBefore">最佳食用日期</label><div class="inset-control"><input id="bestBefore" value="2026-08-25"></div><small>日期状态同时使用文字和边框表达。</small></div>
      <div class="field"><label for="notes">备注</label><div class="inset-control inset-control--textarea"><textarea id="notes">开封后尽快饮用</textarea></div></div>
    </form>`,
  },
  components: {
    label: '控件', title: '共享控件', left: icons.back, leftLabel: '返回', right: '', rightLabel: '', footer: 'none',
    content: `<div class="page-stack">
      <section class="component-group"><div class="section-title"><h2>内凹表面</h2><small>输入 / 选择 / Tab</small></div><label class="inset-control inset-control--search">${icons.search}<input aria-label="搜索冰箱" placeholder="搜索冰箱"></label><div class="segment-track" role="tablist" aria-label="库存状态"><button class="is-active" type="button">全部</button><button type="button">临期</button></div></section>
      <section class="component-group"><div class="section-title"><h2>操作层级</h2><small>一个主操作</small></div><div class="button-grid"><button class="button button--secondary" type="button">取消</button><button class="button button--primary" type="button">确认</button></div><button class="button button--primary" type="button" disabled>处理中</button></section>
      <section class="component-group"><div class="section-title"><h2>SVG 外凸试验</h2><small>不使用位图</small></div><div class="css-raised-stack"><button class="css-raised css-raised--coffee" type="button">SVG 外凸主按钮</button><button class="css-raised css-raised--milk" type="button">SVG 外凸次按钮</button><button class="css-raised css-raised--icon" type="button" aria-label="SVG 外凸添加">${icons.plus}</button></div></section>
      <section class="component-group"><div class="section-title"><h2>浮雕图标</h2><small>同一左上光源</small></div><div class="icon-row"><button class="icon-tile" type="button" aria-label="首页">${icons.home}</button><button class="icon-tile" type="button" aria-label="搜索">${icons.search}</button><button class="icon-tile" type="button" aria-label="添加">${icons.plus}</button><button class="icon-tile" type="button" aria-label="扫码">${icons.scan}</button></div></section>
      <button class="button button--danger" id="openDialog" type="button">查看确认弹窗</button>
    </div>`,
  },
};

const phone = document.querySelector('#phonePrototype');
const content = document.querySelector('#pageContent');
const footer = document.querySelector('#phoneFooter');
const dialogLayer = document.querySelector('#dialogLayer');
const titleText = document.querySelector('#titleText');
const titleButton = document.querySelector('#titleButton');
const titleAffordance = document.querySelector('#titleAffordance');
const headerLeft = document.querySelector('#headerLeft');
const headerRight = document.querySelector('#headerRight');
const pageButtons = [...document.querySelectorAll('.mode-control [data-page]')];
const widthButtons = [...document.querySelectorAll('[data-width]')];

function navFooter(active) {
  const entries = [['home', icons.home, '首页'], ['recipe', icons.recipe, '食谱'], ['cart', icons.cart, '购物'], ['user', icons.user, '我的']];
  return `<nav class="capsule capsule--bottom" id="bottomCapsule" aria-label="主导航"><div class="bottom-content">${entries.map(([key, icon, label]) => `<button class="nav-item${key === active ? ' is-active' : ''}" type="button" data-nav="${key}">${icon}<span>${label}</span></button>`).join('')}</div></nav>`;
}

function actionFooter() {
  return '<div class="action-footer"><button class="button button--secondary" type="button">删除</button><button class="button button--primary" type="submit" form="editForm">保存修改</button></div>';
}

function setHeader(page) {
  titleText.textContent = page.title;
  titleAffordance.innerHTML = page.titleControl ? '<svg class="relief-icon title-chevron" viewBox="0 0 24 24"><path d="m7 9 5 5 5-5"/></svg>' : '';
  titleButton.setAttribute('aria-label', page.titleControl ? '切换冰箱' : page.title);
  headerLeft.innerHTML = page.left;
  headerLeft.setAttribute('aria-label', page.leftLabel || '无操作');
  headerLeft.disabled = !page.left;
  headerRight.innerHTML = page.right;
  headerRight.setAttribute('aria-label', page.rightLabel || '无操作');
  headerRight.disabled = !page.right;
}

function bindPageInteractions(pageKey) {
  document.querySelectorAll('.segment-track').forEach((track) => {
    track.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      track.querySelectorAll('button').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        if (item.hasAttribute('aria-selected')) item.setAttribute('aria-selected', String(active));
      });
    });
  });
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.nav === 'home' || button.dataset.nav === 'recipe') setPage(button.dataset.nav);
    });
  });
  if (pageKey === 'components') document.querySelector('#openDialog').addEventListener('click', openDialog);
}

function setPage(pageKey) {
  const page = pages[pageKey];
  phone.dataset.page = pageKey;
  setHeader(page);
  content.innerHTML = page.content;
  footer.innerHTML = page.footer === 'nav' ? navFooter(page.activeNav) : page.footer === 'actions' ? actionFooter() : '';
  decorateSchemeBSurfaces();
  dialogLayer.innerHTML = '';
  pageButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.page === pageKey));
  bindPageInteractions(pageKey);
  updateMetrics();
}

function openDialog() {
  dialogLayer.innerHTML = '<div class="backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><header class="dialog-head"><span></span><h2 id="dialogTitle">删除冰箱？</h2><span></span></header><div class="dialog-body"><p>冰箱将进入最近删除，期间可以恢复；关联物品不会立即永久删除。</p><div class="dialog-actions"><button class="button button--danger" type="button">删除冰箱</button><button class="button button--secondary" id="closeDialog" type="button">取消</button></div></div></section></div>';
  document.querySelector('#closeDialog').addEventListener('click', () => { dialogLayer.innerHTML = ''; });
}

function setMetric(name, value) {
  document.querySelector(`[data-metric="${name}"]`).textContent = value;
}

function updateMetrics() {
  const page = pages[phone.dataset.page];
  const topCapsule = document.querySelector('#topCapsule');
  const bottomCapsule = document.querySelector('#bottomCapsule');
  const phoneRect = phone.getBoundingClientRect();
  const topRect = topCapsule.getBoundingClientRect();
  const titleRect = titleButton.getBoundingClientRect();
  const centerDelta = (titleRect.left + titleRect.width / 2) - (topRect.left + topRect.width / 2);
  setMetric('page', page.label);
  setMetric('width', `${Math.round(phoneRect.width)}px`);
  setMetric('centerDelta', `${centerDelta.toFixed(2)}px`);
  setMetric('topSeam', '0px · 单体 CSS');
  setMetric('bottomSeam', bottomCapsule ? '0px · 单体 CSS' : '不适用');
  setMetric('capRatio', 'CSS · 不适用');
  setMetric('overflow', `${Math.max(0, phone.scrollWidth - phone.clientWidth)}px`);
}

function setWidth(width) {
  document.documentElement.style.setProperty('--phone-width', `${width}px`);
  phone.dataset.width = width;
  widthButtons.forEach((button) => button.classList.toggle('is-active', Number(button.dataset.width) === width));
  updateMetrics();
}

pageButtons.forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
widthButtons.forEach((button) => button.addEventListener('click', () => setWidth(Number(button.dataset.width))));
window.addEventListener('resize', updateMetrics);

const imageReady = Promise.all([...document.images].map((image) => {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', reject, { once: true });
  });
}));

setPage('home');
Promise.all([document.fonts.ready, imageReady]).then(() => {
  updateMetrics();
  document.documentElement.dataset.prototypeReady = 'true';
});

window.prototypeMetrics = () => Object.fromEntries([...document.querySelectorAll('[data-metric]')].map((node) => [node.dataset.metric, node.textContent]));
