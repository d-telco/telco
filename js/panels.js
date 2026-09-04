/* The presenter's launcher.
 *
 * The readout in debug.js watches. This drives. A demonstration where the presenter has to browse
 * their way into a state before they can show a message is a demonstration that runs out of time,
 * so every experience the site can draw has a button here, and every value a prospect asks for is
 * one press away from the clipboard.
 *
 * Opened with ?launcher=1 and remembered for the session, the same way the readout is.
 *
 * Four things here are fixed by the platform rather than chosen.
 *
 * There is no getSessionId. The SDK keeps the session in localStorage under _dn_sessions as JSON
 * with a sessionId field, so it is read defensively and shows "not set" if the key ever changes.
 *
 * getToken and getDeviceId are callback style and either callback may never fire, so the panel
 * settles on a timer rather than waiting. getToken resolves to nothing until permission is
 * granted, usually minutes after load, so the token is polled rather than read once.
 *
 * The push prompt needs a real user gesture. Chrome counts a dismissed unprompted dialog against
 * the origin and can poison push for every later call on that machine, so it is only ever raised
 * from this button, never on load.
 *
 * Exit intent and scroll depth are native triggers rather than events. Their cards say what
 * gesture to make instead of pretending to fire something, because a button that claims to fire a
 * native trigger is a button that lies.
 */
(function (window, document) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var SLUG = cfg.slug;
  var EV = window.DengageEvents;
  var ID = window.DTelcoIdentity;
  var CR = window.DTelcoCreatives;

  function on() {
    var q = window.location.search;
    try {
      if (/[?&]launcher=1/.test(q)) { sessionStorage.setItem('dps:' + SLUG + ':launcher', '1'); return true; }
      if (/[?&]launcher=0/.test(q)) { sessionStorage.removeItem('dps:' + SLUG + ':launcher'); return false; }
      return sessionStorage.getItem('dps:' + SLUG + ':launcher') === '1';
    } catch (e) { return /[?&]launcher=1/.test(q); }
  }
  if (!on()) { return; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------------------------------------------------------- quick reference */

  var state = { deviceId: null, token: null, sessionId: null };

  function sessionId() {
    try {
      var raw = window.localStorage.getItem('_dn_sessions');
      if (!raw) { return null; }
      var parsed = JSON.parse(raw);
      return parsed && (parsed.sessionId || (parsed[0] && parsed[0].sessionId)) || null;
    } catch (e) { return null; }
  }

  /* The exact string to filter page_url on in the panel: origin plus pathname, query stripped.
     page_url is the only route back to this demo's rows, so getting this wrong means reading
     somebody else's numbers in a shared account. */
  function demoUrl() { return window.location.origin + window.location.pathname; }

  function askSdk() {
    if (typeof window.dengage !== 'function') { return; }
    try { window.dengage('getDeviceId', function (id) { state.deviceId = id || null; paint(); }); } catch (e) {}
    try { window.dengage('getToken', function (t) { state.token = t || null; paint(); }); } catch (e) {}
  }

  function quickReference() {
    state.sessionId = sessionId();
    var rows = [
      ['Contact key', ID ? ID.get() : null],
      ['Device id', state.deviceId],
      ['Session id', state.sessionId],
      ['Push token', state.token],
      ['Page url to filter on', demoUrl()],
      ['Account id', cfg.dengage.accountId || null],
      ['App guid', cfg.dengage.appGuid || null]
    ];
    return rows.map(function (r) {
      var value = r[1];
      return '<div class="dps-qr-row"><span>' + esc(r[0]) + '</span>' +
             '<code>' + esc(value == null || value === '' ? 'not set' : value) + '</code>' +
             (value ? '<button type="button" data-copy="' + esc(value) + '">copy</button>' : '') +
             '</div>';
    }).join('');
  }

  /* ---------------------------------------------------------------- push */

  function pushState() {
    if (typeof window.dengage !== 'function') {
      return { supported: false, permission: 'no sdk on this page' };
    }
    var supported = true, permission = 'unknown';
    /* isPushNotificationsSupported throws when unsupported rather than returning false. */
    try { window.dengage('isPushNotificationsSupported'); } catch (e) { supported = false; }
    try { permission = window.dengage('getNotificationPermission') || 'unknown'; } catch (e) {}
    return { supported: supported, permission: permission };
  }

  /* iOS Safari delivers web push only to a site added to the Home Screen and opened from that
     icon. In a tab the permission call does nothing at all, silently, so the panel prints the
     steps instead of offering a button that cannot work. */
  function iosTab() {
    var ios = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
    if (!ios) { return false; }
    var standalone = window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    return !standalone;
  }

  function pushCard() {
    var p = pushState();
    if (iosTab()) {
      return '<p class="dps-note">This is an iPhone or iPad in a tab. iOS delivers web push only ' +
             'to a site added to the Home Screen and opened from its icon. Share, then Add to Home ' +
             'Screen, then open it from there. Asking here does nothing at all, silently.</p>';
    }
    var permission = esc(p.permission);
    return '<div class="dps-qr-row"><span>Supported</span><code>' + (p.supported ? 'yes' : 'no') +
           '</code></div>' +
           '<div class="dps-qr-row"><span>Permission</span><code>' + permission + '</code></div>' +
           (p.permission === 'granted'
             ? '<p class="dps-note">Already granted. The token appears above once the SDK has it, ' +
               'usually a minute or two after load.</p>'
             : '<button type="button" class="dps-primary" data-act="prompt">Ask for notifications' +
               '</button><p class="dps-note">Raised from this button and nowhere else. A dialog ' +
               'dismissed without a gesture counts against the origin in Chrome and can poison ' +
               'push for every later call on this machine.</p>') +
           '<p class="dps-note">A page can subscribe a device. It cannot send. Sends come from a ' +
           'campaign, a journey or the transactional endpoint.</p>';
  }

  /* ---------------------------------------------------------------- creatives */

  /* Two of the five rules are native triggers in the engine's vocabulary. Their cards say which
     gesture to make rather than firing anything, because there is nothing honest to fire. */
  var GESTURES = {
    exit: 'Move the pointer up and out through the top of the window.',
    scroll: 'Scroll past halfway, having been on the page three seconds.'
  };

  function creativeCards() {
    if (!CR) { return '<p class="dps-note">The creative engine is not on this page.</p>'; }
    var mode = CR.mode();
    return '<div class="dps-switch">' +
             '<button type="button" data-mode="local"' + (mode === 'local' ? ' aria-pressed="true"' : '') +
             '>Drawn by the site</button>' +
             '<button type="button" data-mode="panel"' + (mode === 'panel' ? ' aria-pressed="true"' : '') +
             '>Served by Dengage</button>' +
           '</div>' +
           '<p class="dps-note">' + (mode === 'panel'
             ? 'On panel. Pressing a card fires the event Dengage listens on and the page draws ' +
               'nothing itself, so a popup on screen has one explainable origin.'
             : 'On local. Every card below renders in the same frame as the press.') +
           '</p>' +
           CR.list().map(function (c) {
             return '<div class="dps-card">' +
                      '<div class="dps-card-head"><strong>' + esc(c.id) + '</strong>' +
                        '<em>' + esc(c.kind) + ' &middot; ' + esc(c.rule) + '</em></div>' +
                      '<p>' + esc(c.why) + '</p>' +
                      (GESTURES[c.rule]
                        ? '<p class="dps-note">Native trigger. ' + esc(GESTURES[c.rule]) + '</p>'
                        : '') +
                      '<button type="button" data-show="' + esc(c.id) + '">Show it</button>' +
                      (c.blocked ? '<p class="dps-note">Blocked: ' + esc(c.blocked) + '</p>' : '') +
                    '</div>';
           }).join('');
  }

  /* ---------------------------------------------------------------- flags */

  /* The rules read one store. These set it, so a presenter can reach any creative's condition in
     one press without walking the whole funnel or waiting on the backend. */
  var FLAGS = [
    ['usage_high', true, 'Past 80 percent of the allowance'],
    ['upgrade_eligible', true, 'Contract ending'],
    ['churn_risk', true, 'Port out requested'],
    ['campaign', 'Back to school', 'A campaign is running']
  ];

  function flagCards() {
    if (!CR) { return ''; }
    var set = CR.flags();
    return FLAGS.map(function (f) {
      var live = set[f[0]] !== undefined && set[f[0]] !== false;
      return '<div class="dps-qr-row"><span>' + esc(f[2]) + '</span>' +
             '<code>' + (live ? esc(String(set[f[0]])) : 'off') + '</code>' +
             '<button type="button" data-flag="' + esc(f[0]) + '">' +
             (live ? 'clear' : 'set') + '</button></div>';
    }).join('');
  }

  /* ---------------------------------------------------------------- resets */

  /* Only the SDK's own keys, listed before anything is touched and confirmed twice. This clears
     display state in a shared account's SDK storage, and a presenter who meant to clear the
     demo's own state instead would lose the device binding for the rest of the session. */
  var SDK_KEY = /dengage|dn_|__dn|dnpush/i;

  function sdkKeys() {
    var out = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (SDK_KEY.test(k)) { out.push(k); }
      }
    } catch (e) {}
    return out;
  }

  function resetWidgets() {
    var keys = sdkKeys();
    if (!keys.length) { window.alert('Nothing to clear: the SDK has written no storage keys here.'); return; }
    if (!window.confirm('Clear these ' + keys.length + ' SDK keys?\n\n' + keys.join('\n'))) { return; }
    if (!window.confirm('This resets widget display state for this browser. It does not touch the ' +
                        'Dengage account. Clear them?')) { return; }
    keys.forEach(function (k) { try { window.localStorage.removeItem(k); } catch (e) {} });
    window.alert('Cleared ' + keys.length + ' keys. Reload the page.');
  }

  function resetDemo() {
    if (!window.confirm('Clear this demo\'s own state: creatives seen, recognition, basket, ' +
                        'wishlist and flags? The contact key stays.')) { return; }
    try {
      var drop = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k.indexOf('dps:' + SLUG + ':') === 0 && k.indexOf(':ck') < 0) { drop.push(k); }
      }
      drop.forEach(function (k) { window.localStorage.removeItem(k); });
      window.sessionStorage.removeItem('dps:' + SLUG + ':creatives:session');
      window.alert('Cleared ' + drop.length + ' keys. Reload the page.');
    } catch (e) { window.alert('Could not clear: ' + e); }
  }

  /* ---------------------------------------------------------------- the panel */

  var panel = document.createElement('aside');
  panel.id = 'dps-launcher';
  panel.setAttribute('aria-label', 'Presenter launcher');

  function paint() {
    panel.innerHTML =
      '<header><strong>Launcher</strong>' +
        '<button type="button" data-act="fold" title="Collapse">fold</button></header>' +
      '<div class="dps-body">' +
        '<h4>Quick reference</h4>' + quickReference() +
        '<h4>On site experiences</h4>' + creativeCards() +
        '<h4>Conditions the rules read</h4>' + flagCards() +
        '<h4>Web push</h4>' + pushCard() +
        '<h4>Reset</h4>' +
          '<button type="button" data-act="reset-widgets">Reset widget display state</button>' +
          '<button type="button" data-act="reset-demo">Reset this demo\'s own state</button>' +
      '</div>';
  }

  panel.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-act="fold"]')) { panel.classList.toggle('folded'); return; }

    var copy = t.closest('[data-copy]');
    if (copy) {
      var value = copy.getAttribute('data-copy');
      if (window.navigator.clipboard) { window.navigator.clipboard.writeText(value); }
      copy.textContent = 'copied';
      window.setTimeout(function () { copy.textContent = 'copy'; }, 1200);
      return;
    }
    var m = t.closest('[data-mode]');
    if (m && CR) { CR.setMode(m.getAttribute('data-mode')); CR.closeAll(); paint(); return; }

    var show = t.closest('[data-show]');
    if (show && CR) {
      /* Twice in a row has to work, so the guards are stood down for a deliberate press and the
         row records that a button was pressed rather than that a rule fired. */
      CR.reset();
      CR.show(show.getAttribute('data-show'));
      paint();
      return;
    }
    var flag = t.closest('[data-flag]');
    if (flag && CR) {
      var name = flag.getAttribute('data-flag');
      var def = FLAGS.filter(function (f) { return f[0] === name; })[0];
      var live = CR.flags()[name] !== undefined && CR.flags()[name] !== false;
      CR.setFlag(name, live ? null : def[1]);
      paint();
      return;
    }
    if (t.closest('[data-act="prompt"]')) {
      try { window.dengage('showNativePrompt'); } catch (err) {}
      window.setTimeout(paint, 800);
      return;
    }
    if (t.closest('[data-act="reset-widgets"]')) { resetWidgets(); return; }
    if (t.closest('[data-act="reset-demo"]')) { resetDemo(); return; }
  });

  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(panel);
    paint();
    askSdk();
    /* Either callback may never fire, so the panel settles on a timer rather than waiting on one.
       The token then keeps being polled, because a subscription can be replaced mid session and a
       stale token produces a send reported as successful that reaches nobody. */
    window.setTimeout(paint, 1200);
    window.setInterval(function () {
      if (!state.token) { askSdk(); paint(); }
    }, 3000);
    window.setInterval(function () { askSdk(); paint(); }, 30000);
  });

  window.DTelcoLauncher = { paint: paint, sdkKeys: sdkKeys, demoUrl: demoUrl };
})(window, document);
