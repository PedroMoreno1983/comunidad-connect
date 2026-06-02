"use client";

import { DATA_PALETTE, FoldedBar } from "@/components/cc/viz/FoldedBar";
import { BigDonut } from "@/components/cc/viz/ScoreDonut";

const currencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

interface ExpenseData {
  month: string;
  monto: number;
}

const BAR_COLORS = [
  DATA_PALETTE.yellow,
  "#D9A04A",
  DATA_PALETTE.orange,
  "#CB7146",
  DATA_PALETTE.copper,
  DATA_PALETTE.teal,
];

export function ExpenseAreaChart({ data }: { data: ExpenseData[] }) {
  const max = Math.max(...data.map((item) => item.monto), 1);
  const average = data.length ? data.reduce((sum, item) => sum + item.monto, 0) / data.length : 0;

  return (
    <div className="flex h-full min-h-[280px] flex-col rounded-xl border border-subtle bg-canvas p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] cc-text-tertiary">Histórico operativo</p>
          <p className="mt-1 text-sm font-semibold cc-text-secondary">Promedio mensual</p>
        </div>
        <div className="rounded-lg border border-subtle bg-surface px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] cc-text-tertiary">Media</p>
          <p className="font-mono text-sm font-semibold cc-text-primary">{currencyFormatter.format(average)}</p>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-6 items-end gap-4 border-b border-subtle px-1 pb-4">
        {data.map((item, index) => (
          <div key={item.month} className="flex h-full min-h-[180px] flex-col items-center justify-end gap-2">
            <p className="font-mono text-[11px] font-semibold cc-text-primary">
              ${(item.monto / 1000000).toFixed(1)}M
            </p>
            <div className="flex h-full w-full max-w-[42px] items-end">
              <FoldedBar pct={(item.monto / max) * 100} color={BAR_COLORS[index % BAR_COLORS.length]} orientation="vertical" rounded={4} />
            </div>
            <p className="text-xs font-semibold cc-text-secondary">{item.month}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold cc-text-secondary">Últimos 6 meses operativos</p>
        <p className="font-mono text-xs font-semibold cc-text-tertiary">
          Máximo {currencyFormatter.format(max)}
        </p>
      </div>
    </div>
  );
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface ExpensePieChartProps {
  data: CategoryData[];
  valueFormatter?: (value: number) => string;
  totalFormatter?: (value: number) => string;
  centerLabel?: string;
}

export function ExpensePieChart({
  data,
  valueFormatter = (value) => currencyFormatter.format(value),
  totalFormatter = (value) => `$${(value / 1000000).toFixed(1)}M`,
  centerLabel = "Total",
}: ExpensePieChartProps) {
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  const total = sortedData.reduce((sum, item) => sum + item.value, 0);
  const lead = sortedData[0];
  const leadPct = total > 0 && lead ? Math.round((lead.value / total) * 100) : 0;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-xl border border-subtle bg-canvas p-4">
        <BigDonut
          label={centerLabel}
          value={totalFormatter(total)}
          sub={lead ? `${lead.name} concentra ${leadPct}%` : "Sin movimientos"}
          color={lead?.color || DATA_PALETTE.copper}
          pct={leadPct || 1}
        />
      </div>

      <div className="min-w-0 space-y-2.5">
        {sortedData.slice(0, 6).map((item, index) => {
          const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
          const color = item.color || BAR_COLORS[index % BAR_COLORS.length];

          return (
            <div key={item.name} className="rounded-lg border border-subtle bg-surface px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="truncate text-sm font-semibold cc-text-primary">{item.name}</span>
                </div>
                <span className="shrink-0 font-mono text-xs font-semibold cc-text-secondary">{percentage}%</span>
              </div>
              <FoldedBar pct={percentage} color={color} orientation="horizontal" thickness={8} />
              <p className="mt-2 text-right text-[11px] font-semibold cc-text-tertiary">{valueFormatter(item.value)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface UsageData {
  name: string;
  reservas: number;
}

export function AmenityUsageChart({ data }: { data: UsageData[] }) {
  const sortedData = [...data].sort((a, b) => b.reservas - a.reservas);
  const max = Math.max(...sortedData.map((item) => item.reservas), 1);

  return (
    <div className="space-y-4">
      {sortedData.map((item, index) => {
        const pct = (item.reservas / max) * 100;
        const color = BAR_COLORS[index % BAR_COLORS.length];

        return (
          <div key={item.name}>
            <div className="mb-2 flex items-center justify-between gap-4">
              <p className="truncate text-sm font-semibold cc-text-primary">{item.name}</p>
              <p className="font-mono text-xs font-semibold cc-text-secondary">{item.reservas} reservas</p>
            </div>
            <FoldedBar pct={pct} color={color} orientation="horizontal" thickness={10} />
          </div>
        );
      })}
    </div>
  );
}

interface SparklineProps {
  data: number[];
  color: string;
}

export function Sparkline({ data, color }: SparklineProps) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const points = data.map((value, index) => {
    const x = data.length <= 1 ? 0 : (index / (data.length - 1)) * 100;
    const y = 36 - ((value - min) / range) * 32;
    return `${x},${y}`;
  });

  return (
    <svg viewBox="0 0 100 40" className="h-10 w-full" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points.join(" ")} />
    </svg>
  );
}
