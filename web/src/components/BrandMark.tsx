/** Stroop's mark: four months of rent, three settled and one coming due. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--spruce)" />
      <rect x="7.5" y="7.5" width="7" height="7" rx="2" fill="#fff" />
      <rect x="17.5" y="7.5" width="7" height="7" rx="2" fill="#fff" />
      <rect x="7.5" y="17.5" width="7" height="7" rx="2" fill="#fff" />
      <rect className="brand-due" x="17.5" y="17.5" width="7" height="7" rx="2" fill="var(--amber)" />
    </svg>
  )
}
