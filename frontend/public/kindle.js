(function () {
  var REQUEST_TIMEOUT_MS = 15000;
  var POLL_INTERVAL_MS = 4000;
  var AUTO_HOME_MS = 10 * 60 * 1000;
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

  function text(node, value) {
    while (node.firstChild) node.removeChild(node.firstChild);
    node.appendChild(document.createTextNode(value === undefined || value === null ? '' : String(value)));
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
    node.appendChild(element('h1', '', title));
    node.appendChild(right || element('span', 'kindle-header-cell'));
    return node;
  }

  function setStaticPage(title, statusMessage, hintMessage, className) {
    setPageClass(className || 'kindle-state-page');
    app.appendChild(header(title));
    var content = element('section', 'kindle-content');
    content.appendChild(element('p', 'kindle-status', statusMessage));
    if (hintMessage) content.appendChild(element('p', 'kindle-hint', hintMessage));
    app.appendChild(content);
    return content;
  }

  function showError(title, message, retry) {
    clearAllTimers();
    var content = setStaticPage(title, message, '请检查网络连接后重试。', 'kindle-state-page');
    if (retry) content.appendChild(button('重试', 'kindle-action kindle-primary', retry));
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
    var panel = element('section', 'kindle-passcode-panel');
    var title = element('h2', 'kindle-passcode-title', '无法扫描二维码？');
    var hint = element('p', 'kindle-hint', '请在手机端生成六位绑定码，然后在这里输入。');
    var label = element('label', 'kindle-passcode-label', '六位绑定码');
    var input = element('input', 'kindle-passcode-input');
    var submit = button('使用绑定码', 'kindle-action kindle-primary', function () {
      bindWithPasscode(input, submit, feedback);
    });
    var feedback = element('p', 'kindle-passcode-feedback');

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

  function fitQr(frame, image, reserveHeight) {
    var width = document.documentElement.clientWidth || document.body.clientWidth || 540;
    var height = document.documentElement.clientHeight || document.body.clientHeight || 720;
    var availableWidth = width - 48;
    var availableHeight = height - reserveHeight;
    var size = Math.floor(Math.min(availableWidth, availableHeight));
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
    var statusNode = element('p', 'kindle-status', statusMessage);
    content.appendChild(statusNode);
    if (state.mode === 'entry') {
      var first = element('p', 'kindle-copy-block');
      first.appendChild(element('strong', '', '首次使用'));
      first.appendChild(document.createTextNode('用手机相机扫描，或打开 fridge.flycn.fyi 安装“家常食橱”。'));
      content.appendChild(first);
      var installed = element('p', 'kindle-copy-block');
      installed.appendChild(element('strong', '', '已经安装'));
      installed.appendChild(document.createTextNode('打开“家常食橱”，进入目标冰箱的“冰箱设置”，点击“绑定冰箱端设备”后扫描。'));
      content.appendChild(installed);
      content.appendChild(passcodePanel());
    } else {
      content.appendChild(element('p', 'kindle-copy-block', hintMessage));
    }
    var countdownNode = element('p', 'kindle-status');
    content.appendChild(countdownNode);
    app.appendChild(content);
    app.appendChild(element('footer', 'kindle-footer', state.mode === 'pairing' ? '扫码只添加手机访问，不会更改冰箱所有者' : '二维码更新后，请扫描冰箱屏幕当前显示的二维码。'));
    image.src = qrPath(session.pairing_token);
    fitQr(frame, image, state.mode === 'pairing' ? 420 : 460);
    startCountdown(session.expires_in_seconds || 600, countdownNode, state.mode === 'pairing' ? createPairingSession : createFirstBootSession);
  }

  function showRevoked() {
    var content = setStaticPage('设备访问已移除', '此冰箱端访问已移除。', '请在手机端重新绑定后，再回到此页面。', 'kindle-state-page');
    content.appendChild(button('重新读取设备状态', 'kindle-action kindle-primary', start));
  }

  function showWaitingLayout(refrigerator) {
    clearAllTimers();
    setPageClass('kindle-waiting-page');
    app.appendChild(header(refrigerator.name));
    var content = element('section', 'kindle-content');
    content.appendChild(element('div', 'kindle-waiting-art'));
    content.appendChild(element('p', 'kindle-status', '设备已连接'));
    content.appendChild(element('p', 'kindle-copy-block', '请在手机端完成冰箱布局。保存后，本页面会自动打开冰箱首页。'));
    content.appendChild(element('p', 'kindle-status', '正在等待手机完成设置…'));
    app.appendChild(content);
    app.appendChild(element('footer', 'kindle-footer', '无需再次扫码'));
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

  function riskRank(status) {
    if (status === 'expired') return 0;
    if (status === 'expiring') return 1;
    return 2;
  }

  function groupedItems(items) {
    var groups = {};
    var result = [];
    var index;
    var key;
    for (index = 0; index < items.length; index += 1) {
      key = items[index].subcategory_id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(items[index]);
    }
    for (key in groups) {
      if (groups.hasOwnProperty(key)) result.push(groups[key]);
    }
    return result.slice(0, 5);
  }

  function foodNode(group) {
    var node = element('span', 'kindle-food');
    var icon = findIcon(group[0].icon_key);
    if (icon) {
      var image = element('img');
      image.src = icon.asset_url;
      image.alt = '';
      node.appendChild(image);
    }
    var quantity = group.reduce(function (total, item) { return total + item.quantity; }, 0);
    if (quantity > 1) node.appendChild(element('b', 'kindle-food-count', quantity));
    if (group.some(function (item) { return item.expiry_status === 'expired'; })) node.appendChild(element('b', 'kindle-food-risk', '!'));
    else if (group.some(function (item) { return item.expiry_status === 'expiring'; })) node.appendChild(element('b', 'kindle-food-risk', '◢'));
    return node;
  }

  function slotPosition(slot) {
    var parts = String(slot.key || '').split('-');
    return parts[parts.length - 1] || slot.key;
  }

  function zoneNode(zone) {
    var node = element('section', 'kindle-zone');
    node.appendChild(element('div', 'kindle-zone-title', zone.label));
    zone.slots.forEach(function (slot) {
      var slotButton = button('', 'kindle-slot', function () { renderDetail(slot.id); }, '查看 ' + zone.label + ' 的第 ' + slotPosition(slot) + ' 格');
      groupedItems(itemsForSlot(slot.id)).forEach(function (group) { slotButton.appendChild(foodNode(group)); });
      if (!slotButton.childNodes.length) slotButton.appendChild(document.createTextNode('空'));
      node.appendChild(slotButton);
    });
    return node;
  }

  function syncLabel() {
    var total = state.inventory.reduce(function (sum, item) { return sum + item.quantity; }, 0);
    var expiring = state.inventory.filter(function (item) { return item.expiry_status === 'expiring'; }).length;
    var expired = state.inventory.filter(function (item) { return item.expiry_status === 'expired'; }).length;
    return { total: total, expiring: expiring, expired: expired };
  }

  function renderHome() {
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
    summaryMain.appendChild(element('strong', '', state.refrigerator.name));
    summaryMain.appendChild(element('p', 'kindle-subtitle', summary.total + ' 件物品 · 刚刚刷新'));
    summaryRow.appendChild(summaryMain);
    var actions = element('div', 'kindle-home-actions');
    if (summary.expiring) actions.appendChild(element('span', 'kindle-alert', '◢ ' + summary.expiring));
    if (summary.expired) actions.appendChild(element('span', 'kindle-alert kindle-alert-expired', '! ' + summary.expired));
    actions.appendChild(pairLink.cloneNode(true));
    actions.appendChild(refresh.cloneNode(true));
    actions.childNodes[actions.childNodes.length - 2].onclick = function () { window.location.replace('/fridge/pair'); };
    actions.childNodes[actions.childNodes.length - 1].onclick = function () { loadWorkspace(true); };
    summaryRow.appendChild(actions);
    content.appendChild(summaryRow);
    var fridge = element('section', 'kindle-fridge');
    var main = element('div', 'kindle-fridge-main');
    var door = element('div', 'kindle-fridge-door');
    state.layout.zones.forEach(function (zone) { (zone.is_door ? door : main).appendChild(zoneNode(zone)); });
    fridge.appendChild(main);
    fridge.appendChild(door);
    content.appendChild(fridge);
    content.appendChild(element('p', 'kindle-legend', '◢ 临期　! 过期　点击隔层查看'));
    app.appendChild(content);
    reportSync();
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
    var refresh = button('↻', 'kindle-header-action', function () { loadWorkspace(true); }, '刷新分区');
    app.appendChild(header(location ? location.zone.label + ' · 第 ' + slotPosition(location.slot) + ' 格' : '分区详情', back, refresh));
    var content = element('section', 'kindle-detail-content');
    content.appendChild(element('h2', 'kindle-detail-title', items.length + ' 种物品 · ' + items.reduce(function (sum, item) { return sum + item.quantity; }, 0) + ' 件'));
    if (!items.length) content.appendChild(element('p', 'kindle-empty', '这个隔层还没有物品。'));
    items.forEach(function (item) {
      var row = element('article', 'kindle-item');
      var main = element('div', 'kindle-item-main');
      main.appendChild(element('span', 'kindle-item-name', item.item_name));
      main.appendChild(element('span', 'kindle-item-date', dateLabel(item.best_before)));
      main.appendChild(element('p', 'kindle-item-meta', '剩 ' + item.quantity + ' · ' + (item.expiry_status === 'expired' ? '已过期' : item.expiry_status === 'expiring' ? '临期' : '可食用')));
      row.appendChild(main);
      var actions = element('div', 'kindle-item-actions');
      if (item.quantity === 1) actions.appendChild(button('拿走', '', function () { adjust(item, -1); }));
      else {
        actions.appendChild(button('−', '', function () { adjust(item, -1); }, '减少 ' + item.item_name));
        actions.appendChild(element('strong', '', '剩 ' + item.quantity));
        actions.appendChild(button('＋', '', function () { adjust(item, 1); }, '增加 ' + item.item_name));
        actions.appendChild(button('全部拿走', '', function () { adjust(item, -item.quantity); }));
      }
      row.appendChild(actions);
      content.appendChild(row);
    });
    app.appendChild(content);
    var footer = element('footer', 'kindle-footer');
    if (state.lastAction) footer.appendChild(button('已更新 · 撤销', 'kindle-action', undoLast));
    else text(footer, '⌂ 10分钟后回到首页');
    app.appendChild(footer);
    schedule('autoHome', function () { window.location.replace('/fridge/device'); }, AUTO_HOME_MS);
  }

  function adjust(item, delta) {
    if (state.actionBusy) return;
    setActionBusy(true);
    request('PATCH', '/api/devices/current/inventory/' + encodeURIComponent(item.id) + '/quantity', JSON.stringify({ delta: delta }), function (status, responseText) {
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
        if (status < 200 || status >= 300) { setActionBusy(false); showError('撤销失败', '请稍后重试。', function () { renderDetail(state.slotId); }); return; }
        state.lastAction = null;
        loadWorkspace(false);
      });
      return;
    }
    request('PATCH', '/api/devices/current/inventory/' + encodeURIComponent(action.batch.id) + '/quantity', JSON.stringify({ delta: action.delta }), function (status) {
      if (status < 200 || status >= 300) { setActionBusy(false); showError('撤销失败', '请稍后重试。', function () { renderDetail(state.slotId); }); return; }
      state.lastAction = null;
      loadWorkspace(false);
    });
  }

  function reportSync() {
    request('POST', '/api/devices/current/sync-status', null, function () {});
  }

  function loadWorkspace(forceHome) {
    clearAllTimers();
    jsonRequest('GET', '/api/devices/current', null, function (status, refrigerator) {
      if (status === 401) { window.location.replace('/fridge'); return; }
      if (status === 403) { showRevoked(); return; }
      if (status !== 200 || !refrigerator) { showError('暂时无法读取冰箱状态', '无法读取冰箱状态。', function () { loadWorkspace(forceHome); }); return; }
      state.refrigerator = refrigerator;
      if (refrigerator.setup_status !== 'ready') { showWaitingLayout(refrigerator); return; }
      jsonRequest('GET', '/api/devices/current/layout', null, function (layoutStatus, layout) {
        if (layoutStatus !== 200 || !layout) { showError('暂时无法读取布局', '冰箱布局暂时无法读取。', function () { loadWorkspace(forceHome); }); return; }
        state.layout = layout;
        jsonRequest('GET', '/api/devices/current/inventory', null, function (inventoryStatus, inventory) {
          if (inventoryStatus !== 200 || !inventory) { showError('暂时无法读取库存', '冰箱库存暂时无法读取。', function () { loadWorkspace(forceHome); }); return; }
          state.inventory = inventory;
          jsonRequest('GET', '/api/devices/current/icons', null, function (iconStatus, icons) {
            if (iconStatus !== 200 || !icons) { showError('暂时无法读取图标', '冰箱图标暂时无法读取。', function () { loadWorkspace(forceHome); }); return; }
            state.icons = icons;
            if (forceHome || state.view === 'home') renderHome();
            else renderDetail(state.slotId);
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
      renderQrPage('绑定手机端', session, '请用手机相机扫描二维码。', '');
      schedule('poll', pollFirstBoot, POLL_INTERVAL_MS);
    });
  }

  function pollPairing() {
    jsonRequest('GET', '/api/kindle/pairing-sessions/current', null, function (status, result) {
      if (status === 200 && result && result.state === 'used') {
        clearAllTimers();
        var content = setStaticPage('添加手机', '手机已连接', '扫码只添加手机访问，不会更改冰箱所有者。', 'kindle-state-page');
        content.appendChild(button('返回冰箱首页', 'kindle-action kindle-primary', function () { window.location.replace('/fridge/device'); }));
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

  function start() {
    clearAllTimers();
    state.mode = currentPath();
    if (state.mode === 'entry') startEntry();
    else if (state.mode === 'pairing') {
      jsonRequest('GET', '/api/kindle/page-state', null, function (status, result) {
        if (status === 200 && result && result.state === 'configured') createPairingSession();
        else if (status === 200 && result && result.state === 'revoked') showRevoked();
        else showError('暂时无法连接冰箱', '请先完成冰箱端绑定后再添加手机。', start);
      });
    } else loadWorkspace(true);
  }

  window.onresize = function () {
    var frame = document.getElementsByClassName ? document.getElementsByClassName('kindle-qr-frame')[0] : null;
    var image = document.getElementsByClassName ? document.getElementsByClassName('kindle-qr')[0] : null;
    if (frame && image) fitQr(frame, image, state.mode === 'pairing' ? 420 : 460);
  };

  start();
}());
