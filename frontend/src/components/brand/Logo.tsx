export function ShieldMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-md ring-1 ring-primary/40 ${className}`}
    >
      <img
        src="/logo.png"
        alt="Digital CISO Emblem"
        className="h-full w-full object-contain transition-transform hover:scale-105"
        onError={(e) => {
          // Fallback if image not yet loaded
          (e.target as HTMLElement).style.display = "none";
        }}
      />
    </div>
  );
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <ShieldMark size={collapsed ? 28 : 34} />
      {!collapsed && (
        <div className="flex flex-col">
          <div className="font-display text-sm font-extrabold tracking-tight text-foreground">
            DIGITAL <span className="text-primary font-black">CISO</span>
          </div>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            Autonomous Security
          </span>
        </div>
      )}
    </div>
  );
}