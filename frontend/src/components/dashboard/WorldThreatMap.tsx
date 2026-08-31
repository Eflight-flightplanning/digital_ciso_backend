import React from "react";

interface RegionExposure {
  name: string;
  code: string;
  provider: string;
  total: number;
  fail: number;
  critical: number;
  high: number;
  score: number;
  risk: string;
  color: string;
  dot: string;
}

export function WorldThreatMap({ regions }: { regions: RegionExposure[] }) {
  // Approximate coordinate markers on 800x400 SVG world projection
  const regionCoordinates: Record<string, { cx: number; cy: number; label: string }> = {
    "eastus": { cx: 220, cy: 150, label: "US East (Azure)" },
    "centralindia": { cx: 560, cy: 195, label: "Central India (Azure)" },
    "eu-west-1": { cx: 390, cy: 130, label: "EU West" },
    "ap-southeast-1": { cx: 620, cy: 230, label: "APAC Singapore" },
    "us-ashburn-1": { cx: 230, cy: 155, label: "OCI Ashburn" },
    "us-phoenix-1": { cx: 180, cy: 165, label: "OCI Phoenix" },
  };

  return (
    <div className="relative w-full rounded-2xl border border-border/80 bg-surface/90 p-4 sm:p-5 backdrop-blur-md shadow-lg overflow-hidden select-none">
      <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-display text-xs font-bold text-foreground">Global Perimeter Exposure Map</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Optimal</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Elevated</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Critical</span>
        </div>
      </div>

      <div className="relative w-full h-[220px] sm:h-[260px] rounded-xl bg-[#090d16] border border-border/60 overflow-hidden">
        <svg viewBox="0 0 800 380" className="w-full h-full">
          <defs>
            <pattern id="worldGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.8" fill="#1e293b" opacity="0.6" />
            </pattern>
            <filter id="glowPulse" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00e5ff" floodOpacity="0.8" />
            </filter>
            <filter id="threatGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f43f5e" floodOpacity="0.9" />
            </filter>
          </defs>

          {/* Grid Background */}
          <rect width="100%" height="100%" fill="#090d16" />
          <rect width="100%" height="100%" fill="url(#worldGrid)" />

          {/* Simplified Continental Outlines */}
          <g fill="#161f30" opacity="0.65" stroke="#22324d" strokeWidth="0.8">
            {/* North America */}
            <path d="M 120 70 L 260 70 L 290 140 L 240 180 L 210 230 L 160 170 L 110 130 Z" />
            {/* South America */}
            <path d="M 230 210 L 300 240 L 280 340 L 230 350 L 210 270 Z" />
            {/* Europe */}
            <path d="M 370 70 L 470 70 L 460 140 L 380 150 L 350 110 Z" />
            {/* Africa */}
            <path d="M 370 160 L 470 160 L 480 270 L 420 330 L 370 240 Z" />
            {/* Asia */}
            <path d="M 470 60 L 720 70 L 730 180 L 640 240 L 520 220 L 480 150 Z" />
            {/* Australia */}
            <path d="M 640 260 L 730 260 L 720 340 L 630 330 Z" />
          </g>

          {/* Regional Threat Pins */}
          {regions.map((reg, idx) => {
            const locKey = Object.keys(regionCoordinates).find((k) =>
              reg.code.toLowerCase().includes(k.toLowerCase()) || reg.name.toLowerCase().includes(k.toLowerCase())
            );
            const coords = locKey ? regionCoordinates[locKey] : { cx: 250 + (idx * 140) % 500, cy: 130 + (idx * 60) % 180, label: reg.name };
            const isCritical = reg.fail > 20 || reg.score < 70;
            const isElevated = reg.fail > 0;
            const pinColor = isCritical ? "#f43f5e" : isElevated ? "#f59e0b" : "#10b981";

            return (
              <g key={reg.code || idx} transform={`translate(${coords.cx}, ${coords.cy})`}>
                {/* Ping wave */}
                <circle r="14" fill="none" stroke={pinColor} strokeWidth="1" opacity="0.4">
                  <animate attributeName="r" values="6;22" dur="2.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0" dur="2.5s" repeatCount="indefinite" />
                </circle>

                {/* Pin Core */}
                <circle
                  r="6"
                  fill={pinColor}
                  stroke="#090d16"
                  strokeWidth="2"
                  filter={isCritical ? "url(#threatGlow)" : "url(#glowPulse)"}
                />

                {/* Label Tooltip */}
                <g transform="translate(0, -14)">
                  <rect
                    x="-55"
                    y="-16"
                    width="110"
                    height="20"
                    rx="5"
                    fill="#090d16"
                    stroke={pinColor}
                    strokeWidth="1"
                    opacity="0.95"
                  />
                  <text
                    x="0"
                    y="-3"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="8.5"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {reg.code.toUpperCase()}: {reg.score}% ({reg.fail} FAIL)
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
