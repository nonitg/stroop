import type { Mood } from '../leaseText'

/** Coloured dot + one headline + one short line. The dot pulses when the next move is yours. */
export function Status({ title, sub, mood }: { title: string; sub?: string; mood: Mood }) {
  return (
    <div className="status" data-mood={mood}>
      <i className="dot" aria-hidden />
      <div>
        <strong>{title}</strong>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}
