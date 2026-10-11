/**
 * The Nightshift mark: a crescent moon whose inner edge is a forecast band narrowing to a point,
 * the bell. Amber dot = the opening bell. Drawn on mount (stroke dash) unless motion is reduced.
 */
export function Mark({ size = 28, animate = false, title = "Nightshift" }: { size?: number; animate?: boolean; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title} className={animate ? "ns-mark-draw" : undefined}>
      <defs>
        <radialGradient id="ns-moon" cx="40%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#F4F1E8" />
          <stop offset="100%" stopColor="#C9C6BB" />
        </radialGradient>
        <mask id="ns-crescent">
          <rect width="32" height="32" fill="white" />
          <circle cx="21" cy="12.5" r="11" fill="black" />
        </mask>
      </defs>
      <circle cx="15" cy="16" r="12" fill="url(#ns-moon)" mask="url(#ns-crescent)" />
      {/* the band: two hairlines converging on the bell */}
      <path d="M8.5 9.5 C 14 12, 19 15.5, 25.6 21.2" stroke="#0A0F1E" strokeOpacity="0.55" strokeWidth="0.9" fill="none" className="ns-mark-line" />
      <path d="M6.6 14.6 C 12 16.6, 18 19.4, 25.6 21.2" stroke="#0A0F1E" strokeOpacity="0.55" strokeWidth="0.9" fill="none" className="ns-mark-line" />
      <circle cx="25.6" cy="21.2" r="2.1" fill="#FFB23F" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark size={26} />
      <span className="wordmark text-[1.45rem] leading-none text-moon-0">Nightshift</span>
    </span>
  );
}
