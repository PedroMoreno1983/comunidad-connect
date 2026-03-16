"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

type TooltipValue = string | number | readonly (string | number)[] | undefined;
type ValueFormat = "number" | "percent" | "score";

type SparklineChartProps = {
  data: Array<Record<string, string | number>>;
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

export function SparklineChart({
  data,
  yKey,
  stroke,
  format = "number",
}: SparklineChartProps) {
  const formatTooltipValue = (value: TooltipValue) => {
    const candidate = Array.isArray(value) ? value[0] : value;
    const numericValue = typeof candidate === "number" ? candidate : Number(candidate ?? 0);
    return formatValue(numericValue, format);
  };

  return (
    <div className="h-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Tooltip
            formatter={(value) => formatTooltipValue(value)}
            labelStyle={{ display: "none" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              backgroundColor: "rgba(255,255,255,0.96)",
            }}
          />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={stroke}
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
