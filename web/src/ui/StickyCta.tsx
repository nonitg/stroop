import { type ReactNode, useEffect, useRef, useState } from 'react'

/** Main action pinned to the bottom. The fade behind it only shows while content actually scrolls under it. */
export function StickyCta({ children }: { children: ReactNode }) {
  const end = useRef<HTMLSpanElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = end.current
    if (!el) return
    // The marker sits where the action would rest; below the screen edge means the action is pinned over content.
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top > 0))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      <div className="footer-cta" data-stuck={stuck || undefined}>
        {children}
      </div>
      <span ref={end} aria-hidden />
    </>
  )
}
