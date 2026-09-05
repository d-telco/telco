# The panel content pack

Everything a person pastes into the Dengage panel, generated rather than typed. Run
`python3 tools/build-message-content.py` after any copy change and `node tools/preview-emails.mjs`
before trusting it.

## The two lanes, and the rule that sorts every message

The folder itself answers the first question anyone asks of a message: which route sends it.

**`transactional/`** holds the service messages: sent the second the event happens, to one
person, through `/transactional/push` or `/transactional/email`. A transactional send sees only
the values passed in the call, `$Contact` stays empty, and it cannot fill the App Inbox. Eight
moments qualify: the line going live, the order confirmation, the bill, the failed renewal, the
subscription confirmation, low balance, the 80 percent usage alert and the roaming arrival.

**`campaign/`** holds everything a journey or a campaign sends: it waits, reads the contact,
watches a list or selects an audience, none of which a transactional send can do. Seventeen
moments live here, the recommendation among them, plus the on site experiences.

A moment's lane is declared in `contents.json` and the generator refuses a contradiction: a body
that reads the contact cannot land in `transactional/`, and `tools/check-contract.mjs` checks the
tree did not drift by hand.

## What is here

| Folder | What it holds | How many |
|---|---|---:|
| `contents.json` | Every moment's copy, one entry per moment, all channels, plus the lane | 25 moments |
| `transactional/email/` | Service email bodies in the panel's template language, paste whole | 5 |
| `transactional/email/_tag-check.html` | Not a message. Prints every value in brackets | 1 |
| `transactional/push/` | Service push contents as text, field by field | 8 |
| `transactional/sms/`, `transactional/whatsapp/` | The composed copy on the service moments | 6, 4 |
| `campaign/email/` | Journey and campaign email bodies, the recommendation among them | 15 |
| `campaign/push/` | Campaign push contents as text | 11 |
| `campaign/sms/`, `campaign/whatsapp/` | The composed copy on the campaign moments | 8, 8 |
| `campaign/onsite/` | On site copy per moment, and the three gamification experiences | 9 |
| `values/` | What each call must carry, or for one body what must be true of the contact | 23 |
| `preview/` | Every body rendered, so a person can look before sending | 41 |
| `coupons/` | The coupon list procedure | 1 |

## Why `values/` is JSON and the channels are not

The channel files are what a person pastes: email as full HTML, push, SMS and WhatsApp as plain
text carrying the personalization tags exactly as the panel resolves them. Nothing pasted is JSON.

`values/<moment>.json` is not content and is never pasted. It is the contract of the call: which
values the sender must pass on every send (`always`), which only add detail rows (`optional`),
and for the one contact reading body, what must be true of the contact instead. The demo's
transactional sender and the check suite both read these files, which is why they are structured
rather than prose. One JSON file per moment describing the call; every word a person pastes is
HTML or text.

## The one rule that decides everything

A transactional send sees only `$Current`, the values passed in the call. `$Contact` tags stay
empty. So every value a service message prints travels in the call, and `values/<moment>.json` is
the list.

`always` is what a hole would show: the subject, the preheader, the headline, the paragraph, the
hero image and the button. Send all of them every time.

`optional` is the detail table. Each row is wrapped in a condition and simply does not draw when
its value is absent, which is why a price nobody knows is omitted rather than invented.

## The body that reads the contact, and why it is campaign only

`campaign/email/reco_for_you.html` is the recommendation, and it is the only content here that
Dengage resolves rather than the call. The site's own engine chooses three products, the relay
writes their ids to `reco_product_id_1`, `reco_product_id_2` and `reco_product_id_3` on the
contact, and the body looks each one up in the product table:

```
{% var p1 = $Contact.reco_product_id_1 ? $from("product")
     .where("product_id", "=", $Contact.reco_product_id_1).first() : null; %}
```

That is Query Data From Data Space, from `reference/advanced-personalization`: *"You can make
queries in your templates and get arbitrary data from any table in the data space."* The table is
`product` because `reference/upsertproduct` says *"Product information should be inserted into the
product table"*, and `$from` names are case sensitive, so it is written exactly as that page writes
it. When no id resolves the body calls `$blockSend`, so a contact with no recommendation gets no
message rather than an empty rail.

**Three constraints follow, and all three are enforced by a check rather than by care.**

It is a marketing send only. `reference/customization-in-transactional-messages` is explicit:
contact columns cannot be used for personalization in a transactional message. So this content id
must never be passed to `/transactional/email`, and `tools/check-contract.mjs` fails if anything in
the site, the console or the sender so much as names it.

It carries no push. `reference/advanced-personalization` says `$Contact` *"can be null in Push
sends"*, so a push resolved from the contact can go out with three holes in it. The builder refuses
to write one. The same three ids reach a push through a send list or a remote segment instead,
where they arrive as `$Current` and have no such caveat.

Its subject line carries no query. An unresolved subject is the most visible failure a message has,
and this one reads well without a lookup.

## The served surfaces: which panel type carries which use case

The panel's on site and in app galleries, mapped to this build. Web push contents are created
twice, once per application, because the web and Android applications share nothing.

**On site (web).** The 13 inline slots and their selectors are in `handoff/ONSITE-SLOTS.md`.

| Panel type | Use case in this build |
|---|---|
| Sticky Bar, Basic Sticky Bar | The site wide strip in `#dn_inline_target_below_header`: a service notice, an outage follow up. The bar reports its height and the site publishes the clearance |
| Image Bar | The homepage banner in `#dn_inline_target_below_hero` |
| CTA Image Popup | `churn_save`: the save offer when a port out is in the air |
| Image, Horizontal, Vertical Popup | `seasonal` and `device_upgrade` offers |
| Subscription Popup, Email Subscription | Newsletter capture. An engine capture form mints an `sf_` contact unless the device already carries a key, which is the standing identity check |
| Collect Leads with NPS, NPS, Survey, Rating | `care_nps` after a resolved complaint, and the plan finder questionnaire. Radio question blocks carry `data-dn-is-radio="true"` |
| Recommendation Widget (Beta), Search Widget | The served rail beside the site's own in `#dn_inline_target_reco`, so the two can be compared |
| Inline, Inline Image, Story | The 13 slots and the seasonal story |
| Custom Inline | The recognition hero. Selectors namespaced under the creative root id, padding 0, transparent background, behaviour in `onclick` |
| Product Box, Dynamic Carousel | Flow campaigns only, which is the recorded platform constraint. The browse abandon and recommendation flows |
| Product Box, Static Carousel | A merchandised fixed set in `#dn_inline_target_in_grid` |
| Typeform Popup | Not used. This build allows no third party host at runtime |

**In app (Android).** The four declared properties are `dtelco_app_home`, `dtelco_app_product`,
`dtelco_app_cart` and `dtelco_app_stories`; the screen names are in ACCOUNT-SETUP.md.

| Panel type | Use case in this build |
|---|---|
| Banner | `usage_upsell` on the account screen |
| Modal, Image Modal | `seasonal` and `price_drop` |
| Full Screen, Full Image | `welcome_onboarding` on first open, the seasonal takeover |
| Survey, NPS | `care_nps` in the app |
| Recommendation Widget | The rail on `dtelco_app_home` |
| Inline Content | The three inline properties, drawn inside the app's own layout |
| Story | `dtelco_app_stories` on the Discover tab |

## Gamification: the wheel, the countdown, the scratch card

Three panel side experiences, copy in `contents.json` and one paste sheet each in
`campaign/onsite/`: `spin_the_wheel.txt`, `countdown_offer.txt`, `scratch_card.txt`. The wheel
and the scratch card hand out codes from the account's own `DTELCO-` coupon list, so every winner
gets a code of their own and the platform marks it taken; the countdown sells urgency and prints
the catalogue's own discounted price, never a number typed into a creative. All three are
campaign lane and verify item G9: until the gamification template is confirmed enabled on the
account, each is shown as its canvas and said so plainly.

## Before the first send

Paste `transactional/email/_tag-check.html` as a throwaway content and fire it once at yourself
with every value filled in. The panel's preview cannot resolve `$Current`, so this is the only way
to learn which tags resolve before a dozen templates depend on the answer. `$Contact.name` is
expected to come back empty: that is the behaviour, not a fault. Delete the content afterwards.

## Naming in the panel

`D.dtelco - <lane> - <channel> - <moment>`, matching the folder convention.

## SMS and WhatsApp

Composed, rendered and shown, never sent. Each send costs money per message and this build has
ruled it out. The copy sits in each moment's lane folder so the split still reads correctly: a
`transactional/sms/` file is the service SMS an operator would send on that event, shown rather
than sent.

## What the checks prove

`tools/preview-emails.mjs` renders every body twice, once with every value and once with only the
values marked always, and asserts that both resolve completely, that the headline and button and
hero survive the minimal pass, that every optional row draws when its value is sent and is absent
when it is not, and that none of the nineteen depends on a contact column. It reports a tag it
could not resolve rather than printing it empty: the first version substituted an empty string,
which made every template look perfect and reported nothing.

For the recommendation body substitution proves nothing, because Dengage runs that one rather than
substituting into it. So the renderer runs it too: it compiles `{% %}` and `{%= %}` to a function,
backs `$from` with the product feed this repository commits, and puts the body through four states
a real contact is in. Three ids stored must draw three cards carrying the catalogue's own titles,
prices, images and links, in the order the site chose. One id must draw one. An id the feed has
dropped must cost one card and not the message. None at all must cancel the send with the reason
the values file records. It also fails on a table or a column the feed has not got, which is the
failure that is invisible in a panel screenshot.

`tools/check-contract.mjs` additionally asserts that no body under `transactional/` reads the
contact, so the lane split cannot drift by hand.
