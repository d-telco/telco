/* dtelco-inbox: what Dengage is holding for a contact, read by the agent who has no SDK.
 *
 * The storefront draws an inbox and so does the Android app. Both go through the SDK, which will
 * only answer a device it has a device id for. Between them they prove Dengage holds an inbox.
 * Neither proves the thing a telco actually needs next.
 *
 * A customer rings the contact centre, or walks up to a counter, and says: I got a message about
 * my bill, what was it. The agent's screen is not the customer's phone. It has no SDK and it never
 * will. It reads the customer's mailbox by contact key from a backend and shows the agent exactly
 * what Dengage sent that person.
 *
 * That is the offline touchpoint, and reference/inbox-rest-api is how it is served:
 * "Messages for identified users are stored by ckey, messages for anonymous users by did. When a
 * request carries both, Dengage reads both mailboxes and merges them, which is why a user who
 * registers later keeps the messages received while anonymous."
 *
 * WHAT THIS WILL NOT DO
 *
 * The API has two endpoints and this wraps one. POST /api/inbox/events reports impressions, opens,
 * clicks and deletes, and this function refuses to call it, on purpose, for a reason worth saying
 * out loud at the counter.
 *
 * An agent glancing at a customer's messages has not read them on the customer's behalf. Reporting
 * an impression from here would put a number into Dengage's own inbox report that no person
 * caused, and would mark as read a message the customer has still never seen. The rule is
 * constant: never report impressions, opens or deletes for messages the platform did not issue.
 *
 * Events belong to the surface that actually drew the message, which is js/inbox.js on the web and
 * the mobile SDK in the app.
 *
 * THE HOST, MEASURED RATHER THAN ASSUMED
 *
 * reference/inbox-rest-api gives every path relative and never names a host. Probed 2026-09-04
 * against the documented 400 error shape, with no account data:
 *
 *   https://tr-push.dengage.com/api/inbox/getMessages   400 {"message":"Invalid Account"}
 *   https://tr-event.dengage.com/api/inbox/getMessages  400 {"message":"Invalid Account"}
 *   https://tr-api.dengage.com/api/inbox/getMessages    404 html
 *   https://tr-inapp.lib.dengage.com/...                404 missing bucket key
 *
 * The push host is the one, and it is already in js/config.js under datacenters.tr.push, so
 * nothing new was invented. DTELCO_INBOX_HOST overrides it if the account says otherwise.
 */
const ORIGINS = ['https://d-telco.github.io', 'http://localhost:8101', 'http://127.0.0.1:8101'];
const WINDOW_MS = 60 * 1000, CAP = 30;
const hits = new Map<string, number[]>();
function overCap(who: string) {
  const now = Date.now();
  const recent = (hits.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now); hits.set(who, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > CAP;
}
function cors(origin: string | null) {
  const h: Record<string, string> = { 'content-type': 'application/json',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, apikey' };
  if (origin && ORIGINS.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}

const DC = Deno.env.get('DENGAGE_DATACENTER') ?? 'tr';
const HOST = Deno.env.get('DTELCO_INBOX_HOST') ?? `https://${DC}-push.dengage.com`;
const ACCOUNT_ID = Deno.env.get('DENGAGE_ACCOUNT_ID') ?? '';
/* The Custom Inbox application, which is NOT the web push application. docs/applications creates
   it as its own type, so DENGAGE_APP_GUID is deliberately not the fallback here: sending the push
   guid would ask the wrong mailbox and the answer would look like an empty inbox rather than a
   misconfiguration. Verify in panel which guid the Custom Inbox application carries. */
const INBOX_APP = Deno.env.get('DTELCO_INBOX_APP_GUID') ?? '';

const KEY_SHAPE = /^DPS-[A-Za-z0-9_-]{1,44}$/;

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  if (req.method === 'POST') {
    return new Response(JSON.stringify({
      error: 'this endpoint reads and will not write',
      why: 'POST /api/inbox/events reports impressions, opens, clicks and deletes. An agent ' +
           'glancing at a customer\'s messages has not read them on the customer\'s behalf, and an ' +
           'event reported from here would mark as read a message the customer has never seen.',
      rule: 'never report impressions, opens or deletes for messages Dengage did not issue',
      where_events_belong: 'the SDK on the surface that actually drew the message, which is ' +
                           'js/inbox.js on the web and the mobile SDK in the app',
    }, null, 1), { status: 405, headers });
  }
  if (req.method !== 'GET') return new Response('method', { status: 405, headers });

  const url = new URL(req.url);
  const key = (url.searchParams.get('contact_key') ?? '').trim();

  if (!key) {
    return new Response(JSON.stringify({
      function: 'dtelco-inbox',
      does: 'GET ?contact_key=DPS-DTELCO-1 reads Dengage inbox messages for that contact',
      endpoint: `${HOST}/api/inbox/getMessages`,
      for: 'the contact centre and the retail counter. A customer asks what that message was ' +
           'about, and the agent sees what Dengage sent them.',
      proves: 'the mailbox belongs to the person, not to the browser. No cookie, no device id, ' +
              'no SDK, and the same messages come back. That is why it can be served to a screen ' +
              'that will never carry an SDK.',
      writes: 'nothing, ever',
      will_not: 'report impressions, opens, clicks or deletes. An agent reading is not the ' +
                'customer reading.',
      host_note: 'reference/inbox-rest-api gives paths without a host. The push host was measured ' +
                 'on 2026-09-04 as the one that answers this route.',
      needs: {
        account_id: !!ACCOUNT_ID,
        custom_inbox_app_guid: !!INBOX_APP,
        note: 'the Custom Inbox application is its own application type and carries its own guid. ' +
              'It is not the web push guid, and this function will not substitute one for the other.',
      },
      limit: 'default 20, min 1, max 100',
    }, null, 1), { headers });
  }

  const who = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (overCap(who)) {
    return new Response(JSON.stringify({ error: 'rate limit' }),
      { status: 429, headers: { ...headers, 'retry-after': '60' } });
  }

  if (!KEY_SHAPE.test(key)) {
    return new Response(JSON.stringify({ error: 'contact key shape',
      expected: 'DPS- then up to 44 of letters, digits, underscore or hyphen' }),
      { status: 400, headers });
  }

  if (!ACCOUNT_ID || !INBOX_APP) {
    return new Response(JSON.stringify({
      ok: false, read: false, contact_key: key,
      why: !ACCOUNT_ID
        ? 'no account id is configured, and acc is required on every inbox request'
        : 'no Custom Inbox application guid is configured. appId is required whenever ckey is ' +
          'sent, and the Custom Inbox application is a different application from web push.',
      would_call: `${HOST}/api/inbox/getMessages?acc=<account>&ckey=${key}&appId=<custom inbox>`,
    }, null, 1), { headers });
  }

  const raw = Number(url.searchParams.get('limit') ?? 20);
  const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 20;

  const qs = new URLSearchParams({ acc: ACCOUNT_ID, ckey: key, appId: INBOX_APP,
                                   limit: String(limit) });
  let r: Response;
  try {
    r = await fetch(`${HOST}/api/inbox/getMessages?${qs}`, {
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, read: false, contact_key: key,
      why: 'the inbox host did not answer', detail: String(e).slice(0, 200) }, null, 1), { headers });
  }

  const text = await r.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* below */ }

  /* A refusal is a 400 with a message, and "on a disabled account every request is rejected with
     400". So the account not having the inbox feature and the account id being wrong look alike
     from here, and saying which is a panel job rather than a guess. */
  if (!Array.isArray(parsed)) {
    const said = (parsed as { message?: string } | null)?.message ?? null;
    return new Response(JSON.stringify({
      ok: false, read: false, contact_key: key, http: r.status,
      message_from_dengage: said,
      why: said
        ? 'Dengage refused the read. A 400 here means the account id is wrong, the application ' +
          'guid is not a Custom Inbox application, or the account does not have inbox_enabled ' +
          'switched on. Which one is a panel question, not something this reply can tell apart.'
        : 'the answer was not the documented array of messages',
      raw: said ? undefined : text.slice(0, 300),
    }, null, 1), { headers });
  }

  /* Reported as Dengage sent it, plus nothing. The demo's own message centre lives in
     dtelco-message and is drawn beside this one rather than mixed into it, because a drawer
     message this site invented is not an inbox message Dengage issued. */
  const messages = parsed.map((m) => {
    const j = (m as { messageJson?: Record<string, unknown> }).messageJson ?? {};
    return {
      id: (m as { smsgId?: string }).smsgId ?? null,
      is_read: (m as { isRead?: boolean }).isRead ?? null,
      priority: (m as { priority?: number }).priority ?? null,
      title: j.title ?? null,
      message: j.message ?? null,
      type: j.type ?? null,
      is_pinned: j.isPinned ?? null,
      received_utc: j.receiveDateUTC ?? null,
      buttons: Array.isArray(j.ctaButtons)
        ? (j.ctaButtons as Array<{ label?: string }>).map((b) => b.label ?? null) : [],
    };
  });

  return new Response(JSON.stringify({
    ok: true, read: true, contact_key: key, http: r.status,
    count: messages.length, limit, messages,
    source: 'Dengage, read server side by contact key',
    events_reported: 0,
    note: messages.length === 0
      ? 'an empty mailbox is a real answer. Inbox messages come from campaigns and journeys, ' +
        'never from transactional sends, so a contact that has only had confirmations has none.'
      : 'these are the messages Dengage is holding. Nothing here was drawn by the website.',
  }, null, 1), { headers });
});
