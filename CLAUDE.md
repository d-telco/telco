# CLAUDE.md: standing contract for the D-TELCO demonstration repository

D-TELCO is a telecom marketplace demonstration built on Dengage: a web storefront on GitHub
Pages and a native Android app. It is shown to telecom operator prospects. Its only purpose is
to make every Dengage capability that matters to a telco visible, provable and non repetitive.

D-TELCO is a fictional operator. No real operator is named anywhere in this repository, and the
planning documents that shaped the build are held outside it. Anything not settled by this file
or by the code is a question for the account owner before it is built.

---

## 1. The eight non negotiables

1. **Everything maps to a real mechanism.** Every experience, message, recommendation and segment
   on the site and in the app maps to a documented platform mechanism, and is confirmed in the
   account before it is shown.
2. **Realtime is drawn by the surface.** Confirmation cards, drawer messages, recommendation rails
   and on-site experiences render locally so the platform carries the data rather than the
   decoration. Dengage carries the profile, the events, the product tables, the segments, the
   journeys and the channels.
3. **Nothing is ever deleted, truncated or edited** in Dengage or in the shared Supabase project.
   Every step creates something new. New `dtelco_` objects only.
4. **Contact keys are `DPS-DTELCO-`** and every server endpoint validates
   `^DPS-[A-Za-z0-9_-]{1,44}$` before it acts. Storage keys are namespaced `dps:dtelco:*`.
   Every page and every screen fires its page view first. Unknown numbers are omitted, never
   fabricated. One module talks to the SDK on each surface.
5. **HTTP 200 means accepted.** Read outcome codes in bodies. Storage settles after a short delay.
   A row is proved by a count.
6. **A journey unverified by rehearsal is shown as its canvas** and said so plainly.
7. **Prices are USD.** Every figure is demonstration data and is marked as such. The mark on every
   page and screen is D-TELCO.
8. **No em dashes and no en dashes anywhere**, in any file in this repository. Every control on
   every page does something. No third party host at runtime.

## 2. Names and identifiers

| Thing | Value |
|---|---|
| Demo slug (`<html data-demo-slug>`, storage, page events) | `dtelco` |
| Storage keys | `dps:dtelco:ck`, `dps:dtelco:cart`, `dps:dtelco:wishlist`, and so on |
| Page level events | `dps:dtelco:event`, `dps:dtelco:confirmation` |
| Supabase table prefix | `dtelco_`; views `v_dtelco_` |
| Dengage custom Data Space event table | `dtelco_events` |
| Persona contact keys | `DPS-DTELCO-1` to `DPS-DTELCO-8` |
| Minted anonymous key | `DPS-DTELCO-<Date.now()>` |
| Order ids | `DPS-dtelco-<kind>-<timestamp>` |
| Brand and store name in the catalogue | `D-TELCO` and `D-TELCO Shop` |
| Android package | `com.dtelco.app` |
| Supabase project | `raextqlludkagdntyzwn` |
| Read only role for Dengage remote sources | `dengage_reader` |
| Datacenter | Turkey, Istanbul. `tr` in `js/config.js`, and the Android manifest matches it |
| Published origin | `https://d-telco.github.io/telco/` |

## 3. How each mechanism is meant to be used

Read this before adding any feature. Each line is a property of the platform to design with.

- The App Inbox fills from campaigns and journeys. Instant drawer messages come from the demo's own
  message centre, shown beside the platform's.
- A transactional message prints the values passed in the call. Journey and campaign messages read
  the contact record, custom columns included.
- Web push reaches a device after the browser granted permission on the published origin. iPhone
  uses the Home Screen install. An Android app push uses the Firebase token registered through the
  SDK.
- A device token is bound to the key that subscribed. A later key uses the token path.
- Custom Data Space tables and custom contact columns exist before rows are stored.
- Remote tables relate to `master_contact` or `master_device`. Reference tables about products or
  places are never offered as remote sources and never connected.
- Recommendations are chosen once and reused by every channel, so the site, the app, the email and
  the push all show the same products.
- Anything unconfirmed is checked in the account before it is shown, and shown as a canvas if the
  check does not pass.

## 4. Standing checks

The review checklist for any change that touches identity, events, messaging, on-site or the
backend.

**Identity and events.** Pass the contact key to `initialize`. `setContactKey` with an unknown key
creates a contact, so validate the shape at the call site. Engine capture forms mint `sf_` contacts
unless the device already has a key. Every page fires `pageView` first. Namespace all storage by
slug. Omit unknown numbers and never send `0`: `Number(null)` is `0` and a `0` in `stock_count`
announces every product out of stock. `product_variant_id` falls back to `product_id`, and distinct
variants keep distinct ids including punctuation. Remove before add when a selection changes,
because `cartItems` is the whole cart and the platform rebuilds it from the stream. `beginCheckout`
waits until the cart names an item. Custom tables exist before rows store. `event_id`, `event_type`
and `is_used` are required on every `sendDeviceEvent` row. Only `page_url` finds this demo's rows
and only `session_id` joins the tables.

**Push and inbox.** `getToken` and `getDeviceId` are callback style on the web; cache the token and
refresh it. A token binds to the key that subscribed and `setContactKey` does not rebind it; use
the token path. Code 11 is the state of an unbound device. Code 0 on a token send reports
acceptance. Read `code` in the body. The inbox is contact scoped and its provider needs a device id.
Never report impressions, opens or deletes for messages the platform did not issue.

**On-site.** Fire both the data layer push and the window event with the same name. Behaviour lives
in `onclick` and the whole file is pasted. Padding 0 and transparent background. `data-dn-is-radio="true"`
on radio question blocks. Inline creatives are not sandboxed, so namespace every selector under the
creative root id. A pinned top bar covers a fixed header; measure and publish the clearance and
accept the bar's own height report. Dwell rules wait out their own delay. A rule reads the same
store its flag was written to. Restamp every script tag on every build.

**Server side.** Cache the login token. Respect the documented request rates. `/bulk/contacts`
results sit under `data`. Store the lead before calling the API and record the answer on the row.
Derive every product value server side from an id, never from text the page passed. Send the always
printed values every time. A shared content contains only tags, never an address. Rehearsals never
invent an email address.

**Remote data.** RLS with no policy returns zero rows with no error, so one read policy per table
for `dengage_reader`. Views carry `security_invoker = true`, which means they resolve only if that
role can read every base relation. One flat view per segment. Deterministic seeds make quoted
segment sizes exact.

## 5. How work is done here

- Small commits, one concern each. Push after every verified step.
- Run `bash tools/check-all.sh` before every push. No check writes into the Dengage account; the
  suite asserts its own refusal, and the runner fails loudly rather than swallowing a failure.
- The live rehearsal runs against the real account only when the account owner says so, and never
  with an invented email address.
- Every runbook says what to press, what should happen and how to prove it, in the order a real
  customer meets it.
- When a fault is found: fix the cause, and add the check that catches it.
- **This repository is public.** Nothing in it describes internal planning, commercial context, a
  named prospect, or a judgement about the platform. Write source comments as an engineer would for
  the next engineer: what the code does and why it is shaped that way, stated neutrally.
- Report at the end of each acceptance layer with what is proved, what is shown
  as a canvas, and what is needed. Questions are yes or no wherever possible.

## 6. Every page earns its place

The page map is capability led, not catalogue led. A page exists only if it demonstrates a
capability no other page already demonstrates. Two pages showing the same mechanism is a defect,
not coverage. Product detail, plan detail and category pages are parameterised templates reading
the catalogue feed, not one file per product.
