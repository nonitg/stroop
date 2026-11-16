# Stroop trifold (letter-paper build)

Showcase trifold for the UW Velocity Stellar challenge.

## Print

| File | What |
|---|---|
| `stroop-trifold-sheets.pdf` | **The 16 sheets to print.** Letter, landscape, colour, **Actual size / 100%** |
| `assembly-guide.pdf` | 1 page: where each sheet goes + steps. Don't glue it |
| `board-preview.png` | The assembled board, for a quick look |

Each sheet holds one rounded card that stays 0.4 in clear of the paper edge, so any home printer prints it whole. Sheets butt edge to edge on the board; the white paper borders become 0.8 in gaps between tiles. A few mm of misalignment is invisible, and no cutting is needed. All cards share one board-wide light field, so the tiles read as one picture.

Board assumed: 36 × 48 in open, wings 12 in, center 24 in (fits 22.5 / 12.75 in boards too). Layout: 1 column × 4 rows per wing, 2 × 4 in the center, 1 in from the top.

## Edit + re-export

```sh
npm install           # once: playwright-core, qrcode, jsqr, pngjs
node make-qr.mjs      # after editing qr-urls.json
node export.mjs       # rebuilds both PDFs + preview; fails on overflow or a QR that doesn't decode
```

- Text lives in `trifold.html`. Team lines and customer tiers are in the `TEAM` / `TIERS` arrays near the bottom.
- QR codes: fill `url` in `qr-urls.json`. Entries with no URL are left off the board (the row resizes for 2–4 codes).
- `screens/proof.png` is the real proof page (testnet lease 24), 1200 px wide, captured at 3x.
- Views: `trifold.html` (sheets) · `?mode=board` · `?mode=guide`.

## Content map (read order = pitch order)

| Sheet | Job |
|---|---|
| L1 | Hook: "Pay 12 months upfront." + Nonit's 2017 story |
| L2 | Two strangers: family ↔ landlord, $12,000 wired |
| L3 | Scale: 58% prepaid, $100K+ scam losses |
| L4 | Insight: $23,448 already proven, landlord can't see it → key message 1 |
| C1–C2 | Stroop + "Proof of rent, not prepayment." |
| C3–C6 | Lock → Verify (real app screen) → Paid monthly (early = refused) → Comes back |
| C7 | Why Stellar: USDC → Soroban contract → anchor; key message 2 |
| C8 | QR codes |
| R1 | Who first (3 tiers) + interviews |
| R2 | Two-sided growth loop + consultant channel |
| R3 | 0.5% after move-in, landlords free; 690K × $12K → $41M (estimate) |
| R4 | Team + next milestone |

Deliberately left for Q&A: compliance (MSB/KYC/RTA), disputes, prior art, costs, impact metrics, yield.
