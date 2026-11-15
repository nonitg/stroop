# Stroop design

Open `design/prototype/index.html` in a browser. It's one self-contained file with no build step.

## What went wrong before, and the rule that replaces it

| Past failure | Rule now |
|---|---|
| Looked like every AI-made SaaS (hero left, card right, three steps, green) | One idea specific to Stroop: **you can always see where the money is.** The layout comes from that idea, not from a template. |
| Different for the sake of it | Familiar app patterns (bottom sheets, toasts, list rows, one big button). The product is new, so the controls shouldn't be. |
| Too much at once | One headline, one sentence, one primary button per screen. Details sit lower down or in a sheet. |
| Decoration with no job | Every visual element answers a question: *where is my money*, *what did that cost*, *what happens next*. |

## The one idea: follow the money

The prototype stage puts **the family's phone | the money | the landlord's phone** side by side, with the money between them because neither side holds it.

- The middle column has three stacks: **back to the family** (left, next to the family's phone), **locked** (centre), and **paid to the landlord** (right, next to the landlord's phone). Each block is one month's rent, so when a month is paid its block moves right, and a refund moves blocks left.
- Below that, every fee is listed by who keeps it: the exchange partner, Stroop, the cash-out partner, and the network.
- On a phone the three panels become tabs ("Family", "The money", "Landlord").

This is the pitch visual: judges see the money sit in the middle, move one month at a time, and come back when the listing is fake.

## Transparency, screen by screen

| Question the user asks | Where it's answered |
|---|---|
| How many rupees leave my bank? | Review screen, the big number, before paying |
| Where does each rupee go? | Review screen: one bar plus four rows (rent, Stroop 1%, exchange ~1%, network), with "₹98 of every ₹100 becomes rent" |
| Who takes the fees? | Each fee row says who keeps it. "Not Stroop" is stated on the exchange fee. |
| What does Stroop make, and what does it give back? | "Stroop never makes money from: interest, exchange markup, your landlord." The fee is taken only at move-in and refunded if there's no move-in. Stroop pays the network fee. |
| What if it goes wrong? | "What if…" chips on the review screen: fake listing, leaving early, a dispute, each with the amount that comes back |
| Where is my money now? | Home screen: "Where your US$12,120 is" bar, plus the month tiles |
| How much reaches the landlord's bank? | Proof page: "≈ C$1,393 a month". Cash-out screen: the full C$ breakdown with the 0.5% partner fee and "Stroop's fee C$0" |

## Tokens

Colour carries meaning, so there's one hue and neutrals.

| Token | Value | Means |
|---|---|---|
| `--syrup` | `#E8912A` | Money Stroop is holding (locked). Also the brand, since *stroop* is Dutch for syrup. |
| `--ink` | `#16171B` | Text, primary buttons, **money paid out** |
| `--back` | `#2B7A54` | Money back to the family, verified |
| hatching | grey stripes | Fees kept by partners (exchange, cash-out) |
| `#8D8A82` | grey | Stroop's fee |
| `--danger` | `#B42318` | Blocked, dispute, "wire it upfront" risk |
| `--bg` / `--tint` / `--line` | `#F1F0EB` / `#F7F6F2` / `#E7E5DF` | Stage, cards, rules |

- **Type:** Schibsted Grotesk 400–800. Big amounts are 40px/750. Body is 16px, small text 13.5px, nothing under 12.5px. Don't turn on `tabular-nums`: this font makes commas and periods tabular too, which spaces out "₹10,83,346".
- **Shape:** 14px buttons (52px tall), 16–18px cards, 26px sheet corners, 7px month tiles.
- **Text contrast:** `--ink-2` `#53565D` is about 7:1 on white. `--ink-3` is only for text that doesn't matter.

## Components

- **Money bar + ledger rows:** a proportional bar, then one row per slice (colour key, label, plain-words sub-line, amount). Used for review, home (both sides), move-in, end early and cash out.
- **Month tiles:** 12 per row, labelled J–D. Paid (ink + check), locked (syrup), back (green), next (outlined).
- **Status card:** badge, one-sentence headline, one supporting line. Its tint follows the state (neutral, syrup = waiting on you, green = done, red = stop).
- **Bottom sheet:** for every consequential action. It shows what will happen in money terms before you confirm.
- **Toast:** confirms every action, on both phones when both are affected.

## Screens

**Family:** welcome (wire vs. lock risk bars) → your lease (form) → where your money goes (review) → approve with your bank → locking (3-step progress) → locked + proof link → home, in these states: waiting for landlord · accepted ("Has Priya got the keys?") · keys handed over · no keys by deadline · active · end-early request · paused · complete · refunded/ended → send to bank. Every US$ amount on home also shows ≈ ₹.
Sheets: currency, mediator, approve payment, confirm move-in, take it back, cancel, end early, report a problem.

**Landlord:** messages (the proof link arrives in the chat where the family asked) → proof of rent page (four facts; the cash-out fee is shown here, not hidden until cash out) → accept with passkey + bank account → home, in these states: accepted · keys handed over · deadline passed · active · end-early request · paused · complete · refunded · ended → cash out → sent (with an arrival estimate). Automatic cash-out on each rent day is a switch.
Sheets: sign up, keys handed over, early collection blocked, end early, report a problem.

## Persona findings that shaped it

Two persona testers ran the flow, a parent in Pune and a landlord in Waterloo, and then re-tested after fixes.
- **Refunds have to state what's lost.** "It all comes back" was untrue once the exchange fees are counted, so every refund now shows the rupees that actually land.
- **Name who acts.** "I've got the keys" confused a parent who is abroad. The button now reads "Priya has moved in".
- **A fake landlord can't collect by marking the keys handed over.** The family gets 3 days to object, and the screen says so.
- **Landlords look for the catch.** "Cost to you: Free" hid the 0.5% cash-out fee. The proof page now shows "≈ C$1,393 after a 0.5% cash-out fee (C$7)".
- **Jargon costs trust.** "Contract", "public on Stellar" and "try it" are gone from the user screens. Users see "lease rules", "receipt" and "checked just now".

## Copy rules

- The user's words: "lock", "locked", "paid to Sam", "back to you", "fee", "currency exchange", "lease rules". "USDC" and "contract" appear nowhere on user screens. "Stellar" appears only where it proves something (the "View record" link, the network-fee line).
- Numbers do the talking. Each amount appears once per screen, in the currency the person thinks in: rupees on the way in, US$ in the middle, C$ on the way out.
- Name people, not roles ("Sam accepted", "Priya's family"), and use no gendered pronouns.

## Assumptions to confirm

1. **"How much Stroop gives back"** is shown as: the fee is refunded if there's no move-in, unused rent comes back, Stroop pays the network fee, and Stroop earns no interest unless the family opts into lending. Then Stroop keeps what lending earns and the family gets a flat US$50 off, never a rate or a share (Stablecoin Act). See `docs/LENDING.md`.
2. **Stroop pays the network fee** (the roadmap's sponsored fees). Today's testnet demo has the wallet pay it.
3. **Exchange 1% / cash-out 0.5% / ₹88.50 / C$1.40** are estimates, as in the current app. Pull live quotes before showing real users.
4. **Rent is set in US$** (the contract holds USDC). A Canadian landlord thinks in C$, so a later version could quote the lease in C$ and show the US$ amount locked.

## Porting to the React app

Reuse the existing data layer (`stellar.ts`, `leaseText.ts` statuses and `nextStep`, `money.ts` quotes). Replace the views:

1. `MoneyFlow` / `MoneyTrail` → the money bar + ledger rows (one component, rows passed in)
2. `Schedule` month bar → month tiles
3. `LeaseCard` → status card + one primary action + quiet list rows (the existing `leaseActions` tiers already map onto this)
4. `VerifyView` → proof page
5. The stage (two phones + money panel) as a `/demo` route for the showcase. The normal routes stay single-role.
