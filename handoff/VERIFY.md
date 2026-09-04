# The verification runbook

Brief section A16, turned into something a person can run. Seven layers, in order, each check
naming what to press, what should happen and what proves it.

**The rule that governs every line below.** Nothing is proved by a green send or an HTTP 200. A row
is proved by a count. A message is proved by an outcome code in a body. A segment is proved by a
number that moved. Storage lags about two minutes, so a count read immediately is a count read too
early.

---

## Pre flight, four minutes, before every demonstration

Run this even when nothing has changed. Most of it is one command.

```
bash tools/check-all.sh
```

Ten checks, and the run prints the failures rather than a tail. Then, by hand:

| Press | Should happen | If it does not |
|---|---|---|
| Open the published origin | The home page draws and the debug readout shows a page view | Pages deploys from `main`; give it ten minutes and hard reload |
| `verify/index.html`, run the backend checks | Every assertion green, or a refusal with a named reason | A refusal is fine and is worth showing. A timeout is not |
| Operator console, **Reset the demonstration** | Every segment back to its opening count | Read the report it prints; it names each table it cleared |
| The Android phone, sign in as a persona | The account fills | Check the integration key is set, then that the phone has network |
| The phone, allow notifications | A token appears on the account screen | Android 13 and above needs the runtime grant; older handsets need nothing |

---

## Layer 1. Catalogue and data

| Check | How it is proved |
|---|---|
| The two Dengage CSVs open with the exact headers | `handoff/dtelco-product.csv` and `dtelco-product_variant.csv`, opened in a spreadsheet |
| One row of each uploads cleanly, then the full files | The panel's import report, row counts matching |
| A product opened in the panel shows title, price, image and category | The panel, not the feed |
| Every product has a variant, every variant id is unique, every price is numeric, no product without a category path | `node tools/check-feed.mjs`, which compares the served feed to the committed files field by field |
| Every relation points at an existing id, every bundle has members | The same check |
| Every `dtelco_` table exists, RLS on, a read policy for `dengage_reader` on every table that role is meant to reach, every view `security_invoker = true` | `select count(*)` as `dengage_reader`, which returns the seeded counts and never zero. RLS with no policy returns zero rows with no error, which is why the count is the test rather than the absence of an error. Reference tables about products and places deliberately have no policy and no grant |
| **Every remote view resolves for `dengage_reader`, not just for the service role** | `GET dtelco-remote`. A view with `security_invoker` resolves for a role only when that role can select every relation it reads, so a view joining a table the reporting role has no grant on returns rows for one connection and an error for the other |
| The picker offers nothing unconnectable | The same endpoint. No reference table, and nothing without a contact key |
| The Remote Data Source connects and one segment counts the seeded number | `handoff/SEGMENTS.md` carries the number for each view. The panel must agree |
| Every connectable view is offered and no reference table is | The panel's source picker. Products and stores are reference tables and must not appear |

**The count that matters most.** `v_dtelco_heavy_on_small_plan`, whose number at rest is in
`handoff/SEGMENTS.md` and is not repeated here. If the panel says zero, the read policy is missing
rather than the data: RLS with no policy returns zero rows and no error, so zero and empty look
alike from the panel and only the policy tells them apart.

---

## Layer 2. Identity and events, web and app

| Press | Should happen | Proved by |
|---|---|---|
| Any page, with `?debug=1` | The page view fires first, before anything else | The readout, which names the table |
| A first anonymous visit | A device, a session and a page view, with no contact | The panel's device record |
| A search | One `search_events` row with the result count as it actually was | The counts endpoint |
| A wishlist save on each of the four lists | Four `wishlist_events` rows | The same |
| A multi line cart with a quantity swap | A remove before every add | The debug readout. Dengage rebuilds the cart from the stream, so an add without a remove reads as two of the thing |
| A checkout | `beginCheckout` fires only once the cart names an item | The readout, and the absence of a row on an empty cart |
| An order with a coupon | One `order_events` row and its detail rows, with the code on it | The panel |
| A cancel, a top up, a roaming pack, a plan finder run, a compare | The rows in brief A5.1 | The counts endpoint after the two minute lag |
| Signing in on both surfaces | One contact card holding the web history and the app history | The panel. Not two contacts |
| Any lead form | The relay stores the row first, then upserts the contact | The row's `dengage_status` reads `contact inserted` or `contact updated`, never `pending` |

**The app half.** Layer 4b walks the handset. The source rules `node tools/check-android.mjs`
enforces are listed there.

---

## Layer 3. Messaging

| Check | Proved by |
|---|---|
| Every moment answers `sent` for the channels a persona is reachable on | The message function's reply, reading `code` in the body. Code 0 is sent |
| A refused channel reads as refused with Dengage's code | The same reply. Code 11 is a device that has not claimed the contact, and is the normal state for a device that never subscribed as this person |
| The own inbox row lands | The site's drawer and the app's second list |
| A rich push image renders | An Android phone, or Windows Chrome. macOS draws no image and is not a valid test |
| The Android app receives a push and opens the product screen from it | A physical handset. Not an emulator |
| The inbox drawer and the app inbox show Dengage's messages and the demo's own, in two labelled lists | Both surfaces. Only Dengage's are reported back |
| Every email body renders with all values and with only the always sent values | `node tools/preview-emails.mjs`, which writes two renderings per body into `panel/preview` |
| No unresolved tag in either rendering | The same check |

**The distinction to hold on to.** A transactional message sees only the values passed in the call.
A journey or campaign message sees the contact record, custom columns included. Nineteen of the
twenty bodies are written for the first case. `email/reco_for_you.html` is written for the second
and is the only one that reads the contact, which is why it is never sent transactionally.

---

## Layer 4. On site and in app

| Press | Should happen | Proved by |
|---|---|---|
| Each creative's own rule, then the launcher twice in a row | It appears both times | The frequency cap is per creative, and a creative that appears once and never again has a cap that is too tight |
| `?onsite=panel` | The served campaigns appear from Dengage's engine, not the site's | The switch, flipped mid demonstration |
| `?onsite=local` | The same experience, rendered locally | The pair is the point |
| The subscription form | A `DPS-` contact, never an `sf_` one | The panel. An engine capture form mints `sf_` contacts unless the device already has a key, which is why the key is minted before the form is shown |
| The question form | A tag a segment can read | The panel's tag list |
| Product, cart, account and app home | The recommendation with its rule named | Four surfaces, three products, one rule |
| The contact's `reco_*` columns | Updated within a minute of the rail drawing | The panel |
| An email and a push for the same contact | The same three products the site showed | The rendered body |

---

## Layer 4b. The app on a handset

Nine of these need a real phone. Nothing below can be proved on a desk, which is why they are their
own layer rather than a footnote to the one above.

| Press | Should happen | Proved by |
|---|---|---|
| Account tab, sign in with the key the browser is using | The line the browser has been building appears | One contact card, two surfaces. Not two contacts |
| Account tab, allow notifications, then This device | A token, and a contact key beside it on the same record | The device screen. A token binds to the key that subscribed, so signing in first and asking second is the order that makes a push reach a person rather than a handset |
| This device, with the account switches read back | The account's own answers for inbox, in-app, real time in-app, geofence and app presence | Read from Dengage. An inbox that is off explains an empty inbox screen, and no amount of sending will change it |
| Discover tab | The story rail draws, or the slot says which property it is waiting for | Either is a real answer. A labelled empty slot is not a fault |
| Discover, Home, Product and Cart | An inline in-app message inside the layout rather than over it | Four properties, one engine, and it scrolls with the screen |
| Discover, set the template values, then trigger an in-app message | The message prints this handset's plan name from a template that names no plan | One template, every plan |
| Open a few categories, then Discover | The offers rail reorders | On the handset, with no network call. The scores are this device's; the sorting is the SDK's |
| Near you, ask, start tracking, then Stand here | Whatever the account sends for that region, and the local card naming the region | Both. The message is Dengage's, the card is the app's, and the fix is reported as a mock rather than dressed up as a real one |
| Near you, check in at a store | A row keyed to the contact rather than to the handset | Walking past a shop and saying "I am here" are two different moments, and only the second should start a collect in store journey |
| This device, tag the network rating | A tag a segment can read, written from app code | The panel's tag list. The website writes contact tags through the engine's own form; this is the other writer |
| This device, both consent switches | The device record changes in Dengage | Turning notifications off here does not revoke the Android permission and turning it on does not grant one. Two consents, two holders |
| This device, draw the live update, twice with a different step | One notification that changes, not two notifications | The lock screen |
| Inbox tab, mark all read and empty the mailbox | The list is read again from Dengage rather than from what the screen assumed | A mailbox the app emptied and a mailbox Dengage emptied are the same mailbox, and only one of them is worth trusting |
| A push carrying `dtelco://product/<id>` | The product screen, with the product on it | The deep link, the manifest filter and the catalogue's own `android_deep_link`, all agreeing |

**The source rules.** `node tools/check-android.mjs` asserts every screen fires its page view and
calls `setNavigation`, that only the bridge names the SDK anywhere, that the contact key shape and
the event table match the web, that the app replaces no device id and creates no geofence region,
that a fix it hands over is labelled a mock, that every in-app property a screen fills is written
down for whoever creates the content, and that the manifest asks the operating system about no
package outside this demonstration. It reads source rather than running the app, so it catches the
silent failures a compiler does not.

---

## Layer 5. Journeys and segments

- Each of the twenty five journeys is triggered **from the demonstration**, not from a test send,
  and its first step arrives.
- Any journey that does not fire in rehearsal is **shown as its canvas** and listed as such in the
  report. That is the rule, not a fallback: a journey unverified by rehearsal is shown as a canvas
  and said so plainly.
- Every named segment counts the number in `handoff/SEGMENTS.md`.
- The simulator moving one persona's usage moves `v_dtelco_heavy_on_small_plan` by one at the next
  evaluation. The operator console prints the count before and after, so this is one press.

**Two segments are empty on purpose** and must stay empty until the simulator moves them:
`v_dtelco_stock_waiters_with_stock` and `v_dtelco_price_watchers`. A segment that fills the moment
somebody presses something is the only honest way to show a segment moving, and an empty one at
rest is the setup for it rather than a fault.

**Seven of the fourteen views move on their own**, because they compare a seeded date against the
current date. `handoff/SEGMENTS.md` names which and which direction. A count that has drifted since
the document was written is arithmetic, not a defect, and the document says so.

---

## Layer 6. The repository's own checks

Run before every push, all from one command.

| Check | What it asserts |
|---|---|
| `build-pages.py` | Every page builds and its script tags are restamped |
| `check-contract.mjs` | Ten seams where two files have to agree |
| `check-coverage.mjs` | Every locally drawn behaviour cites a Dengage mechanism in a supplied or declared document |
| `audit.mjs` | The census: no dead control, no broken image, every capability headlined once |
| `verify.mjs` | The browser suite, which asserts its own refusal of `dengage.com` |
| `mobile-check.mjs` | Every page at 390 by 664, including that the opened box is inside the viewport |
| `preview-emails.mjs` | Every body rendered twice, no unresolved tag |
| `check-android.mjs` | The app source rules a compiler does not know about |
| `check-personas.mjs` | The walkthrough's persona table against the operator's records |
| `check-backend.mjs` | The deployed functions, by GET, writing nothing |
| `check-feed.mjs` | The served feed against the committed catalogue |

**No assertion counts are written here on purpose.** A number in this table would be a third place
to update every time an assertion is added, and it would be wrong within a week. The run prints its
own counts, and the run is the thing to read.

**No check writes into the Dengage account.** The browser suite asserts that refusal rather than
relying on it, so a run that started writing would fail rather than succeed quietly.

**The Android app compiles.** `cd android && gradle :app:assembleDebug` produces a debug APK. That
is a separate command because it needs an Android SDK, and it is the only thing here that does.

Also by hand, once per release: no em dash or en dash in any file, no dead internal reference, and
every message image over 20 KB.

---

## Layer 7. Presentation

- The verification console loads no part of the demonstration, so it never appears in its own
  numbers. Confirm by opening it and checking the counts do not move.
- Every moment reads as configured and every table as moved.
- **The walkthrough is rehearsed once end to end on the published origin, with the Android phone in
  hand, before the call.** Not read. Rehearsed.

---

## The report at the end of each layer

At the end of each layer, three lists and nothing else:

1. **Proved.** With the number that proves it.
2. **Shown as a canvas.** With why the rehearsal did not fire it.
3. **Needed.** As yes or no questions wherever possible.

A layer is not reported complete because nothing failed. It is reported complete because every line
above has a number against it.
