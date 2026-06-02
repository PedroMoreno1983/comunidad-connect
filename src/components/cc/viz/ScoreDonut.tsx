"use client";

type ScoreDonutProps = {
  score: number;
  max?: number;
  color: string;
  size?: number;
};

export function ScoreDonut({ score, max = 5, color, size = 38 }: ScoreDonutProps) {
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(score / max, 1));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--cc-ivory-soft)" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${fraction * circumference} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <circle cx={size / 2} cy={size / 2} r="3" fill={color} />
    </svg>
  );
}

type BigDonutProps = {
  value: string;
  label: string;
  sub?: string;
  color: string;
  pct: number;
};

export function BigDonut({ value, label, sub, color, pct }: BigDonutProps) {
  const size = 96;
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(pct, 100)) / 100;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--cc-ivory-soft)" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${fraction * circumference} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-tertiary">{label}</p>
        <p className="mt-1 text-3xl leading-none cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
          {value}
        </p>
        {sub && <p className="mt-1 text-xs cc-text-tertiary">{sub}</p>}
      </div>
    </div>
  );
}
