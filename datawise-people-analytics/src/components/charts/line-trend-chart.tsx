"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TooltipValue = string | number | readonly (string | number)[] | undefined;
type ValueFormat = "number" | "percent" | "score";

type LineTrendChartProps = {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  stroke: string;
  format?: ValueFormat;
};

function formatValue(value: number, format: ValueFormat) {
  switch (format) {
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "score":
      return `${value.toFixed(0)}/100`;
    default:
      return value.toString();
  }
}

export function LineTrendChart({
  data,
  xKey,
  yKey,
  stroke,
  format = "number",
}: LineTrendChartProps) {
  const gradientId = useId().replace(/:/g, "");

  const formatTooltipValue = (value: TooltipValue) => {
    const candidate = Array.isArray(value) ? value[0] : value;
    const numericValue = typeof candidate === "number" ? candidate : Number(candidate ?? 0);
    return formatValue(numericValue, format);
  };

  return (
    <div className="h-64 min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.24} />
              <stop offset="70%" stopColor={stroke} stopOpacity={0.06} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey={xKey}
            stroke="#64748b"
            tickLine={false}
            axisLine={false}
            fontSize={12}
          />
          <YAxis
            stroke="#64748b"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            tickFormatter={(value: number) => formatValue(value, format)}
          />
          <Tooltip
            formatter={(value) => formatTooltipValue(value)}
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              backgroundColor: "rgba(255,255,255,0.96)",
            }}
          />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke="none"
            fill={`url(#${gradientId})`}
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={stroke}
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
