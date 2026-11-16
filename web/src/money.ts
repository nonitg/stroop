// What each step of a lease costs, in the currencies people actually think in.
// Leases are priced and held in Canadian dollars (a CAD stablecoin), so the landlord's rent
// never moves with exchange rates. The family converts once, when they add money.
// Rates and partner fees are indicative; production pulls live quotes from the on-ramp and off-ramp.

export interface Currency {
  code: string
  name: string
  /** Units of this currency per 1 US dollar (indicative). */
  perUsd: number
  locale: string
}

export const CURRENCIES: Currency[] = [
  { code: 'CAD', name: 'Canadian dollar', perUsd: 1.4, locale: 'en-CA' },
  { code: 'INR', name: 'Indian rupee', perUsd: 88.5, locale: 'en-IN' },
  { code: 'CNY', name: 'Chinese yuan', perUsd: 7.15, locale: 'en-US' },
  { code: 'NGN', name: 'Nigerian naira', perUsd: 1480, locale: 'en-US' },
  { code: 'PHP', name: 'Philippine peso', perUsd: 58.5, locale: 'en-US' },
  { code: 'VND', name: 'Vietnamese dong', perUsd: 26300, locale: 'en-US' },
  { code: 'SGD', name: 'Singapore dollar', perUsd: 1.3, locale: 'en-US' },
  { code: 'USD', name: 'US dollar', perUsd: 1, locale: 'en-US' },
]

export const currency = (code: string) => CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]
export const CAD = currency('CAD')

/** Units of `code` per 1 C$. */
export const perCad = (code: string) => currency(code).perUsd / CAD.perUsd

/** Estimated partner fees: converting a foreign currency, and paying C$ out to a Canadian bank. */
export const FX_FEE = 0.01
export const CASH_OUT_FEE = 0.005
/** Indicative XLM price in C$, for turning network fees into cents. */
export const XLM_CAD = 0.56
/** Measured on testnet: locking a lease costs ~0.18 XLM, mostly to store the lease record on Stellar. */
export const LOCK_FEE_XLM = 0.18
export const ACTION_FEE_XLM = 0.001
/** How long a quoted exchange rate holds before the partner re-quotes. */
export const QUOTE_HOLD_SECS = 10 * 60

export const pct = (f: number) => `${+(f * 100).toFixed(2)}%`

/** "₹10,82,034", "C$1,393", "US$12,000.00". */
export function fmtMoney(amount: number, code: string, opts: { cents?: boolean } = {}) {
  const c = currency(code)
  const digits = opts.cents ? 2 : 0
  const text = amount.toLocaleString(c.locale, {
    style: 'currency',
    currency: c.code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  // Several kinds of dollars can sit side by side, so dollars always say which.
  if (code === 'USD') return text.replace('$', 'US$')
  if (code === 'CAD') return text.replace('$', 'C$')
  if (code === 'SGD') return text.replace('$', 'S$')
  return text
}

/** How money gets from a bank in `code` to Stroop, and how long it really takes. */
export function rampRoute(code: string) {
  return code === 'CAD'
    ? { method: 'Interac e-Transfer', from: 'your Canadian bank', time: 'a few minutes' }
    : { method: 'International bank transfer', from: `your bank (${code})`, time: '1–3 business days' }
}

/** Buying `cad` on Stroop from a bank account in `code`: what leaves the bank, and the partner's cut. */
export function onRampQuote(cad: number, code: string) {
  const rate = perCad(code)
  const base = cad * rate
  // C$ in and C$ out is a straight swap: no exchange, no exchange fee.
  const fee = code === 'CAD' ? 0 : base * FX_FEE
  return { pay: base + fee, fee, rate }
}

/**
 * Sending `cad` from Stroop to a bank in `code`: the partner's cut and what lands.
 * Stroop pays the cut back for landlords (`covered`), so their full rent arrives.
 */
export function offRampQuote(cad: number, code = 'CAD', covered = false) {
  const rate = perCad(code)
  const gross = cad * rate
  const fee = gross * (code === 'CAD' ? CASH_OUT_FEE : FX_FEE)
  const rebate = covered ? fee : 0
  return { gross, fee, rebate, receive: gross - fee + rebate, rate }
}

/** What a landlord's rent becomes in their Canadian bank: full amount, cash-out fee paid back by Stroop. */
export const landlordPayout = (cad: number) => offRampQuote(cad, 'CAD', true)
