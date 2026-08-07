(function () {
  var FORCE_CAPABILITY_SPIKE = false;
  var REQUEST_TIMEOUT_MS = 15000;
  var POLL_INTERVAL_MS = 4000;
  var AUTO_HOME_MS = 10 * 60 * 1000;
  var SYNC_RETRY_INTERVAL_MS = 30 * 60 * 1000;
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
    restockEntries: [],
    restockError: false,
    syncStatus: 'unknown',
    lastSuccessfulSyncAt: null,
    hasWorkspaceSnapshot: false,
    lastAction: null,
    actionBusy: false,
    timers: {}
  };

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

  function renderCapabilitySpike() {
    var page = inlineStyle(element('main', 'kindle-page kindle-spike-page'), 'width:100%;min-height:100%;padding:0 24px 24px;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;');
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
    while (app.firstChild) app.removeChild(app.firstChild);
    app.className = 'kindle-page kindle-spike-page';
    app.appendChild(page);
  }

  function button(label, className, handler, ariaLabel) {
    var node = element('button', className || '', label);
    node.type = 'button';
    if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
    if (handler) node.onclick = handler;
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
    if (normalized.indexOf('/fridge/device') === 0) return 'device';
    return 'entry';
  }

  function setPageClass(className) {
    app.className = 'kindle-page ' + className;
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

  function header(title, left, right) {
    var node = element('header', 'kindle-header');
    node.appendChild(left || element('span', 'kindle-header-cell'));
    var heading = inlineStyle(element('h1'), 'font-size:30px;line-height:1.2;font-weight:700;text-align:center;');
    heading.appendChild(legacyText(title));
    node.appendChild(heading);
    node.appendChild(right || element('span', 'kindle-header-cell'));
    return node;
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
    renderHome();
  }

  function retrySync() {
    if (state.view === 'restock') loadRestockPage();
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
        state.refrigerator = refrigerator;
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
    var input = inlineStyle(element('input', 'kindle-passcode-input'), 'display:block;width:100%;min-height:56px;margin-top:8px;padding:8px 12px;border:2px solid #111;border-radius:0;background:#fff;color:#111;font-size:20px;line-height:1.55;letter-spacing:.18em;text-align:center;');
    var submit = inlineStyle(legacyButton('使用绑定码', 'kindle-action kindle-primary', function () {
      bindWithPasscode(input, submit, feedback);
    }, '', '5'), 'display:block;width:100%;min-height:56px;margin-top:16px;padding:8px 16px;border:2px solid #111;background:#111;color:#fff;font-size:20px;font-weight:700;');
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
    app.appendChild(header('六位数字绑定码', link('←', 'kindle-header-action', '/fridge', '返回二维码页')));
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
    firstCell.appendChild(legacyText('用手机相机扫描，或打开 https://fridge.flycn.fyi 安装“家常食橱”。'));
    installedCell.appendChild(installedTitle);
    installedCell.appendChild(legacyText('打开“家常食橱”，进入目标冰箱的“冰箱设置”，点击“绑定冰箱端设备”后扫描。'));
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
    var back = state.mode === 'pairing' ? link('←', 'kindle-header-action', '/fridge/device', '返回冰箱首页') : null;
    var refresh = state.mode === 'pairing' ? button('↻', 'kindle-header-action', createPairingSession, '刷新二维码') : null;
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
      content.appendChild(legacyElement('p', 'kindle-copy-block', hintMessage, '4'));
      content.appendChild(countdownNode);
    }
    app.appendChild(content);
    app.appendChild(state.mode === 'entry' ? entryFooter() : legacyElement('footer', 'kindle-footer', '扫码只添加手机访问，不会更改冰箱所有者', '4'));
    image.src = qrPath(session.pairing_token);
    fitQr(frame, image, state.mode === 'pairing' ? 420 : 400);
    startCountdown(session.expires_in_seconds || 600, countdownNode, state.mode === 'pairing' ? createPairingSession : createFirstBootSession);
  }

  function showRevoked() {
    var content = setStaticPage('设备访问已移除', '此冰箱端访问已移除。', '请在手机端重新绑定后，再回到此页面。', 'kindle-state-page');
    content.appendChild(legacyButton('重新读取设备状态', 'kindle-action kindle-primary', start, '', '5'));
  }

  function showWaitingLayout(refrigerator) {
    clearAllTimers();
    setPageClass('kindle-waiting-page');
    app.appendChild(header(refrigerator.name));
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

  function zoneNode(zone) {
    var node = element('section', 'kindle-zone');
    zone.slots.forEach(function (slot) {
      var slotButton = button('', 'kindle-slot', function () { renderDetail(slot.id); }, '查看 ' + zone.label + ' 的第 ' + slotPosition(slot) + ' 格');
      var items = itemsForSlot(slot.id);
      if (items.length) {
        var cluster = element('span', 'kindle-food-cluster');
        items.forEach(function (item) { cluster.appendChild(foodNode(item)); });
        slotButton.appendChild(cluster);
      } else slotButton.appendChild(legacyText('空', '4'));
      node.appendChild(slotButton);
    });
    return node;
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

  function restockPath() {
    return '/api/devices/current/restock?week_start=' + currentWeekStart();
  }

  function restockEntryTitle(entry) {
    var weekLabel = entry.week_start && entry.week_start !== currentWeekStart() ? '下周' : '本周';
    return weekLabel + ' · ' + String(entry.label || '未知日期') + ' · ' + String(entry.dish_name || '未命名食谱');
  }

  function isArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  }

  function renderRestockEntry(entry) {
    entry = entry || {};
    var node = element('article', 'kindle-restock-entry');
    var title = inlineStyle(element('h2', 'kindle-restock-entry-title'), 'font-size:24px;line-height:1.4;');
    title.appendChild(legacyText(restockEntryTitle(entry), '5'));
    node.appendChild(title);
    var missing = element('div', 'kindle-restock-missing');
    var missingItems = isArray(entry.missing) ? entry.missing : [];
    missingItems.forEach(function (item) {
      item = item || {};
      var row = element('p', 'kindle-restock-missing-row');
      row.appendChild(legacyText(String(item.subcategory_name || '未命名食材') + ' × ' + String(item.quantity || 0), '4'));
      missing.appendChild(row);
    });
    node.appendChild(missing);
    return node;
  }

  function renderRestockPage(entries) {
    var banner;
    clearAllTimers();
    state.view = 'restock';
    setPageClass('kindle-restock-page');
    var back = link('←', 'kindle-header-action', '/fridge/device', '返回冰箱首页');
    var refresh = button('↻', 'kindle-header-action', loadRestockPage, '刷新补货清单');
    app.appendChild(header('补货清单', back, refresh));
    var content = element('section', 'kindle-restock-content');
    var intro = inlineStyle(element('p', 'kindle-restock-intro'), 'font-size:20px;line-height:1.5;');
    intro.appendChild(legacyText('本周和下周未完成食谱的缺货食材。', '4'));
    banner = syncBanner();
    if (banner) app.appendChild(banner);
    content.appendChild(intro);
    if (!entries.length) {
      var empty = inlineStyle(element('p', 'kindle-restock-empty'), 'font-size:24px;line-height:1.5;');
      empty.appendChild(legacyText('没有需要补货的食材。', '5'));
      content.appendChild(empty);
      var emptyHint = inlineStyle(element('p', 'kindle-hint'), 'font-size:19px;line-height:1.5;');
      emptyHint.appendChild(legacyText('当前库存满足本周和下周未完成食谱。', '4'));
      content.appendChild(emptyHint);
    } else {
      entries.forEach(function (entry) { content.appendChild(renderRestockEntry(entry)); });
    }
    app.appendChild(content);
    var footer = element('footer', 'kindle-footer');
    footer.appendChild(legacyText('⌂ 10分钟后回到首页', '4'));
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
    clearAllTimers();
    state.view = 'home';
    setPageClass('kindle-home-page');
    setActionBusy(false);
    var summary = syncLabel();
    var pairLink = link('▦', 'kindle-header-action', '/fridge/pair', '连接手机');
    var refresh = button('↻', 'kindle-header-action', function () { loadWorkspace(true); }, '刷新冰箱');
    app.appendChild(header('家常食橱', pairLink, refresh));
    var content = element('section', 'kindle-home-content');
    var summaryRow = element('div', 'kindle-home-summary');
    var summaryMain = element('div', 'kindle-home-summary-main');
    summaryMain.appendChild(legacyElement('strong', '', state.refrigerator.name, '5'));
    var syncSummary = inlineStyle(element('p', 'kindle-subtitle'), 'font-size:19px;line-height:1.5;');
    syncSummary.appendChild(legacyText(summary.total + ' 件物品 · ' + syncStatusLabel(), '4'));
    summaryMain.appendChild(syncSummary);
    summaryRow.appendChild(summaryMain);
    var actions = element('div', 'kindle-home-actions');
    if (summary.expiring) actions.appendChild(legacyElement('span', 'kindle-alert', '◢ ' + summary.expiring, '4'));
    if (summary.expired) actions.appendChild(legacyElement('span', 'kindle-alert kindle-alert-expired', '! ' + summary.expired, '4'));
    if (!state.restockError && state.restockEntries.length) {
      actions.appendChild(legacyButton('补 ' + state.restockEntries.length, 'kindle-alert kindle-alert-restock', function () {
        window.location.replace('/fridge/device/restock');
      }, '查看补货清单', '4'));
    }
    actions.appendChild(pairLink.cloneNode(true));
    actions.appendChild(refresh.cloneNode(true));
    actions.childNodes[actions.childNodes.length - 2].onclick = function () { window.location.replace('/fridge/pair'); };
    actions.childNodes[actions.childNodes.length - 1].onclick = function () { loadWorkspace(true); };
    summaryRow.appendChild(actions);
    content.appendChild(summaryRow);
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
    var fridge = element('section', 'kindle-fridge');
    var main = element('div', 'kindle-fridge-main');
    var door = element('div', 'kindle-fridge-door');
    state.layout.zones.forEach(function (zone) { (zone.is_door ? door : main).appendChild(zoneNode(zone)); });
    fridge.appendChild(main);
    fridge.appendChild(door);
    content.appendChild(fridge);
    content.appendChild(legacyElement('p', 'kindle-legend', '◢ 临期　! 过期　点击隔层查看', '4'));
    app.appendChild(content);
    layoutFoodClusters();
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

  function detailThumbnail(slotId) {
    var thumbnail = window.KindleLayout.getThumbnailLayout(state.layout);
    var frame = element('div', 'kindle-detail-preview' + (thumbnail.wide ? ' kindle-detail-preview-wide' : ''));
    var panels = thumbnail.panels;
    var panelIndex;
    var zoneIndex;
    var slotIndex;
    var panel;
    var panelNode;
    var zone;
    var zoneNode;
    var slot;
    var slotNode;

    for (panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
      panel = panels[panelIndex];
      panelNode = element('div', 'kindle-detail-preview-panel kindle-detail-preview-panel-' + panel.key);
      for (zoneIndex = 0; zoneIndex < panel.zones.length; zoneIndex += 1) {
        zone = panel.zones[zoneIndex];
        zoneNode = element('div', 'kindle-detail-preview-zone');
        zoneNode.style.left = zone.x + '%';
        zoneNode.style.top = zone.y + '%';
        zoneNode.style.width = zone.width + '%';
        zoneNode.style.height = zone.height + '%';
        for (slotIndex = 0; slotIndex < zone.slots.length; slotIndex += 1) {
          slot = zone.slots[slotIndex];
          slotNode = element(
            'span',
            'kindle-detail-preview-slot' + (slot.id === slotId ? ' is-selected' : '')
          );
          slotNode.style.left = slot.x + '%';
          slotNode.style.top = slot.y + '%';
          slotNode.style.width = slot.width + '%';
          slotNode.style.height = slot.height + '%';
          zoneNode.appendChild(slotNode);
        }
        panelNode.appendChild(zoneNode);
      }
      frame.appendChild(panelNode);
    }
    return frame;
  }

  function renderDetail(slotId) {
    var location = slotById(slotId);
    var items = itemsForSlot(slotId).slice(0).sort(function (left, right) {
      return riskRank(left.expiry_status) - riskRank(right.expiry_status) || dateLabel(left.best_before).localeCompare(dateLabel(right.best_before));
    });
    state.view = 'detail';
    state.slotId = slotId;
    clearAllTimers();
    setPageClass('kindle-detail-page');
    setActionBusy(false);
    var back = link('←', 'kindle-header-action', '/fridge/device', '返回冰箱首页');
    var refresh = button('↻', 'kindle-header-action', function () { loadWorkspace(false); }, '刷新分区');
    app.appendChild(header(location ? location.zone.label + ' · 第 ' + slotPosition(location.slot) + ' 格' : '分区详情', back, refresh));
    var banner = syncBanner();
    if (banner) app.appendChild(banner);
    var content = element('section', 'kindle-detail-content');
    content.appendChild(detailThumbnail(slotId));
    content.appendChild(legacyElement('h2', 'kindle-detail-title', items.length + ' 种物品 · ' + items.reduce(function (sum, item) { return sum + item.quantity; }, 0) + ' 件', '5'));
    if (!items.length) content.appendChild(legacyElement('p', 'kindle-empty', '这个隔层还没有物品。', '4'));
    items.forEach(function (item) {
      var row = element('article', 'kindle-item');
      var iconCell = element('div', 'kindle-item-icon');
      var icon = findIcon(item.icon_key);
      if (icon) {
        var iconImage = element('img');
        iconImage.src = icon.asset_url;
        iconImage.alt = '';
        iconCell.appendChild(iconImage);
      }
      if (item.expiry_status === 'expired') iconCell.appendChild(element('b', 'kindle-item-risk kindle-item-risk-expired', '!'));
      else if (item.expiry_status === 'expiring') iconCell.appendChild(element('b', 'kindle-item-risk kindle-item-risk-expiring', '◢'));
      row.appendChild(iconCell);
      var main = element('div', 'kindle-item-main');
      main.appendChild(legacyElement('span', 'kindle-item-name', item.item_name, '5'));
      main.appendChild(legacyElement('span', 'kindle-item-date', dateLabel(item.best_before), '4'));
      main.appendChild(legacyElement('p', 'kindle-item-meta', '剩 ' + item.quantity + ' · ' + (item.expiry_status === 'expired' ? '已过期' : item.expiry_status === 'expiring' ? '临期' : '可食用'), '4'));
      row.appendChild(main);
      var actions = element('div', 'kindle-item-actions');
      if (item.quantity === 1) actions.appendChild(legacyButton('拿走', '', function () { adjust(item, -1); }, '', '4'));
      else {
        actions.appendChild(legacyButton('−', '', function () { adjust(item, -1); }, '减少 ' + item.item_name, '4'));
        actions.appendChild(legacyElement('strong', '', '剩 ' + item.quantity, '4'));
        actions.appendChild(legacyButton('＋', '', function () { adjust(item, 1); }, '增加 ' + item.item_name, '4'));
        actions.appendChild(legacyButton('全部拿走', '', function () { adjust(item, -item.quantity); }, '', '4'));
      }
      row.appendChild(actions);
      content.appendChild(row);
    });
    app.appendChild(content);
    var footer = element('footer', 'kindle-footer');
    if (state.lastAction) footer.appendChild(legacyButton('已更新 · 撤销', 'kindle-action', undoLast, '', '4'));
    else footer.appendChild(legacyText('⌂ 10分钟后回到首页', '4'));
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
        state.refrigerator = refrigerator;
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
        state.refrigerator = refrigerator;
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
      renderQrPage('请用手机相机扫码绑定手机端或安装程序', session, '', '');
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
    if (hasQueryFlag('spike') || (FORCE_CAPABILITY_SPIKE && state.mode === 'entry' && !hasQueryFlag('normal'))) {
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
    else loadWorkspace(true);
  }

  window.onresize = function () {
    var frame = document.getElementsByClassName ? document.getElementsByClassName('kindle-qr-frame')[0] : null;
    var image = document.getElementsByClassName ? document.getElementsByClassName('kindle-qr')[0] : null;
    if (frame && image) fitQr(frame, image, state.mode === 'pairing' ? 420 : 400);
    if (state.view === 'home') layoutFoodClusters();
  };

  start();
}());
