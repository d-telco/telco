#!/usr/bin/env python3
"""Assemble every page from a fragment plus the shared shell, header and footer.

Two reasons this exists rather than 23 hand written files.

The head order is load bearing and identical everywhere: identity resolves synchronously, the
SDK snippet initialises with the key already known, and stylesheets come last. Repeating that
by hand across 23 pages guarantees one page eventually gets it wrong, and the symptom is a
contact card that is quietly empty.

And Pages caches an asset for about ten minutes, so every script and stylesheet reference
carries a build stamp. Restamping by hand is how a demo ends up serving yesterday's module
during a call.

A fragment is pages/<name>.html beginning with a JSON front matter comment.
"""
import json, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = f"{ROOT}/tools/partials"
STAMP = "?v=" + str(int(time.time()))


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def front_matter(src):
    m = re.match(r"\s*<!--\s*(\{.*?\})\s*-->\s*", src, re.S)
    if not m:
        raise SystemExit("fragment has no JSON front matter comment")
    return json.loads(m.group(1)), src[m.end():]


def build(name):
    meta, body = front_matter(read(f"{ROOT}/pages/{name}.html"))
    out_path = meta.get("path", f"{name}.html")
    rel = "../" * (out_path.count("/"))
    attrs = ""
    for key, attr in (("product_id", "data-product-id"), ("price", "data-price"),
                      ("category_path", "data-category-path"),
                      ("promotion_id", "data-promotion-id")):
        if meta.get(key) is not None:
            attrs += f' {attr}="{meta[key]}"'

    html = (read(f"{P}/shell.html")
            .replace("{{DENGAGE_SNIPPET}}", read(f"{P}/dengage-snippet.html"))
            .replace("{{HEADER}}", read(f"{P}/header.html"))
            .replace("{{FOOTER}}", read(f"{P}/footer.html"))
            .replace("{{BODY}}", body.strip())
            .replace("{{TITLE}}", meta["title"])
            .replace("{{DESCRIPTION}}", meta.get("description", ""))
            .replace("{{PAGE_TYPE}}", meta.get("page_type", "other"))
            .replace("{{BODY_ATTRS}}", attrs)
            .replace("{{HEAD_EXTRA}}", meta.get("head_extra", ""))
            .replace("{{PATH}}", out_path)
            .replace("{{REL}}", rel)
            .replace("{{STAMP}}", STAMP))

    os.makedirs(os.path.dirname(f"{ROOT}/{out_path}") or ROOT, exist_ok=True)
    with open(f"{ROOT}/{out_path}", "w", encoding="utf-8") as fh:
        fh.write(html)
    return out_path, html


def main():
    names = sorted(f[:-5] for f in os.listdir(f"{ROOT}/pages") if f.endswith(".html"))
    if not names:
        raise SystemExit("no fragments in pages/")
    fails, built = [], []
    for name in names:
        meta, _ = front_matter(read(f"{ROOT}/pages/{name}.html"))
        path, html = build(name)
        built.append(path)
        # Rule 8, and the account owner extended it to the whole repository.
        for bad, label in (("—", "em dash"), ("–", "en dash")):
            if bad in html:
                fails.append(f"{path} contains an {label}")
        # A page that never fires pageView writes rows belonging to no identifiable demo, so
        # every page has to carry a page type the module recognises.
        if "page_type" not in meta:
            fails.append(f"{path} does not declare a page_type, so its rows would be untyped")
        for slot in ("dn_inline_target_below_header", "dn_inline_target_above_footer"):
            if slot not in html:
                fails.append(f"{path} is missing {slot}")
        if "DENGAGE SDK START" not in html:
            fails.append(f"{path} is missing the SDK injection script")
        if "{{" in html:
            fails.append(f"{path} has an unreplaced placeholder")

    for f in fails:
        print("FAIL", f)
    print(f"built {len(built)} pages, stamp {STAMP}")
    print("checks " + ("all passed" if not fails else f"{len(fails)} FAILED"))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
