"""Emit the paste ready panel content pack from one data structure.

Reads panel/contents.json for the copy every channel shares and tools/message-content.py for the
part only an email has, and writes one file per moment per channel under panel/<lane>/<channel>/,
where the lane is the moment's route: transactional for a service event sent the second it
happens through /transactional/*, campaign for everything a journey or campaign sends. Nothing
here is typed twice: change a sentence in contents.json and every channel that uses it changes
together, and the folder itself answers which message goes which way.

The output is what a person pastes into the panel, so it is Dengage's template language rather
than the {token} shorthand the source files use. The two are mechanically related, which is the
point: the translation is checkable, and tools/preview-emails.mjs checks it.
"""
import json
import os
import re
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = f"{ROOT}/panel"

spec = importlib.util.spec_from_file_location("mc", f"{ROOT}/tools/message-content.py")
mc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mc)

BRAND = "D·TELCO"
RECO_ID = "reco_for_you"
RED, HOT, INK, MID, LINE, PINK = "#E4002B", "#FF2E52", "#14161a", "#5a6270", "#e4e7ec", "#FFF0F3"
WORDMARK = mc.ASSETS + "brand/wordmark.png"

TOKEN = re.compile(r"\{(\w+)\}")


def tag(token: str) -> str:
    """One {token} as Dengage prints it. A fallback only where a generic word is honest."""
    fb = mc.FALLBACKS.get(token)
    return f"{{%= $Current.{token} || '{fb}' %}}" if fb else f"{{%= $Current.{token} %}}"


def lookup(token: str) -> str:
    """One {token} on the recommendation moment, as the documented Data Space query.

    reference/advanced-personalization gives .value(column) for exactly this shape: "get the given
    column value for the first row. If you know that the result is one row and a single column
    value, you can use this." The table name and the column names are case sensitive, so both are
    written as reference/upsertproduct writes them.
    """
    slot, column = mc.LOOKUP[token]
    return (f'{{%= $from("product").where("product_id", "=", '
            f'$Contact.reco_product_id_{slot}).value("{column}") %}}')


def render(text: str, reads: str = "current") -> str:
    """Translate {token} shorthand into what a person pastes into the panel.

    Two vocabularies, and which one applies is a property of the moment rather than of the token.
    A moment that reads the audience prints $Current. The one moment that reads the contact
    resolves its picks against the catalogue. A token in neither vocabulary is a typo, and raising
    here is how it gets found before it ships as a blank in somebody's inbox.
    """
    def one(m):
        token = m.group(1)
        if reads == "contact" and token in mc.LOOKUP:
            return lookup(token)
        if token in mc.LOOKUP:
            raise SystemExit(f"{token} is a lookup token and only a contact reading moment may use it")
        return tag(token)
    return TOKEN.sub(one, text)


def tokens(text: str) -> set:
    return set(TOKEN.findall(text or ""))


def row(label: str, token: str) -> str:
    """A detail row that prints only when its value was sent.

    The condition is the whole point. A row reading "Price:" with nothing after it is worse than
    no row, and a price invented to fill it is worse than both.
    """
    return (
        f"{{% if ($Current.{token}) {{ %}}"
        f'<tr><td style="padding:7px 0;color:{MID};font-size:13px;">{label}</td>'
        f'<td style="padding:7px 0;color:{INK};font-size:13px;font-weight:600;text-align:right;">'
        f"{{%= $Current.{token} %}}</td></tr>"
        f"{{% }} %}}"
    )


def frame(moment: dict, spec_: dict, hero: str, middle: str, reads: str = "current") -> str:
    """The parts every body shares: the wordmark, the hero, the headline, the button, the footer.

    Only the middle differs. Nineteen bodies put a conditional detail table there; the twentieth
    puts a recommendation rail resolved from the contact. Sharing the frame is what keeps the
    twentieth from quietly drifting into a different brand.
    """
    e = moment["email"]
    subject = render(e["subject"], reads)
    pre = render(e.get("preheader", ""), reads)
    cta_label, cta_token = spec_["cta"]

    how = ("Paste the whole file. This body takes no values: it reads the contact and resolves\n"
           "     each id against the product table, so it runs on marketing sends only and blocks\n"
           "     its own send when nothing resolves."
           if reads == "contact" else
           f"Paste the whole file. Values marked always in panel/values/{moment['id']}.json must be\n"
           "     sent on every call; the detail rows print only when their value is sent.")

    return f"""<!-- {BRAND} email: {moment['id']} ({moment['lane']} lane, journey {moment['journey']})
     Subject: {subject}
     Trigger: {moment['trigger']}
     {how} -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#f7f8fa;margin:0;padding:24px 0;">
<tr><td align="center">

<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{pre}</span>

<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
       style="width:520px;max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;
              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <tr><td style="background:{RED};padding:16px 24px;">
    <img src="{WORDMARK}" width="120" alt="{BRAND}" style="display:block;border:0;height:auto;">
  </td></tr>

  <tr><td style="padding:0;">
    <img src="{hero}" width="520" alt=""
         style="display:block;border:0;width:100%;height:auto;">
  </td></tr>

  <tr><td style="padding:24px 24px 0;">
    <h1 style="margin:0 0 10px;font-size:22px;line-height:1.25;color:{INK};font-weight:700;">
      {render(spec_['headline'], reads)}</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:{MID};">
      {render(spec_['lead'], reads)}</p>
  </td></tr>

{middle}

  <tr><td style="padding:22px 24px 26px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="background:{RED};border-radius:8px;">
        <a href="{tag(cta_token)}"
           style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;
                  color:#ffffff;text-decoration:none;">{cta_label}</a>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="background:{PINK};padding:16px 24px;">
    <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:{MID};">
      Sent by {BRAND} through Dengage. This is a demonstration message: prices and figures are demo
      data unless they name a published tariff.</p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:{MID};">
      <a href="{{{{unsubscribe-link}}}}" style="color:{RED};">Unsubscribe</a></p>
  </td></tr>

</table>
</td></tr>
</table>
"""


COUPON_SLOT = """  <!-- COUPON SLOT: {token}
       On a transactional send this value travels in the call and every recipient gets the same
       code. On the journey, replace each {{%= $Current.{token} %}} below with a coupon list, so
       every recipient gets a code of their own and Dengage marks it taken.
       docs/coupon: in the Email Rich Text Editor click Insert > Customization Tags, open the
       Coupons tab that appears on the right, and click the list. The tag it inserts is not printed
       in the documentation, which is why this is a marked slot rather than a guess.
       panel/coupons/README.md holds the whole procedure and the list to point at. -->"""


def email_html(moment: dict, spec_: dict) -> str:
    rows = "".join(row(label, token) for label, token in spec_["rows"])
    slot = (COUPON_SLOT.format(token=spec_["coupon"]) + "\n") if spec_.get("coupon") else ""
    middle = slot + f"""  <tr><td style="padding:0 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-top:1px solid {LINE};border-bottom:1px solid {LINE};">
      {rows}
    </table>
  </td></tr>"""
    return frame(moment, spec_, "{%= $Current.hero_image %}", middle)


def reco_html(moment: dict, spec_: dict) -> str:
    """The one body that reads the contact, and the only one Dengage resolves rather than the call.

    Every line of the preamble comes from reference/advanced-personalization. $from queries a table
    in the data space by its case sensitive name; .where repeats; .first() returns the row. The
    table is product because reference/upsertproduct says "Product information should be inserted
    into the product table". $blockSend cancels the send for one contact rather than delivering an
    empty rail, which is what makes this safe to schedule against a whole segment.

    One query per slot rather than one query for all three. A single .where holding three values
    would lose the order the site chose, and the order is the claim: the same three, in the same
    order, as the rail the visitor saw.
    """
    slots = spec_["slots"]
    picks = "\n".join(
        '  var p{n} = $Contact.reco_product_id_{n} ? $from("product")'
        '.where("product_id", "=", $Contact.reco_product_id_{n}).first() : null;\n'
        '  if (p{n}) {{ picks.push(p{n}); }}'.format(n=n)
        for n in range(1, slots + 1))

    preamble = ("{%\n"
                "  var picks = [];\n"
                + picks + "\n"
                '  if (picks.length === 0) { $blockSend("' + spec_["blocked"] + '"); }\n'
                "%}")

    card = (
        '      {% for (var i = 0; i < picks.length; i++) { %}\n'
        '      <tr>\n'
        '        <td width="96" style="padding:12px 0;vertical-align:top;">\n'
        '          <a href="{%= picks[i].link %}"><img src="{%= picks[i].image_link %}" width="80"\n'
        '             alt="" style="display:block;border:0;width:80px;height:auto;border-radius:8px;"></a>\n'
        '        </td>\n'
        '        <td style="padding:12px 0;vertical-align:top;">\n'
        '          <a href="{%= picks[i].link %}"\n'
        '             style="font-size:14px;font-weight:700;color:' + INK + ';text-decoration:none;">'
        '{%= picks[i].title %}</a>\n'
        '          <div style="padding-top:4px;font-size:13px;color:' + MID + ';">'
        '$' '{%= picks[i].discounted_price %}</div>\n'
        '        </td>\n'
        '      </tr>\n'
        '      {% } %}')

    middle = (preamble + "\n\n"
              '  <tr><td style="padding:0 24px;">\n'
              '    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"\n'
              '           style="border-top:1px solid ' + LINE + ';border-bottom:1px solid ' + LINE + ';">\n'
              + card + "\n"
              '    </table>\n'
              '  </td></tr>')

    hero = f"{mc.ASSETS}{spec_['hero']}-1200.jpg"
    return frame(moment, spec_, hero, middle, reads="contact")


def reco_values(moment: dict, spec_: dict) -> dict:
    """What this body needs, and it is not a list of values to pass.

    Every other values file answers "what must the call carry". This one answers "what must be true
    of the contact and of the catalogue", because nothing here travels in a call. Saying so in the
    file is what stops somebody wiring this content id into a transactional send and getting a
    message with three holes in it.
    """
    return {
        "moment": moment["id"],
        "journey": moment["journey"],
        "trigger": moment["trigger"],
        "sends": "marketing",
        "always": [],
        "optional": [],
        "rows": [],
        "hero_image": f"{mc.ASSETS}{spec_['hero']}-1200.jpg",
        "reads": [f"$Contact.reco_product_id_{n}" for n in range(1, spec_["slots"] + 1)],
        "resolves_from": "product",
        "resolves_columns": ["product_id", "title", "discounted_price", "image_link", "link"],
        "blocks_when": spec_["blocked"],
        "note": "Marketing channels only. reference/customization-in-transactional-messages: "
                "contact columns and device data cannot be used for personalization in a "
                "transactional send, so this content id must never be passed to /transactional/*. "
                "Push is excluded for a second reason: reference/advanced-personalization says "
                "$Contact can be null in Push sends.",
    }


def values_for(moment: dict, spec_: dict) -> dict:
    """Exactly what a call has to carry, split by whether a hole in it would show.

    Always: the subject, the preheader, the headline, the paragraph, the hero and the button.
    A transactional send sees only these, so a value missing from this list is a blank in the
    part of the message a visitor reads first.

    Optional: the detail rows. Each one is wrapped in a condition, so a value not sent simply
    does not draw its row.
    """
    e = moment["email"]
    always = set()
    for text in (e["subject"], e.get("preheader", ""), spec_["headline"], spec_["lead"]):
        always |= tokens(text)
    always.add("hero_image")
    always.add(spec_["cta"][1])

    optional = {t for _, t in spec_["rows"]} - always

    hero = spec_["hero"]
    hero_value = ("the product's own image URL, so one content serves the whole catalogue"
                  if hero == "product" else f"{mc.ASSETS}{hero}-1200.jpg")

    return {
        "moment": moment["id"],
        "journey": moment["journey"],
        "trigger": moment["trigger"],
        "always": sorted(always),
        "optional": sorted(optional),
        # Each detail row, so a reader knows what the message prints and a checker can look for
        # the row itself rather than hunting its value in the page. A two character value like a
        # day count is a substring of half the stylesheet.
        "rows": [[label, token] for label, token in spec_["rows"]],
        "hero_image": hero_value,
        **({"coupon": {
            "token": spec_["coupon"],
            "transactional": "the value travels in the call, so every recipient gets the same code",
            "journey": "insert a Dengage coupon list through Insert > Customization Tags > Coupons, "
                       "so every recipient gets a code of their own and the platform marks it taken",
            "read_the_list": "GET /contents/coupon-list/{listId}, wrapped by dtelco-coupons",
            "redemption": "Dengage issues a unique code per recipient and marks it taken. "
                          "Applying the discount is the operator's billing system",
        }} if spec_.get("coupon") else {}),
        "note": "A transactional send sees only these values. $Contact tags stay empty, so nothing "
                "the email prints comes from the contact record.",
    }


def values_for_push(moment: dict) -> dict:
    """What a transactional push call has to carry, for the moments that send no email.

    The push title and body are the whole message, so every token in them is always. The SMS and
    WhatsApp copy beside the same moment is composed and never sent, and its extra tokens are
    listed as optional so this file still describes the moment completely.
    """
    p = moment["push"]
    always = tokens(p["title"]) | tokens(p["body"])
    always.add("link")
    optional = (tokens(moment.get("sms", "")) | tokens(moment.get("whatsapp", ""))) - always
    return {
        "moment": moment["id"],
        "journey": moment["journey"],
        "trigger": moment["trigger"],
        "lane": moment["lane"],
        "always": sorted(always),
        "optional": sorted(optional),
        "rows": [],
        "note": "A transactional send sees only these values. This moment sends push only: the "
                "SMS and WhatsApp copy beside it is composed and never sent.",
    }


def push_txt(moment: dict) -> str:
    """One push content as a person pastes it, field by field.

    Text rather than JSON by decision: the panel's push editor takes a title, a message, a target
    URL and a media URL, so the file mirrors those fields and nothing else. The guardrails ride
    along as prose, because a truncated push is the most common way this channel quietly fails.
    """
    p = moment["push"]
    media = p.get("media")
    lane = moment["lane"]
    values = (f"Transactional: values travel in the call. See panel/values/{moment['id']}.json."
              if lane == "transactional" else
              "Campaign: $Current resolves from the journey's own event or audience columns.")
    lines = [
        f"D-TELCO push content: {moment['id']} [{lane}]",
        f"Trigger: {moment['trigger']} (journey {moment['journey']})",
        values,
        "Create this content twice, once on the web application and once on the Android",
        "application: they are two applications in the panel and nothing set up for one reaches",
        "the other.",
        f"Save To Inbox: {'on, expire 7 days' if moment.get('inbox') else 'off'}.",
        "",
        f"Title:      {render(p['title'])}",
        f"Message:    {render(p['body'])}",
        f"Target URL: {tag('link')}",
    ]
    if media:
        lines.append(f"Media:      {mc.ASSETS}push/{media}.jpg")
    lines += [
        "",
        f"Title {len(p['title'])} of 50 characters and message {len(p['body'])} of 120: inside "
        "what a phone truncates.",
        "The target URL is a tag rather than an address: a shared content with an address in it",
        "sends one brand's visitor to another brand's storefront.",
    ]
    return "\n".join(lines) + "\n"


def onsite_txt(entry: dict) -> str:
    """One panel side onsite experience, written once here and created in the panel."""
    lines = [
        f"D-TELCO onsite experience: {entry['id']} [{entry['lane']}]",
        f"Panel type: {entry['panel_type']}",
        f"Placement: {entry['placement']}",
        f"Trigger: {entry['trigger']}",
        "",
        f"Title: {entry['title']}",
        f"Body:  {entry['body']}",
    ]
    if entry.get("segments"):
        lines.append("Segments: " + " | ".join(entry["segments"]))
    lines += [
        f"Coupon: {entry['coupon']}",
        "",
        f"Verify: {entry['verify']}",
        "The slot rules in handoff/ONSITE-SLOTS.md apply: padding 0, transparent background,",
        "selectors namespaced under the creative root id, behaviour in onclick.",
    ]
    return "\n".join(lines) + "\n"


def moment_onsite_txt(moment: dict) -> str:
    """The onsite copy a moment carries, tokens left as {name} on purpose.

    Whether onsite content resolves $Current or $from at all is confirm item 6 in
    ACCOUNT-SETUP.md, so this file does not print a tag syntax the surface may not read. Until
    the check passes, the served creative is shown as its canvas.
    """
    o = moment["onsite"]
    return "\n".join([
        f"D-TELCO onsite copy: {moment['id']} [{moment['lane']}]",
        f"Trigger: {moment['trigger']} (journey {moment['journey']})",
        "Target one of the 13 slots in handoff/ONSITE-SLOTS.md: the slot table names the moment",
        "each one is there for. Tokens are left as {name}: whether onsite content resolves",
        "personalization tags is confirm item 6, and the creative is a canvas until it passes.",
        "",
        f"Title: {o['title']}",
        f"Body:  {o['body']}",
    ]) + "\n"


def tag_check(all_tokens) -> str:
    """The throwaway content the template model recommends sending once at yourself.

    The panel preview cannot resolve $Current, so the only way to learn which tags actually resolve
    is to fire one content that prints every value in brackets. Doing that once settles it before a
    dozen templates depend on the answer.
    """
    rows = "".join(
        f'<tr><td style="padding:4px 10px 4px 0;color:{MID};font-size:13px;">{t}</td>'
        f'<td style="padding:4px 0;font-size:13px;">[{{%= $Current.{t} %}}]</td></tr>'
        for t in sorted(all_tokens)
    )
    return f"""<!-- {BRAND} tag check. Not a message. Send this once to yourself with every value in
     panel/values/*.json filled in, and read which brackets came back empty. Delete it afterwards. -->
<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
       style="width:520px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
  <tr><td style="padding:0 0 12px;font-size:15px;font-weight:700;">$Current tag check</td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    {rows}
    <tr><td style="padding:10px 10px 4px 0;color:{MID};font-size:13px;">$Contact.name</td>
        <td style="padding:10px 0;font-size:13px;">[{{%= $Contact.name %}}]</td></tr>
    <tr><td style="padding:4px 10px 4px 0;color:{MID};font-size:13px;">unsubscribe</td>
        <td style="padding:4px 0;font-size:13px;">[{{{{unsubscribe-link}}}}]</td></tr>
  </table></td></tr>
  <tr><td style="padding:12px 0 0;color:{MID};font-size:12px;">
    $Contact is expected to come back empty on a transactional send. That is the answer, not a
    fault: everything a transactional message prints has to travel in the call.</td></tr>
</table>
"""


LANES = ("transactional", "campaign")


def main():
    contents = json.load(open(f"{ROOT}/panel/contents.json", encoding="utf-8"))
    moments = {m["id"]: m for m in contents["moments"]}

    # The lane is load bearing: it decides the folder, and the folder is the answer to "which
    # message goes which way". A moment without one would land somewhere by accident.
    for mid, m in moments.items():
        if m.get("lane") not in LANES:
            raise SystemExit(f"{mid} carries no lane. Every moment is transactional or campaign.")

    made = {"email": 0, "push": 0, "sms": 0, "whatsapp": 0, "onsite": 0, "values": 0}
    for lane in LANES:
        for name in ("email", "push", "sms", "whatsapp"):
            os.makedirs(f"{OUT}/{lane}/{name}", exist_ok=True)
    os.makedirs(f"{OUT}/campaign/onsite", exist_ok=True)
    os.makedirs(f"{OUT}/values", exist_ok=True)

    for mid, spec_ in mc.EMAIL.items():
        moment = moments[mid]
        html = email_html(moment, spec_)
        assert "—" not in html and "–" not in html, mid
        open(f"{OUT}/{moment['lane']}/email/{mid}.html", "w", encoding="utf-8").write(html)
        json.dump(values_for(moment, spec_), open(f"{OUT}/values/{mid}.json", "w", encoding="utf-8"),
                  indent=1, ensure_ascii=False)
        made["email"] += 1
        made["values"] += 1

    # The recommendation body, kept out of the loop above because it is not the same kind of thing:
    # it takes no values, it reads the contact, and it is the only one that queries a table.
    reco = moments[RECO_ID]
    if reco.get("reads") != "contact":
        raise SystemExit(f"{RECO_ID} must be marked reads: contact, since its body reads $Contact")
    if reco.get("lane") != "campaign":
        raise SystemExit(f"{RECO_ID} reads the contact and can only be campaign lane: contact "
                         "columns cannot personalize a transactional message")
    html = reco_html(reco, mc.RECO)
    assert "—" not in html and "–" not in html, RECO_ID
    open(f"{OUT}/campaign/email/{RECO_ID}.html", "w", encoding="utf-8").write(html)
    json.dump(reco_values(reco, mc.RECO), open(f"{OUT}/values/{RECO_ID}.json", "w",
              encoding="utf-8"), indent=1, ensure_ascii=False)
    made["email"] += 1
    made["values"] += 1

    # A moment reading the contact must not carry a push. reference/advanced-personalization says
    # $Contact "can be null in Push sends", so a push whose copy resolves from the contact is a
    # push that can go out with three holes in it. Refusing here is cheaper than finding out.
    for mid, moment in moments.items():
        lane = moment["lane"]
        reads = moment.get("reads", "current")
        if reads == "contact" and moment.get("push"):
            raise SystemExit(f"{mid} reads the contact and cannot carry a push: $Contact can be "
                             "null in Push sends")
        if reads == "contact" and lane == "transactional":
            raise SystemExit(f"{mid} reads the contact and cannot be transactional")
        if moment.get("push"):
            open(f"{OUT}/{lane}/push/{mid}.txt", "w", encoding="utf-8").write(push_txt(moment))
            made["push"] += 1
        for channel in ("sms", "whatsapp"):
            if moment.get(channel):
                text = render(moment[channel], reads)
                open(f"{OUT}/{lane}/{channel}/{mid}.txt", "w", encoding="utf-8").write(text + "\n")
                made[channel] += 1
        if moment.get("onsite"):
            open(f"{OUT}/campaign/onsite/{mid}.txt", "w", encoding="utf-8") \
                .write(moment_onsite_txt(moment))
            made["onsite"] += 1
        # The three push only transactional moments still need a values file: the send passes
        # values whether or not an email exists to derive them from.
        if lane == "transactional" and mid not in mc.EMAIL and moment.get("push"):
            json.dump(values_for_push(moment), open(f"{OUT}/values/{mid}.json", "w",
                      encoding="utf-8"), indent=1, ensure_ascii=False)
            made["values"] += 1

    # The panel side experiences: the wheel, the countdown, the scratch card. Copy written once
    # here, created in the panel from the gamification templates, canvas until G9 passes.
    for entry in contents.get("onsite_experiences", []):
        open(f"{OUT}/campaign/onsite/{entry['id']}.txt", "w", encoding="utf-8") \
            .write(onsite_txt(entry))
        made["onsite"] += 1

    # Every push title and message inside the limits a phone imposes, checked rather than assumed.
    over = [(m["id"], len(m["push"]["title"]), len(m["push"]["body"]))
            for m in moments.values()
            if m.get("push") and (len(m["push"]["title"]) > 50 or len(m["push"]["body"]) > 120)]
    if over:
        raise SystemExit("push copy over the limit a phone shows: " + repr(over))

    all_tokens = {"hero_image"}
    for mid, spec_ in mc.EMAIL.items():
        m = moments[mid]
        for text in (m["email"]["subject"], m["email"].get("preheader", ""),
                     spec_["headline"], spec_["lead"]):
            all_tokens |= tokens(text)
        all_tokens |= {t for _, t in spec_["rows"]}
        all_tokens.add(spec_["cta"][1])
    # The tag check lives on the transactional side, because $Current resolution on a
    # transactional send is exactly what it exists to settle.
    open(f"{OUT}/transactional/email/_tag-check.html", "w", encoding="utf-8") \
        .write(tag_check(all_tokens))

    print("wrote " + ", ".join(f"{v} {k}" for k, v in made.items()) +
          f", and a tag check covering {len(all_tokens)} values")
    print("push copy: every title under 50 characters and every message under 120")


if __name__ == "__main__":
    main()
