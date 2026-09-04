# The walkthrough

The demonstration, in the order a real customer meets it, with what to press, what should happen
and how to prove it happened. Roughly 45 minutes with questions, and it breaks cleanly at the end
of any act if the room wants to stop early.

Nothing in here is a slide. Every claim is made by pressing something and then showing the row it
wrote, because a telecom operator has been shown decks before.

**Two windows, one phone.** The storefront at `https://d-telco.github.io/telco/` on the main
screen. The Dengage panel on a second window, on the contact card for whoever you are being. The
Android phone in your hand, signed in as the same contact key.

**Before the room arrives**, run the pre flight in `handoff/VERIFY.md`. It takes four minutes and
it is the difference between a demonstration and an apology.

---

## What the eight personas are for, and when to stop using them

A persona carries what a first visit cannot: a month of consumption, a contract clock, three lines
at one address, six months of roaming history. That is the half of a telecom customer that takes
time to accumulate and that no demonstration can conjure by clicking.

Everything else is already real for whoever is browsing. So the walkthrough starts as a stranger,
and takes a line partway through, on the operator console's **Give this browser a line**. From
that point the browsing is the room's own and the operator history is a persona's. That is the
honest version, and it is more convincing than driving somebody else's account for an hour.

| Key | Who | What their record carries | The moment they are for |
|---|---|---|---|
| `DPS-DTELCO-1` | Aysel Mammadova | GO 11.99 prepaid, 92 percent of 5 GB, iPhone 16 | The usage upsell |
| `DPS-DTELCO-2` | Rashad Quliyev | Klass 19 postpaid, 55 percent, iPhone 15 | The stock and price watcher, both segments empty until the simulator moves them |
| `DPS-DTELCO-3` | Nigar Aliyeva | GO 29.99 prepaid, six roaming days, Galaxy S25, prefers WhatsApp | The traveller, before and after the flight |
| `DPS-DTELCO-4` | Elvin Safarov | GO 7.99 prepaid, 88 percent used, 62 cents left, at risk | Low balance against high usage. The top up |
| `DPS-DTELCO-5` | Leyla Huseynova | Klass 31 postpaid, at risk, a complaint and a detractor score | The churn save, the only defensive journey |
| `DPS-DTELCO-6` | Tural Bayramov | GO 17.99 prepaid, activated this month, no device on record | The switcher who ported in |
| `DPS-DTELCO-7` | Kamran Valiyev | Klass 19 postpaid, three lines at one address, fiber checked | The family bundle and convergence |
| `DPS-DTELCO-8` | Sevinc Rahimova | GO 3.99 prepaid, 4 percent used, dormant thirty days | The win back |

Every figure in that table is read from the operator's own record by `dtelco-profile`, and
`tools/check-personas.mjs` fails the build if this table and that endpoint disagree. A runbook
that quotes a number nobody can reproduce is worse than one that quotes none.

---

## Act 1. A stranger, and what Dengage knows about them before they say a word

**Press.** Open the home page. Nothing else.

**What happens.** The page fires its page view before it draws anything.

**Prove it.** Add `?debug=1` to the URL. The readout names the event and the table it lands in.
Then open the Dengage panel's Data Space and show `page_view_events` moving. Say the two minute
storage lag out loud before anybody notices it: an HTTP 200 means accepted, not stored.

**The line to say.** "Nobody has signed in. There is no cookie banner theatre here. Dengage has a
device, a session and a page view, and that is enough to start with."

**Press.** Open any handset. Then open the same handset again.

**What happens.** On the next page the hero, the popup and the rail all bend to that product. A
contact key is minted at the second view, because crossing that threshold is the first moment this
visitor can be addressed at all.

**Prove it.** The debug readout shows the minted key. The panel shows a new contact with a page
view history and no name, which is exactly what an anonymous shopper is.

**Why it matters to a telco.** Handset browsing is the highest intent signal on a telecom site and
it happens before any login. Most operators throw it away.

---

## Act 2. The same person, on the phone

**Press.** On the Android phone, the Account tab. Type the contact key the browser just minted.
Sign in.

**What happens.** The app calls `setContactKey` with the same key. The account fills with the line
that key has.

**Prove it.** One contact card in the panel, with the web history and the app history on it. Not
two contacts. Not a merge that runs overnight.

**The line to say.** "That is the same person. Not a probabilistic match, not an identity graph
you pay extra for. The same key, set on both surfaces."

**Press.** Allow notifications, on the app's account screen.

**What happens.** The SDK subscribes the device and binds the token to the key that is signed in.

**Prove it.** The token appears on the screen. Say why the order matters: a token binds to the key
that subscribed, and asking before signing in binds it to nobody.

---

## Act 3. The moment only a telecom operator has

This is the act to spend time on. Everything before it, a retailer could do.

**Press.** Operator console, `operator.html`. **Give this browser a line.**

**What happens.** The key this browser has been using gains a subscriber record, a number, a plan,
a contract clock and a month of usage.

**Press.** Still on the console, **Data at 80 percent**.

**What happens.** Three things at once, and the log says which system did which. The page sends a
`usage_80` custom row to Dengage from the browser. The operator function writes the usage to
Postgres and sends the same fact to Dengage's Event API with no browser involved at all. The
segment count moves and the log says whether this line entered it.

**Prove it.** The log prints the segment view name and the count before and after. Then show the
same segment in the panel. `v_dtelco_heavy_on_small_plan` is a remote segment reading Postgres
live, so it is not a nightly export.

**The line to say.** "Consumption is the one signal a bank, a retailer and an airline do not have.
This is a live remote segment: Dengage is reading the operator's own database at evaluation time,
not a file somebody uploaded last night."

**Press.** Back on the site, the account page.

**What happens.** The usage bar reads the real number, and the on site experience arms from it
rather than from a presenter setting a switch.

---

## Act 4. The fault nobody wrote in advance

**Press.** Operator console, **Network operations**. Choose Ganja. **Compose the notice.**

**What happens.** Nothing is sent. The screen shows the exact words and says who it would reach.

**The line to say.** "Every other message in this demonstration comes from a content saved in
advance, which is right for an order confirmation. Nobody writes the wording of an outage in
advance. This one is composed at two in the morning by whoever is on shift."

**Press.** **Send it.**

**What happens.** The broadcast goes out and the reply names the code Dengage returned.

**Prove it.** The phone in the room. And say the honest part: a code of zero means Dengage accepted
the broadcast, not that a handset drew a notification.

**Why two presses.** It is the only control here that reaches more than one person. Say so.

---

## Act 5. The counter, and the touchpoint with no SDK

**Press.** Operator console, **At the counter**, **What have we sent them**.

**What happens.** The agent's screen fills with the messages Dengage is holding for that customer.

**The line to say.** "Your contact centre and your retail desks will never have an SDK. They still
need to see what the customer saw. This screen has no cookie of theirs and no device of theirs. It
asks Dengage for the mailbox by contact key."

**The part worth saying out loud.** Nothing here reports an open. An agent glancing at a customer's
messages has not read them on the customer's behalf, and reporting it would mark as read a message
the customer has never seen. That is a small point that tells an enterprise buyer what kind of
platform this is.

---

## Act 6. Buying, and the four failures that are not the same failure

**Press.** Add a tariff and a handset to the cart. Change the quantity of one.

**Prove it.** The debug readout shows a remove before every add. Say why: Dengage rebuilds the cart
from the event stream, so a changed quantity sent as a second add reads as two of the thing.

**Press.** Go to checkout. Fill the form. Stop before paying.

**The line to say.** "There are four ways to fail to buy and most platforms treat them as one.
Nothing chosen is browse abandonment. Chosen and not paid is cart abandonment. Details entered and
not paid is checkout abandonment, and it is a warmer lead than the other two. Paid and not
activated is the eSIM that never got installed. Four journeys, four messages, four audiences."

**Press.** Pay.

**What happens.** The confirmation card appears in the same second. The order row goes
to Dengage and the journey after it is Dengage's.

**Prove it.** The order in `order_events`, and the coupon code on it if one was used.

---

## Act 7. The recommendation that is the same everywhere

**Press.** The account page. Read the three products on the rail and the rule printed under them.

**Press.** The Android phone, Home tab. Read the three products there.

**What happens.** They are the same three, in the same order, with the same rule named.

**Prove it.** The contact's `reco_product_id_1`, `_2` and `_3` columns in the panel. Then open the
recommendation email body in the panel and show it printing the same three products, looked up in
the product table from the ids on the contact.

**The line to say.** "One engine, four surfaces. The website, the app, the email and the push all
show the same three products because they all read the same three ids. A customer who sees one
thing on your site and a different thing in your email has been told your systems do not talk."

---

## Act 8. Leaving, and being asked not to

**Press.** Operator console, acting as Leyla, **Port out requested**.

**What happens.** The churn risk flag is set from the signal rather than from a launcher.

**Press.** Back on the site, browse, then move the mouse to close the tab.

**What happens.** The save offer appears on exit intent.

**The line to say.** "This is the only defensive journey in the set. Everything else here is trying
to sell something. This one is trying to keep somebody, and the trigger is a port out request that
came from the operator's own systems rather than from anything they clicked."

---

## Act 9. The proof, shown rather than claimed

**Press.** The verification console, `verify/index.html`.

**What happens.** It runs every backend assertion live, in front of the room.

**The line to say.** "This console loads no part of the demonstration, so it never appears in its
own numbers. It reads the account and the operator's database and reports what it finds, including
what is refused."

**Show the refusals deliberately.** A channel with no permission reads as refused with the code
Dengage returned. A table that does not exist reads as not found. That is the point: a
demonstration that can only show success is a demonstration nobody should believe.

---

## What to say when something does not work

Say what happened. The whole build is written so that a refusal reports itself with a reason, and
every one of those reasons is a real thing a real integration hits. A presenter who reads the
reason out loud and explains it is more convincing than one who reloads and moves on.

The three most likely, and the answer to each:

| What you see | What it is | What to say |
|---|---|---|
| A push reports code 11 | The device has not claimed this contact | "That token belongs to a different key. The fallback sends by token, and that is a real distinction rather than a bug" |
| A count has not moved | The two minute storage lag | "Accepted is not stored. Watch it appear" |
| A channel reads refused with 403 | The API user lacks that permission | "That is the platform refusing rather than pretending. Here is where the permission is granted" |
