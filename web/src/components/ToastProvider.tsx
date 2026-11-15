import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { explorer } from '../stellar'
import { ToastContext, type ToastInput } from './useToast'

type Toast = ToastInput & { id: number; ms: number }

const TOAST_MS = 8_000
// Manual-copy toasts stay up longer: the person has to select the text.
const COPY_TOAST_MS = 30_000

// Confirmations after each action: what happened, how fast Stellar settled it, and the public receipt.
export function ToastProvider({ children, view }: { children: ReactNode; view: string }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  // Confirmations belong to the screen they came from; switching views clears them.
  useEffect(() => setToasts([]), [view])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++
      const ms = t.copyText ? COPY_TOAST_MS : TOAST_MS
      setToasts((all) => [...all.slice(-2), { ...t, id, ms }])
      setTimeout(() => dismiss(id), ms)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" style={{ '--toast-ms': `${t.ms}ms` } as CSSProperties}>
            <svg className="toast-check" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <circle cx="12" cy="12" r="11" />
              <path d="m7.5 12.4 3 3 6-6.4" />
            </svg>
            <div className="toast-text">
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
              {t.copyText && (
                <input
                  className="toast-copy"
                  readOnly
                  value={t.copyText}
                  aria-label="Text to copy"
                  onFocus={(e) => e.currentTarget.select()}
                />
              )}
              {t.hash && (
                <span className="toast-meta">
                  {t.secs !== undefined && <span className="num">Settled in {t.secs.toFixed(1)} s</span>}
                  <a href={explorer.tx(t.hash)} target="_blank" rel="noreferrer">
                    Receipt <ArrowUpRight size={13} aria-hidden />
                  </a>
                </span>
              )}
            </div>
            <button className="x" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={16} aria-hidden />
            </button>
            <span className="toast-timer" aria-hidden />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
