import type { ReactNode } from 'react'

export type Tone = 'paid' | 'locked' | 'back' | 'fee' | 'partner' | 'empty'

export interface Slice {
  tone: Tone
  value: number
  label: string
  who?: ReactNode
  amount?: ReactNode
}

/** One proportional bar: each slice is a share of the money, coloured by where it is. */
export function MoneyBar({ slices, thin }: { slices: Slice[]; thin?: boolean }) {
  const shown = slices.filter((s) => s.value > 0)
  return (
    <div className={`bar${thin ? ' thin' : ''}`} role="img" aria-label={shown.map((s) => s.label).join(', ')}>
      {(shown.length ? shown : [{ tone: 'empty', value: 1, label: '' } as Slice]).map((s, i) => (
        <span key={i} className={`tone-${s.tone}`} style={{ flexGrow: s.value }} />
      ))}
    </div>
  )
}

/** The bar's key: one row per slice with who keeps it and how much. */
export function Ledger({ slices, total }: { slices: Slice[]; total?: { label: string; amount: ReactNode } }) {
  return (
    <ul className="ledger">
      {slices.map((s) => (
        <li key={s.label}>
          <i className={`key tone-${s.tone}`} aria-hidden />
          <span className="what">{s.label}</span>
          {s.who && <span className="who">{s.who}</span>}
          <span className="amt">{s.amount}</span>
        </li>
      ))}
      {total && (
        <li className="total">
          <i aria-hidden />
          <span className="what">{total.label}</span>
          <span className="amt">{total.amount}</span>
        </li>
      )}
    </ul>
  )
}

/** Compact key under a bar on cards: colour and label only. */
export function KeyRow({ slices }: { slices: Slice[] }) {
  return (
    <ul className="key-row">
      {slices
        .filter((s) => s.value > 0)
        .map((s) => (
          <li key={s.label}>
            <i className={`tone-${s.tone}`} aria-hidden />
            {s.label}
            {s.amount && <> · {s.amount}</>}
          </li>
        ))}
    </ul>
  )
}
