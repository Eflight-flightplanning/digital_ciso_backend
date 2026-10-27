import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const TickIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 8.5 6.5 12 13 4.5" /></svg>
);
export const CrossIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 4l8 8M12 4l-8 8" /></svg>
);
export const ClipboardIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={1.6}>
    <rect x="3.5" y="3" width="9" height="11.5" rx="1.2" />
    <path d="M6 3V2h4v1M6 7h4M6 10h4" />
  </svg>
);
export const DashIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 8h8" /></svg>
);
export const ArrowIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
);
export const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={1.6}>
    <rect x="3" y="7" width="10" height="7" rx="1.2" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);
export const WarnIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={1.6}>
    <path d="M8 2 15 14H1L8 2Z" />
    <path d="M8 6.5v3.5M8 12v.01" />
  </svg>
);
export const InfoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={1.6}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 7.5V11M8 5v.01" />
  </svg>
);

/** The Oracle SaaS CIS dashboard's logo (red shield), as in the standalone app. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 34 38" width={size} height={(size * 38) / 34} aria-hidden="true">
      <path d="M17 1 32 6.5v11.2c0 9.3-6.3 16.2-15 19.3C8.3 33.9 2 27 2 17.7V6.5L17 1Z" fill="var(--oc-red)" />
      <path
        d="M17 8.5 25.5 11.6v6.3c0 5.2-3.5 9.2-8.5 11.1-5-1.9-8.5-5.9-8.5-11.1v-6.3L17 8.5Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
      />
      <circle cx="17" cy="18" r="3" fill="#fff" />
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={compact ? 24 : 30} />
      <div className="flex items-baseline gap-2 leading-none">
        <span className={`text-oc-ink ${compact ? "text-lg" : "text-xl"}`} style={{ fontFamily: '"Marcellus", "Cormorant Garamond", Georgia, serif' }}>
          Digital CISO
        </span>
        <span className="hidden text-sm text-oc-ink-soft sm:inline">Oracle SaaS CIS</span>
      </div>
    </div>
  );
}
