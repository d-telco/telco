/* The message drawer: Dengage's Inbox and the demo's own message centre, in one list.
 *
 * Written from the Inbox Web SDK guide. The four calls it documents are marked DOC below.
 *
 * What the docs establish about the channel: Inbox is pull based, a campaign writes into a
 * server-side store and the surface fetches it; delivery does not depend on notification
 * permission; messages are bound to the user rather than the device, so they follow a person
 * across web and mobile; expiry is 7 days, both default and maximum; and deduplication is
 * always on, so a visitor cannot be shown the same campaign message twice.
 */
(function (window, document) {
  'use strict';

  var cfg = window.DTELCO_CONFIG;
  var ID = window.DTelcoIdentity;
  var SLUG = cfg.slug;

  /* DOC: the provider is a prototype constructed with new.
     The provider is constructed with new; a bare call is not the contract.
     Requires Web SDK 2.4.0 or later; below that this returns nothing and the drawer says so. */
  function provider() {
    try {
      if (window.DengageHelper && window.DengageHelper.InboxMessageProvider) {
        return new window.DengageHelper.InboxMessageProvider();
      }
      if (typeof window.dengage === 'function') {
        var p = new window.dengage('InboxMessageProvider');
        // The SDK replaces the queue stub with its dispatcher when it finishes loading. A call
        // against the stub is queued and its return value lost, so validate the shape rather
        // than probing internals.
        if (p && typeof p.getMessages === 'function') { return p; }
      }
    } catch (e) { /* fall through to own-only */ }
    return null;
  }

  var state = { dengage: [], own: [], read: {}, open: false, provider: null, seen: {} };
  try { state.read = JSON.parse(ID.read('inboxRead') || '{}'); } catch (e) { state.read = {}; }

  function markRead(id) {
    state.read[id] = Date.now();
    ID.write('inboxRead', JSON.stringify(state.read), false);
  }

  /* The message shape is decided by the server and the Inbox Web SDK guide does not publish it.
     So read through candidate keys at both levels rather than committing to one spelling, and
     log the first raw message per refresh so the real shape can be recorded rather than guessed.
     The exact field names are confirmed in the account once it serves one. */
  function pick(obj, names) {
    for (var i = 0; i < names.length; i++) {
      var parts = names[i].split('.');
      var v = obj;
      for (var j = 0; j < parts.length && v != null; j++) { v = v[parts[j]]; }
      if (v !== undefined && v !== null && v !== '') { return v; }
    }
    return undefined;
  }

  function normalise(m) {
    var id = pick(m, ['smsgId', 'id', 'messageId', 'message_id']);
    return {
      id: String(id),
      source: 'dengage',
      title: pick(m, ['title', 'messageJson.title', 'message.title', 'messageDetails.title']),
      body: pick(m, ['message', 'body', 'messageJson.message', 'messageJson.body',
                     'message.body', 'messageDetails.message']),
      media: pick(m, ['mediaUrl', 'media', 'messageJson.mediaUrl', 'messageJson.media',
                      'image', 'messageJson.image']),
      target: pick(m, ['targetUrl', 'url', 'messageJson.targetUrl', 'messageJson.url']),
      at: pick(m, ['receiveDate', 'sentDate', 'date', 'messageJson.date']),
      buttons: pick(m, ['buttons', 'messageJson.buttons']) || [],
      raw: m
    };
  }

  function httpOnly(url) { return /^https?:\/\//i.test(String(url || '')) ? url : null; }

  var api = {
    /* DOC: getMessages(limit) is asynchronous and returns a Promise. It also serves a 30 second
       cache: the first call fetches, and anything within the window is served from the cache. */
    refresh: function () {
      var jobs = [api.fetchOwn()];
      state.provider = state.provider || provider();
      if (state.provider) {
        jobs.push(Promise.resolve(state.provider.getMessages(cfg.dengage.inboxLimit))
          .then(function (list) {
            var arr = Array.isArray(list) ? list : (list && list.messages) || [];
            if (arr.length && window.console && !state.loggedShape) {
              state.loggedShape = true;
              console.log('[dtelco inbox] first raw message, for recording the real shape:',
                          JSON.stringify(arr[0]));
            }
            state.dengage = arr.map(normalise).filter(function (m) { return m.id !== 'undefined'; });
          })
          .catch(function () {
            /* The provider rejects with nothing while there is no device id yet. That is a
               timing state, not an error, and the drawer must not report it as one. */
            state.dengage = [];
          }));
      }
      return Promise.all(jobs).then(render);
    },

    /* The demo's own message centre. It exists because an Inbox message is written by a
       campaign, and a confirmation has to appear in the same second the visitor acted. Dengage
       also offers a Custom Inbox server-to-server path for surfaces without an SDK, so this is
       a latency choice rather than a gap in the platform. */
    fetchOwn: function () {
      var key = ID.get();
      if (!key || !cfg.functions.base) { return Promise.resolve(); }
      return fetch(cfg.functions.base + cfg.functions.message +
                   '?inbox=' + encodeURIComponent(key), { credentials: 'omit' })
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          state.own = (Array.isArray(rows) ? rows : []).map(function (r) {
            return { id: 'demo-' + r.id, source: 'own', title: r.title, body: r.message,
                     media: r.mediaUrl, target: r.targetUrl, at: r.sentDate,
                     channels: r.channels, buttons: [] };
          });
        })
        .catch(function () { state.own = []; });
    },

    unread: function () {
      return api.all().filter(function (m) { return !state.read[m.id]; }).length;
    },
    all: function () {
      return state.dengage.concat(state.own).sort(function (a, b) {
        return new Date(b.at || 0) - new Date(a.at || 0);
      });
    },

    /* DOC: the four report methods map one to one to the standard events, and nothing is sent
       automatically. Only Dengage's own messages are ever reported: the demo's carry a demo-
       prefix and Dengage never issued them, so reporting an impression for one would be a lie
       in the channel report. */
    report: function (kind, m, buttonId) {
      if (m.source !== 'dengage' || !state.provider) { return; }
      try {
        if (kind === 'impression' && !state.seen[m.id]) {
          state.seen[m.id] = true;                 // once per message per page, never on fetch
          state.provider.onImpression(m.id);
        }
        if (kind === 'open') { state.provider.onOpen(m.id); }
        if (kind === 'click') { state.provider.onClick(m.id, buttonId); }
        if (kind === 'delete') { state.provider.onDelete(m.id); }
      } catch (e) { /* reporting is never allowed to break the drawer */ }
    },

    open: function () {
      state.open = true;
      document.getElementById('dps-drawer').classList.add('open');
      api.refresh();
    },
    close: function () {
      state.open = false;
      document.getElementById('dps-drawer').classList.remove('open');
    }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function render() {
    var list = document.getElementById('dps-drawer-list');
    if (!list) { return; }
    var msgs = api.all();
    var badge = document.getElementById('bell-badge');
    var n = api.unread();
    if (badge) { badge.hidden = !n; badge.textContent = String(n); }

    if (!msgs.length) {
      list.innerHTML = '<li class="empty">' + (state.provider
        ? 'No messages yet. A campaign or a journey writes into Dengage’s inbox; anything ' +
          'this site sends you appears here in the same second.'
        : 'The Dengage inbox needs an application on this page, and Web SDK 2.4.0 or later. ' +
          'The demo’s own messages still appear here.') + '</li>';
      return;
    }
    // Reserve the media column for the whole list or for none of it, so a list with one image
    // does not look broken.
    var anyMedia = msgs.some(function (m) { return httpOnly(m.media); });
    list.innerHTML = msgs.map(function (m) {
      var media = httpOnly(m.media);
      return '<li class="msg' + (state.read[m.id] ? '' : ' unread') + '" data-id="' + esc(m.id) + '">' +
        (anyMedia ? '<span class="thumb">' + (media
          ? '<img alt="" loading="lazy" src="' + esc(media) + '" onerror="this.remove()">' : '') +
          '</span>' : '') +
        '<span class="body"><strong>' + esc(m.title || 'Message') + '</strong>' +
        '<span>' + esc(m.body || '') + '</span>' +
        '<span class="why">' + (m.source === 'own'
          ? 'from this site' + (m.channels ? ', also sent by ' + esc(m.channels) : '')
          : 'from Dengage') + '</span></span>' +
        (httpOnly(m.target) ? '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" ' +
          'href="' + esc(m.target) + '" data-act="open">Open</a>' : '') +
        '<button class="icon-btn" type="button" data-act="delete" aria-label="Dismiss">&times;</button>' +
      '</li>';
    }).join('');

    msgs.forEach(function (m) { api.report('impression', m); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var drawer = document.createElement('aside');
    drawer.id = 'dps-drawer';
    drawer.setAttribute('aria-label', 'Messages');
    drawer.innerHTML =
      '<header><strong>Messages</strong>' +
      '<button type="button" data-act="refresh" class="btn btn-ghost btn-sm">Refresh</button>' +
      '<button type="button" data-act="close" class="icon-btn" aria-label="Close">&times;</button>' +
      '</header><ul id="dps-drawer-list"></ul>';
    document.body.appendChild(drawer);

    var bell = document.getElementById('bell');
    if (bell) {
      bell.insertAdjacentHTML('beforeend', '<span class="cart-count" id="bell-badge" hidden>0</span>');
      bell.addEventListener('click', function () { state.open ? api.close() : api.open(); });
    }

    drawer.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      var li = e.target.closest('.msg');
      if (act && act.getAttribute('data-act') === 'close') { api.close(); }
      if (act && act.getAttribute('data-act') === 'refresh') { api.refresh(); }
      if (!li) { return; }
      var m = api.all().filter(function (x) { return x.id === li.getAttribute('data-id'); })[0];
      if (!m) { return; }
      var kind = act && act.getAttribute('data-act');
      if (kind === 'delete') {
        api.report('delete', m);
        /* DOC: never send an event and then refetch. getMessages serves a 30 second cache and
           processing is asynchronous, so the list would come back unchanged and look broken.
           Update locally at the moment the user acts, which is what the guide asks for. */
        state.dengage = state.dengage.filter(function (x) { return x.id !== m.id; });
        state.own = state.own.filter(function (x) { return x.id !== m.id; });
        markRead(m.id); render();
        return;
      }
      if (kind === 'open') { api.report('click', m, 'open'); }
      else { api.report('open', m); }
      markRead(m.id); render();
    });

    api.refresh();
    // No faster than the cache the guide documents: polling inside 30 seconds returns the same
    // list and only costs battery.
    window.setInterval(function () {
      if (!document.hidden) { api.refresh(); }
    }, Math.max(30000, cfg.timing.inboxPollMs));
  });

  window.DTelcoInbox = api;
})(window, document);
