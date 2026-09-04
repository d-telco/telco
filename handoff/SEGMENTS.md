# Segment sizes, as seeded

Measured 3 September 2026 against the live project, after the corrections in
`supabase/seed/0203_dtelco_segment_corrections.sql`. The seed is deterministic, so these are
the numbers the panel will show and the numbers a presenter can say out loud.

Base: 2010 subscriber rows. 2000 generated, 8 personas, 2 household members at one address.

| Segment view | Rows | Share | Persona in it | The story it carries |
|---|---:|---:|---|---|
| `v_dtelco_heavy_on_small_plan` | 253 | 12.6% | DPS-DTELCO-1, DPS-DTELCO-4 | At 80 percent or more of an allowance of 10 GB or less. The usage upsell |
| `v_dtelco_low_balance_high_usage` | 30 | 1.5% | DPS-DTELCO-4 | Prepaid, under two dollars, past 70 percent of data. The top-up nudge |
| `v_dtelco_plan_expiring_7d` | 454 | 22.6% | DPS-DTELCO-4 | Plan lapses within a week. High because a 30 day cycle puts roughly a quarter of any prepaid base in a 7 day window, which is arithmetic rather than a seeding error |
| `v_dtelco_renewal_failed` | 32 | 1.6% | DPS-DTELCO-5 | An automatic payment that did not go through. Payment recovery |
| `v_dtelco_roamers_now` | 227 | 11.3% | DPS-DTELCO-3 | Abroad in the current period. `has_pack` false is the arrival audience |
| `v_dtelco_frequent_travellers` | 254 | 12.6% | DPS-DTELCO-3 | Ten or more roaming days over six months. The pre-trip audience |
| `v_dtelco_dormant_30d` | 216 | 10.7% | DPS-DTELCO-8 | No usage worth the name and no contact in a month, on a line old enough for that to mean something |
| `v_dtelco_churn_risk` | 272 | 13.5% | DPS-DTELCO-5 | Port-out, detractor, or at risk with a case. `reason` names which one fired |
| `v_dtelco_upgrade_eligible` | 245 | 12.2% | DPS-DTELCO-2, DPS-DTELCO-8 | Handset over two years old, or a contract ending inside 60 days |
| `v_dtelco_family_candidates` | 167 | 8.3% | DPS-DTELCO-7 and household | More than one line at the address, still billed as singles |
| `v_dtelco_switchers_1m` | 34 | 1.7% | DPS-DTELCO-6 | Activated in the last 30 days. `ported_in` separates a switch from a new line |
| `v_dtelco_stock_waiters_with_stock` | 0 | 0% | none yet | **Empty on purpose.** Rashad waits on a handset that is out of stock. He appears the moment the simulator restocks it, which is the only honest way to show a segment moving |
| `v_dtelco_price_watchers` | 0 | 0% | none yet | **Empty on purpose.** No product is discounted yet. Rashad appears when the simulator drops the price he is watching |
| `v_dtelco_fiber_checked_no_order` | 200 | 10.0% | DPS-DTELCO-7 | Checked availability, never ordered. The convergence audience |

## The two empty ones are the point

A segment that is full before anybody presses anything proves nothing about Dengage. The stock
waiter and price watcher segments are seeded empty, with exactly one person queued behind each,
so that pressing a button in the operator simulator moves a real segment from zero to one while
the room watches. Everything else is seeded populated so a segment can be opened cold.

## Three corrections worth remembering

Three segments came out useless on the first pass and were fixed before anything depended on
them. They are recorded here because the failure mode is easy to repeat.

**Family candidates read 1486 of 2000.** Two thousand lines over fifteen hundred possible
addresses meant almost every address had a second person at it. A segment covering three
quarters of the base is not a segment, and the first question from the room is why.

**Upgrade eligible read 1153.** Device age ran six to forty five months uniformly, so more than
half the base was carrying a handset over two years old.

**Dormant read 217 one hour and 216 the next.** The view compared against `now() minus 30 days`,
a cut that moves every second, and exactly one contact, `DPS-DTELCO-S01524`, has its newest offline
signal at 17:15 UTC on the boundary day. Counted before 17:15 the segment held 216; counted after
it held 217. The 217 first recorded here was an afternoon measurement. Migration 0009 moves both
this view and `roamers_now` to `current_date`, so they answer the same all day, and 216 is the
number.

**Dormant reads on absence rather than on status.** An earlier shape read "lifecycle is
dormant OR the last offline signal is older than thirty days", and since those signals spread
over four months, nearly everyone who had ever walked into a store qualified. Having visited a
store two months ago is not dormancy.

## The two watcher views were counted right and broken anyway

Recorded 4 September 2026. Both counts above are correct. What differs is the role they are read as.

Every check in this repository reads Postgres as the service role, which bypasses RLS and holds
every grant. Dengage connects as `dengage_reader`. Both watcher views joined `dtelco_product` to
read a title, a price and a stock count, and that role cannot select `dtelco_product` and must
never be able to: reference tables about products or places are never offered as remote sources.

So as the service role they returned zero rows, which is exactly what this document says. As
`dengage_reader` they answered `permission denied for table dtelco_product`, and these are the two
segments the demonstration uses to show a segment filling while the room watches.

Migration 0017 moves the product state onto the watch row and keeps it current by trigger, so both
views now read one contact keyed table and nothing else. Verified live: a restock takes the stock
waiters from 0 to 1 and a price drop takes the price watchers from 0 to 1, read as `dengage_reader`,
and both return to 0 when the product is put back.

`GET dtelco-remote` is the standing check, and `tools/check-backend.mjs` and the verification
console both assert it.

## Seven of the fourteen move without anybody pressing anything

Measured again on 4 September 2026, one day after the table above. Three counts had already
changed: `plan_expiring_7d` 454 to 456, `dormant_30d` 217 to 218, `switchers_1m` 34 to 33.

By design. Seven of the fourteen views compare a seeded date against `current_date` or
`now()`, so they move every night whether or not the demonstration is touched.

| Segment view | Why it moves | Which way |
|---|---|---|
| `v_dtelco_plan_expiring_7d` | A seven day window that slides forward | Either, with the cycle |
| `v_dtelco_renewal_failed` | Failures older than thirty days fall out | Down, to zero |
| `v_dtelco_roamers_now` | Reads the current billing period | Turns over with the month |
| `v_dtelco_frequent_travellers` | Six months of roaming days, oldest month falls out | Down |
| `v_dtelco_dormant_30d` | Seeded contact dates age past thirty days | Up |
| `v_dtelco_upgrade_eligible` | Handsets cross two years, contracts cross sixty days | Up |
| `v_dtelco_switchers_1m` | Activations older than thirty days fall out | Down, to zero |

The other seven are fixed: only a signal from the operator simulator moves them.

**This matters more than the drift itself.** Four of the seven decay rather than merely move, and
two of those decay to zero. Left alone, the payment recovery audience and the switcher audience
empty out, and the journeys built on them have nobody to address. That is a demonstration that
works today and is embarrassing in November.

**What to do about it.** Before a session with a prospect, roll the seeded dates forward:

    POST https://raextqlludkagdntyzwn.supabase.co/functions/v1/dtelco-reset
    {"roll": true}

That resets the simulator's work and then calls `dtelco_roll_dates()`, which shifts every seeded
date by the days elapsed since the anchor in `dtelco_clock`. A GET on the same endpoint reports the
anchor and how many days behind the data is without changing anything, and the verification console
shows the same line. Rolling is opt in: a plain POST with no body resets and leaves the dates alone.

Proved on 4 September 2026. The data was one day behind, the roll shifted 2010 subscriber rows,
12060 usage rows, 1607 invoices, 253 tickets, 1717 offline events, 5 watch rows and 60 snapshot
keys, and thirteen of the fourteen counts came back to the numbers in this table exactly. The
fourteenth is the dormant correction recorded below.

Read the live column in the verification console, never this table. The console pins a baseline on
request, so the delta column then shows what a rehearsal did rather than what the calendar did.

## How to read a count during a demonstration

Say the live number, not the seeded one. The seeded column is what the data looked like the day it
was built and is useful only as the thing a delta is measured from. The two numbers that carry a
story are the delta after a signal, which should be exactly one, and the count of a fixed segment,
which should not have moved at all.
