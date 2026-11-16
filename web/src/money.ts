// What each step of a lease costs, in the currencies people actually think in.
// Rates and partner fees are indicative; production pulls live quotes from the on-ramp and off-ramp.

export interface Currency {
  code: string
  name: string
  /** Units of this currency per 1 USDC (indicative). */
  perUsd: number
  locale: string
}

export const CURRENCIES: Currency[] = [
  { code: 'INR', name: 'Indian rupee', perUsd: 88.5, locale: 'en-IN' },
  { code: 'CNY', name: 'Chinese yuan', perUsd: 7.15, locale: 'en-US' },
  { code: 'NGN', name: 'Nigerian naira', perUsd: 1480, locale: 'en-US' },
  { code: 'PHP', name: 'Philippine peso', perUsd: 58.5, locale: 'en-US' },
  { code: 'VND', name: 'Vietnamese dong', perUsd: 26300, locale: 'en-US' },
  { code: 'SGD', name: 'Singapore dollar', perUsd: 1.3, locale: 'en-US' },
  { code: 'USD', name: 'US dollar', perUsd: 1, locale: 'en-US' },
  { code: 'CAD', name: 'Canadian dollar', perUsd: 1.4, locale: 'en-CA' },
]

export const currency = (code: string) => CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]
export const CAD = currency('CAD')

/** Estimated partner fees: local money to USDC for families, USDC to a Canadian bank for landlords. */
export const ON_RAMP_FEE = 0.01
export const OFF_RAMP_FEE = 0.005
/** Indicative XLM price, for turning network fees into cents. */
export const XLM_USD = 0.4
/** Measured on testnet: locking a lease costs ~0.18 XLM, mostly to store the lease record on Stellar. */
export const LOCK_FEE_XLM = 0.18
export const ACTION_FEE_XLM = 0.001

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
  // Two kinds of dollars sit side by side on most screens, so dollars always say which.
  if (code === 'USD') return text.replace('$', 'US$')
  if (code === 'CAD') return text.replace('$', 'C$')
  if (code === 'SGD') return text.replace('$', 'S$')
  return text
}

/** Paying for `usdc` from a bank account in `code`: what leaves the bank, and the on-ramp's cut. */
export function onRampQuote(usdc: number, code: string) {
  const c = currency(code)
  const base = usdc * c.perUsd
  const fee = c.code === 'USD' ? 0 : base * ON_RAMP_FEE
  return { pay: base + fee, fee, rate: c.perUsd }
}

/**
 * Sending `usdc` to a bank in `code`: the cash-out partner's cut and what lands.
 * Stroop pays the cut back for landlords (`covered`), so their full rent arrives.
 */
export function offRampQuote(usdc: number, code = 'CAD', covered = false) {
  const c = currency(code)
  const gross = usdc * c.perUsd
  const fee = c.code === 'USD' ? 0 : gross * OFF_RAMP_FEE
  const rebate = covered ? fee : 0
  return { gross, fee, rebate, receive: gross - fee + rebate, rate: c.perUsd }
}

/** What a landlord's rent becomes in their Canadian bank: full amount, cash-out fee paid back by Stroop. */
export const landlordPayout = (usdc: number) => offRampQuote(usdc, 'CAD', true)
