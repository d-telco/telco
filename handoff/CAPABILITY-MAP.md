# The capability map: what earns its place, and why nothing repeats

The rule, from CLAUDE.md section 6: **a page, a screen or a moment exists only if it
demonstrates a Dengage capability no other page, screen or moment already demonstrates.**
Two surfaces showing the same mechanism is a defect, not coverage.

This file is the audit that enforces it. Part 1 is the capability inventory. Part 2 assigns
every capability to exactly one headline surface. Part 3 is the journey matrix. Part 4 is the
repetition audit and the gaps.

Sign off on Part 2 before any page is written.

---

## Part 1. The Dengage capability inventory for a telco

**71 capabilities.** The census in `tools/audit.mjs` reads that number from this line and counts
the rows below it, so adding a capability without updating the sentence fails the build.

Nothing here is aspirational: each maps to a documented mechanism, or is marked **verify**
and is checked in the account before it is shown, and drawn as a canvas if the check fails.

There is one count in this document and the line above holds it. A second one written out in
words sat here for weeks saying fifty five while the line above said sixty seven, and no check
could see it because no check reads prose. `tools/audit.mjs` now refuses a second.

### A. Identity and profile

| id | Capability |
|---|---|
| A1 | Anonymous device profile; events land keyed by device id before anyone is known |
| A2 | Contact key identification, and the anonymous to known stitch on one profile |
| A3 | Contact created and updated from a web form, by a backend over REST from an allowlisted IP |
| A4 | Contact created by the engine's own native subscription form |
| A5 | Custom contact columns, 27 of them, listed in ACCOUNT-SETUP.md, written by the backend and read by journeys |
| A6 | Contact tags written by the engine's native question form |
| A7 | Contact 360 in the panel: web, app, order, wishlist and offline history on one card |
| A8 | The same profile made visible to the customer, working before anyone knows their name |

### B. Behavioural events, the six standard tables

| id | Capability |
|---|---|
| B1 | `pageView` carrying page type, category path, product id, price and stock |
| B2 | `ec:search` once per settled query, with result count and filters |
| B3 | `ec:addToCart` and `ec:removeFromCart` on a multi line cart, remove before add on a swap |
| B4 | `ec:deleteCart` when a visitor genuinely empties the cart |
| B5 | `ec:beginCheckout`, fired only once the cart names an item |
| B6 | `ec:order` with coupon code and payment method, lines in `order_events_detail` |
| B7 | `ec:cancelOrder` naming the order it reverses |
| B9 | Fulfilment as custom events, because the order API's status vocabulary has no room for it |
| B8 | `wishlist_events` across all four list names |

### C. Custom events, the Data Space table

| id | Capability |
|---|---|
| C1 | A custom event table with 36 telco specific event types |
| C2 | Custom rows sourced from the web |
| C3 | Custom rows sourced from the Android app, into the same table |
| C4 | Custom rows sourced from BSS, care, store and chatbot, on the same profile |
| C5 | Impression and action rows for the demo's own on site experiences |

### D. Catalogue

| id | Capability |
|---|---|
| D1 | The `product` table in Data Space |
| D2 | The `product_variant` table, variants resolving by id |
| D3 | A message resolving a product by id and printing its title, price and image |
| D4 | Relations driving upsell, downsell, cross sell, bundle, requires, alternative, upgrade |

### E. Segmentation

| id | Capability |
|---|---|
| E1 | Segments over standard tables, for example wishers by list name |
| E2 | Segments over the custom event table |
| E3 | Segments over custom contact columns |
| E4 | Segments over contact tags |
| E5 | Remote Data Source: segments over first party Postgres, one flat view each |
| E6 | A remote segment moving live during the call, because the operator changed the data |

### F. Channels

| id | Capability |
|---|---|
| F1 | Web push subscription, with a rich image |
| F2 | Transactional push addressed by contact |
| F3 | Push by device token, the fallback for an unbound device |
| F4 | Transactional email, values passed in the call |
| F5 | SMS content, composed and rendered, send suppressed by decision |
| F6 | WhatsApp content, composed and rendered, send suppressed by decision |
| F7 | The Dengage App Inbox, filled by a campaign or a journey |
| F8 | The demo's own message centre, merged into one list beside Dengage's |
| F9 | Android app push through Firebase Cloud Messaging |
| F10 | Mobile in app message |
| F11 | Mobile app inbox, rendered natively and reported back |
| F12 | Broadcast push composed at the moment it is needed, inline rather than from a saved content |
| F13 | A contact's mailbox read by contact key from a surface that carries no SDK |

### G. On site and in app messaging

| id | Capability |
|---|---|
| G1 | A campaign served by the engine as a popup |
| G2 | A campaign served as a sticky bar, with the header clearance measured and published |
| G3 | A campaign served inline, injected into the page's own flow at a target slot |
| G4 | The native subscription form contract |
| G5 | The native question form contract, writing a segmentable tag |
| G6 | A dynamic content creative reading the product table |
| G7 | A dynamic content creative reading the contact's own columns |
| G8 | An A/B test, two variants of one served campaign |
| G9 | Gamification: spin to win, scratch card, countdown **verify** |
| G10 | The native exit intent trigger |
| G11 | The native scroll depth trigger |
| G12 | The site's own creatives, with their own rules, guards and reporting |

### H. Orchestration

| id | Capability |
|---|---|
| H1 | A journey triggered by a standard ecommerce event |
| H2 | A journey triggered by a custom event |
| H3 | A journey triggered by segment entry |
| H4 | A journey triggered relative to a date carried on the event |
| H5 | A journey with waits and a channel ladder that escalates |
| H6 | A journey that fills the App Inbox, which no transactional send can do |

### I. Recommendations

| id | Capability |
|---|---|
| I1 | The local engine, every rule naming itself so the readout shows why a card appeared |
| I2 | `reco_shown` and `reco_clicked` rows a journey can react to |
| I3 | The top three written to contact columns |
| I4 | The same three products printed by a marketing message, resolved with `$from("product")` |
| I5 | A unique coupon code per recipient, from a Dengage coupon list |

### J. Proof

| id | Capability |
|---|---|
| J1 | Data Space row counts, read before and after a walk |
| J2 | Channel readiness reported per channel before a send is attempted |
| J3 | Outcome codes read from bodies, so a refusal shows as a refusal |

---

## Part 2. Every surface, and the one capability it exists to prove

**Headline** is the capability the surface exists for. It appears as a headline exactly once in
this table. **Also carries** are capabilities already headlined elsewhere that this surface
naturally uses; they are not the reason it exists.

### The storefront: 23 pages

| # | Page | Headline capability | Also carries | Proved by |
|---|---|---|---|---|
| 1 | Home | **A1** anonymous profile, first touch, no identity yet | B1, G2, G12 | A row in `page_view_events` before any contact exists |
| 2 | Plans listing | **B2** settled query search with filters and result count | B1, G3 | One search row per settled query, never per keystroke |
| 3 | Plan detail (parameterised) | **D4** the relation ladder: next tier with the delta named | B1, D1, I1 | The tier above resolves from `product_relation`, not from text |
| 4 | Plan finder quiz | **G5** the native question form writing a segmentable tag | G1, C2 | A segment built on the tag counts the answers |
| 5 | Plan compare | **C1** a custom row naming several products at once | C2 | A `compare` row holding two plan ids |
| 6 | Internet and add ons | **B3** multi line cart, remove before add on a swap | B1, D4 | Add and remove counts match in the panel, cart holds one item |
| 7 | Roaming | **H4** a journey timed off a date the customer chose | C2, D4 | A `roaming_pack` row with a future travel date, journey 13 fires against it |
| 8 | Numbers, SIM and eSIM | **C2** the lifecycle events of the line itself | B6 | `number_selected`, `esim_selected`, `mnp_requested` rows |
| 9 | Shop listing | **E1** stock as a segmentable fact, not a label | B1, B2 | A real integer in `stock_count`, zeros included, never a fabricated 0 |
| 10 | Device detail (parameterised) | **B8** all four wishlist lists on one control | D2, G6 | Four distinct `list_name` values stored |
| 11 | Cart | **B5** checkout started, only once an item is named | B3, B4, I1 | No empty `beginCheckout` row anywhere in the table |
| 12 | Checkout | **B6** order with coupon, payment method and lines | A3, F2, F4, F8 | `order_events_detail` carries every line |
| 13 | My orders | **B7** the reversal, naming the order it reverses | F2 | A cancel row pointing at a real order id |
| 14 | Top up | **E6** a remote segment moving while the room watches | C2, G9 | Segment count before and after the balance write |
| 15 | Fiber and at home | **D4** convergence: a fixed product pulling a mobile bundle | C2 | `fiber_checked` row, bundle resolves through `bundle_contains` |
| 16 | Services | **B6** a genuine zero: a free service ordered at value 0 | C2 | An order row at 0 that is a fact, not a gap |
| 17 | Offers and campaigns | **G8** the A/B test, two variants of one served campaign | B1, G1 | Both variants seen, each reported |
| 18 | Register and sign in | **A3** a contact created by a backend, which no page can do | A2, A5 | `dengage_status` reads inserted or updated, never pending |
| 19 | My account | **A8** the profile made visible, the customer side of the contact card | A5, G7, I3 | The 26 columns read back and drawn |
| 20 | Inbox drawer (every page) | **F8** two message sources merged, only one reported back | F7 | Own rows carry a `demo-` id and are never reported |
| 21 | Support and care | **A6** a tag from care that a segment can read | C2, G5 | NPS tag written, segment counts it |
| 22 | Newsletter and consent | **A4** a contact created by the engine's own form | G1, G4 | A stored `DPS-` contact, never an `sf_` one |
| 23 | Archive | **D3** an inactive product still resolving by id in a message | D1 | `is_active FALSE` row printed by a content |

### Presenter surfaces: 2

| # | Surface | Headline capability | Also carries | Proved by |
|---|---|---|---|---|
| 24 | Operator simulator | **C4** offline, BSS, care, store and chatbot on the same profile as web and app | C2, E6, F2, F5, F6, F12, F13 | One contact card holding all five sources |
| 25 | Verification console | **J1 J2 J3** counts, channel readiness, and refusals shown as refusals | F5, F6 | Loads no part of the demo, so it never appears in its own numbers |

The operator simulator carries two panels that are neither a web page nor an app screen, because
the touchpoints they stand for are neither.

**At the counter (F13).** A customer rings the contact centre or walks up to a retail desk and asks
what that message was about. The agent's screen has no SDK, no cookie of theirs and no device of
theirs, and it never will. It reads the customer's Dengage mailbox by contact key from a backend,
through `GET /api/inbox/getMessages`, and shows the agent what was actually sent. The site inbox
(F7, F8) and the app inbox (F11) both prove Dengage holds an inbox; only this proves the mailbox
belongs to the person rather than to a browser, which is the only reason it can be served to a
screen like this one. It reads and refuses to write: `POST /api/inbox/events` answers 405, because
an agent glancing at a customer's messages has not read them on the customer's behalf, and an
impression reported from there would mark as read a message the customer has never seen.

**Network operations (F12).** Every other push in this build carries a saved content id, which is
right for an order confirmation and useless at two in the morning when there is a fault in Ganja.
`POST /push/sendInstant` takes the words inline. Two presses, because it is the only control in the
demonstration that reaches more than one person: the first composes and reports who it would reach,
the second sends. The city is checked against the six the operator serves, held once in
`js/config.js` and asserted equal to the function's list by `tools/check-contract.mjs`.

The console also carries the **SMS and WhatsApp preview surface**: the saved content rendered
into a phone mock with the persona's real values beside the content id and Dengage's readiness
for that channel, labelled as composed and not sent. Sends cost money per message; the copy,
the audience and the trigger cost nothing and are what a prospect actually needs to see.

### The Android app: 5 screens

| # | Screen | Headline capability | Proved by |
|---|---|---|---|
| 26 | App sign in | **A2** the same contact key, so web and app land on one profile | One contact card, two surfaces of history |
| 27 | App home | **F10** mobile in app message, the app's answer to an on site campaign | The message drawn on a real device |
| 28 | App product | **F9** app push through Firebase, opening this screen from the notification | A physical phone, a simulator raised push, the right screen |
| 29 | App inbox | **F11** the inbox rendered natively and reported back | Impression and open recorded for Dengage's messages only |
| 30 | App shop, catalogue and cart | **C3** app sourced rows landing in the same tables as the web | One count moving from two surfaces |

### Capabilities carried by the demo layer rather than by a page

| id | Where |
|---|---|
| A7 | The Dengage panel itself, shown live |
| F1 | The launcher's push prompt card, from a real user gesture |
| F3 | The message function's fallback when a contact has no bound device |
| G10, G11 | Native triggers, shown from the launcher as gestures rather than fired |
| G12 | The site's own creative engine, switchable with `?onsite=local` and `?onsite=panel` |
| C5 | Every self drawn appearance and action, written as a reporting row |
| I1, I2, I4, I5 | The engine, present on pages 3, 10, 11, 19 and app screens 27 and 30 |
| B9 | The operator simulator's fulfilment group, which journey 7 waits on |
| E2, E3, E4, E5 | The panel, built on what the surfaces above write |

---

## Part 3. The journey matrix

Twenty five journeys. The test is not the channel list; it is whether the **business moment**
repeats. Each row names what makes it different from every other row.

| # | Journey | What makes it distinct | Trigger kind | Provable |
|---|---|---|---|---|
| 1 | Welcome and onboarding | The only journey that starts at line activation | H2 | Partly |
| 2 | Abandoned cart | Items chosen, never paid for | H1 | Fully |
| 3 | Abandoned checkout | Details entered, never paid for. A different failure from 2 | H1 | Partly |
| 4 | Browse abandonment | Nothing chosen at all. A different failure again | H1 | Fully |
| 5 | Price drop | The product changed, not the customer | H2 | Fully |
| 6 | Back in stock | The supply changed, not the price | H2 | Partly |
| 7 | Order and delivery | The only journey with a status that advances, and it advances by custom event | H1, H2 | Fully |
| 8 | eSIM activation help | A purchase completed but not installed | H2 | Canvas |
| 9 | Usage upsell | Consumption, the one signal only a telco has | H2, H3 | Partly |
| 10 | Low balance and top up | Prepaid running out. Money in, not money owed | H2 | Partly |
| 11 | Renewal recovery | An automatic payment that failed | H2, H5 | Partly |
| 12 | Postpaid billing | Money owed. The opposite of 10 | H2 | Partly |
| 13 | Roaming pre trip | Timed off a future date the customer gave | H4 | Fully |
| 14 | Roaming arrival | Location, in the moment, unplanned | H2 | Partly |
| 15 | Device upgrade | The contract clock, not behaviour | H3 | Fully |
| 16 | Accessory cross sell | After the purchase, not before | H1 | Fully |
| 17 | Family bundle | Household shape, not individual behaviour | H3 | Partly |
| 18 | Convergence | Fixed line intent pulling mobile | H2 | Fully |
| 19 | Dormant win back | Absence as the signal | H3 | Partly |
| 20 | Churn save | Stated intent to leave. The only defensive journey | H2 | Partly |
| 21 | Care follow up and NPS | Service quality, not commercial intent | H2 | Partly |
| 22 | Newsletter and consent | Permission itself as the moment | H1 | Fully |
| 23 | Seasonal | Calendar, not customer. The only date driven campaign | H3 plus date | Fully |
| 24 | Referral and loyalty | Advocacy, the only journey about someone else | H1 | Fully |
| 25 | Recommendation reuse | The only journey whose content the site chooses and Dengage resolves. Same three products, same order, as the rail the visitor read | H3 | Fully |

**Provable** means the first step lands and is read from an outcome code. Twelve are fully
provable, twelve are partly provable with SMS and WhatsApp steps composed and rendered but not
sent, and journey 8 is every step suppressed, so it is shown as its canvas with its content
rendered beside it. That is stated on the day, not discovered on the day.

**Journey 7 advances by custom event, not by order upsert.** `reference/upsertorders` closes the
vocabulary: *"order_status = success / refund"*. There is no shipped and no delivered, so an order
whose status moves is a sequence of `order_shipped` and `order_delivered` custom events, written
by the operator simulator into `dtelco_offline_event` and sent to Dengage by the page as the rows
a journey waits on. Neither signal moves a segment, and the simulator says so in its own reply
rather than leaving a presenter to wonder why a count did not change.

Journey 25 is the only addition to the original twenty four. It
exists because the recommendation chosen once has to be reused by
Dengage in every channel, and nothing in the twenty four consumes it: the ids were written to the
contact and no message read them. It is one journey rather than a change to any existing one, so
the original twenty four are untouched.

Journey 25 is the one whose proof is not a send. Its email body is rendered against the committed
product feed by `tools/preview-emails.mjs`, which runs the `$from` query the body carries and
checks that the three products the message prints are the three the site's own engine chose, with
the same titles, the same prices and the same links. It carries no push step: a push cannot read
the contact, so the same three ids reach a push only through a send list or a remote segment.

`H6`, a journey filling the App Inbox, is carried by journeys 1, 7 and 24, which is the only
way an inbox row can exist: no transactional send can write one.

---

## Part 4. Repetition audit

**Every capability appears as a headline exactly once, with two argued exceptions.** A1, A2, A3,
A4, A6, A8, B2, B3, B5, B7, B8, C1, C2, C3, C4, D3, E1, E6, F8, F9, F10, F11, G5, G8, J1, J2, J3
are each the sole reason one surface exists.

Argued repeats, read by the census from this list, so an unargued repeat fails the build:

- **D4 x3.** Page 3 is the **upsell ladder**, page 15 is **convergence across product families**,
  and page 6 carries relations only as a supporting mechanism. If you want strict uniqueness,
  page 15's headline becomes the convergence bundle and page 3 keeps the ladder.
- **B6 x2.** Page 12 is the **order itself**, with coupon, payment method and lines. Page 16 is the
  **honest zero**: a free service ordered at value 0, which is a fact rather than a gap. They are
  the same event making two different claims, and dropping either loses one of them. The
  alternative is to headline page 16 on C2 and lose the point about zero entirely.

**Pages deliberately not built**, because another page already proves the mechanism:

| Not built | Because |
|---|---|
| A page per product, per plan, per category | Parameterised templates, per answer 38 and 39 |
| Separate prepaid and postpaid landing pages | One listing page with a filter proves the same `pageView` |
| Separate daily, weekly and monthly internet pages | One add ons page proves the same cart mechanics |
| A separate wishlist page | The four lists are proved on the device page and read on the account page |
| A separate search results page | Search is proved on the listing page |
| Separate campaign pages per offer | One offers page with the A/B test proves it once |
| A tariff archive per family | One archive page proves an inactive product resolving by id |
| A store locator | Stores are a reference table and can never be a remote source. Store visits reach the profile through the simulator instead |

**Why the two channels added on 4 September 2026 are not repeats**

| Looks like | Actually |
|---|---|
| F12 against F2 and F3 | F2 and F3 send a **saved content** to one addressed person. F12 composes the words at the moment of sending and reaches an application or a segment. The distinction is the whole reason a network operations centre can use it, and it is a different endpoint |
| F13 against F7, F8 and F11 | F7, F8 and F11 all draw an inbox **through an SDK, on the customer's own device**. F13 reads the same mailbox from a screen the customer is not holding and that has no SDK. That is the contact centre and the retail counter, and neither of the other three reaches it |

**Known gaps, and what happens to each**

| Gap | Handling |
|---|---|
| G9 gamification on a new account | **verify** in the panel. If the template is not enabled, the moment renders locally and is reported as a creative row, and the panel capability is shown as a canvas |
| G6 and G7 dynamic content resolving a product from a contact held id | **verify** in the panel. Fallback columns `reco_title_1` and siblings already in the model, so the message prints from the contact alone |
| Journeys 5 and 6 narrowing to wishers of one product id | **verify** in the panel. Fallback is a per contact event raised by the simulator |
| F5 and F6 live sends | Suppressed by decision. Composed, rendered and shown; never claimed as delivered |
| RCS | Not offered by Dengage. Say so if asked |

---

## Part 5. The recognition thread

Added 3 September 2026. Previously parked as "model aware
dynamic popups" and "dynamic content creatives reading the visitor's history and a product table
per contact", calling both the obvious next capabilities for a marketplace. It is now the
demonstration's headline moment.

**The story.** A visitor looks at one phone twice. Nothing else changes: no form, no sign in, no
name. The next time they open the home page, the hero is that phone. The popup is that phone.
The rail underneath is that phone's case, charger and earbuds. Somebody who looked at a
different phone sees theirs instead. Same page, same code, two visitors, two experiences.

### How it is built, and why twice

It is built **two ways at once**, because the pair is the point.

| | Drawn by the site | Served by Dengage |
|---|---|---|
| When it reacts | Instantly, on the next page load | On the next visit, once the contact is written |
| Who it works for | Anyone, including a visitor with no identity | A contact with the columns written |
| What it proves | Rule 10: realtime belongs to the site | The platform does this natively, not just this demo |
| Mechanism | `focus` state in namespaced storage, read on render | Dynamic content creative resolving `$Contact.focus_product_id` against the `product` table |
| Switched by | `?onsite=local` | `?onsite=panel` |

Flipping the switch mid call and seeing the same experience arrive from Dengage instead of from
the page is the moment that lands, and it costs one query parameter.

### The mechanics

1. **Counting.** Every product `pageView` increments a per product counter in
   `dps:dtelco:views`, holding count, last seen, title, brand, category path, price and image.
   Views older than 30 days decay out.
2. **The threshold.** Two views of the same product makes it the **focus product**. Where
   several qualify, the most recently seen wins.
3. **The mint.** Crossing the threshold is a moment the visitor can be addressed, so a
   `DPS-DTELCO-<timestamp>` key is minted here if none exists, followed by `pageView('login')`
   so the new contact owns a page view row. This extends the usual mint triggers, which are
   push permission, form submit and engine capture, and it is the honest production pattern:
   you identify in order to personalize.
4. **The write.** The page cannot write contact fields, so it posts the focus product to the
   relay, which upserts the columns from the allowlisted IP. Batched on the rolling one minute
   window, per answer 66.
5. **The event.** A `product_focus` row lands in `dtelco_events` with the product id, the brand,
   the category path and the view count, so a journey and a segment can both read it.
6. **The draw.** Hero, popup and rail all read the same focus state and each names its rule in
   the readout: `focus_hero`, `focus_popup`, `focus_cross_sell`.

### New contact columns

Eight, taking the custom column count from 26 to 34: `focus_product_id`,
`focus_product_title`, `focus_product_image`, `focus_product_price`, `focus_brand`,
`focus_category`, `focus_view_count`, `focus_at`. The title, image and price travel with the id
so a message prints from the contact alone even if the dynamic content lookup fails the panel
check, which is the same fallback already designed for the recommendation columns.

### Where the recognition rule sits in the engine

Priority order, unchanged except for the new entry in bold:

1. `requires`, a plan that needs an internet package
2. the usage 80 percent upsell, for a signed in subscriber
3. the cart based bundle
4. **`focus_cross_sell`, the accessories and bundles of the focus product**
5. cross sell for the product being viewed right now
6. the travel and family triggers
7. `alternative`

On the home page there is no product being viewed, so the focus rule wins there naturally. On a
product page the product in front of the visitor wins, which is correct.

### What this adds to the capability map

| id | Capability | Headline surface |
|---|---|---|
| G7 | Dynamic content creative reading the contact's own columns | Home page, **returning visitor state**: the adaptive hero |
| G6 | Dynamic content creative resolving the product table | Home page, **returning visitor state**: the product aware popup |
| K1 | Browse depth as a first class signal, counted and acted on | The events module, reported as `product_focus` |
| K2 | The same personalization served two ways, switchable live | The `?onsite` switch |

**This is not a repetition of the home page's A1 headline.** A1 is the visitor the site has
never seen; G6 and G7 are the visitor it has seen twice. One page, two visitor states, two
capabilities. That distinction is the exception to the one headline rule and the only one in
this document.

### Catalogue consequence

Narrated with an iPhone against a Google Pixel. The phone mix carried
no Google, so `Shop>Phones` is rebalanced within its 40: iPhone 8, Samsung 10, Google 4,
Xiaomi 8, Honor 5, Redmi 5. The total stays 40 and the catalogue total stays 241, and the story
can be told with the brands a presenter reaches for without thinking.
