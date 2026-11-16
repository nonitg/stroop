import { Check } from 'lucide-react'
import { CURRENCIES } from '../money'
import { Sheet } from './Sheet'

/** Pick the currency the family pays from: a Canadian bank (no exchange) or a bank at home. */
export function CurrencySheet(props: { open: boolean; onClose: () => void; value: string; onChange: (code: string) => void }) {
  const { open, onClose, value, onChange } = props
  return (
    <Sheet open={open} onClose={onClose} title="Your currency">
      <ul className="list glass strong" style={{ borderRadius: 20 }}>
        {CURRENCIES.map((c) => (
          <li key={c.code}>
            <button
              className="row"
              aria-pressed={c.code === value}
              onClick={() => {
                onChange(c.code)
                onClose()
              }}
            >
              <span className="txt">
                <strong>{c.name}</strong>
                <span>{c.code}</span>
              </span>
              {c.code === value && <Check size={18} aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
