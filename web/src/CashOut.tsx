import { fmtUSD } from './stellar'

// Placeholder: real CAD settlement goes through a licensed off-ramp (SEP-24). Simulated on testnet.
export function CashOut({ onClose, amount }: { onClose: () => void; amount: bigint }) {
  return (
    <div className="cashout">
      <h4>Cash out to a Canadian bank account</h4>
      <p>
        {fmtUSD(amount)} USDC received. On mainnet the landlord withdraws through a Stellar off-ramp (SEP-24) to
        CAD by Interac or bank transfer. This testnet step is simulated.
      </p>
      <button className="secondary" onClick={onClose}>
        Close
      </button>
    </div>
  )
}
