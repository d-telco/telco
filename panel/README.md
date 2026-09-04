# The panel content pack

Everything a person pastes into the Dengage panel, generated rather than typed. Run
`python3 tools/build-message-content.py` after any copy change and `node tools/preview-emails.mjs`
before trusting it.

## What is here

| Folder | What it holds | How many |
|---|---|---:|
| `contents.json` | Every moment's copy, one entry per moment, all six channels | 25 moments |
| `email/` | Email bodies in the panel's template language, ready to paste whole | 20 |
| `email/_tag-check.html` | Not a message. Prints every value in brackets | 1 |
| `push/` | Push title, message, target URL and media per moment | 19 |
| `sms/`, `whatsapp/` | The composed copy for the two channels that are never sent | 14, 12 |
| `values/` | What each call must carry, or for one body what must be true of the contact | 20 |
| `preview/` | Every body rendered, so a person can look before sending | 41 |

## The one rule that decides everything

A transactional send sees only `$Current`, the values passed in the call. `$Contact` tags stay
empty. So every value a message prints travels in the call, and `values/<moment>.json` is the list.

Nineteen of the twenty bodies work that way. One does not, and the difference is the point of it.

`always` is what a hole would show: the subject, the preheader, the headline, the paragraph, the
hero image and the button. Send all of them every time.

`optional` is the detail table. Each row is wrapped in a condition and simply does not draw when
its value is absent, which is why a price nobody knows is omitted rather than invented.

## The twentieth body, and why it is different

`email/reco_for_you.html` is the recommendation, and it is the only content here that Dengage
resolves rather than the call. The site's own engine chooses three products, the relay writes their
ids to `reco_product_id_1`, `reco_product_id_2` and `reco_product_id_3` on the contact, and the
body looks each one up in the product table:

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

## Before the first send

Paste `email/_tag-check.html` as a throwaway content and fire it once at yourself with every value
filled in. The panel's preview cannot resolve `$Current`, so this is the only way to learn which
tags resolve before a dozen templates depend on the answer. `$Contact.name` is expected to come
back empty: that is the behaviour, not a fault. Delete the content afterwards.

## Naming in the panel

`D.dtelco - <channel> - <moment>`, matching the folder convention.

## SMS and WhatsApp

Composed, rendered and shown, never sent. Each send costs money per message and this build has ruled it
out. The content, the audience and the trigger are what a prospect needs to see, and the
verification console shows all three side by side.

## What the checks prove

`tools/preview-emails.mjs` renders every body twice, once with every value and once with only the
values marked always, and asserts that both resolve completely, that the headline and button and
hero survive the minimal pass, that every optional row draws when its value is sent and is absent
when it is not, and that none of the nineteen depends on a contact column. It reports a tag it could not
resolve rather than printing it empty: the first version substituted an empty string, which made
every template look perfect and reported nothing.

For the recommendation body substitution proves nothing, because Dengage runs that one rather than
substituting into it. So the renderer runs it too: it compiles `{% %}` and `{%= %}` to a function,
backs `$from` with the product feed this repository commits, and puts the body through four states
a real contact is in. Three ids stored must draw three cards carrying the catalogue's own titles,
prices, images and links, in the order the site chose. One id must draw one. An id the feed has
dropped must cost one card and not the message. None at all must cancel the send with the reason
the values file records. It also fails on a table or a column the feed has not got, which is the
failure that is invisible in a panel screenshot.
