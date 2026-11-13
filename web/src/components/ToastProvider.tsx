import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { CircleCheck, ExternalLink, X } from 'lucide-react'
import { explorer } from '../stellar'
import { ToastContext, type ToastInput } from './useToast'

type Toast = ToastInput & { id: number }

const TOAST_MS = 10_000
// Manual-copy toasts stay up longer: the person has to select the text.
const COPY_TOAST_MS = 30_000

// Confirmations after each action, with a link to the on-chain receipt.
export function ToastProvider({ children, view }: { children: ReactNode; view: string }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  // Confirmations belong to the screen they came from; switching views clears them.
  useEffect(() => setToasts([]), [view])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++
      setToasts((all) => [...all.slice(-2), { ...t, id }])
      setTimeout(() => dismiss(id), t.copyText ? COPY_TOAST_MS : TOAST_MS)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <CircleCheck className="toast-icon" size={20} aria-hidden />
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
                <a href={explorer.tx(t.hash)} target="_blank" rel="noreferrer">
                  View receipt on Stellar Expert <ExternalLink size={14} aria-hidden />
                </a>
              )}
            </div>
            <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={18} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
