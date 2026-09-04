# The coupon list, and the one thing it cannot do

The abandoned checkout email carries a discount code. There are two ways to put one in a message
and the difference is commercial rather than technical.

A code typed into the copy is the same for everybody. It works, it is one line of effort, and the
first recipient who posts it on a forum has given the discount to the whole internet.

A **coupon list** gives every recipient a code of their own. Dengage hands out one code per send,
marks it taken, keeps the count, and raises its own alert when the list runs low. This build
chose this, so the journey uses it and the transactional path does not.

## Making the list

**Content > Assets > Coupons**, then **New**.

| Field | What this demonstration uses |
|---|---|
| List Name | `D-TELCO checkout recovery` |
| Snippet | the short identifier the content refers to. Note what the panel gives it |
| Expiry Date | optional. Set one if the offer has an end |
| Email Alerts | on, shortage at 10 percent, so a list running dry announces itself |
| Sync to Shopify | off. This demonstration has no Shopify store |

Then **Coupon List > Add Coupons > Generate**:

| Field | Value | Why |
|---|---|---|
| Prefix | `DTELCO-` | the site recognises this prefix and nothing else |
| Coupon Count | 500 | enough that a demonstration cannot exhaust it |

The generator appends eight random letters and numbers to the prefix, so a code reads
`DTELCO-A1B2C3D4`. That is where `js/config.js` gets its shape, and why the checkout can tell a
D-TELCO code from anything else without asking a server.

Codes can also be imported rather than generated, from a CSV or ZIP up to 100 MB, mapping **Code**
and **Status** where status is `A` for active or `T` for taken. `POST /contents/coupon-list/import`
does the same thing over the API with a `listId` and an array of codes.

## Putting it in the email

Open the abandoned checkout content. The body carries a marked slot:

```
<!-- COUPON SLOT: code ... -->
```

In the Rich Text Editor, click **Insert > Customization Tags**. Alongside the usual tabs, a
**Coupons** tab appears on the right listing every coupon list with its name, description, usable
and total counts, creation date and status. Click the list, and it is inserted into the content.
Replace each `{%= $Current.code %}` in the body and in the SMS with what it inserts.

The documentation does not print the tag that click produces, which is exactly why the body ships a
marked slot rather than a guessed snippet. **Note the tag the panel inserts, and record it here.**

Coupons work the same way in SMS and MMS, mobile and web push, in-app and on-site.

## What the preview will show

Not a real code. During testing the system substitutes a placeholder built from the list name, so a
list called `Coupon test list` previews as `Coupon_Test_List_Code456`, the number varying between 1
and 999. That confirms the list and the mapping without exposing stock. A preview showing a
placeholder is the feature working, not a fault.

## Proving the list is real, in the room

`dtelco-coupons` wraps `GET /contents/coupon-list/{listId}`:

```
GET  .../dtelco-coupons?list=<listId>
```

and reports the list's `Key`, `Status`, `ExpiryDate`, and how many of the total are still
available, in a sentence rather than three numbers to interpret on the spot. It reads. It never
imports, takes or redeems anything.

```
GET  .../dtelco-coupons?check=DTELCO-A1B2C3D4
```

answers whether a code has the shape the generator produces. That is a shape test, not a lookup.

## Where the two halves meet

**Issuing and redeeming are two different jobs, in two different systems.** Dengage issues a unique
code per recipient, marks it taken and reports the counts. Applying the discount to a bill is the
operator's billing system, which is where every operator already applies one, and the checkout page
names it on screen the moment a code is recognised.

Worth saying out loud in a demonstration rather than leaving to be discovered, because it is the
question a finance stakeholder asks: who actually takes the money off. The answer is the same
system that takes the money off today.

## Where the number lives

The list id is set once, in the `DTELCO_COUPON_LIST_ID` environment variable on the
`dtelco-coupons` function, so the console reads the same list the content points at rather than a
number typed in two places. `DTELCO_COUPON_PREFIX` matches `js/config.js`.
