# The mechanism map

Every element these surfaces render locally, traced to the platform mechanism and the documentation
page that delivers the same thing. Rendering locally keeps the decoration off the network path so
the platform carries the data: the profile, the events, the product tables, the segments, the
journeys and the channels.

This file is machine read, not prose to be trusted. `tools/check-coverage.mjs` reads the tables in
section 1 and section 2 and fails when a behaviour the code performs has no row, when a row cites a
document outside the supplied set without that citation being declared in section 0, and when a row
marked **confirm** has no entry in section 7.

Verified against dev.dengage.com on 4 September 2026. Datacenter: Istanbul.

---

## 0. What may be cited

**The supplied set.** Thirty two pages the account owner named. A row may cite any of them without
comment.

```
reference/web-push-sdk-setup        reference/on-site-message
reference/event-collection          reference/page-view-events
reference/ecommerce-events          reference/custom-events
reference/tagging-websdk            reference/recommendation-web-sdk
reference/inbox-web-sdk             reference/updatecontactsbulk
reference/updatecontactsbulkasync   reference/getcouponlist
reference/post_dataspace-sync-upsert            reference/createtable
reference/post_dataspace-triggerautomatedflow   reference/post_dataspace-async-upsert-v2
reference/sendinstantpush           reference/sendtransactionalemail
reference/sendtransactionalpush     reference/upsertorders
reference/upsertproduct             reference/sendevent
reference/inbox-rest-api            docs/star-schema-relational-database
docs/remote-table                   docs/create-a-table
docs/automated-flow                 docs/remote-segments
docs/customization-in-transactional-messages    docs/dynamic-content-customization
docs/remote-segment-columns-customization       docs/recommendation-rules
```

**Beyond the supplied set.** Twenty one pages, each read because a question could not be answered
without it, and each named here so a reader knows exactly how far this document reaches past what
was handed over. `tools/check-coverage.mjs` counts the rows below and fails if this sentence
disagrees with them, because it said five while listing nineteen for long enough to be quoted.

Every one of them was read, and every one answers with HTTP 200 on 4 September 2026.

| Page | Why it was needed |
|---|---|
| `reference/advanced-personalization` | How a message prints the recommendation the surfaces chose. None of the supplied thirty two covers it |
| `docs/coupon` | `reference/getcouponlist` reads a list; this is the page that says how a code reaches a message, and what the platform will not do with it |
| `reference/importcoupons` | The other way codes get into a list, for an operator with its own generator |
| `docs/onsite` | The parent page for the template pages below it |
| `docs/inline-personalization` | `focus_hero`, the recognition band |
| `docs/image-popup` | `focus_popup` and `churn_save_popup` |
| `docs/sticky-bar` | `usage_upsell_bar` |
| `docs/inline-onsite` | `upgrade_inline` and `seasonal_inline` |
| `docs/product-box-onsite` | The recommendation rail in the page flow |
| `docs/recommendation-engine-onsite` | Where a recommendation widget draws on a page |
| `docs/recommendation-engine-email` | Where one draws in an email |
| `docs/recommendation-engine-in-app` | Where one draws in the app |
| `docs/survey-onsite` | The plan finder quiz |
| `docs/nps-net-promoter-score-onsite` | The NPS after support |
| `docs/subscription-popup` | The newsletter capture |
| `docs/spin-to-win-onsite` | The gamified top up bonus |
| `docs/story` | The offers carousel |
| `docs/ab-split` | Two variants of one creative |
| `docs/smart-search-onsite` | The faceted catalogue search the site stands in for |
| `docs/applications` | `reference/inbox-rest-api` says a Custom Inbox application must exist and links here. It is why `dtelco-inbox` takes its own guid and refuses to fall back to the push one |
| `reference/new-android-sdk-` | The Android SDK. Nothing in the supplied set is about a handset, and the app is half this demonstration |

That list is longer than it looks like it should be, and the reason is worth stating: a claim that
Dengage draws a popup is not proved by a page about popups in general. Each template is its own
page, so each claim cites its own page.

---

## 1. Recommendations, model by model

Dengage's engine has **eleven models**, seven rule-based and four predictive, plus a Context Source
that decides what drives a context-driven model. `docs/recommendation-rules` names them:

**Rule-based:** Top Sellers, Category Best Sellers, New Arrivals, Category New Arrivals,
Discounted Products, Category Discounted Products, Trending Products.
**Predictive:** Similar Items, Frequently Bought Together, Frequently Viewed Together,
Recommended Items (User-Based).
**Context Source:** Static, User Attribute, or Event Attribute (for example Current Product).

The site runs ten rules of its own. Four of them are one of those models today. Three are one of
those models with a Context Source that has to be confirmed in the account. Three are telco
specific and are rules Dengage would build for an operator rather than models it ships. Saying
which is which is the whole point of this table, and it is a better answer in a room than a claim
that all ten are covered.

| Behaviour | Kind | Dengage mechanism | Source | Verified |
|---|---|---|---|---|
| `popular` | rule | **Top Sellers**, and the documentation's own best practice is a global context free fallback | docs/recommendation-rules | yes |
| `alternative` | rule | **Similar Items**, Context Source Event Attribute, Current Product | docs/recommendation-rules | yes |
| `cross_sell` | rule | **Frequently Bought Together**, Context Source Event Attribute, Current Product | docs/recommendation-rules | yes |
| `cart_bundle` | rule | **Frequently Bought Together** with **Exclude items in cart** | docs/recommendation-rules | yes |
| `focus_cross_sell` | rule | **Frequently Viewed Together**, or **Recommended Items (User-Based)**. The twice viewed product has to reach the model as an event attribute | docs/recommendation-rules | verify |
| `traveller` | rule | **Category Best Sellers**, Context Source **User Attribute**, driven by roaming days | docs/recommendation-rules | verify |
| `family` | rule | **Category Best Sellers**, Context Source **User Attribute**, driven by lines at the address | docs/recommendation-rules | verify |
| `requires` | rule | No model. A plan that needs an internet package is an authored relation, not a statistical one. Dengage builds this for an operator as a custom rule | docs/recommendation-rules | telco |
| `upsell` | rule | No model. The tier above the one on screen is an ordering of a curated ladder | docs/recommendation-rules | telco |
| `usage_80` | rule | No model. Consumption against an allowance is the one signal only a telco has, and it is why an operator wants a rule built rather than a model chosen | docs/recommendation-rules | telco |

**Only in stock** and **Exclude items in cart** are filters the engine ships, and the site applies
both. Where the widget draws, on a product page, in a cart, in an email or in an app, is
`docs/recommendation-engine-onsite`, `docs/recommendation-engine-email` and
`docs/recommendation-engine-in-app`.

### How the same three products reach a message

This is the account owner's own question and it has a documented answer, which is why it is worth
stating precisely rather than gesturing at.

The site's engine picks three product ids. The relay writes them to the contact as
`reco_product_id_1`, `reco_product_id_2` and `reco_product_id_3`. A marketing message then resolves
each id against the catalogue in the message itself:

```
{% var p = $from("product").where("product_id", "=", $Contact.reco_product_id_1).first(); %}
{%= p.title %}  {%= p.discounted_price %}  <img src="{%= p.image_link %}">
```

`reference/advanced-personalization` documents `$from` as fetching *"arbitrary data from any table
in the data space"*, with `.where()`, `.order()`, `.take()`, `.skip()`, `.random()` and the
terminals `.get()`, `.first()` and `.value()`. The table is `product` because
`reference/upsertproduct` says *"Product information should be inserted into the product table"*.
`$blockSend` cancels the send for a contact with no recommendation rather than delivering an empty
rail.

**Not** through Columns From Table, which is a column picker over the campaign's audience row:
*"The selected table must be used as the audience in the campaign otherwise this value will be
empty."* And **not** through the Product Box, whose Product Source offers Recommendation Dengage,
Recommendation Segmentify, Recommendation WIS or Products From Segment, none of which reads a
contact column.

Three constraints follow, and each is enforced by a check rather than remembered:

- Marketing channels only. `docs/customization-in-transactional-messages`: contact columns and
  device data cannot be used for personalization in a transactional send.
- No push step on that moment. `reference/advanced-personalization` says `$Contact` *"can be null
  in Push sends"*. The same three ids reach a push through a send list or a remote segment, where
  they arrive as `$Current` and carry no such caveat.
- No query in a subject line, which is a design choice rather than a limit: an unresolved subject
  is the most visible failure a message has.

---

## 2. What each surface renders, and the template that renders the same thing

Every self drawn creative has a named template. None is invented.

| Behaviour | Kind | Dengage mechanism | Source | Verified |
|---|---|---|---|---|
| `focus_hero` | creative | **Inline Personalization**, an inline element placed in the page with Add Customization on source, text, link and button | docs/inline-personalization | yes |
| `focus_popup` | creative | **Image Popup** or **CTA Image Popup**, with Advanced Personalization in Onsite | docs/image-popup | yes |
| `usage_upsell_bar` | creative | **Sticky Bar**, or **Basic Sticky Bar** | docs/sticky-bar | yes |
| `upgrade_inline` | creative | **Inline Onsite**, or **Custom Inline** | docs/inline-onsite | yes |
| `seasonal_inline` | creative | **Inline Onsite** on a campaign audience | docs/inline-onsite | yes |
| `churn_save_popup` | creative | **Image Popup** on an exit intent trigger | docs/image-popup | yes |

The triggers behind them, page view, dwell, scroll depth and exit intent, are the four documented
records, and `?onsite=panel` hands every one of these back to the engine so the same experience can
be watched arriving from Dengage instead of from the page.

| Site draws | Dengage template | Source |
|---|---|---|
| Plan finder quiz | **Survey Onsite**, and **Collect Leads with NPS** | docs/survey-onsite |
| NPS after support | **NPS Onsite** | docs/nps-net-promoter-score-onsite |
| Newsletter capture | **Subscription Popup**, **Email Subscription Popup**, **SMS Subscription Popup** | docs/subscription-popup |
| Exit intent, welcome back, seasonal | **Image Popup**, **CTA Image Popup**, **Horizontal**, **Vertical**, **Video Popup** | docs/image-popup |
| Usage bar, save banner, roaming bar | **Sticky Bar**, **Basic Sticky Bar** | docs/sticky-bar |
| Recommendation rail in the page flow | **Inline Onsite**, **Custom Inline**, **Product Box** | docs/product-box-onsite |
| Gamified top-up bonus | **Spin to Win**, **Scratch to Win** | docs/spin-to-win-onsite |
| Offers carousel | **Story** | docs/story |
| Two variants of one creative | **A/B Split** | docs/ab-split |
| Faceted catalogue search | **Smart Search Onsite**. Real, and it needs the Search Container configured by Dengage's team first, so the site's own search stands in until that is enabled | docs/smart-search-onsite |

---

## 3. The message drawer

The App Inbox fills from a campaign or a journey, and no
transactional send can answer the moment a visitor acted. The current documentation is more
generous, and the design changes accordingly.

| Fact from the docs | Consequence here |
|---|---|
| Inbox is **pull based**: a campaign writes to a server-side store and the surface fetches it | Confirms the drawer must fetch rather than receive |
| **Anonymous visitors are fully supported**, `ckey` is attached only when identified | The drawer is built for anonymous visitors as well as identified ones |
| A **Web SDK** inbox path exists, requires Web SDK 2.4.0 or later | The drawer uses `new dengage('InboxMessageProvider')` |
| A **Custom Inbox, server to server** path exists for surfaces without an SDK | This is the honest answer to "can Dengage answer the moment": yes, through the Custom Inbox endpoints. The demo's own message centre is kept because a campaign still has to run to write an Inbox message, and the confirmation card has to appear in the same second |
| **Expiry is 7 days, both default and maximum** | Recorded so nobody promises a 30 day inbox |
| **Deduplication is always on** | A visitor cannot be shown the same campaign message twice |
| Messages are **bound to the user, not the device**, and follow them across web and mobile | This is the one-profile story, and it is Dengage's, not the demo's |

---

## 4. Local housekeeping, which belongs to no channel

These are not capability claims, so they need no counterpart: the catalogue itself, the basket,
the checkout form, prices, stock, the operator simulator standing in for a BSS, and the
verification console. Dengage is a customer engagement platform, not a commerce engine, and
saying so plainly is more convincing than pretending otherwise.

---

## 5. Where rendering happens locally, and the mechanism behind each

Stated so a prospect is never misled about which is which.

| The site does it | Dengage would do it in production | Why the site does it here |
|---|---|---|
| Computes the three recommendations | Recommendation Engine widget | Decision 13, and it keeps every rule visible and explainable on screen |
| Draws every creative except three | Onsite campaigns | The demo runs with nothing pasted into the panel; `?onsite=panel` hands the same experiences back to the engine |
| Draws the instant confirmation card | Onsite campaign on an event, or a Custom Inbox write | It has to appear in the same second the visitor acted |
| Runs faceted search | Smart Search Onsite | Smart Search needs a Search Container configured by Dengage first |

The `?onsite=panel` switch exists precisely so this table can be demonstrated rather than
asserted: flip it and the same experience arrives from Dengage instead of from the page.

---

## 6. The coupon, end to end

A unique code per recipient comes from a coupon list. `docs/coupon`: in the Rich Text Editor,
**Insert > Customization Tags** opens a **Coupons** tab listing every list, and clicking one
inserts it into the content. It works the same way in email, SMS and MMS, mobile and web push,
in-app and on-site. `reference/getcouponlist` reads a list's key, status, expiry and how many codes
are left, which `dtelco-coupons` wraps so a presenter can prove the list is real and has stock.

**Issuing and redeeming are two different jobs, in two different systems.** Dengage issues a
unique code per recipient and marks it taken. Applying the discount to a bill is the operator's
billing system, which is where every operator already applies one. The checkout recognises the
shape a generated code takes, an optional prefix plus eight random letters and numbers, and names
who applies the discount, so the division is visible on screen rather than assumed.

The tag is inserted by that click rather than typed, so `panel/email/abandoned_checkout.html`
carries a marked slot naming the steps rather than a guessed snippet: the list is chosen in the
editor and the platform writes the tag.

---

## 7. Confirmed in the account

Everything above marked **confirm**, and nothing else. Each is checked in the account before it is
said out loud, and shown as a canvas if the check fails.

| # | What to check | What it decides |
|---|---|---|
| 1 | The case sensitive physical name of the catalogue table for `$from`. `reference/upsertproduct` says the table is `product`; `$from` names are case sensitive and the panel is the only place to confirm the spelling | Whether the recommendation email resolves at all |
| 2 | Whether `$from` is permitted against ecommerce system tables or only customer created ones | The same, by a different route: if only custom tables are queryable, the catalogue is mirrored into one |
| 3 | Row limits, timeouts and per send cost of one `$from` per recipient. All undocumented | Whether three queries per message is fine at campaign scale |
| 4 | Which user attributes the **User Attribute** Context Source exposes | `traveller`, `family` and `focus_cross_sell` in section 1 |
| 5 | Whether a Big Data table carries twelve custom columns, since `docs/create-a-table` describes the Big Data structure as fixed | Whether `dtelco_events` holds the twelve columns ACCOUNT-SETUP.md lists |
| 6 | Whether `$from` resolves in SMS, WhatsApp, on-site and inbox content, or only in email. The advanced personalization page is not written channel by channel | Whether the recommendation reaches those four channels as a lookup or only as a send list column |
| 7 | The tag the Coupons tab inserts, which the documentation shows only as a screenshot | What replaces the marked slot in the abandoned checkout content |
| 8 | The guid of the **Custom Inbox** application, which is a different application type from web push. `docs/applications` creates it separately | Whether the counter panel reads a mailbox or reports a misconfiguration. `dtelco-inbox` refuses to substitute the push guid, so a wrong value shows as a refusal rather than as an empty inbox |
| 9 | Whether the account has `inbox_enabled` switched on. "On a disabled account every request is rejected with `400`" | The same panel. A 400 cannot tell a disabled account apart from a wrong account id, and the function says so rather than guessing |
| 10 | Whether the API user has the push permission `sendInstant` needs. An API user without a permission answers 403 with an empty body | Whether the outage broadcast sends or reports a refusal. The function names the 403 as a missing permission rather than as a failure |
| 11 | Whether App Stories is enabled for the **Android** application, and whether a story property can carry the id `dtelco_app_stories` | Whether the Discover tab's rail fills or is shown as a labelled empty slot |
| 12 | Whether inline in-app properties exist for the Android application under the three ids the app declares: `dtelco_app_home`, `dtelco_app_product`, `dtelco_app_cart` | Whether an in-app message lands in the app's own layout or only over it |
| 13 | Whether the account has geofence switched on, and whether the seven regions in ACCOUNT-SETUP.md are created. The device screen reads the switch back from the account, so this is answerable on the handset | Whether the Near you screen demonstrates a region or explains an empty one |
| 14 | Whether live update is enabled on the account, and the field names its push carries in the content state. The app reads `title`, `step`, `detail` and `percent` | Whether the order progress notification is edited by a push or only drawn locally |
| 15 | Whether the in-app cart's integer `price` is read as minor units or whole currency units. The app sends minor units, because 216 of 490 catalogue prices have cents and rounding would be a different catalogue | Which scale a panel rule about a line price is written in. One constant flips it |
| 16 | Whether App Inbox is enabled for the Android application as well as the web one. They are two applications and nothing set up for one reaches the other | Whether the app inbox screen fills or reports an empty mailbox |

### Measurements, recorded rather than assumed

| Date | What was measured | Result |
|---|---|---|
| 4 September 2026 | The host serving `/api/inbox/getMessages`. `reference/inbox-rest-api` gives every path relative and names no host | `tr-push.dengage.com` and `tr-event.dengage.com` answer the documented `400 {"message":"Invalid Account"}`; `tr-api.dengage.com` answers 404 html; `tr-inapp.lib.dengage.com` answers a missing bucket key. The push host is the one, and it was already in `js/config.js` under `datacenters.tr.push`. Probed with no account data and nothing written |

---

## 8. The app, and what it renders locally

The same question as section 1, asked of the handset. For each thing the app draws itself, the
mechanism that would draw it instead, and how it was confirmed.

Two of these are not documentation citations, and that is deliberate. The Android SDK's published
surface was read with `javap` against the shipped 6.0.99 artifact on 4 September 2026, because
three signatures in the guide do not compile against it and one documented call is not in it at
all. A signature copied from a code sample is a signature nobody has compiled. Where the artifact
and the guide disagree, the artifact wins and `DengageBridge.kt` records which.

| What the app draws | Kind | The Dengage mechanism | Source | Confirmed |
|---|---|---|---|---|
| `picked_for_you` | app | The recommendation rail, the same three ids the website's rail shows, both asked of one backend rather than each running its own rules | reference/recommendation-web-sdk | yes |
| `rfm_order` | app | `saveRFMScores` and `sortRFMItems`, on the handset, no network call. The list is chosen elsewhere; this only orders it | AAR 6.0.99 | yes |
| `geofence_card` | app | `DengageGeofence` raises the signal and the panel holds the regions. The card is the local half, beside whatever Dengage sent | AAR 6.0.99, sdk-geofence | yes |
| `live_update_preview` | app | `LiveUpdateHandler.buildNotification`, the same handler a live update push calls. The preview posts it without a push and says so on its face | AAR 6.0.99 | yes |
| `cart_confirmation` | app | Non negotiable 2: a confirmation is drawn locally on every surface, and Dengage carries the profile, the events and the channels | reference/ecommerce-events | yes |
| `empty_slot_outline` | app | Nothing. An inline property with no content served into it draws a labelled outline rather than a blank gap, so a slot waiting for content does not read as a fault | reference/new-android-sdk- | yes |

Everything else the app shows is Dengage's own view, drawn by the SDK and reported by the SDK, with
nothing local about it: the App Stories rail, the inline in-app element, the modal in-app message,
the App Inbox list, and the push notification itself.

**One documented call is not in the shipped artifact.** `getRecommendation` and `RecommendationView`
appear in the mobile documentation and are absent from 6.0.99, which is the latest published
version. The app therefore does not call them, and the rail asks the shared backend for the same
three ids the website's rail shows. That keeps the two surfaces identical by construction rather
than by two engines agreeing, which is the stronger property anyway.
