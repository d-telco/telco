"""The email bodies, defined once.

Copy that appears on more than one channel lives in panel/contents.json and is read from there:
a moment must not say one thing in a push and something else in an email. What lives here is the
part only an email has, the frame around that copy: the hero, the headline, the paragraph, the
detail table and the call to action.

Two rules come straight from the template model and shape everything below.

A transactional send sees only $Current, the values passed in the call. $Contact tags stay empty,
so nothing in EMAIL reads a contact column: every value those emails print travels in the call.
RECO at the foot of this file is the single exception and is marketing only for that reason.

Anything above or around the detail table is sent every time, because a hole in a subject line or
a button is the first thing a visitor sees. The detail table is the opposite: every row prints
only when its value was sent, because a city or a store or a price has no honest stand in.
"""

ORIGIN = "https://d-telco.github.io/telco/"
ASSETS = ORIGIN + "assets/"

# The two tokens that may carry a fallback. A money value never gets one: an invented figure is
# worse than a missing row, and the detail table simply omits the row instead.
FALLBACKS = {
    "product": "your item",
    "link": ORIGIN,
}

# hero: an image slug under assets/, resolved to a URL in the values file. 'product' means the
#       call passes the product's own image, so one content serves the whole catalogue.
# rows: (label, token) pairs, each printed only when the value was sent.
# cta:  (label, url token). The url is always a tag, never an address: a shared content with an
#       address in it sends one brand's visitor to another brand's storefront.
EMAIL = {
    "welcome_onboarding": dict(
        hero="editorial/hero-esim",
        headline="Your line is live",
        lead="Your D·TELCO number is active. Two taps in the app finish the eSIM and you are done.",
        rows=[("Your number", "msisdn"), ("Plan", "plan_name"), ("Data each month", "next_data")],
        cta=("Finish setup", "link"),
    ),
    "abandoned_cart": dict(
        hero="product",
        headline="You left something behind",
        lead="{product} is still in your basket. Nothing has been charged, and it is one tap from done.",
        rows=[("In your basket", "product"), ("Price", "price"), ("Saving", "saving")],
        cta=("Back to my basket", "link"),
    ),
    "abandoned_checkout": dict(
        hero="editorial/cat-phones",
        headline="One step left",
        lead="Your order is filled in and waiting. Use {code} at checkout and it is done.",
        rows=[("Your order", "product"), ("Total", "amount"), ("Code", "code")],
        cta=("Finish my order", "link"),
        # The one value in the pack that has two honest sources, and the difference matters
        # commercially. On a transactional send the code travels in the call, so every recipient
        # gets whatever the caller passed. On the journey it comes from a Dengage coupon list, so
        # every recipient gets a code of their own and the platform marks it taken. This build
        # chose the second. docs/coupon does not print the tag the Coupons tab inserts, so the body
        # marks the slot and names the steps rather than guessing at a snippet.
        coupon="code",
    ),
    "browse_abandon": dict(
        hero="editorial/cat-plans",
        headline="GO 11.99 or GO 29.99?",
        lead="You looked at both. Here they are beside each other, so the difference is one glance "
             "rather than two tabs.",
        rows=[("The one you viewed", "product"), ("Data", "next_data"), ("Price", "price")],
        cta=("Compare the two", "link"),
    ),
    "price_drop": dict(
        hero="product",
        headline="{product} just got cheaper",
        lead="You asked us to watch this one. The price moved today.",
        rows=[("Was", "amount"), ("Now", "price"), ("You save", "saving")],
        cta=("See the new price", "link"),
    ),
    "back_in_stock": dict(
        hero="product",
        headline="{product} is back",
        lead="The one you asked us to watch is in stock again. Stock on this model has not lasted "
             "long before.",
        rows=[("Back in stock", "product"), ("Price", "price")],
        cta=("Buy it now", "link"),
    ),
    "order_confirmation": dict(
        hero="editorial/cat-phones",
        headline="Order {order_id} confirmed",
        lead="Thank you. Here is your receipt. You can follow the delivery from your account at any "
             "time.",
        rows=[("Order", "order_id"), ("Item", "product"), ("Total", "amount"),
              ("Delivery", "due_date")],
        cta=("Track my order", "link"),
    ),
    "renewal_recovery": dict(
        hero="editorial/cat-support",
        headline="Your renewal needs attention",
        lead="The automatic payment for your plan did not go through. Your line is still on, and "
             "two minutes fixes it.",
        rows=[("Plan", "plan_name"), ("Amount", "amount"), ("Due", "due_date")],
        cta=("Update my payment", "link"),
    ),
    "postpaid_billing": dict(
        hero="editorial/cat-support",
        headline="Your bill is ready",
        lead="Your D·TELCO bill for this period is {amount}, due {due_date}.",
        rows=[("Amount", "amount"), ("Due", "due_date"), ("Plan", "plan_name"),
              ("Balance carried", "balance")],
        cta=("View my bill", "link"),
    ),
    "roaming_pretrip": dict(
        hero="editorial/hero-roaming",
        headline="Before you fly to {destination}",
        lead="Roaming charges are the one part of a trip nobody plans for. A pack bought before you "
             "land costs a fraction of one bought after.",
        rows=[("Destination", "destination"), ("Pack", "pack"), ("Price", "price"),
              ("Covers", "days")],
        cta=("Add a roaming pack", "link"),
    ),
    "device_upgrade": dict(
        hero="product",
        headline="Your contract ends in {days} days",
        lead="You are free to upgrade. {product} is the closest step up from the handset you have "
             "now, and your number stays exactly as it is.",
        rows=[("Suggested", "product"), ("From", "price"), ("Contract ends", "due_date")],
        cta=("See my upgrade", "link"),
    ),
    "accessory_cross_sell": dict(
        hero="product",
        headline="Made for your {product}",
        lead="A case, a charger and a pair of buds that fit the handset you just bought. Nothing "
             "here needs an adapter.",
        rows=[("Your handset", "product"), ("From", "price")],
        cta=("See what fits", "link"),
    ),
    "family_bundle": dict(
        hero="editorial/promo-family",
        headline="You are paying for {lines} lines separately",
        lead="Three lines at one address, three bills. One family plan covers all of them and costs "
             "less than the three together.",
        rows=[("Lines at your address", "lines"), ("You pay now", "amount"),
              ("Family plan", "price"), ("You save", "saving")],
        cta=("See the family plan", "link"),
    ),
    "convergence": dict(
        hero="editorial/cat-home",
        headline="Fiber is available at your address",
        lead="You checked and never came back. It is still available, and taken with your mobile it "
             "is cheaper than on its own.",
        rows=[("Speed", "pack"), ("With your mobile", "price"), ("You save", "saving")],
        cta=("Check my address again", "link"),
    ),
    "dormant_winback": dict(
        hero="editorial/hero-ai",
        headline="Your D·TELCO line is waiting",
        lead="It has been a while. Every GO plan now carries free AI access, which is new since you "
             "were last here.",
        rows=[("Your plan", "plan_name"), ("New on it", "pack"), ("Offer", "downsell")],
        cta=("Come back", "link"),
    ),
    "churn_save": dict(
        hero="editorial/cat-services",
        headline="Before you leave D·TELCO",
        lead="Your port out request is in. Nothing here delays it. One offer is worth a look first, "
             "and if it is not enough, the port goes ahead as asked.",
        rows=[("Your plan", "plan_name"), ("What we can do", "downsell"), ("You save", "saving")],
        cta=("See the offer", "link"),
    ),
    "newsletter_welcome": dict(
        hero="editorial/promo-app",
        headline="Welcome to D·TELCO news",
        lead="Offers first, always. You can leave at any time with the link at the bottom of any "
             "message we send.",
        rows=[("You subscribed as", "msisdn")],
        cta=("Browse the shop", "link"),
    ),
    "seasonal": dict(
        hero="editorial/cat-accessories",
        headline="{campaign} at D·TELCO",
        lead="A few days only. The best of it goes first, so this is the one message worth opening "
             "early.",
        rows=[("Campaign", "campaign"), ("Ends", "due_date"), ("Code", "code")],
        cta=("See the offers", "link"),
    ),
    "referral_loyalty": dict(
        hero="editorial/promo-family",
        headline="Your referral code is {code}",
        lead="Share it. When somebody joins on it, you both get {reward}. There is no limit on how "
             "many times it works.",
        rows=[("Your code", "code"), ("You get", "reward"), ("They get", "reward")],
        cta=("Share my code", "link"),
    ),
}

# ----------------------------------------------------------------------------------------------
# The recommendation, and the one moment whose values do not travel in the call.
#
# Every body above prints $Current, the values passed in the call, because that is all a
# transactional send can see. This one is the opposite and is marketing only for exactly that
# reason: it reads the three product ids the site's own engine chose and the relay wrote to the
# contact, then resolves each one against the catalogue in the message itself.
#
# The mechanism is Query Data From Data Space, quoted from reference/advanced-personalization:
# "You can make queries in your templates and get arbitrary data from any table in the data space.
# For this, you must use the $from function with the table name." The table is named by
# reference/upsertproduct: "Product information should be inserted into the product table".
#
# $from names are case sensitive, so "product" is written exactly as that page writes it, and the
# body blocks its own send rather than printing an empty rail when nothing resolves.

# One token per value the shared copy can print, mapped to the column and the contact slot it
# resolves from. Anything not in here is an ordinary $Current token and stays that way.
#
# discounted_price rather than price, because that is the figure the storefront prints: js/site.js
# draws every card from discounted_price and the product API requires discounted_price <= price.
# A message quoting price would show a visitor a higher number than the rail they just read.
LOOKUP = {
    "pick_1": (1, "title"),
    "pick_2": (2, "title"),
    "pick_3": (3, "title"),
    "pick_1_price": (1, "discounted_price"),
    "pick_2_price": (2, "discounted_price"),
    "pick_3_price": (3, "discounted_price"),
}

RECO = dict(
    hero="editorial/promo-app",
    headline="Three picked for you",
    lead="These are the three the shop put in front of you, chosen from what you have been "
         "looking at. Same three, same order, wherever you read this.",
    cta=("See all three", "link"),
    # Read in place of the detail table. Each id is looked up on its own so one id that no longer
    # resolves costs one card rather than the whole message.
    slots=3,
    blocked="no recommendation is stored on this contact",
)
