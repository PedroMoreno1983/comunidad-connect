"use client";

import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{
        name: string;
        value: number;
        color?: string;
    }>;
    label?: string;
}

const currencyFormatter = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
});

const COLORS = ["#f45b3d", "#0bc9a1", "#2563eb", "#f59e0b", "#7c3aed", "#64748b"];

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
    if (!active || !payload?.length) return null;

    return (
        <div className="rounded-lg border border-subtle bg-surface p-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] cc-text-secondary">{label}</p>
            {payload.map((entry, index) => (
                <p key={`${entry.name}-${index}`} className="mt-1 text-sm cc-text-secondary">
                    {entry.name}: <span className="font-semibold cc-text-primary">{currencyFormatter.format(entry.value)}</span>
                </p>
            ))}
        </div>
    );
}

interface ExpenseData {
    month: string;
    monto: number;
}

export function ExpenseAreaChart({ data }: { data: ExpenseData[] }) {
    return (
        <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f45b3d" stopOpacity={0.26} />
                        <stop offset="95%" stopColor="#f45b3d" stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="#e7e2dd" className="dark:stroke-slate-700" />
                <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#8a8178", fontWeight: 600 }}
                />
                <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#8a8178", fontWeight: 600 }}
                    tickFormatter={(value) => `$${(Number(value) / 1000000).toFixed(0)}M`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                    type="monotone"
                    dataKey="monto"
                    stroke="#f45b3d"
                    strokeWidth={3}
                    fill="url(#colorExpense)"
                    name="Gasto"
                    activeDot={{ r: 5, strokeWidth: 0, fill: "#0f172a" }}
                />
            </AreaChart>
        </ResponsiveContainer>
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
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const sortedData = [...data].sort((a, b) => b.value - a.value);

    return (
        <div className="grid min-w-0 gap-4 md:grid-cols-[180px_1fr] md:items-center">
            <div className="relative h-48 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={sortedData}
                            cx="50%"
                            cy="50%"
                            innerRadius={56}
                            outerRadius={82}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="var(--cc-bg-surface)"
                            strokeWidth={3}
                        >
                            {sortedData.map((entry, index) => (
                                <Cell key={`cell-${entry.name}`} fill={entry.color || COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={(value) => [valueFormatter(Number(value)), "Valor"]}
                            contentStyle={{
                                backgroundColor: "var(--cc-bg-surface)",
                                border: "1px solid var(--cc-border-subtle)",
                                borderRadius: "8px",
                                boxShadow: "0 8px 24px rgba(17, 24, 39, 0.10)",
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] cc-text-tertiary">{centerLabel}</span>
                    <span className="text-base font-semibold cc-text-primary">{totalFormatter(total)}</span>
                </div>
            </div>

            <div className="min-w-0 space-y-2">
                {sortedData.slice(0, 6).map((item, index) => {
                    const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                    const color = item.color || COLORS[index % COLORS.length];

                    return (
                        <div key={item.name} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-subtle bg-canvas px-3 py-2">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                                    <span className="truncate text-sm font-semibold cc-text-primary">{item.name}</span>
                                </div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
                                    <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: color }} />
                                </div>
                            </div>
                            <span className="text-sm font-semibold cc-text-secondary">{percentage}%</span>
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
    const chartHeight = Math.max(220, sortedData.length * 46);

    return (
        <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={sortedData} layout="vertical" margin={{ top: 8, right: 14, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 8" horizontal={false} stroke="#e7e2dd" className="dark:stroke-slate-700" />
                <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#8a8178", fontWeight: 600 }}
                />
                <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    width={108}
                    tick={{ fontSize: 11, fill: "#4b5563", fontWeight: 700 }}
                />
                <Tooltip
                    formatter={(value) => [value as number, "Reservas"]}
                    contentStyle={{
                        backgroundColor: "var(--cc-bg-surface)",
                        border: "1px solid var(--cc-border-subtle)",
                        borderRadius: "8px",
                        boxShadow: "0 8px 24px rgba(17, 24, 39, 0.10)",
                    }}
                />
                <Bar dataKey="reservas" fill="#0bc9a1" radius={[0, 8, 8, 0]} barSize={18} />
            </BarChart>
        </ResponsiveContainer>
    );
}

interface SparklineProps {
    data: number[];
    color: string;
}

export function Sparkline({ data, color }: SparklineProps) {
    const chartData = data.map((value, index) => ({ value, index }));

    return (
        <ResponsiveContainer width="100%" height={40}>
            <LineChart data={chartData}>
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
        </ResponsiveContainer>
    );
}
