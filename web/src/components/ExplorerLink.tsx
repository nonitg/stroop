import { ArrowUpRight } from 'lucide-react'

/** Link to the public Stellar Expert explorer for an account, contract or transaction. */
export function ExplorerLink({ href, text }: { href: string; text: string }) {
  return (
    <a className="mono-link" href={href} target="_blank" rel="noreferrer" title="View on Stellar Expert">
      <span className="mono">{text}</span> <ArrowUpRight size={13} aria-hidden />
    </a>
  )
}
