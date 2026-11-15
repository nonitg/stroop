/** Stroop's mark: four months of rent, three paid and one still locked. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <rect width="32" height="32" rx="10" fill="#141519" />
      <rect x="7.5" y="7.5" width="7" height="7" rx="2.2" fill="#fff" />
      <rect x="17.5" y="7.5" width="7" height="7" rx="2.2" fill="#fff" />
      <rect x="7.5" y="17.5" width="7" height="7" rx="2.2" fill="#fff" />
      <rect x="17.5" y="17.5" width="7" height="7" rx="2.2" fill="#E8912A" />
    </svg>
  )
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      Stroop
    </span>
  )
}
