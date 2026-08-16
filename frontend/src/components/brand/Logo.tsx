export function ShieldMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dciso-shield" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-info)" />
        </linearGradient>
      </defs>
      <path
        d="M24 3 6 10v13c0 11 7.6 19.4 18 22 10.4-2.6 18-11 18-22V10L24 3Z"
        fill="url(#dciso-shield)"
        fillOpacity="0.14"
        stroke="url(#dciso-shield)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <g stroke="url(#dciso-shield)" strokeWidth="1.6" strokeLinecap="round" opacity="0.9">
        <path d="M24 14v7M24 27v7" />
        <path d="M15 21h5.5M27.5 21H33" />
        <path d="M17 30h4l3-3" />
      </g>
      <circle cx="24" cy="24" r="3.1" fill="url(#dciso-shield)" />
      <circle cx="15" cy="21" r="1.6" fill="url(#dciso-shield)" />
      <circle cx="33" cy="21" r="1.6" fill="url(#dciso-shield)" />
      <circle cx="17" cy="30" r="1.6" fill="url(#dciso-shield)" />
    </svg>
  );
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <ShieldMark size={collapsed ? 28 : 32} />
      {!collapsed && (
        <div className="font-display text-lg font-bold tracking-tight text-foreground">
          DIGITAL <span className="text-primary">CISO</span>
        </div>
      )}
    </div>
  );
}
