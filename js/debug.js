/* The ?debug=1 readout.
 *
 * It calls the SDK for nothing. It listens for the page level event dengageEvents announces and
 * it watches the transport, because a readout that only reports what the page tried to send is
 * exactly the readout that says "sent" for everything while a content blocker silently drops
 * every request to event.dengage.com and lets push.dengage.com through. That happened, on one
 * device, and nothing on screen disagreed.
 */
(function (window, document) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var SLUG = cfg.slug;
  var MAX = 40;
  var rows = [];

  function on() {
    var q = window.location.search;
    if (/[?&]debug=1/.test(q)) { try { sessionStorage.setItem('dps:' + SLUG + ':debug', '1'); } catch (e) {} return true; }
    if (/[?&]debug=0/.test(q)) { try { sessionStorage.removeItem('dps:' + SLUG + ':debug'); } catch (e) {} return false; }
    try { return sessionStorage.getItem('dps:' + SLUG + ':debug') === '1'; } catch (e) { return false; }
  }
  if (!on()) { return; }

  var panel = document.createElement('div');
  panel.id = 'dps-debug';
  panel.innerHTML =
    '<header><strong>Dengage readout</strong>' +
    '<button type="button" data-act="copy" title="Copy as JSON">copy</button>' +
    '<button type="button" data-act="fold" title="Collapse">fold</button></header>' +
    '<dl id="dps-sdk" class="dps-sdk"></dl><ol></ol>';
  var list = panel.querySelector('ol');
  var sdkEl = panel.querySelector('#dps-sdk');

  /* The SDK parameters, pinned above the event log so a presenter can reconcile a row in Dengage
     against this browser without leaving the page: the contact key it is identified as, its device
     id, the session id the custom tables join on, and the push token a send is addressed by. There
     is no getSessionId, so the session is read from the SDK's own _dn_sessions store the way the
     launcher reads it. The token and device id resolve through the SDK's callback getters, so they
     fill in a moment after load and again whenever identity changes. */
  var sdk = { contactKey: null, deviceId: null, sessionId: null, token: null };
  function readSession() {
    try {
      var raw = window.localStorage.getItem('_dn_sessions');
      if (!raw) { return null; }
      var parsed = JSON.parse(raw);
      return (parsed && (parsed.sessionId || (parsed[0] && parsed[0].sessionId))) || null;
    } catch (e) { return null; }
  }
  function sdkRow(label, value) {
    return '<div><dt>' + label + '</dt><dd>' +
      (value == null || value === '' ? '<i>not set</i>' : String(value)) + '</dd></div>';
  }
  function paintSdk() {
    if (!sdkEl) { return; }
    sdk.sessionId = readSession();
    sdkEl.innerHTML =
      sdkRow('contact key', sdk.contactKey) +
      sdkRow('device id', sdk.deviceId) +
      sdkRow('session id', sdk.sessionId) +
      sdkRow('push token', sdk.token) +
      sdkRow('account id', cfg.dengage && cfg.dengage.accountId) +
      sdkRow('app guid', cfg.dengage && cfg.dengage.appGuid);
  }
  function refreshSdk() {
    var EV = window.DengageEvents, IDN = window.DTelcoIdentity;
    sdk.contactKey = IDN ? IDN.get() : null;
    paintSdk();
    if (!EV) { return; }
    try { EV.getContactKey(function (v) { if (v) { sdk.contactKey = v; paintSdk(); } }); } catch (e) {}
    try { EV.getDeviceId(function (v) { sdk.deviceId = v || null; paintSdk(); }); } catch (e) {}
    try { EV.getToken(function (v) { sdk.token = v || null; paintSdk(); }); } catch (e) {}
  }

  function add(kind, title, detail, ok) {
    rows.unshift({ kind: kind, title: title, detail: detail, ok: ok, at: new Date().toISOString() });
    rows = rows.slice(0, MAX);
    render();
  }
  function render() {
    list.innerHTML = rows.map(function (r) {
      return '<li class="' + r.kind + (r.ok === false ? ' bad' : '') + '">' +
             '<b>' + r.title + '</b><span>' + (r.detail || '') + '</span></li>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(panel);
    panel.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'fold') { panel.classList.toggle('folded'); }
      if (act === 'copy' && navigator.clipboard) {
        navigator.clipboard.writeText(JSON.stringify({ sdk: sdk, events: rows }, null, 1));
      }
    });
    render();
    /* The token and device id land after the SDK subscribes, so poll a few times over the first
       few seconds rather than once on load, and refresh whenever the contact key changes. */
    refreshSdk();
    var tries = 0;
    var poll = window.setInterval(function () {
      refreshSdk();
      if (++tries >= 6) { window.clearInterval(poll); }
    }, 1500);
    window.addEventListener('dps:' + SLUG + ':identified', refreshSdk);
    window.addEventListener('dps:' + SLUG + ':auth', refreshSdk);
  });

  // What the page tried to send, and the table it was aimed at.
  window.addEventListener('dps:' + SLUG + ':event', function (e) {
    var d = e.detail || {};
    var table = { 'pageView': 'page_view_events', 'ec:addToCart': 'shopping_cart_events',
      'ec:removeFromCart': 'shopping_cart_events', 'ec:deleteCart': 'shopping_cart_events',
      'ec:beginCheckout': 'shopping_cart_events', 'ec:order': 'order_events + detail',
      'ec:cancelOrder': 'order_events', 'ec:search': 'search_events',
      'setContactKey': 'contact binding' }[d.action] ||
      (d.action === 'sendDeviceEvent' ? cfg.dengage.eventTable : '');
    add('sent', d.action + (table ? '  ->  ' + table : ''),
        (d.note ? d.note + '  ' : '') + JSON.stringify(d.payload || {}).slice(0, 240),
        d.accepted !== false || !!d.note);
  });

  window.addEventListener('dps:' + SLUG + ':focus', function (e) {
    add('focus', 'recognition threshold crossed',
        e.detail.product_id + ' after ' + e.detail.views + ' views, key ' + e.detail.contact_key);
  });
  window.addEventListener('dps:' + SLUG + ':confirmation', function (e) {
    add('moment', 'moment ' + (e.detail && e.detail.moment),
        JSON.stringify(e.detail || {}).slice(0, 240));
  });

  /* The transport. Status 0 on a phone is almost always a blocker or a DNS filter, and it is
     the only way to tell that apart from a send that worked. */
  function watch(host, method, url, promise) {
    promise.then(function (r) {
      add('net', method + ' ' + host, (r && r.status !== undefined ? r.status : '?') + ' ' +
          String(url).replace(/^https?:\/\/[^/]+/, ''), !r || r.status < 400);
    }, function (err) {
      add('net', method + ' ' + host, 'no response, ' + (err && err.message), false);
    });
  }
  var interesting = /(dengage\.com|supabase\.co)/i;
  var nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = nativeFetch.apply(this, arguments);
      if (interesting.test(url)) {
        watch(String(url).replace(/^https?:\/\/([^/]+).*/, '$1'),
              (init && init.method) || 'GET', url, p);
      }
      return p;
    };
  }
  var open = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
  if (open) {
    window.XMLHttpRequest.prototype.open = function (method, url) {
      if (interesting.test(url)) {
        this.addEventListener('loadend', function () {
          add('net', method + ' xhr', this.status + ' ' +
              String(url).replace(/^https?:\/\/[^/]+/, ''), this.status > 0 && this.status < 400);
        });
      }
      return open.apply(this, arguments);
    };
  }
  var beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  if (beacon) {
    navigator.sendBeacon = function (url, data) {
      var ok = beacon(url, data);
      if (interesting.test(url)) { add('net', 'BEACON', (ok ? 'queued ' : 'refused ') + url, ok); }
      return ok;
    };
  }

  add('note', 'readout on', 'listening only, it calls the SDK for nothing');
})(window, document);
