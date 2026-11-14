import { X, type LucideIcon } from 'lucide-react'

/** A short, calm message about what the contract did or is doing. */
export function Note(props: { tone: 'protect' | 'paused'; Icon: LucideIcon; title: string; body: string; onDismiss?: () => void }) {
  const { tone, Icon, title, body, onDismiss } = props
  return (
    <div className={`note ${tone}`} role="status">
      <span className="note-icon" aria-hidden>
        <Icon size={20} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      {onDismiss && (
        <button className="icon-btn" onClick={onDismiss} aria-label="Dismiss">
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  )
}
