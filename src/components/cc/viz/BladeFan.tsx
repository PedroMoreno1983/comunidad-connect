"use client";

import { useId } from "react";
import { fold } from "./FoldedBar";

type Blade = {
  color: string;
  value: number;
  max?: number;
  delta?: string;
};

type BladeFanProps = {
  width?: number;
  height?: number;
  origin?: { x: number; y: number };
  startAngle?: number;
  endAngle?: number;
  blades: Blade[];
  maxLen?: number;
  bladeWidth?: number;
  tipInset?: number;
  grid?: boolean;
  gridRings?: number[];
  labels?: boolean;
};

function tipOf(origin: { x: number; y: number }, angle: number, length: number, extra = 0) {
  const radians = (angle * Math.PI) / 180;
  const adjusted = length + extra;
  return {
    x: origin.x + adjusted * Math.sin(radians),
    y: origin.y - adjusted * Math.cos(radians),
  };
}

export function BladeFan({
  width = 520,
  height = 460,
  origin = { x: 90, y: 400 },
  startAngle = 8,
  endAngle = 84,
  blades,
  maxLen = 300,
  bladeWidth = 16,
  tipInset = 0,
  grid = true,
  gridRings = [1, 2, 3, 4, 5],
  labels = true,
}: BladeFanProps) {
  const count = blades.length;
  const span = endAngle - startAngle;
  const maxValue = Math.max(...blades.map((blade) => blade.max ?? blade.value), 1);
  const widthHalf = bladeWidth / 2;
  const filterId = useId();

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <defs>
        <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1A1611" floodOpacity="0.12" />
        </filter>
      </defs>

      {grid &&
        gridRings.map((ring) => {
          const radius = (ring / Math.max(...gridRings)) * maxLen;
          const start = (startAngle * Math.PI) / 180;
          const end = (endAngle * Math.PI) / 180;
          const x0 = origin.x + radius * Math.sin(start);
          const y0 = origin.y - radius * Math.cos(start);
          const x1 = origin.x + radius * Math.sin(end);
          const y1 = origin.y - radius * Math.cos(end);
          const large = endAngle - startAngle > 180 ? 1 : 0;

          return (
            <g key={ring}>
              <path d={`M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`} fill="none" stroke="var(--cc-line)" strokeWidth="1" />
              <text x={x1 + 8} y={y1} fontFamily="var(--cc-font-mono)" fontSize="9" fill="var(--cc-ink-faint)">
                {ring}
              </text>
            </g>
          );
        })}

      <g filter={`url(#${filterId})`}>
        {blades.map((blade, index) => {
          const angle = count === 1 ? (startAngle + endAngle) / 2 : startAngle + (index / (count - 1)) * span;
          const length = (blade.value / maxValue) * maxLen;
          const left = `${-widthHalf},0 0,0 0,${-length} ${-widthHalf},${-length + tipInset}`;
          const right = `${widthHalf},0 0,0 0,${-length} ${widthHalf},${-length + tipInset}`;

          return (
            <g key={`${blade.color}-${index}`} transform={`translate(${origin.x},${origin.y}) rotate(${angle})`}>
              <polygon points={left} fill={blade.color} />
              <polygon points={right} fill={fold(blade.color)} />
            </g>
          );
        })}
      </g>

      {labels &&
        blades.map((blade, index) => {
          const angle = count === 1 ? (startAngle + endAngle) / 2 : startAngle + (index / (count - 1)) * span;
          const length = (blade.value / maxValue) * maxLen;
          const tip = tipOf(origin, angle, length, 14);
          const lead = tipOf(origin, angle, length, 4);

          return (
            <g key={`label-${blade.color}-${index}`}>
              <line x1={lead.x} y1={lead.y} x2={tip.x} y2={tip.y} stroke="var(--cc-line-strong)" strokeWidth="1" />
              <text x={tip.x} y={tip.y - 4} fontFamily="var(--cc-font-display)" fontSize="18" fill="var(--cc-ink)" textAnchor="middle">
                {blade.value.toFixed(2)}
              </text>
              {blade.delta && (
                <text x={tip.x} y={tip.y + 9} fontFamily="var(--cc-font-mono)" fontSize="9" fill={blade.delta.startsWith("+") ? "var(--cc-sage)" : "var(--cc-rose)"} textAnchor="middle">
                  {blade.delta}
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}
