"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type DistributionDatum = {
  label: string;
  value: number;
  tone: "positive" | "warning" | "critical";
};

type DistributionChartProps = {
  data: DistributionDatum[];
};

const COLORS: Record<DistributionDatum["tone"], string> = {
  positive: "#22c55e",
  warning: "#eab308",
  critical: "#ef4444",
};

type TooltipValue = string | number | readonly (string | number)[] | undefined;

export function DistributionChart({ data }: DistributionChartProps) {
  const formatTooltipValue = (value: TooltipValue) => {
    const candidate = Array.isArray(value) ? value[0] : value;
    const numericValue = typeof candidate === "number" ? candidate : Number(candidate ?? 0);
    return `${numericValue}%`;
  };

  return (
    <div className="h-64 min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={58}
            outerRadius={96}
            paddingAngle={3}
          >
            {data.map((entry) => (
              <Cell key={entry.label} fill={COLORS[entry.tone]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatTooltipValue(value)}
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              backgroundColor: "rgba(255,255,255,0.96)",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
