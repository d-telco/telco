# D-TELCO

A telecom marketplace demonstration built on Dengage: a web storefront and a native Android app,
shown to telecom operator prospects.

D-TELCO is a fictional operator. Every price, plan, customer and figure in this repository is
demonstration data created for this build, and is marked as such on the page and on the screen.

## What is here

| Path | What it holds |
|---|---|
| `*.html`, `js/`, `assets/` | The web storefront, published to GitHub Pages |
| `android/` | The Android app, Kotlin and Jetpack Compose, on the Dengage Android SDK |
| `supabase/` | The operator side: edge functions and the database behind them |
| `panel/` | The content pack, ready to paste into the Dengage panel |
| `handoff/` | The runbooks: the walkthrough, the verification protocol and the capability map |
| `tools/` | The build and the checks |
| `verify/` | The verification console, which reads the account and reports what it finds |

## Running the checks

```
bash tools/check-all.sh
```

Twelve checks. Every one reads; none writes into the Dengage account, and the browser suite
asserts that refusal rather than relying on it.

The Android app builds separately, because it needs an Android SDK:

```
cd android && gradle :app:assembleDebug
```

## Before a demonstration

`handoff/WALKTHROUGH.md` is the script, in the order a customer meets it.
`handoff/VERIFY.md` is the pre-flight and the verification protocol.
`handoff/ONSITE-SLOTS.md` is where a campaign can be placed on each page.

Published at `https://d-telco.github.io/telco/`.
