(function () {
  var FORCE_CAPABILITY_SPIKE = false;
  var REQUEST_TIMEOUT_MS = 15000;
  var POLL_INTERVAL_MS = 4000;
  var AUTO_HOME_MS = 10 * 60 * 1000;
  var SYNC_RETRY_INTERVAL_MS = 30 * 60 * 1000;
  var ALL_ITEMS_SLOT_ID = '__all_inventory__';
  var app = document.getElementById('kindle-app');
  var state = {
    mode: 'entry',
    refrigerator: null,
    layout: null,
    inventory: [],
    icons: [],
    token: '',
    expiresAt: 0,
    view: 'home',
    slotId: '',
    detailPage: 0,
    restockEntries: [],
    restockError: false,
    recipeDays: [],
    recipeWeekOffset: 0,
    syncStatus: 'unknown',
    lastSuccessfulSyncAt: null,
    hasWorkspaceSnapshot: false,
    lastAction: null,
    actionBusy: false,
    timers: {}
  };
  var recipeIconId = 0;

  function element(tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.appendChild(document.createTextNode(String(text)));
    return node;
  }

  function inlineStyle(node, value) {
    node.style.cssText = value;
    return node;
  }

  function hasQueryFlag(name) {
    var query = window.location.search || '';
    return new RegExp('[?&]' + name + '=1(?:&|$)').test(query);
  }

  function isCapabilitySpikePath() {
    var path = window.location.pathname || '';
    return (path.replace(/\/+$/, '') || '/') === '/k';
  }

  function setRefrigerator(refrigerator) {
    var name;
    state.refrigerator = refrigerator;
    name = refrigerator && refrigerator.name ? String(refrigerator.name).trim() : '';
    document.title = name ? '家常食橱 - ' + name : '家常食橱';
  }

  function legacyText(value, size) {
    var node = element('font');
    node.setAttribute('size', size || '5');
    node.appendChild(document.createTextNode(value));
    return node;
  }

  function markLegacy(node, size) {
    node.setAttribute('data-legacy-font', 'true');
    if (size) node.setAttribute('data-legacy-font-size', size);
    return node;
  }

  function legacyElement(tagName, className, value, size) {
    var node = markLegacy(element(tagName, className), size);
    text(node, value);
    return node;
  }

  function legacyButton(label, className, handler, ariaLabel, size) {
    var node = markLegacy(button('', className, handler, ariaLabel), size);
    text(node, label);
    return node;
  }

  function text(node, value) {
    while (node.firstChild) node.removeChild(node.firstChild);
    var textValue = value === undefined || value === null ? '' : String(value);
    if (node.getAttribute && node.getAttribute('data-legacy-font') === 'true') {
      node.appendChild(legacyText(textValue, node.getAttribute('data-legacy-font-size') || '5'));
      return;
    }
    node.appendChild(document.createTextNode(textValue));
  }

  function spikeRow(label, result) {
    var row = element('tr');
    var name = inlineStyle(element('td', '', label), 'padding:8px 12px 8px 0;vertical-align:top;font-size:20px;font-weight:700;');
    var value = inlineStyle(element('td', '', result), 'padding:8px 0;vertical-align:top;font-size:20px;');
    row.appendChild(name);
    row.appendChild(value);
    return row;
  }

  function spikeCheck(name, value) {
    return name + ': ' + (value ? 'PASS' : 'FAIL');
  }

  function detectSpikeCapabilities() {
    var result = [];
    var xhr = false;
    var canvas = false;
    var svg = false;
    var storage = false;
    var media = false;
    var flex = false;
    var grid = false;
    try { xhr = typeof XMLHttpRequest !== 'undefined' && !!new XMLHttpRequest(); } catch (ignoreXhr) { xhr = false; }
    try { canvas = !!document.createElement('canvas').getContext; } catch (ignoreCanvas) { canvas = false; }
    try { svg = !!document.createElementNS && !!document.createElementNS('http://www.w3.org/2000/svg', 'svg'); } catch (ignoreSvg) { svg = false; }
    try { storage = !!window.localStorage; } catch (ignoreStorage) { storage = false; }
    try { media = typeof window.matchMedia === 'function'; } catch (ignoreMedia) { media = false; }
    try {
      var flexNode = document.createElement('div');
      flexNode.style.display = 'flex';
      flex = flexNode.style.display === 'flex';
      var gridNode = document.createElement('div');
      gridNode.style.display = 'grid';
      grid = gridNode.style.display === 'grid';
    } catch (ignoreLayout) {}
    result.push(spikeCheck('ES5 基础脚本', true));
    result.push(spikeCheck('DOM 创建与修改', !!document.createElement));
    result.push(spikeCheck('JSON', typeof JSON !== 'undefined' && typeof JSON.parse === 'function'));
    result.push(spikeCheck('XMLHttpRequest', xhr));
    result.push(spikeCheck('Canvas API', canvas));
    result.push(spikeCheck('SVG 创建', svg));
    result.push(spikeCheck('localStorage', storage));
    result.push(spikeCheck('matchMedia', media));
    result.push(spikeCheck('Flex 属性声明', flex));
    result.push(spikeCheck('Grid 属性声明', grid));
    result.push(spikeCheck('URL', typeof window.URL !== 'undefined'));
    result.push(spikeCheck('Promise', typeof window.Promise !== 'undefined'));
    result.push(spikeCheck('fetch', typeof window.fetch === 'function'));
    return result;
  }

  function spikeStyle(node, styles) {
    var name;
    for (name in styles) {
      if (Object.prototype.hasOwnProperty.call(styles, name)) node.style[name] = styles[name];
    }
    return node;
  }

  function marginSpikeBar(label) {
    var bar = spikeStyle(element('div'), {
      height: '36px',
      lineHeight: '36px',
      backgroundColor: '#111',
      color: '#fff',
      textAlign: 'center',
      fontSize: '18px'
    });
    bar.appendChild(legacyText(label, '4'));
    return bar;
  }

  function marginSpikeCase(label, description, sample) {
    var section = spikeStyle(element('section'), {
      marginTop: '12px',
      paddingTop: '8px',
      paddingRight: '8px',
      paddingBottom: '8px',
      paddingLeft: '8px',
      border: '2px solid #111'
    });
    var title = legacyElement('p', '', label, '4');
    var note = legacyElement('p', '', description, '3');
    var boundary = spikeStyle(element('div'), {
      width: '100%',
      height: '42px',
      marginTop: '6px',
      border: '2px solid #777',
      backgroundColor: '#fff'
    });
    title.style.fontWeight = '700';
    note.style.color = '#555';
    note.style.marginTop = '4px';
    boundary.appendChild(sample);
    section.appendChild(title);
    section.appendChild(note);
    section.appendChild(boundary);
    return section;
  }

  function renderMarginSpike(page) {
    var viewportWidth = document.documentElement.clientWidth || document.body.clientWidth || 540;
    var availableWidth = Math.max(viewportWidth - 80, 180);
    var parentPadding = spikeStyle(element('div'), {
      paddingLeft: '10px',
      paddingRight: '10px'
    });
    parentPadding.appendChild(marginSpikeBar('父元素 padding-left/right: 10px'));
    var childMargin = marginSpikeBar('子元素 margin-left/right: 10px');
    childMargin.style.marginLeft = '10px';
    childMargin.style.marginRight = '10px';
    var explicitWidth = marginSpikeBar('子元素 width + left: 10px');
    explicitWidth.style.width = Math.max(availableWidth - 24, 1) + 'px';
    explicitWidth.style.marginLeft = '10px';
    var table = spikeStyle(element('table'), {
      width: '100%',
      height: '40px',
      borderCollapse: 'collapse',
      tableLayout: 'fixed'
    });
    var row = element('tr');
    var leftCell = spikeStyle(element('td'), { width: '10px', padding: '0' });
    var middleCell = spikeStyle(element('td'), { padding: '0' });
    var rightCell = spikeStyle(element('td'), { width: '10px', padding: '0' });
    middleCell.appendChild(marginSpikeBar('table 空白单元格: 10px'));
    row.appendChild(leftCell);
    row.appendChild(middleCell);
    row.appendChild(rightCell);
    table.appendChild(row);
    var inlineBlock = marginSpikeBar('inline-block width + left: 10px');
    inlineBlock.style.display = 'inline-block';
    inlineBlock.style.width = Math.max(availableWidth - 24, 1) + 'px';
    inlineBlock.style.marginLeft = '10px';
    var nbsp = element('div');
    nbsp.style.height = '36px';
    nbsp.style.lineHeight = '36px';
    nbsp.style.textAlign = 'left';
    nbsp.appendChild(document.createTextNode('\u00a0\u00a0\u00a0\u00a0\u00a0'));
    nbsp.appendChild(legacyText('HTML 不换行空格后开始内容', '4'));
    page.appendChild(legacyElement('h2', '', '页边距实现对比', '5'));
    page.appendChild(legacyElement('p', '', '每个灰色框是同样的边界；黑色内容如果从边界内缩，说明该方式在本机可用。目标内缩：10px。', '4'));
    page.appendChild(marginSpikeCase('A · 父元素 inline padding', '父元素左右 padding，各 10px。', parentPadding));
    page.appendChild(marginSpikeCase('B · 子元素 inline margin', '子元素左右 margin，各 10px。', childMargin));
    page.appendChild(marginSpikeCase('C · 计算宽度 + 左偏移', '直接设置像素宽度，再设置 margin-left: 10px。', explicitWidth));
    page.appendChild(marginSpikeCase('D · table 空白单元格', '左右各插入一个固定 10px 的空白 td。', table));
    page.appendChild(marginSpikeCase('E · inline-block + 左偏移', 'inline-block 设置像素宽度，再左移 10px。', inlineBlock));
    page.appendChild(marginSpikeCase('F · HTML 不换行空格', '使用传统 HTML 空格把文字从边界内推入。', nbsp));
  }

  function renderCapabilitySpike() {
    var viewportWidth = document.documentElement.clientWidth || document.body.clientWidth || 540;
    var page = spikeStyle(element('main', 'kindle-page kindle-spike-page'), {
      boxSizing: 'content-box',
      width: Math.max(viewportWidth - 68, 180) + 'px',
      minHeight: '100%',
      paddingTop: '0',
      paddingRight: '24px',
      paddingBottom: '24px',
      paddingLeft: '24px',
      backgroundColor: '#fff',
      color: '#111',
      fontFamily: 'Arial,Helvetica,sans-serif'
    });
    var heading = inlineStyle(element('h1'), 'margin:0;padding:24px 0;border-bottom:2px solid #111;font-size:30px;line-height:1.3;text-align:center;');
    heading.appendChild(legacyText('Kindle 能力诊断'));
    page.appendChild(heading);

    var intro = inlineStyle(element('p'), 'margin:20px 0;font-size:22px;line-height:1.55;');
    intro.appendChild(legacyText('以下结果用于记录 DP75SDI 的 Kindle 能力。'));
    page.appendChild(intro);

    var visualTitle = inlineStyle(element('h2'), 'margin:24px 0 12px;font-size:24px;line-height:1.4;');
    visualTitle.appendChild(legacyText('视觉样例'));
    page.appendChild(visualTitle);

    var external = element('p', 'kindle-spike-external', '外链 CSS class：如果边框、背景和大字号出现，说明外链 CSS 生效。');
    var inline = inlineStyle(element('p', '', '内联 style：如果文字明显较大且有边框，说明 inline style 生效。'), 'padding:12px;border:3px solid #111;font-size:28px;line-height:1.4;');
    var legacy = element('p');
    legacy.appendChild(legacyText('传统 font 标签：应当明显大于普通文字。', '5'));
    var normal = inlineStyle(element('p', '', '普通文字基线：用于和上面三种方式比较。'), 'font-size:16px;line-height:1.4;');
    page.appendChild(external);
    page.appendChild(inline);
    page.appendChild(legacy);
    page.appendChild(normal);
    renderMarginSpike(page);

    var layoutTable = inlineStyle(element('table'), 'width:100%;border-collapse:collapse;table-layout:fixed;margin-top:16px;');
    var layoutBody = element('tbody');
    var layoutRow = element('tr');
    var tableCell = inlineStyle(element('td', '', 'table 单元格'), 'padding:12px;border:2px solid #111;font-size:20px;');
    var inlineCell = inlineStyle(element('td', '', 'inline-block'), 'display:inline-block;width:44%;margin:2%;padding:12px;border:2px solid #111;font-size:20px;');
    var flexCell = inlineStyle(element('td', '', 'flex 声明'), 'display:flex;padding:12px;border:2px solid #111;font-size:20px;');
    layoutRow.appendChild(tableCell);
    layoutRow.appendChild(inlineCell);
    layoutRow.appendChild(flexCell);
    layoutBody.appendChild(layoutRow);
    layoutTable.appendChild(layoutBody);
    page.appendChild(layoutTable);

    var resultTitle = inlineStyle(element('h2'), 'margin:24px 0 12px;font-size:24px;line-height:1.4;');
    resultTitle.appendChild(legacyText('自动检测结果'));
    page.appendChild(resultTitle);
    var resultTable = inlineStyle(element('table'), 'width:100%;border-collapse:collapse;table-layout:fixed;');
    var resultBody = element('tbody');
    var results = detectSpikeCapabilities();
    var resultIndex;
    for (resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      resultBody.appendChild(spikeRow(String(resultIndex + 1), results[resultIndex]));
    }
    resultTable.appendChild(resultBody);
    page.appendChild(resultTable);

    var footer = inlineStyle(element('p'), 'margin-top:24px;padding-top:16px;border-top:2px solid #111;font-size:20px;line-height:1.55;');
    footer.appendChild(legacyText('请记录截图、User-Agent 和视口尺寸；普通页面不会进入此诊断。'));
    page.appendChild(footer);
    setPageClass('kindle-spike-shell');
    app.appendChild(page);
  }

  function button(label, className, handler, ariaLabel) {
    var node = element('button', className || '', label);
    node.type = 'button';
    if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
    if (handler) node.onclick = handler;
    return node;
  }

  function svgIcon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    var arrowPath;
    var paths = {
      back: 'M20 12H5m0 0 7-7m-7 7 7 7',
      next: 'M4 12h15m0 0-7-7m7 7-7 7',
      qr: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 3h2m2 3h2v-2m0-4h-2v2',
      basket: 'M3 4h2l2.2 11h10.6l3-8H6.1',
      recipes: 'M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4V4zm0 0a4 4 0 0 1 4 4v12',
      expiring: 'M12 4 21 20H3L12 4zm0 5v5m0 3h.01',
      expired: 'M12 4v9m0 4h.01M5 2h14v20H5z',
      home: 'M4 11 12 4l8 7v9h-5v-5H9v5H4z',
      take: 'M12 4v12m0 0-5-5m5 5 5-5M5 20h14',
      minus: 'M5 12h14',
      plus: 'M12 5v14m-7-7h14'
    };
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    if (name === 'refresh') svg.setAttribute('class', 'kindle-refresh-icon');
    if (name === 'recipes') {
      var recipeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      var recipePaths = [
        'M6 10.5a3.5 3.5 0 0 1 .6-6.9 5 5 0 0 1 10.8 0A3.5 3.5 0 1 1 18 10.5',
        'M6 10.5h12v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z',
        'M8 20.5h8'
      ];
      var recipePathIndex;
      recipeGroup.setAttribute('transform', 'translate(0 3)');
      for (recipePathIndex = 0; recipePathIndex < recipePaths.length; recipePathIndex += 1) {
        var recipePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        recipePath.setAttribute('d', recipePaths[recipePathIndex]);
        recipePath.setAttribute('fill', 'none');
        recipePath.setAttribute('stroke', 'currentColor');
        recipePath.setAttribute('stroke-width', '2');
        recipePath.setAttribute('stroke-linecap', 'round');
        recipePath.setAttribute('stroke-linejoin', 'round');
        recipeGroup.appendChild(recipePath);
      }
      svg.appendChild(recipeGroup);
      return svg;
    }
    path.setAttribute('d', name === 'refresh' ? 'M19 11a7 7 0 1 0 1.9 4.7' : (paths[name] || 'M19 11a7 7 0 1 0 1.9 4.7'));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', name === 'refresh' ? '2.5' : '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    if (name === 'refresh') {
      arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrowPath.setAttribute('d', 'M19 4v7h-7');
      arrowPath.setAttribute('fill', 'none');
      arrowPath.setAttribute('stroke', 'currentColor');
      arrowPath.setAttribute('stroke-width', '2.5');
      arrowPath.setAttribute('stroke-linecap', 'round');
      arrowPath.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(arrowPath);
    }
    if (name === 'basket') {
      ['9,19', '17,19'].forEach(function (point) {
        var parts = point.split(',');
        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', parts[0]);
        circle.setAttribute('cy', parts[1]);
        circle.setAttribute('r', '1.2');
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', 'currentColor');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
      });
    }
    return svg;
  }

  function recipeCompletionIcon(completed) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var path;
    var bodyPath = 'M88 48V16a8 8 0 0 1 16 0v32a8 8 0 0 1-16 0m40 8a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m32 0a8 8 0 0 0 8-8V16a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8m92.8 46.4L224 124v60a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32v-60L3.2 102.4a8 8 0 0 1 9.6-12.8L32 104V80a8 8 0 0 1 8-8h176a8 8 0 0 1 8 8v24l19.2-14.4a8 8 0 0 1 9.6 12.8M208 88H48v96a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16Z';
    svg.setAttribute('viewBox', '0 0 256 256');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'kindle-recipe-completion-icon');
    if (completed) {
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', bodyPath);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      return svg;
    }
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    var clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    var clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    var bodyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    var lid = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var lidPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    recipeIconId += 1;
    clipPath.setAttribute('id', 'kindle-recipe-body-' + recipeIconId);
    clipRect.setAttribute('x', '0');
    clipRect.setAttribute('y', '72');
    clipRect.setAttribute('width', '256');
    clipRect.setAttribute('height', '184');
    clipPath.appendChild(clipRect);
    defs.appendChild(clipPath);
    bodyGroup.setAttribute('clip-path', 'url(#kindle-recipe-body-' + recipeIconId + ')');
    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', bodyPath);
    path.setAttribute('fill', 'currentColor');
    bodyGroup.appendChild(path);
    lid.setAttribute('x', '0');
    lid.setAttribute('y', '-12');
    lid.setAttribute('width', '256');
    lid.setAttribute('height', '256');
    lid.setAttribute('viewBox', '0 0 24 24');
    lid.setAttribute('fill', 'none');
    lid.setAttribute('stroke', 'currentColor');
    lid.setAttribute('stroke-width', '1.5');
    lid.setAttribute('stroke-linecap', 'round');
    lid.setAttribute('stroke-linejoin', 'round');
    lidPath.setAttribute('d', 'M4 6h16M9 6l.623-2.057A1.5 1.5 0 0 1 11.016 3h1.969a1.5 1.5 0 0 1 1.392.943L15 6');
    lid.appendChild(lidPath);
    svg.appendChild(defs);
    svg.appendChild(bodyGroup);
    svg.appendChild(lid);
    return svg;
  }

  function iconButton(name, className, handler, ariaLabel) {
    var node = button('', className, handler, ariaLabel);
    node.appendChild(svgIcon(name));
    return node;
  }

  function iconLink(name, className, href, ariaLabel) {
    var node = link('', className, href, ariaLabel);
    node.appendChild(svgIcon(name));
    return node;
  }

  function link(label, className, href, ariaLabel) {
    var node = element('a', className || '', label);
    node.href = href;
    if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
    return node;
  }

  function clearTimer(name) {
    if (state.timers[name]) {
      window.clearTimeout(state.timers[name]);
      state.timers[name] = 0;
    }
  }

  function clearAllTimers() {
    var name;
    for (name in state.timers) {
      if (state.timers[name]) window.clearTimeout(state.timers[name]);
    }
    state.timers = {};
  }

  function schedule(name, callback, delay) {
    clearTimer(name);
    state.timers[name] = window.setTimeout(function () {
      state.timers[name] = 0;
      callback();
    }, delay);
  }

  function request(method, path, body, callback) {
    var xhr = new XMLHttpRequest();
    var finished = false;
    var timeoutId = 0;

    function finish(status, responseText) {
      if (finished) return;
      finished = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      callback(status, responseText || '');
    }

    try {
      xhr.open(method, path, true);
      xhr.setRequestHeader('Accept', 'application/json');
      if (body !== null) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) finish(xhr.status, xhr.responseText);
      };
      xhr.onerror = function () { finish(0, ''); };
      timeoutId = window.setTimeout(function () {
        try { xhr.abort(); } catch (ignore) {}
        finish(0, '');
      }, REQUEST_TIMEOUT_MS);
      xhr.send(body);
    } catch (error) {
      finish(0, '');
    }
  }

  function jsonRequest(method, path, body, callback) {
    request(method, path, body, function (status, responseText) {
      var data = null;
      if (responseText) {
        try { data = JSON.parse(responseText); } catch (ignore) { data = null; }
      }
      callback(status, data);
    });
  }

  function currentPath() {
    var path = window.location.pathname || '/fridge';
    var normalized = path.replace(/\/+$/, '') || '/';
    if (normalized === '/fridge/pair') return 'pairing';
    if (normalized === '/fridge/passcode') return 'passcode';
    if (normalized === '/fridge/device/restock') return 'restock';
    if (normalized === '/fridge/device/recipes') return 'recipes';
    if (normalized.indexOf('/fridge/device') === 0) return 'device';
    return 'entry';
  }

  function setPageClass(className) {
    app.className = 'kindle-page ' + className;
    if (document.body) {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.width = '100%';
    }
    app.style.boxSizing = 'content-box';
    app.style.width = Math.max((document.documentElement.clientWidth || document.body.clientWidth || 540) - 40, 1) + 'px';
    app.style.minHeight = '100%';
    app.style.paddingTop = '0';
    app.style.paddingRight = '20px';
    app.style.paddingBottom = '24px';
    app.style.paddingLeft = '20px';
    app.style.backgroundColor = '#fff';
    while (app.firstChild) app.removeChild(app.firstChild);
  }

  function setActionBusy(busy) {
    var groups;
    var groupIndex;
    var buttons;
    var buttonIndex;
    state.actionBusy = busy;
    if (!document.getElementsByClassName) return;
    groups = document.getElementsByClassName('kindle-item-actions');
    for (groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      buttons = groups[groupIndex].getElementsByTagName('button');
      for (buttonIndex = 0; buttonIndex < buttons.length; buttonIndex += 1) {
        buttons[buttonIndex].disabled = busy;
      }
    }
  }

  function styleHeaderCell(node) {
    node.style.display = 'table-cell';
    node.style.width = '72px';
    node.style.minWidth = '72px';
    node.style.minHeight = '72px';
    node.style.height = '72px';
    node.style.padding = '0';
    node.style.border = '0';
    node.style.backgroundColor = 'transparent';
    node.style.verticalAlign = 'middle';
    return node;
  }

  function headerCell(content, align) {
    var cell = styleHeaderCell(element('div', 'kindle-header-cell'));
    cell.style.textAlign = align || 'center';
    if (content) cell.appendChild(styleHeaderAction(content));
    return cell;
  }

  function header(title, left, right) {
    var node = element('header', 'kindle-header');
    node.style.display = 'table';
    node.style.width = '100%';
    node.style.minHeight = '72px';
    node.style.height = '72px';
    node.style.tableLayout = 'fixed';
    node.style.borderBottom = '2px solid #111';
    node.appendChild(headerCell(left, 'left'));
    var heading = inlineStyle(element('h1'), 'font-size:30px;line-height:1.2;font-weight:700;text-align:center;');
    heading.style.display = 'table-cell';
    heading.style.width = 'auto';
    heading.style.height = '72px';
    heading.style.paddingLeft = '12px';
    heading.style.paddingRight = '12px';
    heading.style.verticalAlign = 'middle';
    heading.appendChild(legacyText(title));
    node.appendChild(heading);
    node.appendChild(headerCell(right, 'right'));
    return node;
  }

  function homeHeader(summary) {
    var node = element('header', 'kindle-header kindle-home-header');
    var titleCell = element('div', 'kindle-home-header-title');
    titleCell.appendChild(legacyButton(summary.total + ' 件物品', 'kindle-home-header-total', function () {
      state.detailPage = 0;
      renderDetail(ALL_ITEMS_SLOT_ID);
    }, '查看全部食材', '4'));
    var actions = element('div', 'kindle-home-header-actions');
    node.style.display = 'table';
    node.style.width = '100%';
    node.style.height = '72px';
    node.style.minHeight = '72px';
    node.style.boxSizing = 'border-box';
    node.style.paddingLeft = '20px';
    node.style.paddingRight = '20px';
    node.style.tableLayout = 'auto';
    node.style.borderBottom = '2px solid #111';
    node.style.textAlign = 'left';
    titleCell.style.display = 'table-cell';
    titleCell.style.width = 'auto';
    titleCell.style.paddingTop = '8px';
    titleCell.style.paddingRight = '5px';
    titleCell.style.paddingBottom = '8px';
    titleCell.style.paddingLeft = '5px';
    titleCell.style.verticalAlign = 'middle';
    actions.style.display = 'table-cell';
    actions.style.width = 'auto';
    actions.style.height = '72px';
    actions.style.paddingRight = '5px';
    actions.style.verticalAlign = 'middle';
    actions.style.textAlign = 'right';
    actions.style.whiteSpace = 'nowrap';
    if (summary.expiring) actions.appendChild(styleHomeBadge(actionBadge('expiring', summary.expiring, '临期物品 ' + summary.expiring + ' 件')));
    if (summary.expired) actions.appendChild(styleHomeBadge(actionBadge('expired', summary.expired, '过期物品 ' + summary.expired + ' 件')));
    actions.appendChild(styleHeaderAction(iconLink('qr', 'kindle-header-action', '/fridge/pair', '连接手机')));
    if (!state.restockError && state.restockEntries.length) {
      actions.appendChild(styleHeaderAction(iconButton('basket', 'kindle-header-action kindle-header-restock', function () {
        window.location.replace('/fridge/device/restock');
      }, '查看补货清单')));
    }
    actions.appendChild(styleHeaderAction(iconButton('recipes', 'kindle-header-action kindle-header-recipes', function () {
      window.location.replace('/fridge/device/recipes');
    }, '查看每日食谱')));
    actions.appendChild(styleHeaderAction(iconButton('refresh', 'kindle-header-action', function () { loadWorkspace(true); }, '刷新冰箱')));
    node.appendChild(titleCell);
    node.appendChild(actions);
    return node;
  }

  function styleHeaderAction(node) {
    var svg = node.getElementsByTagName('svg')[0];
    node.style.display = 'inline-block';
    node.style.width = '72px';
    node.style.minWidth = '72px';
    node.style.minHeight = '72px';
    node.style.height = '72px';
    node.style.paddingTop = '6px';
    node.style.paddingRight = '4px';
    node.style.paddingBottom = '6px';
    node.style.paddingLeft = '4px';
    node.style.border = '0';
    node.style.backgroundColor = 'transparent';
    node.style.color = '#111';
    node.style.lineHeight = '0';
    node.style.verticalAlign = 'top';
    node.style.overflow = 'visible';
    if (svg) {
      svg.style.display = svg.getAttribute('class') === 'kindle-refresh-icon' ? 'inline-block' : 'block';
      svg.style.width = '60px';
      svg.style.height = '60px';
      svg.style.marginLeft = 'auto';
      svg.style.marginRight = 'auto';
      if (svg.getAttribute('class') === 'kindle-refresh-icon') {
        svg.style.overflow = 'visible';
        svg.style.verticalAlign = 'middle';
        svg.style.strokeWidth = '2.5';
      }
    }
    return node;
  }

  function styleHomeBadge(node) {
    var svg = node.getElementsByTagName('svg')[0];
    node.style.display = 'inline-block';
    node.style.width = '56px';
    node.style.minWidth = '56px';
    node.style.minHeight = '56px';
    node.style.height = '56px';
    node.style.paddingTop = '8px';
    node.style.paddingRight = '4px';
    node.style.paddingBottom = '8px';
    node.style.paddingLeft = '4px';
    node.style.border = '0';
    node.style.backgroundColor = 'transparent';
    node.style.color = '#111';
    node.style.lineHeight = '0';
    node.style.verticalAlign = 'top';
    if (svg) {
      svg.style.display = 'block';
      svg.style.width = '32px';
      svg.style.height = '32px';
      svg.style.marginLeft = 'auto';
      svg.style.marginRight = 'auto';
    }
    return node;
  }

  function actionBadge(name, value, ariaLabel) {
    var badge = element('span', 'kindle-header-badge' + (name === 'expired' ? ' kindle-header-badge-expired' : ''), '');
    badge.setAttribute('aria-label', ariaLabel);
    badge.appendChild(svgIcon(name));
    badge.appendChild(legacyText(String(value), '4'));
    return badge;
  }

  function setStaticPage(title, statusMessage, hintMessage, className) {
    setPageClass(className || 'kindle-state-page');
    app.appendChild(header(title));
    var content = element('section', 'kindle-content');
    content.appendChild(legacyElement('p', 'kindle-status', statusMessage, '5'));
    if (hintMessage) content.appendChild(legacyElement('p', 'kindle-hint', hintMessage, '4'));
    app.appendChild(content);
    return content;
  }

  function showError(title, message, retry) {
    clearAllTimers();
    var content = setStaticPage(title, message, '请检查网络连接后重试。', 'kindle-state-page');
    if (retry) content.appendChild(legacyButton('重试', 'kindle-action kindle-primary', retry, '', '5'));
  }

  function showSyncError(title, message, retry) {
    var content;
    var banner;
    clearAllTimers();
    content = setStaticPage(title, message, '请检查网络连接后重试。', 'kindle-state-page');
    banner = syncBanner();
    if (banner) content.appendChild(banner);
    if (retry) content.appendChild(legacyButton('重试', 'kindle-action kindle-primary', retry, '', '5'));
    schedule('syncRetry', retry || retrySync, SYNC_RETRY_INTERVAL_MS);
  }

  function syncTimeLabel() {
    if (!state.lastSuccessfulSyncAt) return '尚未成功同步';
    return String(state.lastSuccessfulSyncAt).replace('T', ' ').substring(0, 16);
  }

  function syncStatusLabel() {
    if (state.syncStatus === 'syncing') return '同步中……';
    if (state.syncStatus === 'offline') return '离线 · 最后同步 ' + syncTimeLabel();
    if (state.syncStatus === 'success') return '最后同步 ' + syncTimeLabel();
    return syncTimeLabel();
  }

  function syncBanner() {
    var banner;
    if (state.syncStatus !== 'offline') return null;
    banner = inlineStyle(element('div', 'kindle-sync-banner'), 'margin:16px 8px 0;padding:12px 8px;border:3px solid #111;font-size:20px;line-height:1.5;text-align:center;');
    banner.appendChild(legacyText('离线：无法更新冰箱状态。' + syncStatusLabel() + '，每 30 分钟自动重试。', '4'));
    return banner;
  }

  function renderCurrentWorkspace() {
    if (state.view === 'detail') {
      renderDetail(state.slotId);
      return;
    }
    if (state.view === 'restock') {
      renderRestockPage(state.restockEntries);
      return;
    }
    if (state.view === 'recipes') {
      renderRecipePage(state.recipeDays);
      return;
    }
    renderHome();
  }

  function retrySync() {
    if (state.view === 'restock') loadRestockPage();
    else if (state.view === 'recipes') loadRecipePage(state.recipeWeekOffset);
    else loadWorkspace(false);
  }

  function markSyncFailure(title, message, retry) {
    var retryCallback = retry || retrySync;
    var wasOffline = state.syncStatus === 'offline';
    state.syncStatus = 'offline';
    if (state.hasWorkspaceSnapshot) {
      if (!wasOffline) renderCurrentWorkspace();
      schedule('syncRetry', retryCallback, SYNC_RETRY_INTERVAL_MS);
      return;
    }
    showSyncError(title, message, retryCallback);
  }

  function beginSync() {
    clearTimer('syncRetry');
    if (state.syncStatus === 'offline') return;
    state.syncStatus = 'syncing';
    if (state.hasWorkspaceSnapshot) renderCurrentWorkspace();
  }

  function completeSync(syncResult) {
    state.syncStatus = 'success';
    state.lastSuccessfulSyncAt = syncResult.last_successful_sync_at;
    clearTimer('syncRetry');
    renderCurrentWorkspace();
  }

  function readSyncStatus(callback) {
    jsonRequest('GET', '/api/devices/current/sync-status', null, function (status, result) {
      if (status === 200 && result) state.lastSuccessfulSyncAt = result.last_successful_sync_at || null;
      callback(status, result);
    });
  }

  function formatRemaining(seconds) {
    var minutes = Math.floor(seconds / 60);
    var remainder = seconds % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (remainder < 10 ? '0' : '') + remainder;
  }

  function normalizePasscode(value) {
    return String(value || '').replace(/\D/g, '').substring(0, 6);
  }

  function passcodeErrorMessage(status, data) {
    var detail = data && data.detail ? String(data.detail) : '';
    if (status === 0 || status >= 500) return '网络连接失败，请检查网络后重试。';
    if (status === 400 || status === 422 || detail.indexOf('绑定码') >= 0) {
      return '绑定码无效、已过期或已使用，请在手机端重新生成。';
    }
    if (status === 409) return '该冰箱已有冰箱端设备，请在手机端确认更换后重新生成绑定码。';
    if (status === 401 || status === 403) return '此设备访问已失效，请重新开始绑定。';
    return '绑定失败，请稍后重试。';
  }

  function bindWithPasscode(input, submit, feedback) {
    var passcode = normalizePasscode(input.value);
    input.value = passcode;
    if (passcode.length !== 6) {
      text(feedback, '请输入完整的六位数字绑定码。');
      feedback.className = 'kindle-passcode-feedback kindle-error';
      return;
    }
    input.disabled = true;
    submit.disabled = true;
    text(submit, '正在连接…');
    text(feedback, '正在验证绑定码……');
    feedback.className = 'kindle-passcode-feedback';
    jsonRequest('POST', '/api/kindle/bind', JSON.stringify({
      passcode: passcode,
      label: '厨房 Kindle'
    }), function (status, refrigerator) {
      if (status === 201 && refrigerator) {
        clearAllTimers();
        setRefrigerator(refrigerator);
        if (refrigerator.setup_status === 'ready') window.location.replace('/fridge/device');
        else showWaitingLayout(refrigerator);
        return;
      }
      input.disabled = false;
      submit.disabled = false;
      text(submit, '使用绑定码');
      text(feedback, passcodeErrorMessage(status, refrigerator));
      feedback.className = 'kindle-passcode-feedback kindle-error';
    });
  }

  function passcodePanel() {
    var panel = inlineStyle(element('section', 'kindle-passcode-panel'), 'width:100%;margin:28px auto 0;padding-top:24px;border-top:2px solid #111;text-align:left;');
    var title = inlineStyle(element('h2', 'kindle-passcode-title'), 'font-size:24px;line-height:1.3;');
    var hint = inlineStyle(element('p', 'kindle-hint'), 'margin-top:16px;color:#555;font-size:21px;line-height:1.55;');
    var label = inlineStyle(element('label', 'kindle-passcode-label'), 'display:block;margin-top:20px;font-size:19px;line-height:1.55;font-weight:700;');
    var input = inlineStyle(element('input', 'kindle-passcode-input'), 'display:block;width:100%;min-height:112px;margin-top:16px;padding:16px 24px;border:2px solid #111;border-radius:0;background:#fff;color:#111;font-size:20px;line-height:1.55;letter-spacing:.18em;text-align:center;');
    var submit = inlineStyle(legacyButton('使用绑定码', 'kindle-action kindle-primary', function () {
      bindWithPasscode(input, submit, feedback);
    }, '', '5'), 'display:block;width:100%;min-height:112px;margin-top:16px;padding:16px 32px;border:2px solid #111;background:#111;color:#fff;font-size:20px;font-weight:700;');
    var feedback = markLegacy(inlineStyle(element('p', 'kindle-passcode-feedback'), 'min-height:28px;margin-top:12px;font-size:19px;line-height:1.5;font-weight:700;'), '4');

    title.appendChild(legacyText('无法扫描二维码？'));
    hint.appendChild(legacyText('请在手机端生成六位绑定码，然后在这里输入。'));
    label.appendChild(legacyText('六位绑定码'));

    input.type = 'text';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', 'one-time-code');
    input.maxLength = 6;
    input.placeholder = '例如 042913';
    input.setAttribute('aria-label', '六位绑定码');
    input.oninput = function () {
      input.value = normalizePasscode(input.value);
      if (input.value.length === 6) {
        text(feedback, '');
        feedback.className = 'kindle-passcode-feedback';
      }
    };
    input.onkeypress = function (event) {
      if (event.keyCode === 13) bindWithPasscode(input, submit, feedback);
    };
    feedback.setAttribute('role', 'alert');

    label.htmlFor = 'kindle-passcode';
    input.id = 'kindle-passcode';
    panel.appendChild(title);
    panel.appendChild(hint);
    panel.appendChild(label);
    panel.appendChild(input);
    panel.appendChild(submit);
    panel.appendChild(feedback);
    return panel;
  }

  function renderPasscodePage() {
    clearAllTimers();
    setPageClass('kindle-passcode-page');
    app.appendChild(header('六位数字绑定码', iconLink('back', 'kindle-header-action', '/fridge', '返回二维码页')));
    var content = element('section', 'kindle-content');
    content.appendChild(passcodePanel());
    app.appendChild(content);
    var footer = inlineStyle(legacyElement('footer', 'kindle-footer', '绑定码仅用于当前冰箱端设备的一次性绑定。', '4'), 'width:100%;min-height:56px;padding:14px 20px;border-top:2px solid #111;color:#555;font-size:20px;line-height:1.55;text-align:center;');
    app.appendChild(footer);
  }

  function entryInstructions() {
    var table = inlineStyle(element('table', 'kindle-entry-table'), 'width:100%;border-collapse:collapse;table-layout:fixed;text-align:left;');
    var body = element('tbody');
    var instructionRow = element('tr');
    var firstCell = inlineStyle(element('td', 'kindle-copy-block'), 'width:50%;padding:24px 18px 0;vertical-align:top;font-size:23px;line-height:1.5;text-align:left;');
    var installedCell = inlineStyle(element('td', 'kindle-copy-block'), 'width:50%;padding:24px 18px 0;vertical-align:top;font-size:23px;line-height:1.5;text-align:left;');

    var firstTitle = inlineStyle(element('strong'), 'display:block;margin-bottom:4px;font-size:24px;line-height:1.5;');
    var installedTitle = inlineStyle(element('strong'), 'display:block;margin-bottom:4px;font-size:24px;line-height:1.5;');
    firstTitle.appendChild(legacyText('首次使用'));
    installedTitle.appendChild(legacyText('已经安装'));
    firstCell.appendChild(firstTitle);
    firstCell.appendChild(legacyText('用手机相机扫描，或打开 https://fridge.flycn.fyi 安装“家常食橱”。', '4'));
    installedCell.appendChild(installedTitle);
    installedCell.appendChild(legacyText('打开“家常食橱”，进入目标冰箱的“冰箱设置”，点击“绑定冰箱端设备”后扫描。', '4'));
    instructionRow.appendChild(firstCell);
    instructionRow.appendChild(installedCell);
    body.appendChild(instructionRow);
    table.appendChild(body);
    return table;
  }

  function entryFooter() {
    var footer = inlineStyle(element('footer', 'kindle-footer'), 'width:100%;min-height:56px;padding:14px 20px;border-top:2px solid #111;color:#555;font-size:20px;line-height:1.55;text-align:center;');
    footer.appendChild(legacyText('无法扫码？', '5'));
    var passcodeLink = inlineStyle(link('', 'kindle-inline-link', '/fridge/passcode', '打开六位数字绑定码页'), 'display:inline-block;margin-left:8px;color:#111;font-size:24px;font-weight:400;line-height:1.5;text-decoration:underline;');
    while (passcodeLink.firstChild) passcodeLink.removeChild(passcodeLink.firstChild);
    passcodeLink.appendChild(legacyText('打开六位数字绑定码页', '5'));
    footer.appendChild(passcodeLink);
    return footer;
  }

  function fitQr(frame, image, reserveHeight) {
    var width = document.documentElement.clientWidth || document.body.clientWidth || 540;
    var height = document.documentElement.clientHeight || document.body.clientHeight || 720;
    var availableWidth = width - 48;
    var availableHeight = height - reserveHeight;
    var size = Math.floor(Math.min(availableWidth, availableHeight));
    if (state.mode === 'entry') size = Math.floor(size * 0.68);
    if (size < 160) size = 160;
    image.style.width = size + 'px';
    image.style.height = size + 'px';
    frame.style.width = (size + 24) + 'px';
    frame.style.height = (size + 24) + 'px';
  }

  function updateCountdown(node, onExpired) {
    var remaining = Math.max(0, Math.ceil((state.expiresAt - new Date().getTime()) / 1000));
    text(node, (state.mode === 'pairing' ? '本次连接有效 ' : '二维码将在 ') + formatRemaining(remaining) + (state.mode === 'pairing' ? '' : ' 后更新'));
    if (remaining === 0) {
      onExpired();
      return;
    }
    schedule('countdown', function () { updateCountdown(node, onExpired); }, 1000);
  }

  function startCountdown(seconds, node, onExpired) {
    clearTimer('countdown');
    state.expiresAt = new Date().getTime() + (Math.max(0, seconds) * 1000);
    updateCountdown(node, onExpired);
  }

  function qrPath(token) {
    var endpoint = state.mode === 'pairing' ? '/api/kindle/pairing-sessions/qr' : '/api/kindle/first-boot-sessions/qr';
    return endpoint + '?token=' + encodeURIComponent(token) + '&t=' + new Date().getTime();
  }

  function renderQrPage(title, session, statusMessage, hintMessage) {
    clearAllTimers();
    setPageClass('kindle-qr-page');
    var back = state.mode === 'pairing' ? iconLink('back', 'kindle-header-action', '/fridge/device', '返回冰箱首页') : null;
    var refresh = state.mode === 'pairing' ? iconButton('refresh', 'kindle-header-action', createPairingSession, '刷新二维码') : null;
    app.appendChild(header(title, back || element('span', 'kindle-header-cell'), refresh || element('span', 'kindle-header-cell')));
    var content = element('section', 'kindle-content');
    var frame = element('div', 'kindle-qr-frame');
    var image = element('img', 'kindle-qr');
    image.alt = '用于连接手机的二维码';
    image.onerror = function () {
      if (!image.parentNode) return;
      showError('二维码暂时无法显示', '二维码图片加载失败，请重试。', state.mode === 'pairing' ? createPairingSession : createFirstBootSession);
    };
    frame.appendChild(image);
    content.appendChild(frame);
    var statusNode = inlineStyle(legacyElement('p', 'kindle-status', statusMessage, '5'), 'margin-top:16px;font-size:22px;line-height:1.55;font-weight:700;');
    var countdownNode = inlineStyle(legacyElement('p', 'kindle-status', '', '4'), 'margin-top:16px;font-size:20px;line-height:1.55;font-weight:700;');
    if (state.mode === 'entry') {
      content.appendChild(countdownNode);
      content.appendChild(entryInstructions());
    } else {
      content.appendChild(statusNode);
      content.appendChild(legacyElement('p', 'kindle-copy-block', hintMessage, '3'));
      content.appendChild(countdownNode);
    }
    app.appendChild(content);
    app.appendChild(state.mode === 'entry' ? entryFooter() : legacyElement('footer', 'kindle-footer', '扫码只添加手机访问，不会更改冰箱所有者', '4'));
    image.src = qrPath(session.pairing_token);
    fitQr(frame, image, state.mode === 'pairing' ? 450 : 400);
    startCountdown(session.expires_in_seconds || 600, countdownNode, state.mode === 'pairing' ? createPairingSession : createFirstBootSession);
  }

  function showRevoked() {
    var content = setStaticPage('设备访问已移除', '此冰箱端访问已移除。', '请在手机端重新绑定后，再回到此页面。', 'kindle-state-page');
    content.appendChild(legacyButton('重新读取设备状态', 'kindle-action kindle-primary', start, '', '5'));
  }

  function showWaitingLayout(refrigerator) {
    clearAllTimers();
    setPageClass('kindle-waiting-page');
    app.appendChild(header(''));
    var content = element('section', 'kindle-content');
    content.appendChild(element('div', 'kindle-waiting-art'));
    content.appendChild(legacyElement('p', 'kindle-status', '设备已连接', '5'));
    content.appendChild(legacyElement('p', 'kindle-copy-block', '请在手机端完成冰箱布局。保存后，本页面会自动打开冰箱首页。', '4'));
    content.appendChild(legacyElement('p', 'kindle-status', '正在等待手机完成设置…', '5'));
    app.appendChild(content);
    app.appendChild(legacyElement('footer', 'kindle-footer', '无需再次扫码', '4'));
    schedule('layout', pollLayout, POLL_INTERVAL_MS);
  }

  function findIcon(key) {
    var index;
    for (index = 0; index < state.icons.length; index += 1) {
      if (state.icons[index].key === key) return state.icons[index];
    }
    return null;
  }

  function itemsForSlot(slotId) {
    if (slotId === ALL_ITEMS_SLOT_ID) return state.inventory.slice(0);
    return state.inventory.filter(function (item) { return item.storage_slot_id === slotId; });
  }

  var FOOD_EDGE_GAP = 2;
  var FOOD_ICON_WIDTH = 40;
  var FOOD_ICON_HEIGHT = 40;

  function riskRank(status) {
    if (status === 'expired') return 0;
    if (status === 'expiring') return 1;
    return 2;
  }

  function foodNode(item) {
    var node = element('span', 'kindle-food');
    var icon = findIcon(item.icon_key);
    if (icon) {
      var image = element('img');
      image.src = icon.asset_url;
      image.alt = '';
      node.appendChild(image);
    }
    node.setAttribute('data-food-key', String(item.id));
    if (item.quantity > 1) node.appendChild(element('b', 'kindle-food-count', item.quantity));
    if (item.expiry_status === 'expired') node.appendChild(element('b', 'kindle-food-risk', '!'));
    else if (item.expiry_status === 'expiring') node.appendChild(element('b', 'kindle-food-risk', '◢'));
    return node;
  }

  function slotPosition(slot) {
    var parts = String(slot.key || '').split('-');
    return parts[parts.length - 1] || slot.key;
  }

  function zoneNode(zone, slots, className) {
    var slotList = slots || zone.slots || [];
    var node = element('section', 'kindle-zone' + (className ? ' ' + className : '') + (zone.geometry && zone.geometry.layout_kind === 'single_row' ? ' kindle-zone-row' : ''));
    slotList.forEach(function (slot, slotIndex) {
      var slotButton = button('', 'kindle-slot', function () { state.detailPage = 0; renderDetail(slot.id); }, '查看 ' + zone.label + ' 的第 ' + slotPosition(slot) + ' 格');
      var items = itemsForSlot(slot.id);
      slotButton.style.height = (100 / Math.max(slotList.length, 1)) + '%';
      if (zone.geometry && zone.geometry.layout_kind === 'single_row') slotButton.style.width = (100 / Math.max(slotList.length, 1)) + '%';
      if (items.length) {
        var cluster = element('span', 'kindle-food-cluster');
        items.forEach(function (item) { cluster.appendChild(foodNode(item)); });
        slotButton.appendChild(cluster);
      } else slotButton.appendChild(legacyText('空', '4'));
      node.appendChild(slotButton);
    });
    return node;
  }

  function setAbsolute(node, left, top, width, height) {
    node.style.position = 'absolute';
    node.style.left = left + 'px';
    node.style.top = top + 'px';
    node.style.width = width + 'px';
    node.style.height = height + 'px';
    return node;
  }

  function numberOr(value, fallback) {
    return typeof value === 'number' ? value : fallback;
  }

  function appendDoorPanel(fridge, segments, side, left, top, width, height) {
    var panel = setAbsolute(element('div', 'kindle-fridge-door kindle-fridge-door-' + side), left, top, width, height);
    var index;
    var segment;
    var zone;
    for (index = 0; index < segments.length; index += 1) {
      segment = segments[index];
      if (segment.side !== side) continue;
      zone = zoneNode(segment.zone, segment.slots, 'kindle-door-segment');
      zone.style.top = segment.top + '%';
      zone.style.height = segment.height + '%';
      zone.style.position = 'absolute';
      zone.style.left = '0';
      zone.style.width = '100%';
      panel.appendChild(zone);
    }
    fridge.appendChild(panel);
  }

  function buildFridge(scale) {
    var shell = window.KindleLayout.getShellGeometry(state.layout.template_key);
    var unit = scale || 1;
    var shellWidth = shell.width * unit;
    var shellHeight = shell.height * unit;
    var cabinetZones = state.layout.zones.filter(function (zone) { return !zone.is_door; });
    var doorZones = state.layout.zones.filter(function (zone) { return zone.is_door; });
    var segments = window.KindleLayout.getDoorSegments(state.layout.template_key, cabinetZones, doorZones);
    var fridge = element('section', 'kindle-fridge');
    var innerWidth = shellWidth - 8 * unit;
    var innerHeight = shellHeight - 8 * unit;
    var freeWidth = innerWidth - (shell.columns.length === 5 ? 16 : 8) * unit;
    var mainWidth;
    var sideWidth;
    var doorWidth;
    var mainLeft;
    var rightDoorLeft;
    var bands;
    var bandTop = 0;
    var index;
    var zoneIndex;
    var band;
    var cabinet;
    var zone;
    var bandNode;

    fridge.setAttribute('aria-label', '冰箱布局预览');
    fridge.style.width = shellWidth + 'px';
    fridge.style.height = shellHeight + 'px';
    if (shell.columns.length === 5) {
      sideWidth = freeWidth * shell.columns[0] / (shell.columns[0] + shell.columns[2] + shell.columns[4]);
      mainWidth = freeWidth * shell.columns[2] / (shell.columns[0] + shell.columns[2] + shell.columns[4]);
      mainLeft = 4 * unit + sideWidth + shell.columns[1] * unit;
      rightDoorLeft = mainLeft + mainWidth + shell.columns[3] * unit;
      cabinet = setAbsolute(element('div', 'kindle-fridge-main'), mainLeft, 4 * unit, mainWidth, innerHeight);
      for (index = 0; index < cabinetZones.length; index += 1) {
        zone = zoneNode(cabinetZones[index], null, 'kindle-wide-zone');
        zone.style.left = (numberOr(cabinetZones[index].geometry && cabinetZones[index].geometry.x, 0) / 100 * mainWidth) + 'px';
        zone.style.top = (numberOr(cabinetZones[index].geometry && cabinetZones[index].geometry.y, 0) / 100 * innerHeight) + 'px';
        zone.style.width = (numberOr(cabinetZones[index].geometry && cabinetZones[index].geometry.width, 100) / 100 * mainWidth) + 'px';
        zone.style.height = (numberOr(cabinetZones[index].geometry && cabinetZones[index].geometry.height, 100) / 100 * innerHeight) + 'px';
        zone.style.position = 'absolute';
        cabinet.appendChild(zone);
      }
      fridge.appendChild(cabinet);
      appendDoorPanel(fridge, segments, 'left', 4 * unit, 4 * unit, sideWidth, innerHeight);
      appendDoorPanel(fridge, segments, 'right', rightDoorLeft, 4 * unit, sideWidth, innerHeight);
      return fridge;
    }

    mainWidth = freeWidth * shell.columns[0] / (shell.columns[0] + shell.columns[2]);
    doorWidth = freeWidth * shell.columns[2] / (shell.columns[0] + shell.columns[2]);
    mainLeft = 4 * unit;
    rightDoorLeft = mainLeft + mainWidth + shell.columns[1] * unit;
    cabinet = setAbsolute(element('div', 'kindle-fridge-main'), mainLeft, 4 * unit, mainWidth, innerHeight);
    bands = window.KindleLayout.getZoneBands(state.layout.template_key, cabinetZones);
    for (index = 0; index < bands.length; index += 1) {
      band = bands[index];
      if (!band.zones || !band.zones.length) continue;
      bandNode = element('div', 'kindle-zone-band' + (band.zones.length > 1 ? ' kindle-zone-band-split' : ''));
      bandNode.style.height = band.height + '%';
      bandNode.style.width = '100%';
      bandNode.style.position = 'absolute';
      bandNode.style.left = '0';
      bandNode.style.top = bandTop + '%';
      bandTop += bands[index].height;
      for (zoneIndex = 0; zoneIndex < band.zones.length; zoneIndex += 1) {
        zone = zoneNode(band.zones[zoneIndex]);
        zone.style.position = 'absolute';
        zone.style.left = (zoneIndex * 100 / band.zones.length) + '%';
        zone.style.top = '0';
        zone.style.width = (100 / band.zones.length) + '%';
        zone.style.height = '100%';
        if (index + 1 < bands.length) zone.style.borderBottom = '1px solid #111';
        bandNode.appendChild(zone);
      }
      cabinet.appendChild(bandNode);
    }
    fridge.appendChild(cabinet);
    appendDoorPanel(fridge, segments, 'right', rightDoorLeft, 4 * unit, doorWidth, innerHeight);
    return fridge;
  }

  function getHomeFridgeScale() {
    var shell = window.KindleLayout.getShellGeometry(state.layout.template_key);
    var viewportWidth = document.documentElement.clientWidth || document.body.clientWidth || 540;
    var viewportHeight = document.documentElement.clientHeight || document.body.clientHeight || 720;
    var maxWidth = Math.max(180, viewportWidth - 64);
    var maxHeight = Math.max(245, viewportHeight - 214);
    return Math.min(maxWidth / shell.width, maxHeight / shell.height);
  }

  function fitHomeFridge() {
    var fridge = document.getElementsByClassName ? document.getElementsByClassName('kindle-fridge')[0] : null;
    var scale;
    if (!fridge || !state.layout) return;
    scale = getHomeFridgeScale();
    if (fridge.parentNode) fridge.parentNode.replaceChild(buildFridge(scale), fridge);
    layoutFoodClusters();
  }

  function layoutFoodClusters() {
    var clusters;
    var clusterIndex;
    var foods;
    var keys;
    var positions;
    var width;
    var height;
    var foodIndex;
    var usableWidth;
    var usableHeight;

    if (!document.getElementsByClassName) return;
    clusters = document.getElementsByClassName('kindle-food-cluster');
    for (clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
      foods = clusters[clusterIndex].getElementsByClassName('kindle-food');
      keys = [];
      for (foodIndex = 0; foodIndex < foods.length; foodIndex += 1) {
        keys.push(foods[foodIndex].getAttribute('data-food-key') || String(foodIndex));
      }
      width = clusters[clusterIndex].offsetWidth || 180;
      height = clusters[clusterIndex].offsetHeight || 64;
      positions = window.KindleLayout.getFoodIconPositions(keys, width, height);
      usableWidth = Math.max(width - FOOD_EDGE_GAP * 2 - FOOD_ICON_WIDTH, 1);
      usableHeight = Math.max(height - FOOD_EDGE_GAP * 2 - FOOD_ICON_HEIGHT, 1);
      for (foodIndex = 0; foodIndex < foods.length; foodIndex += 1) {
        foods[foodIndex].style.left = Math.round(FOOD_EDGE_GAP + positions[foodIndex].x * usableWidth) + 'px';
        foods[foodIndex].style.top = Math.round(FOOD_EDGE_GAP + positions[foodIndex].y * usableHeight) + 'px';
      }
    }
  }

  function syncLabel() {
    var total = state.inventory.reduce(function (sum, item) { return sum + item.quantity; }, 0);
    var expiring = state.inventory.filter(function (item) { return item.expiry_status === 'expiring'; }).length;
    var expired = state.inventory.filter(function (item) { return item.expiry_status === 'expired'; }).length;
    return { total: total, expiring: expiring, expired: expired };
  }

  function twoDigits(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function currentWeekStart() {
    var today = new Date();
    var day = today.getDay();
    var mondayOffset = day === 0 ? 6 : day - 1;
    var monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset);
    return monday.getFullYear() + '-' + twoDigits(monday.getMonth() + 1) + '-' + twoDigits(monday.getDate());
  }

  function weekStartWithOffset(offset) {
    var current = currentWeekStart().split('-');
    var monday = new Date(parseInt(current[0], 10), parseInt(current[1], 10) - 1, parseInt(current[2], 10) + offset);
    return monday.getFullYear() + '-' + twoDigits(monday.getMonth() + 1) + '-' + twoDigits(monday.getDate());
  }

  function restockPath() {
    return '/api/devices/current/restock?week_start=' + currentWeekStart();
  }

  function recipePath(offset) {
    return '/api/devices/current/recipes?week_start=' + weekStartWithOffset(offset || 0);
  }

  function restockWeekEntries(entries, weekStart) {
    return entries.filter(function (entry) {
      return entry && entry.week_start === weekStart;
    });
  }

  function isArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  }

  function renderRestockEntry(entry) {
    entry = entry || {};
    var node = element('article', 'kindle-restock-entry');
    var missingLabels = [];
    var missingItems = isArray(entry.missing) ? entry.missing : [];
    missingItems.forEach(function (item) {
      item = item || {};
      missingLabels.push(String(item.subcategory_name || '未命名食材') + ' × ' + String(item.quantity || 0));
    });
    node.appendChild(legacyText(
      String(entry.label || '未知日期') + ' · ' + String(entry.dish_name || '未命名食谱') + '：' + missingLabels.join('，'),
      '4'
    ));
    return node;
  }

  function renderRestockWeek(title, entries) {
    var cell = element('td', 'kindle-restock-week');
    var heading = inlineStyle(element('h2', 'kindle-restock-week-title'), 'font-size:24px;line-height:1.3;');
    heading.appendChild(legacyText(title, '5'));
    cell.appendChild(heading);
    if (!entries.length) {
      var empty = inlineStyle(element('p', 'kindle-restock-week-empty'), 'font-size:20px;line-height:1.4;');
      empty.appendChild(legacyText('暂无', '4'));
      cell.appendChild(empty);
      return cell;
    }
    entries.forEach(function (entry) { cell.appendChild(renderRestockEntry(entry)); });
    return cell;
  }

  function renderRestockPage(entries) {
    var banner;
    clearAllTimers();
    state.view = 'restock';
    setPageClass('kindle-restock-page');
    var back = iconLink('back', 'kindle-header-action', '/fridge/device', '返回冰箱首页');
    var refresh = iconButton('refresh', 'kindle-header-action kindle-restock-refresh', loadRestockPage, '刷新补货清单');
    app.appendChild(header('补货清单', back, refresh));
    var content = element('section', 'kindle-restock-content');
    banner = syncBanner();
    if (banner) app.appendChild(banner);
    if (!entries.length) {
      var empty = inlineStyle(element('p', 'kindle-restock-empty'), 'font-size:24px;line-height:1.5;');
      empty.appendChild(legacyText('没有需要补货的食材。', '5'));
      content.appendChild(empty);
      var emptyHint = inlineStyle(element('p', 'kindle-hint'), 'font-size:19px;line-height:1.5;');
      emptyHint.appendChild(legacyText('当前库存满足本周和下周未完成食谱。', '4'));
      content.appendChild(emptyHint);
    } else {
      var table = element('table', 'kindle-restock-table');
      var head = element('thead');
      var headerRow = element('tr');
      var currentWeek = currentWeekStart();
      var currentWeekParts = currentWeek.split('-');
      var nextWeek = new Date(
        parseInt(currentWeekParts[0], 10),
        parseInt(currentWeekParts[1], 10) - 1,
        parseInt(currentWeekParts[2], 10) + 7
      );
      var nextWeekStart = nextWeek.getFullYear() + '-' + twoDigits(nextWeek.getMonth() + 1) + '-' + twoDigits(nextWeek.getDate());
      var body = element('tbody');
      var bodyRow = element('tr');
      var currentHeader = element('th');
      var nextHeader = element('th');
      currentHeader.appendChild(legacyText('本周', '5'));
      nextHeader.appendChild(legacyText('下周', '5'));
      headerRow.appendChild(currentHeader);
      headerRow.appendChild(nextHeader);
      head.appendChild(headerRow);
      bodyRow.appendChild(renderRestockWeek('本周', restockWeekEntries(entries, currentWeek)));
      bodyRow.appendChild(renderRestockWeek('下周', restockWeekEntries(entries, nextWeekStart)));
      body.appendChild(bodyRow);
      table.appendChild(head);
      table.appendChild(body);
      content.appendChild(table);
    }
    app.appendChild(content);
    var footer = element('footer', 'kindle-footer');
    footer.appendChild(legacyText('⌂ 10分钟后回到首页', '4'));
    app.appendChild(footer);
    if (state.syncStatus !== 'syncing' && state.syncStatus !== 'offline') {
      schedule('autoHome', function () { window.location.replace('/fridge/device'); }, AUTO_HOME_MS);
    }
  }

  function recipeMissingQuantity(entry, ingredient) {
    var missing = isArray(entry.missing) ? entry.missing : [];
    var index;
    for (index = 0; index < missing.length; index += 1) {
      if (missing[index] && missing[index].subcategory_name === ingredient.subcategory_name) {
        return Number(missing[index].quantity) || 0;
      }
    }
    return 0;
  }

  function renderRecipeEntry(entry) {
    var node = element('article', 'kindle-recipe-entry' + (entry.completed ? ' is-complete' : ''));
    var main = element('div', 'kindle-recipe-entry-main');
    var dish = legacyElement('strong', 'kindle-recipe-dish', entry.dish_name || '未命名食谱', '4');
    var ingredients = element('div', 'kindle-recipe-ingredients');
    var items = isArray(entry.ingredients) ? entry.ingredients : [];
    var index;
    var ingredient;
    var missingQuantity;
    var label;
    var chip;

    main.appendChild(dish);
    if (!items.length) {
      ingredients.appendChild(legacyText('未添加食材', '3'));
    } else {
      for (index = 0; index < items.length; index += 1) {
        ingredient = items[index] || {};
        missingQuantity = recipeMissingQuantity(entry, ingredient);
        label = String(ingredient.subcategory_name || '未命名食材') + '×' + String(ingredient.quantity || 0);
        if (missingQuantity) label += '-' + String(missingQuantity);
        chip = legacyElement('span', 'kindle-recipe-ingredient' + (missingQuantity ? ' is-missing' : ''), label, '3');
        ingredients.appendChild(chip);
        if (index + 1 < items.length) ingredients.appendChild(document.createTextNode('　'));
      }
    }
    main.appendChild(ingredients);
    if (entry.note) main.appendChild(legacyElement('em', 'kindle-recipe-note', entry.note, '3'));
    node.appendChild(main);
    var statusCell = element('span', 'kindle-recipe-status' + (entry.completed ? ' is-complete' : ''));
    var statusButton = button('', 'kindle-recipe-status-button', null, entry.completed ? '已完成' : '未完成');
    statusButton.disabled = true;
    statusButton.appendChild(recipeCompletionIcon(Boolean(entry.completed)));
    statusCell.appendChild(statusButton);
    node.appendChild(statusCell);
    return node;
  }

  function orderedRecipeDays(days) {
    var result = (days || []).slice(0);
    function group(day) {
      var entries = isArray(day.entries) ? day.entries : [];
      var index;
      if (!entries.length) return 1;
      for (index = 0; index < entries.length; index += 1) {
        if (!entries[index].completed) return 0;
      }
      return 2;
    }
    result.sort(function (left, right) {
      return group(left) - group(right) || Number(left.weekday) - Number(right.weekday);
    });
    return result;
  }

  function renderRecipePage(days) {
    var headerNode;
    var heading;
    var content;
    var tabs;
    var currentTab;
    var nextTab;
    var orderedDays;
    var dayIndex;
    var day;
    var section;
    var title;
    var entries;
    var entryIndex;
    var empty;
    var footer;

    clearAllTimers();
    state.view = 'recipes';
    setPageClass('kindle-recipe-page');
    headerNode = header(
      '每周食谱',
      iconLink('back', 'kindle-header-action', '/fridge/device', '返回冰箱首页'),
      iconButton('basket', 'kindle-header-action kindle-recipe-cart', function () {
        window.location.replace('/fridge/device/restock');
      }, '查看补货清单')
    );
    headerNode.className += ' kindle-recipe-header';
    headerNode.style.minHeight = '72px';
    headerNode.style.height = '72px';
    heading = headerNode.getElementsByTagName('h1')[0];
    heading.style.fontSize = '26px';
    heading.style.lineHeight = '1.2';
    app.appendChild(headerNode);

    content = element('section', 'kindle-recipe-content');
    if (state.syncStatus === 'offline') content.appendChild(syncBanner());
    tabs = element('div', 'kindle-recipe-tabs');
    currentTab = legacyButton('本周', 'kindle-recipe-tab' + (state.recipeWeekOffset === 0 ? ' is-active' : ''), function () {
      if (state.recipeWeekOffset !== 0) loadRecipePage(0);
    }, '查看本周食谱', '4');
    nextTab = legacyButton('下周', 'kindle-recipe-tab' + (state.recipeWeekOffset === 7 ? ' is-active' : ''), function () {
      if (state.recipeWeekOffset !== 7) loadRecipePage(7);
    }, '查看下周食谱', '4');
    tabs.appendChild(currentTab);
    tabs.appendChild(nextTab);
    content.appendChild(tabs);

    orderedDays = orderedRecipeDays(days);
    for (dayIndex = 0; dayIndex < orderedDays.length; dayIndex += 1) {
      day = orderedDays[dayIndex] || {};
      section = element('section', 'kindle-recipe-day');
      title = legacyElement('h2', 'kindle-recipe-day-title', day.label || '未知日期', '4');
      section.appendChild(title);
      entries = isArray(day.entries) ? day.entries : [];
      if (!entries.length) {
        empty = legacyElement('p', 'kindle-recipe-empty', '暂无安排', '3');
        section.appendChild(empty);
      } else {
        for (entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
          section.appendChild(renderRecipeEntry(entries[entryIndex] || {}));
        }
      }
      content.appendChild(section);
    }
    if (!orderedDays.length) content.appendChild(legacyElement('p', 'kindle-recipe-empty', '暂无食谱。', '4'));
    app.appendChild(content);

    footer = element('footer', 'kindle-footer kindle-recipe-footer');
    footer.appendChild(legacyText('⌂ 10分钟后回到首页', '3'));
    app.appendChild(footer);
    if (state.syncStatus !== 'syncing' && state.syncStatus !== 'offline') {
      schedule('autoHome', function () { window.location.replace('/fridge/device'); }, AUTO_HOME_MS);
    }
  }

  function handleRestockForHome(status, entries) {
    if (status === 401 || status === 403) {
      showRevoked();
      return false;
    }
    if (status !== 200 || !isArray(entries)) {
      state.restockEntries = [];
      state.restockError = true;
      return false;
    }
    state.restockEntries = entries;
    state.restockError = false;
    return true;
  }

  function renderHome() {
    var banner;
    var summary;
    clearAllTimers();
    state.view = 'home';
    setPageClass('kindle-home-page');
    setActionBusy(false);
    summary = syncLabel();
    app.appendChild(homeHeader(summary));
    var content = element('section', 'kindle-home-content');
    banner = syncBanner();
    if (banner) content.appendChild(banner);
    if (state.restockError) {
      var restockError = element('div', 'kindle-home-restock-error');
      restockError.appendChild(legacyText('补货清单暂时无法读取。', '4'));
      restockError.appendChild(legacyButton('重试', 'kindle-home-restock-retry', function () {
        loadWorkspace(true);
      }, '重新读取补货清单', '4'));
      content.appendChild(restockError);
    }
    content.appendChild(buildFridge());
    content.appendChild(legacyElement('p', 'kindle-legend', syncStatusLabel(), '4'));
    app.appendChild(content);
    fitHomeFridge();
  }

  function slotById(slotId) {
    var found = null;
    state.layout.zones.forEach(function (zone) {
      zone.slots.forEach(function (slot) { if (slot.id === slotId) found = { zone: zone, slot: slot }; });
    });
    return found;
  }

  function dateLabel(value) {
    return value ? value.substring(5).replace('-', '/') : '未设日期';
  }

  function renderDetail(slotId) {
    var isAllItems = slotId === ALL_ITEMS_SLOT_ID;
    var location = slotById(slotId);
    var allItems = itemsForSlot(slotId).slice(0).sort(function (left, right) {
      return riskRank(left.expiry_status) - riskRank(right.expiry_status) || dateLabel(left.best_before).localeCompare(dateLabel(right.best_before));
    });
    var pageCount = Math.max(1, Math.ceil(allItems.length / 5));
    var pageStart;
    var items;
    var pager;
    state.view = 'detail';
    state.slotId = slotId;
    if (state.detailPage >= pageCount) state.detailPage = pageCount - 1;
    if (state.detailPage < 0) state.detailPage = 0;
    pageStart = state.detailPage * 5;
    items = allItems.slice(pageStart, pageStart + 5);
    clearAllTimers();
    setPageClass('kindle-detail-page');
    setActionBusy(false);
    var back = iconLink('back', 'kindle-header-action', '/fridge/device', '返回冰箱首页');
    var refresh = iconButton('refresh', 'kindle-header-action', function () { loadWorkspace(false); }, isAllItems ? '刷新全部食材' : '刷新分区');
    app.appendChild(header(isAllItems ? '全部食材' : (location ? location.zone.label + ' · 第 ' + slotPosition(location.slot) + ' 格' : '分区详情'), back, refresh));
    var banner = syncBanner();
    if (banner) app.appendChild(banner);
    var content = element('section', 'kindle-detail-content');
    content.appendChild(legacyElement('h2', 'kindle-detail-title', allItems.length + ' 种物品 · ' + allItems.reduce(function (sum, item) { return sum + item.quantity; }, 0) + ' 件', '5'));
    if (!items.length) content.appendChild(legacyElement('p', 'kindle-empty', isAllItems ? '还没有食材。' : '这个隔层还没有物品。', '4'));
    items.forEach(function (item) {
      var row = element('article', 'kindle-item');
      var iconCell = element('div', 'kindle-item-icon');
      var iconFrame = element('span', 'kindle-item-icon-frame');
      var iconRing;
      var ring;
      var icon = findIcon(item.icon_key);
      if (icon) {
        var iconImage = element('img');
        iconImage.src = icon.asset_url;
        iconImage.alt = '';
        iconFrame.appendChild(iconImage);
      }
      iconRing = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      iconRing.setAttribute('class', 'kindle-item-icon-ring');
      iconRing.setAttribute('viewBox', '0 0 64 64');
      iconRing.setAttribute('aria-hidden', 'true');
      iconRing.setAttribute('focusable', 'false');
      ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', '32');
      ring.setAttribute('cy', '32');
      ring.setAttribute('r', '30');
      iconRing.appendChild(ring);
      iconFrame.appendChild(iconRing);
      iconCell.appendChild(iconFrame);
      if (item.expiry_status === 'expired') iconCell.appendChild(element('b', 'kindle-item-risk kindle-item-risk-expired', '!'));
      else if (item.expiry_status === 'expiring') iconCell.appendChild(element('b', 'kindle-item-risk kindle-item-risk-expiring', '◢'));
      row.appendChild(iconCell);
      var main = element('div', 'kindle-item-main');
      main.appendChild(legacyElement('span', 'kindle-item-name', item.item_name, '5'));
      main.appendChild(legacyElement('span', 'kindle-item-date', dateLabel(item.best_before), '4'));
      main.appendChild(legacyElement('p', 'kindle-item-meta', '剩 ' + item.quantity + ' · ' + (item.expiry_status === 'expired' ? '已过期' : item.expiry_status === 'expiring' ? '临期' : '可食用'), '4'));
      row.appendChild(main);
      var actions = element('div', 'kindle-item-actions');
      if (item.quantity === 1) actions.appendChild(iconButton('take', 'kindle-item-action-button', function () { adjust(item, -1); }, '拿走 ' + item.item_name));
      else {
        actions.appendChild(iconButton('minus', 'kindle-item-action-button', function () { adjust(item, -1); }, '减少 ' + item.item_name));
        actions.appendChild(legacyElement('strong', '', '剩 ' + item.quantity, '4'));
        actions.appendChild(iconButton('plus', 'kindle-item-action-button', function () { adjust(item, 1); }, '增加 ' + item.item_name));
        actions.appendChild(iconButton('take', 'kindle-item-action-button', function () { adjust(item, -item.quantity); }, '全部拿走 ' + item.item_name));
      }
      row.appendChild(actions);
      content.appendChild(row);
    });
    app.appendChild(content);
    var footer = element('footer', 'kindle-footer');
    if (state.lastAction) footer.appendChild(legacyButton('已更新 · 撤销', 'kindle-action kindle-detail-undo', undoLast, '', '4'));
    footer.appendChild(legacyElement('div', 'kindle-detail-autohome', '⌂ 10分钟后回到首页', '4'));
    pager = element('div', 'kindle-detail-pager');
    pager.appendChild(iconButton('back', 'kindle-detail-page-button', function () {
      if (state.detailPage > 0) { state.detailPage -= 1; renderDetail(state.slotId); }
    }, '上一页'));
    pager.appendChild(legacyElement('strong', 'kindle-detail-page-number', (state.detailPage + 1) + ' / ' + pageCount, '4'));
    pager.appendChild(iconButton('next', 'kindle-detail-page-button kindle-detail-page-button-next', function () {
      if (state.detailPage + 1 < pageCount) { state.detailPage += 1; renderDetail(state.slotId); }
    }, '下一页'));
    if (state.detailPage === 0) pager.childNodes[0].disabled = true;
    if (state.detailPage + 1 >= pageCount) pager.childNodes[2].disabled = true;
    footer.appendChild(pager);
    app.appendChild(footer);
    if (state.syncStatus !== 'syncing' && state.syncStatus !== 'offline') {
      schedule('autoHome', function () { window.location.replace('/fridge/device'); }, AUTO_HOME_MS);
    }
  }

  function adjust(item, delta) {
    if (state.actionBusy) return;
    setActionBusy(true);
    request('PATCH', '/api/devices/current/inventory/' + encodeURIComponent(item.id) + '/quantity', JSON.stringify({ delta: delta }), function (status, responseText) {
      if (status === 401 || status === 403) {
        showRevoked();
        return;
      }
      if (status < 200 || status >= 300) {
        setActionBusy(false);
        showError('暂时无法更新库存', '库存更新失败，请稍后重试。', function () { renderDetail(state.slotId); });
        return;
      }
      var updated = null;
      try { updated = JSON.parse(responseText); } catch (ignore) {}
      state.lastAction = { batch: item, delta: -delta, removed: updated && updated.quantity === 0 };
      loadWorkspace(false);
    });
  }

  function undoLast() {
    if (!state.lastAction || state.actionBusy) return;
    setActionBusy(true);
    var action = state.lastAction;
    if (action.removed) {
      request('POST', '/api/devices/current/inventory/restore', JSON.stringify({ batch_id: action.batch.id, quantity: action.batch.quantity }), function (status) {
        if (status === 401 || status === 403) {
          showRevoked();
          return;
        }
        if (status < 200 || status >= 300) { setActionBusy(false); showError('撤销失败', '请稍后重试。', function () { renderDetail(state.slotId); }); return; }
        state.lastAction = null;
        loadWorkspace(false);
      });
      return;
    }
    request('PATCH', '/api/devices/current/inventory/' + encodeURIComponent(action.batch.id) + '/quantity', JSON.stringify({ delta: action.delta }), function (status) {
      if (status === 401 || status === 403) {
        showRevoked();
        return;
      }
      if (status < 200 || status >= 300) { setActionBusy(false); showError('撤销失败', '请稍后重试。', function () { renderDetail(state.slotId); }); return; }
      state.lastAction = null;
      loadWorkspace(false);
    });
  }

  function reportSync() {
    request('POST', '/api/devices/current/sync-status', null, function (status) {
      if (status === 401 || status === 403) {
        showRevoked();
        return;
      }
      if (status !== 204) {
        markSyncFailure('同步失败', '冰箱状态已读取，但同步记录失败。', retrySync);
        return;
      }
      readSyncStatus(function (syncStatus, result) {
        if (syncStatus === 200 && result && result.last_successful_sync_at) {
          completeSync(result);
          return;
        }
        if (syncStatus === 401 || syncStatus === 403) {
          showRevoked();
          return;
        }
        markSyncFailure('同步时间暂时无法读取', '同步已完成，但最后同步时间暂时无法读取。', retrySync);
      });
    });
  }

  function loadRestockPage() {
    clearAllTimers();
    beginSync();
    readSyncStatus(function (syncStatus) {
      if (syncStatus === 401 || syncStatus === 403) { showRevoked(); return; }
      jsonRequest('GET', '/api/devices/current', null, function (status, refrigerator) {
        if (status === 401) { window.location.replace('/fridge'); return; }
        if (status === 403) { showRevoked(); return; }
        if (status !== 200 || !refrigerator) {
          markSyncFailure('暂时无法读取补货清单', '无法读取冰箱状态。', loadRestockPage);
          return;
        }
        setRefrigerator(refrigerator);
        if (refrigerator.setup_status !== 'ready') {
          showWaitingLayout(refrigerator);
          return;
        }
        jsonRequest('GET', restockPath(), null, function (restockStatus, entries) {
          if (restockStatus === 401 || restockStatus === 403) { showRevoked(); return; }
          if (restockStatus !== 200 || !isArray(entries)) {
            markSyncFailure('暂时无法读取补货清单', '补货清单读取失败，请重试。', loadRestockPage);
            return;
          }
          state.restockEntries = entries;
          state.restockError = false;
          state.hasWorkspaceSnapshot = true;
          state.syncStatus = 'success';
          clearTimer('syncRetry');
          renderRestockPage(entries);
        });
      });
    });
  }

  function loadRecipePage(offset) {
    clearAllTimers();
    state.recipeWeekOffset = offset === 7 ? 7 : 0;
    beginSync();
    readSyncStatus(function (syncStatus) {
      if (syncStatus === 401 || syncStatus === 403) { showRevoked(); return; }
      jsonRequest('GET', '/api/devices/current', null, function (status, refrigerator) {
        if (status === 401) { window.location.replace('/fridge'); return; }
        if (status === 403) { showRevoked(); return; }
        if (status !== 200 || !refrigerator) {
          markSyncFailure('暂时无法读取每周食谱', '无法读取冰箱状态。', function () { loadRecipePage(state.recipeWeekOffset); });
          return;
        }
        setRefrigerator(refrigerator);
        if (refrigerator.setup_status !== 'ready') {
          showWaitingLayout(refrigerator);
          return;
        }
        jsonRequest('GET', recipePath(state.recipeWeekOffset), null, function (recipeStatus, days) {
          if (recipeStatus === 401 || recipeStatus === 403) { showRevoked(); return; }
          if (recipeStatus !== 200 || !isArray(days)) {
            markSyncFailure('暂时无法读取每周食谱', '每周食谱读取失败，请重试。', function () {
              loadRecipePage(state.recipeWeekOffset);
            });
            return;
          }
          state.recipeDays = days;
          state.hasWorkspaceSnapshot = true;
          state.syncStatus = 'success';
          clearTimer('syncRetry');
          renderRecipePage(days);
          reportSync();
        });
      });
    });
  }

  function loadWorkspace(forceHome) {
    clearAllTimers();
    beginSync();
    readSyncStatus(function (syncStatus) {
      if (syncStatus === 401 || syncStatus === 403) { showRevoked(); return; }
      jsonRequest('GET', '/api/devices/current', null, function (status, refrigerator) {
        if (status === 401) { window.location.replace('/fridge'); return; }
        if (status === 403) { showRevoked(); return; }
        if (status !== 200 || !refrigerator) {
          markSyncFailure('暂时无法读取冰箱状态', '无法读取冰箱状态。', function () { loadWorkspace(forceHome); });
          return;
        }
        setRefrigerator(refrigerator);
        if (refrigerator.setup_status !== 'ready') { showWaitingLayout(refrigerator); return; }
        jsonRequest('GET', '/api/devices/current/layout', null, function (layoutStatus, layout) {
          if (layoutStatus === 401 || layoutStatus === 403) { showRevoked(); return; }
          if (layoutStatus !== 200 || !layout) {
            markSyncFailure('暂时无法读取布局', '冰箱布局暂时无法读取。', function () { loadWorkspace(forceHome); });
            return;
          }
          state.layout = layout;
          jsonRequest('GET', '/api/devices/current/inventory', null, function (inventoryStatus, inventory) {
            if (inventoryStatus === 401 || inventoryStatus === 403) { showRevoked(); return; }
            if (inventoryStatus !== 200 || !inventory) {
              markSyncFailure('暂时无法读取库存', '冰箱库存暂时无法读取。', function () { loadWorkspace(forceHome); });
              return;
            }
            state.inventory = inventory;
            jsonRequest('GET', '/api/devices/current/icons', null, function (iconStatus, icons) {
              if (iconStatus === 401 || iconStatus === 403) { showRevoked(); return; }
              if (iconStatus !== 200 || !icons) {
                markSyncFailure('暂时无法读取图标', '冰箱图标暂时无法读取。', function () { loadWorkspace(forceHome); });
                return;
              }
              state.icons = icons;
              jsonRequest('GET', restockPath(), null, function (restockStatus, entries) {
                if (!handleRestockForHome(restockStatus, entries)) {
                  if (restockStatus !== 401 && restockStatus !== 403) {
                    markSyncFailure('暂时无法读取补货清单', '补货清单读取失败，请重试。', function () { loadWorkspace(forceHome); });
                  }
                  return;
                }
                state.hasWorkspaceSnapshot = true;
                if (forceHome || state.view === 'home') renderHome();
                else renderDetail(state.slotId);
                reportSync();
              });
            });
          });
        });
      });
    });
  }

  function pollLayout() {
    jsonRequest('GET', '/api/devices/current', null, function (status, refrigerator) {
      if (status === 200 && refrigerator && refrigerator.setup_status === 'ready') {
        window.location.replace('/fridge/device');
        return;
      }
      if (status === 401 || status === 403) { showRevoked(); return; }
      if (status === 0 || status >= 500) {
        showError('暂时无法确认布局', '网络连接中断，请重试。', function () { showWaitingLayout(state.refrigerator); });
        return;
      }
      if (status !== 200 || !refrigerator) {
        showError('暂时无法确认布局', '冰箱状态读取失败，请重试。', function () { showWaitingLayout(state.refrigerator); });
        return;
      }
      schedule('layout', pollLayout, POLL_INTERVAL_MS);
    });
  }

  function pollFirstBoot() {
    jsonRequest('GET', '/api/kindle/first-boot-sessions/current', null, function (status, result) {
      if (status === 200 && result && result.state === 'bound' && result.refrigerator) {
        if (result.refrigerator.setup_status === 'ready') window.location.replace('/fridge/device');
        else showWaitingLayout(result.refrigerator);
        return;
      }
      if (status === 400 || status === 404) { createFirstBootSession(); return; }
      if (status === 0 || status >= 500) {
        showError('暂时无法确认绑定状态', '网络连接中断，请重新显示二维码。', createFirstBootSession);
        return;
      }
      if (status !== 200 || !result) {
        showError('暂时无法确认绑定状态', '绑定状态读取失败，请重新显示二维码。', createFirstBootSession);
        return;
      }
      schedule('poll', pollFirstBoot, POLL_INTERVAL_MS);
    });
  }

  function createFirstBootSession() {
    state.mode = 'entry';
    jsonRequest('POST', '/api/kindle/first-boot-sessions', '', function (status, session) {
      if (status < 200 || status >= 300 || !session || !session.pairing_token) {
        showError('二维码暂时无法生成', '请检查网络连接后重试。', createFirstBootSession);
        return;
      }
      state.token = session.pairing_token;
      renderQrPage('绑定手机端', session, '', '');
      schedule('poll', pollFirstBoot, POLL_INTERVAL_MS);
    });
  }

  function pollPairing() {
    jsonRequest('GET', '/api/kindle/pairing-sessions/current', null, function (status, result) {
      if (status === 200 && result && result.state === 'used') {
        clearAllTimers();
        var content = setStaticPage('添加手机', '手机已连接', '扫码只添加手机访问，不会更改冰箱所有者。', 'kindle-state-page');
        content.appendChild(legacyButton('返回冰箱首页', 'kindle-action kindle-primary', function () { window.location.replace('/fridge/device'); }, '', '5'));
        return;
      }
      if (status === 400 || status === 404 || (result && (result.state === 'expired' || result.state === 'missing'))) {
        createPairingSession();
        return;
      }
      if (status === 401 || status === 403) { showRevoked(); return; }
      if (status === 0 || status >= 500) {
        showError('暂时无法确认手机连接', '网络连接中断，请重新显示二维码。', createPairingSession);
        return;
      }
      if (status !== 200 || !result) {
        showError('暂时无法确认手机连接', '手机连接状态读取失败，请重新显示二维码。', createPairingSession);
        return;
      }
      schedule('poll', pollPairing, POLL_INTERVAL_MS);
    });
  }

  function createPairingSession() {
    state.mode = 'pairing';
    jsonRequest('POST', '/api/kindle/pairing-sessions', '', function (status, session) {
      if (status === 401 || status === 403) { showRevoked(); return; }
      if (status < 200 || status >= 300 || !session || !session.pairing_token) {
        showError('二维码暂时无法生成', '请检查网络连接后重试。', createPairingSession);
        return;
      }
      state.token = session.pairing_token;
      renderQrPage('添加手机', session, '二维码已生成。', '在手机端打开“家常食橱”，点击“扫描冰箱二维码”。未安装时，可先用系统相机扫描并按提示安装。');
      schedule('poll', pollPairing, POLL_INTERVAL_MS);
    });
  }

  function startEntry() {
    jsonRequest('GET', '/api/kindle/page-state', null, function (status, result) {
      if (status === 200 && result && result.state === 'unconfigured') { createFirstBootSession(); return; }
      if (status === 200 && result && result.state === 'configured') { window.location.replace('/fridge/device'); return; }
      if (status === 200 && result && result.state === 'revoked') { showRevoked(); return; }
      showError('暂时无法确认设备状态', '无法确认设备状态。', start);
    });
  }

  function startPasscode() {
    jsonRequest('GET', '/api/kindle/page-state', null, function (status, result) {
      if (status === 200 && result && result.state === 'unconfigured') {
        renderPasscodePage();
        return;
      }
      if (status === 200 && result && result.state === 'configured') {
        window.location.replace('/fridge/device');
        return;
      }
      if (status === 200 && result && result.state === 'revoked') {
        showRevoked();
        return;
      }
      showError('暂时无法确认设备状态', '无法打开六位数字绑定码页。', startPasscode);
    });
  }

  function start() {
    clearAllTimers();
    state.mode = currentPath();
    if (isCapabilitySpikePath() || hasQueryFlag('spike') || (FORCE_CAPABILITY_SPIKE && state.mode === 'entry' && !hasQueryFlag('normal'))) {
      renderCapabilitySpike();
      return;
    }
    if (state.mode === 'entry') startEntry();
    else if (state.mode === 'passcode') startPasscode();
    else if (state.mode === 'pairing') {
      jsonRequest('GET', '/api/kindle/page-state', null, function (status, result) {
        if (status === 200 && result && result.state === 'configured') createPairingSession();
        else if (status === 200 && result && result.state === 'revoked') showRevoked();
        else showError('暂时无法连接冰箱', '请先完成冰箱端绑定后再添加手机。', start);
      });
    } else if (state.mode === 'restock') loadRestockPage();
    else if (state.mode === 'recipes') loadRecipePage(0);
    else loadWorkspace(true);
  }

  window.onresize = function () {
    var frame = document.getElementsByClassName ? document.getElementsByClassName('kindle-qr-frame')[0] : null;
    var image = document.getElementsByClassName ? document.getElementsByClassName('kindle-qr')[0] : null;
    if (frame && image) fitQr(frame, image, state.mode === 'pairing' ? 450 : 400);
    if (state.view === 'home') fitHomeFridge();
  };

  start();
}());
