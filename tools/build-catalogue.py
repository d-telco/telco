#!/usr/bin/env python3
"""Build the D-TELCO catalogue from tools/catalogue.py.

Emits, all deterministic so a rebuild is byte identical:
  handoff/dtelco-product.csv          the Dengage product upload, A6.1 header order
  handoff/dtelco-product_variant.csv  the Dengage product_variant upload
  handoff/dtelco-product.test.csv     header plus one row, for the first test upload
  handoff/dtelco-product_variant.test.csv
  data/catalogue.json                 the feed the site and the app read
  supabase/seed/0100_dtelco_catalogue_seed.sql

Nothing here invents a published figure. A published price is carried through as the
same numeral in dollars; everything else is flagged demo_data and reaches the panel as a
demo-data tag, so the two are told apart without asking anybody.
"""
import csv, hashlib, io, json, os, sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalogue as C

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "https://d-telco.github.io/telco/"
SEED_EPOCH = datetime(2025, 3, 1, 9, 0)      # oldest publish_date
UNL = C.UNLIMITED

products, variants, relations, bundle_items = [], [], [], []
_seen = set()


def det(key, lo, hi):
    """Deterministic integer in [lo, hi] from a string. Same catalogue, same numbers, always."""
    h = int(hashlib.sha256(key.encode()).hexdigest()[:12], 16)
    return lo + (h % (hi - lo + 1))


def pid(prefix, slug):
    return slug if slug.startswith(prefix + "-") else f"{prefix}-{slug}"


def published_at(product_id):
    """Varied dates, per the account owner's answer 46: a catalogue where everything published in
    the same minute reads as generated, which it is, but it should not announce it."""
    return SEED_EPOCH + timedelta(days=det(product_id + "date", 0, 540),
                                  minutes=det(product_id + "min", 0, 599))


def add_product(product_id, title, description, category_path, brand, product_type, price,
                discounted=None, stock=9999, family=None, tags=(), demo=True, active=True,
                **extra):
    assert product_id not in _seen, f"duplicate product_id {product_id}"
    _seen.add(product_id)
    store = C.STORE_SHOP if product_type in ("device", "accessory") else C.STORE_MAIN
    tag_list, seen = [], set()
    for t in [product_type] + [t for t in tags if t] + (["demo-data"] if demo else []):
        if t not in seen:
            seen.add(t)
            tag_list.append(t)
    products.append(dict(
        product_id=product_id, title=title, description=description,
        category_path=category_path, brand=brand, product_type=product_type, family=family,
        price=round(price, 2),
        discounted_price=round(price if discounted is None else discounted, 2),
        stock_count=stock, is_active=active, publish_date=published_at(product_id),
        store_name=store, parent_id=None, tags=tag_list,
        link_path=f"product.html?id={product_id}", image_slug=product_id,
        demo_data=demo, **extra))
    return product_id


def add_variant(product_variant_id, product_id, title, price, discounted=None, stock=None,
                size=None, color=None, gender=None, image_slug=None):
    variants.append(dict(
        product_variant_id=product_variant_id, product_id=product_id, title=title,
        price=round(price, 2),
        discounted_price=round(price if discounted is None else discounted, 2),
        stock_count=stock, size=size, color=color, gender=gender, age_interval=None,
        store_name=next(p["store_name"] for p in products if p["product_id"] == product_id),
        image_slug=image_slug or product_id))


def solo_variants():
    """Every product with no explicit variant gets one whose id equals its product_id.
    the integration guide: product_variant_id falls back to product_id, and a product that is its own only
    variant is a fact, not a gap. Leaving it undefined dropped the key on every wishlist row."""
    have = {v["product_id"] for v in variants}
    for p in products:
        if p["product_id"] not in have:
            add_variant(p["product_id"], p["product_id"], p["title"], p["price"],
                        p["discounted_price"], p["stock_count"])


def rel(a, b, kind, rank=1, note=None):
    if a != b:
        relations.append(dict(from_product_id=a, to_product_id=b, relation=kind,
                              rank=rank, note=note))


def money(v):
    return f"{v:.2f}"


def allowance(data_gb, minutes, sms, days, social=0, ai=0):
    bits = []
    bits.append("Unlimited data" if data_gb is None else f"{data_gb:g} GB")
    if social:
        bits.append(f"{social:g} GB social media")
    if ai:
        bits.append(f"{ai:g} GB free AI")
    if minutes:
        bits.append("unlimited minutes" if minutes >= UNL else f"{minutes} min")
    if sms:
        bits.append("unlimited SMS" if sms >= UNL else f"{sms} SMS")
    bits.append(f"{days} days")
    return ", ".join(bits)


# =========================================================================================
# Plans
# =========================================================================================
def build_plans():
    families = [
        ("Mobile>Plans>Prepaid GO",       "GO",       C.GO,       "prepaid"),
        ("Mobile>Plans>Prepaid GO Pro",   "GO Pro",   C.GO_PRO,   "prepaid"),
        ("Mobile>Plans>Prepaid Star",     "Star",     C.STAR,     "prepaid"),
        ("Mobile>Plans>Prepaid Star Pro", "Star Pro", C.STAR_PRO, "prepaid"),
        ("Mobile>Plans>Prepaid Klass",    "Klass",    C.KLASS_PREPAID, "prepaid"),
    ]
    for path, family, rows, kind in families:
        ids = []
        for slug, title, price, data, social, ai, mins, sms, days, ussd, demo in rows:
            p = add_product(
                pid("plan", slug), title,
                allowance(data, mins, sms, days, social, ai) + ", free WhatsApp texting",
                path, C.BRAND, "plan", price, stock=9999, family=family,
                tags=[family.lower().replace(" ", "-"), kind, "5g"], demo=demo,
                ussd_code=ussd, validity_days=days, data_gb=data, social_gb=social,
                ai_gb=ai, minutes=mins, sms=sms,
                free_apps=["WhatsApp", "ChatGPT", "Claude", "Perplexity", "DeepSeek"] if ai else ["WhatsApp"])
            ids.append(p)
        for i, p in enumerate(ids):
            if i + 1 < len(ids):
                rel(p, ids[i + 1], "upsell", 1, "the next tier up in the same family")
            if i:
                rel(p, ids[i - 1], "downsell", 1, "the tier below, offered in a save journey")

    # Postpaid Klass carries its contract term as the variant, which is what a postpaid
    # customer actually chooses.
    post_ids = []
    for slug, title, price, data, social, ai, mins, sms, days, demo in C.KLASS_POSTPAID:
        p = add_product(
            pid("plan", slug), title,
            allowance(data, mins, sms, days, social, ai) + ", billed monthly",
            "Mobile>Plans>Postpaid Klass", C.BRAND, "plan", price, stock=9999, family="Klass",
            tags=["klass", "postpaid", "5g"], demo=demo, validity_days=days, data_gb=data,
            social_gb=social, ai_gb=ai, minutes=mins, sms=sms, free_apps=["WhatsApp"])
        post_ids.append(p)
        for term, disc in (("No contract", 0.00), ("12 months", 0.10), ("24 months", 0.18)):
            add_variant(f"{p}-{term.split()[0].lower()}m" if term != "No contract" else f"{p}-nocontract",
                        p, f"{title}, {term}", price, round(price * (1 - disc), 2), 9999, size=term)
    for i, p in enumerate(post_ids):
        if i + 1 < len(post_ids):
            rel(p, post_ids[i + 1], "upsell", 1, "the next postpaid tier")
        if i:
            rel(p, post_ids[i - 1], "downsell", 1, "the tier below")

    # Archived tariffs. is_active FALSE and kept, so the archive page has real data and a
    # message can still resolve an inactive product by id.
    for slug, title, price, data, social, ai, mins, sms, days, ussd in C.ARCHIVE:
        add_product(pid("plan", slug), title,
                    allowance(data, mins, sms, days) + ", withdrawn from sale",
                    "Mobile>Plans>Archive", C.BRAND, "plan", price, stock=9999,
                    family="Archive", tags=["archive", "prepaid"], demo=True, active=False,
                    ussd_code=ussd, validity_days=days, data_gb=data, minutes=mins, sms=sms)

    # Alternatives across families at a similar price point: the sibling a shopper compares to.
    plans = [p for p in products if p["product_type"] == "plan" and p["is_active"]]
    for a in plans:
        near = sorted((b for b in plans if b["family"] != a["family"]),
                      key=lambda b: abs(float(b["price"]) - float(a["price"])))[:2]
        for r, b in enumerate(near, start=1):
            rel(a["product_id"], b["product_id"], "alternative", r,
                "similar money, different family")


# =========================================================================================
# Internet, add-ons, services
# =========================================================================================
def build_packs():
    ladders = []
    for path, rows, tag in (("Mobile>Internet>Daily", C.INTERNET_DAILY, "daily"),
                            ("Mobile>Internet>Weekly", C.INTERNET_WEEKLY, "weekly"),
                            ("Mobile>Internet>Monthly", C.INTERNET_MONTHLY, "monthly")):
        ids = []
        for slug, title, price, data, days in rows:
            desc = ("Unlimited data overnight, " if data is None else f"{data:g} GB, ") + f"{days} days"
            p = add_product(pid("pack", slug), title, desc, path, C.BRAND, "internet", price,
                            family="Internet", tags=["internet", tag], demo=True,
                            validity_days=days, data_gb=data)
            add_variant(p, p, f"{title} ({data:g} GB / {days} days)" if data else title,
                        price, price, 9999, size=(f"{data:g} GB / {days} days" if data else f"{days} days"))
            ids.append(p)
        ladders.append(ids)

    for slug, title, price, speed in C.INTERNET_UNLIMITED:
        p = add_product(pid("pack", slug), title, f"Unlimited data at up to {speed} Mbps, 28 days",
                        "Mobile>Internet>Unlimited", C.BRAND, "internet", price,
                        family="Internet", tags=["internet", "unlimited"], demo=True,
                        validity_days=28, speed_mbps=speed)
        add_variant(p, p, title, price, price, 9999, size=f"{speed} Mbps / 28 days")

    for slug, title, price, data, apps in C.SOCIAL_AI:
        free = price == 0
        p = add_product(pid("pack", slug), title,
                        f"{data:g} GB for {', '.join(apps)}, 28 days" + (", free of charge" if free else ""),
                        "Mobile>Internet>Social and AI", C.BRAND, "internet", price,
                        family="Internet", tags=["internet", "social", "free" if free else "paid"],
                        demo=True, validity_days=28, data_gb=data, social_gb=data,
                        ai_gb=data if "AI" in title or "ChatGPT" in apps else None, free_apps=apps)
        add_variant(p, p, title, price, price, 9999, size=f"{data:g} GB / 28 days")

    for slug, title, price, n in C.SMS_PACKS:
        p = add_product(pid("addon", slug), title, f"{n} SMS countrywide, 28 days",
                        "Mobile>Add-ons>SMS", C.BRAND, "addon", price, family="SMS",
                        tags=["addon", "sms"], demo=True, validity_days=28, sms=n)
        add_variant(p, p, title, price, price, 9999, size=f"{n} SMS / 28 days")

    for slug, title, price, n, scope in C.MINUTE_PACKS:
        label = "unlimited minutes" if n >= UNL else f"{n} minutes"
        p = add_product(pid("addon", slug), title, f"{label} {scope}, 28 days",
                        "Mobile>Add-ons>Minutes", C.BRAND, "addon", price, family="Minutes",
                        tags=["addon", "minutes", scope], demo=True, validity_days=28, minutes=n)
        add_variant(p, p, title, price, price, 9999, size=f"{label} / 28 days")

    for slug, title, price in C.NETWORK_ADDONS:
        free = price == 0
        add_product(pid("addon", slug), title,
                    f"{title} on your line" + (", free of charge" if free else f", {money(price)} per month"),
                    "Mobile>Add-ons>Network", C.BRAND, "addon", price, family="Network",
                    tags=["addon", "network", "free" if free else "paid"], demo=True)

    for slug, title, price in C.CALL_SERVICES:
        free = price == 0
        add_product(pid("svc", slug), title,
                    f"{title}" + (", free of charge" if free else f", {money(price)} per month"),
                    "Mobile>Services>Calls", C.BRAND, "service", price, family="Calls",
                    tags=["service", "calls", "free" if free else "paid"], demo=True)

    # Ladders inside each pack group, and what a pack renews into.
    for ids in ladders:
        for i, p in enumerate(ids):
            if i + 1 < len(ids):
                rel(p, ids[i + 1], "upsell", 1, "the bigger pack in the same period")
            if i:
                rel(p, ids[i - 1], "downsell", 1, "the smaller pack")
    rel("pack-net-1gb-1d", "pack-net-1gb-7d", "renews_to", 1, "a daily habit is cheaper weekly")
    rel("pack-net-5gb-7d", "pack-net-10gb-28d", "renews_to", 1, "a weekly habit is cheaper monthly")


# =========================================================================================
# Roaming, numbers and SIM
# =========================================================================================
def build_roaming():
    for zslug, zname, mult in C.ZONES:
        ids = []
        for sslug, sname, gb, base in C.ROAM_SIZES:
            price = round(base * mult, 2)
            p = add_product(f"roam-{zslug}-{sslug}", f"{zname} roaming {sname}",
                            f"{sname} of data while roaming in {zname}",
                            "Mobile>Roaming>Internet", C.BRAND, "roaming", price,
                            family="Roaming", tags=["roaming", "internet", zslug], demo=True,
                            data_gb=gb, roaming_zone=zname)
            for days in (7, 14):
                add_variant(f"{p}-{days}d", p, f"{zname} roaming {sname}, {days} days",
                            price if days == 7 else round(price * 1.6, 2),
                            price if days == 7 else round(price * 1.6, 2), 9999,
                            size=f"{zname} / {days} days")
            ids.append(p)
        for i, p in enumerate(ids):
            if i + 1 < len(ids):
                rel(p, ids[i + 1], "upsell", 1, "more data in the same zone")

        for days, base in C.ROAM_ALLIN:
            price = round(base * mult, 2)
            p = add_product(f"roam-allin-{zslug}-{days}d", f"{zname} all in one, {days} days",
                            f"Data, minutes and SMS in {zname} for {days} days",
                            "Mobile>Roaming>All-in-one", C.BRAND, "roaming", price,
                            family="Roaming", tags=["roaming", "all-in-one", zslug], demo=True,
                            roaming_zone=zname, validity_days=days)
            add_variant(p, p, f"{zname} all in one, {days} days", price, price, 9999,
                        size=f"{zname} / {days} days")

    for slug, title, price, n in C.ROAM_CALLS + C.ROAM_SMS:
        p = add_product(pid("roam", slug), title, f"{title} in any roaming zone, 30 days",
                        "Mobile>Roaming>Calls and SMS", C.BRAND, "roaming", price,
                        family="Roaming", tags=["roaming", "calls" if "minute" in title else "sms"],
                        demo=True, validity_days=30)
        add_variant(p, p, title, price, price, 9999, size="Any zone / 30 days")

    p = add_product("roam-travelsim", "TravelSIM",
                    "A local data SIM for your destination, delivered before you fly",
                    "Mobile>Roaming>TravelSIM", C.BRAND, "roaming", 12.99, family="Roaming",
                    tags=["roaming", "travelsim", "esim-capable"], demo=True)
    for dest in C.TRAVELSIM_DESTINATIONS:
        add_variant(f"{p}-{dest.lower().replace(' ', '-')}", p, f"TravelSIM for {dest}",
                    12.99, 12.99, 9999, size=dest)
    for zslug, zname, _ in C.ZONES:
        rel(f"roam-{zslug}-3gb", "roam-travelsim", "alternative", 1,
            "the local SIM answer to the same trip")


def build_numbers():
    for slug, title, kind, price in C.NUMBERS_SIM:
        tags = [kind]
        if kind == "esim":
            tags.append("esim-capable")
        p = add_product(pid(kind if kind in ("sim", "esim") else "number", slug), title,
                        f"{title} on the D·TELCO network", "Mobile>Numbers and SIM", C.BRAND,
                        kind, price, family="Numbers", tags=tags, demo=True)
    rel("sim-physical", "esim-swap", "cross_sell", 1, "a physical SIM owner can move to eSIM")
    rel("esim-new", "sim-physical", "alternative", 1, "the same line, a different form")
    rel("number-mnp", "plan-go-17-99", "cross_sell", 1, "a switcher needs a plan on arrival")


# =========================================================================================
# Devices and accessories
# =========================================================================================
OUT_OF_STOCK = {"dev-iphone-17-pro-max", "dev-galaxy-s25-ultra", "dev-pixel-10-pro",
                "acc-buds-airpods-pro-3", "acc-power-magnetic-5000", "dev-apple-watch-s11"}


def build_devices():
    groups = [("Shop>Phones", C.PHONES, "device"), ("Shop>Tablets", C.TABLETS, "device"),
              ("Shop>Wearables", C.WEARABLES, "device"), ("Shop>Routers and modems", C.ROUTERS, "device")]
    for path, rows, ptype in groups:
        for slug, title, maker, price, sizes, colors in rows:
            product_id = pid("dev", slug)
            stock = 0 if product_id in OUT_OF_STOCK else det(product_id, 3, 60)
            instal = [12, 18] if price >= 200 else [12]
            add_product(product_id, title,
                        f"{title} from {maker}. Pay once or spread it over "
                        f"{' or '.join(str(m) for m in instal)} months.",
                        path, maker, ptype, price, stock=stock, family=maker,
                        tags=["device", maker.lower(), "5g", f"instalment-{max(instal)}m"],
                        demo=True, instalment_months=instal)
            for si, size in enumerate(sizes):
                for color in colors:
                    vid = f"{product_id}-{size.lower().replace(' ', '')}-{color.lower().replace(' ', '-')}"
                    vprice = round(price * (1 + 0.14 * si), 2)
                    vstock = 0 if stock == 0 else max(0, det(vid, 0, stock))
                    add_variant(vid, product_id, f"{title} {size} {color}", vprice, vprice,
                                vstock, size=size, color=color, gender="unisex",
                                image_slug=f"{product_id}-{color.lower().replace(' ', '-')}")
            # The upgrade story: the newer model in the same family, for an owner of the old one.
    for path, rows, _ in groups:
        for i in range(len(rows) - 1):
            a, b = rows[i], rows[i + 1]
            if a[2] == b[2]:
                rel(pid("dev", a[0]), pid("dev", b[0]), "upgrade_of", 1,
                    "offered to the owner of the older model at contract end")
                rel(pid("dev", b[0]), pid("dev", a[0]), "downsell", 2, "the same family, less money")

    for slug, title, maker, price, kind, colors, fits in C.ACCESSORIES:
        product_id = pid("acc", slug)
        stock = 0 if product_id in OUT_OF_STOCK else det(product_id, 5, 120)
        add_product(product_id, title, f"{title}. Fits straight out of the box.",
                    "Shop>Accessories", maker, "accessory", price, stock=stock, family=maker,
                    tags=["accessory", kind, maker.lower()], demo=True)
        for color in colors:
            vid = f"{product_id}-{color.lower().replace(' ', '-')}"
            add_variant(vid, product_id, f"{title} {color}", price, price,
                        0 if stock == 0 else max(0, det(vid, 0, stock)),
                        size="One size", color=color, gender="unisex",
                        image_slug=f"{product_id}-{color.lower().replace(' ', '-')}")
        for phone in fits:
            rel(pid("dev", phone), product_id, "cross_sell",
                {"case": 1, "screen": 2, "charger": 3, "earbuds": 4, "powerbank": 5}[kind],
                "goes in the basket with the phone")
            rel(product_id, pid("dev", phone), "compatible_with", 1, "made for this handset")

    # eSIM works with anything modern in this catalogue.
    for slug, *_ in C.PHONES[:24]:
        rel("esim-new", pid("dev", slug), "compatible_with", 1, "eSIM capable handset")


# =========================================================================================
# Home and bundles
# =========================================================================================
def build_home():
    ids = []
    for slug, title, price, mbps in C.FIBER:
        p = add_product(pid("fixed", slug), title,
                        f"Fiber to the home at {mbps} Mbps, unlimited data, billed monthly",
                        "Home>Fiber", C.BRAND, "fixed", price, family="Fiber",
                        tags=["fixed", "fiber"], demo=True, speed_mbps=mbps)
        add_variant(p, p, title, price, price, 9999, size=f"{mbps} Mbps")
        ids.append(p)
    for i, p in enumerate(ids):
        if i + 1 < len(ids):
            rel(p, ids[i + 1], "upsell", 1, "the faster line")
        if i:
            rel(p, ids[i - 1], "downsell", 1, "the slower line, less money")

    for slug, title, price, gb in C.WIFI_PACKS:
        p = add_product(pid("fixed", slug), title, f"{gb} GB of D·TELCO Wi-Fi, valid 30 days",
                        "Home>Wi-Fi packages", C.BRAND, "fixed", price, family="Wi-Fi",
                        tags=["fixed", "wifi"], demo=True, data_gb=gb, validity_days=30)
        add_variant(p, p, title, price, price, 9999, size=f"{gb} GB / 30 days")

    for slug, title, maker, price in C.HOME_DEVICES:
        product_id = pid("dev", slug)
        stock = det(product_id, 4, 40)
        add_product(product_id, title, f"{title} for a D·TELCO home line.",
                    "Home>Devices", maker, "device", price, stock=stock, family="Home",
                    tags=["device", "home"], demo=True)
        add_variant(product_id, product_id, title, price, price, stock, size="One size",
                    color="White", gender="unisex")
    rel("fixed-fiber-300", "dev-home-mesh", "cross_sell", 1, "a bigger flat needs a second node")
    rel("fixed-fiber-1000", "dev-home-mesh", "cross_sell", 1, "a bigger flat needs a second node")
    rel("fixed-fiber-100", "dev-home-ont", "requires", 1, "the line needs a terminal")


def build_bundles():
    for slug, title, phone, plan, price, months in C.DEVICE_PLAN_BUNDLES:
        dev, pl = pid("dev", phone), pid("plan", plan)
        p = add_product(slug, title,
                        f"{title}, with {months} months of included data on the plan",
                        "Bundles>Device plus plan", C.BRAND, "bundle", price, family="Bundles",
                        tags=["bundle", f"bundle-member:{slug}", "instalment-18m"], demo=True,
                        instalment_months=[12, 18])
        for member in (dev, pl):
            rel(p, member, "bundle_contains", 1, "a line of the bundle")
            bundle_items.append(dict(bundle_id=p, product_id=member, quantity=1,
                                     note=f"{months} months included data"))
        rel(dev, p, "cross_sell", 6, "the same handset, cheaper with a plan")
        rel(pl, p, "cross_sell", 6, "the same plan, with a handset")
        add_variant(p, p, title, price, price, 9999, size=f"{months} months included data")

    for slug, title, lines, plan, price in C.FAMILY_BUNDLES:
        pl = pid("plan", plan)
        p = add_product(slug, title, f"{lines} lines on one bill, each on {title.split()[0]} terms",
                        "Bundles>Family", C.BRAND, "bundle", price, family="Bundles",
                        tags=["bundle", "family"], demo=True)
        rel(p, pl, "bundle_contains", 1, f"{lines} lines")
        bundle_items.append(dict(bundle_id=p, product_id=pl, quantity=lines, note="one bill"))
        rel(pl, p, "cross_sell", 7, "cheaper per line once there are two")
        add_variant(p, p, title, price, price, 9999, size=f"{lines} lines")

    for slug, title, fiber, plan, price in C.CONVERGENCE_BUNDLES:
        fb, pl = pid("fixed", fiber), pid("plan", plan)
        p = add_product(slug, title, "Home and mobile on one bill, at a lower price than apart",
                        "Bundles>Convergence", C.BRAND, "bundle", price, family="Bundles",
                        tags=["bundle", "convergence"], demo=True)
        for member in (fb, pl):
            rel(p, member, "bundle_contains", 1, "a line of the bundle")
            bundle_items.append(dict(bundle_id=p, product_id=member, quantity=1, note=None))
        rel(fb, p, "cross_sell", 1, "add the mobile line and pay less for both")
        add_variant(p, p, title, price, price, 9999, size="Home plus mobile")

    for slug, title, plan, roam, price in C.TRAVEL_BUNDLES:
        pl = pid("plan", plan)
        p = add_product(slug, title, "A plan and the roaming pack that fits the trip",
                        "Bundles>Travel", C.BRAND, "bundle", price, family="Bundles",
                        tags=["bundle", "travel"], demo=True)
        for member in (pl, roam):
            rel(p, member, "bundle_contains", 1, "a line of the bundle")
            bundle_items.append(dict(bundle_id=p, product_id=member, quantity=1, note=None))
        rel(roam, p, "cross_sell", 1, "the trip, with the plan behind it")
        add_variant(p, p, title, price, price, 9999, size="Plan plus roaming")


def build_plan_requirements_and_cross_sell():
    """The operator rule: a GO plan needs an internet package. Every requires has to be
    satisfied by at least one in stock product, which A16 layer 1 checks."""
    for slug, *_ in C.GO:
        p = pid("plan", slug)
        for r, pack in enumerate(("pack-net-5gb-28d", "pack-net-10gb-28d", "pack-net-20gb-28d"), 1):
            rel(p, pack, "requires", r, "a GO plan carries a mandatory internet package")
    plans = [p["product_id"] for p in products if p["product_type"] == "plan" and p["is_active"]]
    for p in plans:
        rel(p, "pack-social-3gb", "cross_sell", 1, "social media without the data cost")
        rel(p, "pack-free-ai", "cross_sell", 2, "free AI, included at no charge")
        rel(p, "roam-europe-1gb", "cross_sell", 3, "the pack for the next trip")


# =========================================================================================
# Emit
# =========================================================================================
PRODUCT_HEADER = ["publish_date","is_active","stock_count","price","discounted_price",
                  "product_id","title","description","category_path","brand","link",
                  "mobile_web_link","android_deep_link","ios_deep_link","image_link",
                  "small_image_link","large_image_link","store_name","parent_id",
                  "trans_title","tags"]
VARIANT_HEADER = ["stock_count","price","discounted_price","product_variant_id","product_id",
                  "title","image_link","small_image_link","large_image_link","size","color",
                  "gender","age_interval","store_name"]


def img(slug, size):
    return f"{ORIGIN}assets/catalog/{slug}-{size}.jpg"


def product_row(p):
    return [p["publish_date"].strftime("%d-%m-%Y %H:%M"),
            "TRUE" if p["is_active"] else "FALSE",
            p["stock_count"], money(p["price"]), money(p["discounted_price"]),
            p["product_id"], p["title"], p["description"], p["category_path"], p["brand"],
            ORIGIN + p["link_path"], ORIGIN + p["link_path"],
            f"dtelco://product/{p['product_id']}", ORIGIN + p["link_path"],
            img(p["image_slug"], 1200), img(p["image_slug"], 400), img(p["image_slug"], 1600),
            p["store_name"], p["parent_id"] or "", p["title"], ",".join(p["tags"])]


def variant_row(v):
    return [v["stock_count"] if v["stock_count"] is not None else "",
            money(v["price"]), money(v["discounted_price"]),
            v["product_variant_id"], v["product_id"], v["title"],
            img(v["image_slug"], 1200), img(v["image_slug"], 400), img(v["image_slug"], 1600),
            v["size"] or "", v["color"] or "", v["gender"] or "", v["age_interval"] or "",
            v["store_name"]]


def write_csv(path, header, rows):
    """UTF-8 with a byte order mark and CRLF, mirroring the Magento export Dengage supplied.
    The first test upload settles it if their importer wants something else."""
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
        w.writerow(header)
        w.writerows(rows)


def sql_str(v):
    if v is None or v == "":
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, datetime):
        return "'" + v.strftime("%Y-%m-%d %H:%M:%S") + "'"
    if isinstance(v, (list, tuple)):
        inner = ",".join('"' + str(x).replace('"', '\\"') + '"' for x in v)
        return "'{" + inner + "}'"
    return "'" + str(v).replace("'", "''") + "'"


def emit_seed(path):
    cols_p = ["product_id","title","description","category_path","brand","product_type","family",
              "price","discounted_price","stock_count","is_active","publish_date","store_name",
              "parent_id","tags","link_path","image_slug","ussd_code","validity_days","data_gb",
              "social_gb","ai_gb","minutes","sms","roaming_zone","speed_mbps","instalment_months",
              "free_apps","demo_data"]
    cols_v = ["product_variant_id","product_id","title","price","discounted_price","stock_count",
              "size","color","gender","age_interval","store_name","image_slug"]
    out = ["-- Generated by tools/build-catalogue.py. Do not edit by hand: edit tools/catalogue.py",
           "-- and rebuild, so the CSVs, the JSON feed and these rows can never disagree.",
           "begin;"]
    out.append(f"insert into public.dtelco_product ({','.join(cols_p)}) values")
    out.append(",\n".join("(" + ",".join(sql_str(p.get(c)) for c in cols_p) + ")" for p in products)
               + "\non conflict (product_id) do update set "
               + ",".join(f"{c}=excluded.{c}" for c in cols_p if c != "product_id") + ";")
    out.append(f"insert into public.dtelco_product_variant ({','.join(cols_v)}) values")
    out.append(",\n".join("(" + ",".join(sql_str(v.get(c)) for c in cols_v) + ")" for v in variants)
               + "\non conflict (product_variant_id) do update set "
               + ",".join(f"{c}=excluded.{c}" for c in cols_v if c != "product_variant_id") + ";")
    out.append("insert into public.dtelco_product_relation (from_product_id,to_product_id,relation,rank,note) values")
    out.append(",\n".join("(" + ",".join(sql_str(r[c]) for c in
               ("from_product_id","to_product_id","relation","rank","note")) + ")" for r in relations)
               + "\non conflict (from_product_id,to_product_id,relation) do nothing;")
    out.append("insert into public.dtelco_bundle_item (bundle_id,product_id,quantity,note) values")
    out.append(",\n".join("(" + ",".join(sql_str(b[c]) for c in
               ("bundle_id","product_id","quantity","note")) + ")" for b in bundle_items)
               + "\non conflict (bundle_id,product_id) do nothing;")
    out.append("commit;")
    open(path, "w").write("\n".join(out) + "\n")


def check():
    """Brief A16 layer 1, run here so a broken catalogue never reaches an upload."""
    ids = {p["product_id"] for p in products}
    fails = []
    active = [p for p in products if p["is_active"]]
    if len(active) != 241:
        fails.append(f"active products {len(active)}, expected 241")
    vids = [v["product_variant_id"] for v in variants]
    if len(vids) != len(set(vids)):
        fails.append("duplicate product_variant_id")
    covered = {v["product_id"] for v in variants}
    missing = ids - covered
    if missing:
        fails.append(f"products with no variant: {sorted(missing)[:5]}")
    for v in variants:
        if v["product_id"] not in ids:
            fails.append(f"variant {v['product_variant_id']} points at a missing product")
    for r in relations:
        if r["from_product_id"] not in ids or r["to_product_id"] not in ids:
            fails.append(f"relation points at a missing id: {r['from_product_id']} -> {r['to_product_id']}")
    bundles = [p["product_id"] for p in products if p["product_type"] == "bundle"]
    for b in bundles:
        if not [x for x in bundle_items if x["bundle_id"] == b]:
            fails.append(f"bundle with no members: {b}")
    stock = {p["product_id"]: p["stock_count"] for p in products}
    for r in relations:
        if r["relation"] == "requires" and not stock.get(r["to_product_id"], 0):
            fails.append(f"requires not satisfiable in stock: {r['to_product_id']}")
    for p in products:
        if len(p["tags"]) != len(set(p["tags"])):
            fails.append(f"duplicated tag on {p['product_id']}: {p['tags']}")
        if not p["category_path"] or ">" not in p["category_path"]:
            fails.append(f"no category path: {p['product_id']}")
        if p["stock_count"] is None:
            fails.append(f"null stock_count: {p['product_id']}")
    for dev in (p for p in products if p["product_type"] == "device"
                and p["category_path"] == "Shop>Phones"):
        vs = [v for v in variants if v["product_id"] == dev["product_id"]]
        if not all(v["size"] and v["color"] for v in vs):
            fails.append(f"phone without storage and colour variants: {dev['product_id']}")
    return fails


def main():
    build_plans(); build_packs(); build_roaming(); build_numbers()
    build_devices(); build_home(); build_bundles()
    build_plan_requirements_and_cross_sell()
    solo_variants()

    fails = check()
    for f in fails:
        print("FAIL", f)

    os.makedirs(f"{ROOT}/handoff", exist_ok=True)
    os.makedirs(f"{ROOT}/data", exist_ok=True)
    os.makedirs(f"{ROOT}/supabase/seed", exist_ok=True)
    prows = [product_row(p) for p in sorted(products, key=lambda p: (p["category_path"], p["product_id"]))]
    vrows = [variant_row(v) for v in sorted(variants, key=lambda v: (v["product_id"], v["product_variant_id"]))]
    write_csv(f"{ROOT}/handoff/dtelco-product.csv", PRODUCT_HEADER, prows)
    write_csv(f"{ROOT}/handoff/dtelco-product_variant.csv", VARIANT_HEADER, vrows)
    sample_p = next(r for r in prows if r[5] == "plan-go-11-99")
    sample_v = next(r for r in vrows if r[3] == "dev-iphone-16-128gb-black")
    write_csv(f"{ROOT}/handoff/dtelco-product.test.csv", PRODUCT_HEADER, [sample_p])
    write_csv(f"{ROOT}/handoff/dtelco-product_variant.test.csv", VARIANT_HEADER, [sample_v])
    emit_seed(f"{ROOT}/supabase/seed/0100_dtelco_catalogue_seed.sql")

    # A synchronous index, so a parameterised product page can fire a COMPLETE pageView.
    # The feed is async, and pageView must not wait on it: a page whose pageView never fires
    # writes rows belonging to no identifiable demo. Without this the row would carry only the
    # product id from the query string, and category_path and price would have to be omitted,
    # which is correct but loses the two fields a category segment needs most.
    idx = {p["product_id"]: [p["category_path"], float(p["discounted_price"]),
                             p["stock_count"], p["product_type"]] for p in products}
    with open(f"{ROOT}/js/catalog-index.js", "w", encoding="utf-8") as fh:
        fh.write("/* Generated by tools/build-catalogue.py. Loaded synchronously in the head so\n"
                 " * a product page can fire a complete pageView before the feed has arrived.\n"
                 " * [category_path, price, stock_count, product_type] per product id. */\n")
        fh.write("window.DTELCO_INDEX=" + json.dumps(idx, separators=(",", ":")) + ";\n")
    feed = dict(generated_from="tools/catalogue.py", origin=ORIGIN, currency="USD",
                products=[{**p, "publish_date": p["publish_date"].isoformat()} for p in products],
                variants=variants, relations=relations, bundle_items=bundle_items)
    json.dump(feed, open(f"{ROOT}/data/catalogue.json", "w"), indent=1, default=str)

    print(f"products {len(products)} ({len(products) - len([p for p in products if p['is_active']])} archived)")
    print(f"variants {len(variants)}  relations {len(relations)}  bundle members {len(bundle_items)}")
    print(f"checks {'all passed' if not fails else str(len(fails)) + ' FAILED'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
