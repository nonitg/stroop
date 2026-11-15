# Lending idle rent (opt-in)

Status: built on testnet (branch `lending`). Not in the showcase pitch yet. Needs legal sign-off before real money.

## The deal, in one line

The family can let Stroop lend rent it won't need for months. Stroop keeps what that earns, covers any loss from its own on-chain fund, and takes US$50 off its fee.

## Rules the contract enforces

| Rule | Why |
|---|---|
| Opt-in per lease, signed by the payer at `create` (`lend: true`) | Consent is explicit and on-chain |
| The next 3 months of rent are never lent (`CASH_PERIODS`) | Rent is always paid on time, even if the pool is slow to return money. The last month (Ontario's only legal deposit) always falls inside this buffer |
| Lent rent goes to one venue fixed at deployment (`vault`) | Stroop can't pick riskier venues later |
| Recalled automatically before it's due (`release`, `rebalance`) | No one has to remember |
| Short return → the cover fund pays the gap (`covered` on the lease) | The family and landlord don't carry the loss |
| Lending stops at 10× the cover fund; treasury can't pull cover below 10% of lent rent | The promise is backed by money, not words |
| Payer can switch off any time (`set_lending`); disputes, early ends and refunds recall everything first | The family stays in control |
| Flat US$50 discount, 9+ month leases only | A flat amount that doesn't grow with amount or time, so it isn't interest. Shorter leases have too little to lend |

Testnet uses `demo_vault` as a stand-in for Blend (it can simulate a loss). Mainnet needs an adapter that calls Blend's `pool.submit` (supply = request type 0, withdraw = 1).

## What we show, and what we leave out

**Family (one consent sheet, three facts):**
1. The next 3 months are never lent. Your landlord is paid on time.
2. If lending loses money, Stroop's fund pays it, with the live fund balance. The limit sits right next to the promise: only a loss bigger than the whole fund could leave the lease short.
3. Stroop keeps what lending earns, about US$X on this lease (a dollar estimate, no rate). You get US$50 off. Switch off any time; the discount stays.

Then one fine-print line: "Not a bank deposit or insurance."

A persona test showed that putting "Stroop covers any loss" in large text with the limit hidden in fine print felt like a trick, and that hiding Stroop's earnings made the US$50 look stingy. Both were fixed this way.

**Landlord (proof page):** "Tenant chose lending · Next 3 months always stay here · Stroop covers any loss · cover fund US$X". Lent months are striped on the month tiles.

**Left out on purpose:**
- **Rates and APY.** The family earns nothing from lending, so a rate invites the wrong comparison and makes it look like interest. Stroop's own likely earnings are shown once, in dollars.
- **BLND rewards, utilization, backstop, oracles.** These don't change what the family gets, and Stroop absorbs these risks.
- **The words** "guaranteed", "insured", "safe", "risk-free", "deposit", "savings", "interest". Canada's Competition Act judges ads by the overall impression on an inexperienced consumer.

## Compliance (what we checked, not legal advice)

| Topic | Finding | How the design responds |
|---|---|---|
| Stablecoin Act (Bill C-15, s.32) | Bans **issuers** paying interest, directly or indirectly. Stroop isn't an issuer and has no deal with Circle | The family gets no return. The discount is flat |
| Securities (CSA crypto platform rules) | Platforms can't "pledge, rehypothecate or otherwise use" client crypto; lending needs regulator consent | Opt-in, no profit to the family, one fixed venue, rules in code, Stroop bears losses. **Still needs counsel before launch** |
| Payments law (RPAA, extended by C-15) | The Bank of Canada's safeguarding rules allow cash, GICs or highly rated debt for client funds. A DeFi lending position likely doesn't qualify | **Probably the hard blocker for production.** Possible route: lend through a regulated partner, or hold T-bill-backed assets instead |
| Insurance | Promising to cover losses could look like insurance if sold on its own | Frame it as a promise about Stroop's own service, funded from Stroop's reserve. Never sell it separately |
| Ontario RTA | Landlords can only *require* last month's rent. Months of prepaid rent are legal only if the tenant offers | Market as tenant-chosen. The last month is never lent |
| FINTRAC | Nothing new from lending. The escrow flow already likely needs MSB registration | More record-keeping |

## Blend today (checked 2026-11-15)

- Main USDC pool (Fixed V2) holds about 40M USDC, about 80% lent out, and pays roughly 6%.
- It's "on ice": new borrowing is paused, but supplying and withdrawing still work. It is still attached to the backstop damaged in the Aug 2026 exploit.
- The Stellar Community Fund has paused Blend integrations while it's under review.
- **Don't put real money in until Blend says what happens to this pool.**

## Economics (estimate)

A 12-month, US$1,000 lease lends about US$3,000 on average over the year. At about 6%, that earns about US$180. After the US$50 discount, Stroop makes about US$130 more per lease than without lending, before paying for the cover fund's money. Shorter or cheaper leases earn little, which is why lending needs 9+ months.

Sources: [Bill C-15 regs](https://gazette.gc.ca/rp-pr/p1/2026/2026-10-24/html/reg1-eng.html) · [Canada stablecoin framework](https://www.canada.ca/en/department-finance/programs/financial-sector-policy/canadas-stablecoin-framework.html) · [CSA 21-333](https://www.osc.ca/en/securities-law/instruments-rules-policies/2/21-333) · [CSA 21-330 advertising](https://osc.ca/en/securities-law/instruments-rules-policies/2/21-330/csa-iiroc-staff-notice-21-330-guidance-crypto-trading-platforms-requirements-relating-advertising) · [Bank of Canada safeguarding](https://www.bankofcanada.ca/end-user-funds-safeguarding/) · [Blend integration](https://docs.blend.capital/tech-docs/integrations/integrate-pool) · [Blend deployments](https://docs.blend.capital/mainnet-deployments) · [Meru on Blend](https://stellar.org/case-studies/meru-wallet-uses-blend-defi-protocol-for-yield) · [Competition Act private enforcement](https://www.lexpert.ca/news/legal-insights/new-remedies-new-risks-private-enforcement-under-canadas-competition-act-enters-new-phase/393037)
