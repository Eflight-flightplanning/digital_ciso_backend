import { useState } from "react";

export function ShieldMark({ size = 34, className = "" }: { size?: number; className?: string }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#0052CC] via-[#0284c7] to-[#0ea5e9] p-[1.5px] shadow-lg shadow-blue-500/20 ring-1 ring-primary/40 ${className}`}
    >
      {!imgError ? (
        <img
          src="/digital-ciso-logo.png"
          alt="Digital CISO Emblem"
          className="h-full w-full rounded-[10px] object-cover bg-surface transition-transform hover:scale-105"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src.includes("digital-ciso-logo.png")) {
              target.src = "/logo.png";
            } else {
              setImgError(true);
            }
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-surface">
          <svg viewBox="0 0 32 32" fill="none" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M16 3L5 7.5V14.5C5 21.5 9.7 27.9 16 29.5C22.3 27.9 27 21.5 27 14.5V7.5L16 3Z"
              fill="url(#shield_grad)"
              stroke="#38bdf8"
              strokeWidth="1.5"
            />
            <path
              d="M16 8V24M11 13H21M13 18H19"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="16" cy="13" r="2" fill="#38bdf8" />
            <defs>
              <linearGradient id="shield_grad" x1="5" y1="3" x2="27" y2="29.5" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0052CC" />
                <stop offset="1" stopColor="#0284c7" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}
    </div>
  );
}

export function Wordmark({ collapsed = false, className = "" }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-3 group shrink-0 ${className}`}>
      <div className="transition-transform duration-300 group-hover:scale-105">
        <ShieldMark size={collapsed ? 30 : 38} />
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="text-base font-black tracking-tight leading-none text-foreground">
            DIGITAL <span className="text-primary font-black">CISO</span>
          </span>
          <span className="text-[11px] font-bold tracking-wide text-primary leading-none mt-1">
            AI Cloud Security
          </span>
        </div>
      )}
    </div>
  );
}