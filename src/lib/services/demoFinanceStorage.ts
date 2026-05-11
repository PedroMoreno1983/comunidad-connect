export type DemoCondoFee = {
    id: string;
    unit_id: string;
    amount: number;
    month: string;
    status: "pending" | "paid" | "overdue";
    due_date: string;
    paid_at?: string;
    payment_method?: string;
    units: {
        number: string;
        tower?: string;
    };
};

const demoFinanceStorageKey = "cc_demo_condo_fees";

export const initialDemoCondoFees: DemoCondoFee[] = [
    { id: "demo-fee-1204", unit_id: "demo-unit-1204", amount: 126900, month: "2026-05", status: "pending", due_date: "2026-05-15", units: { number: "1204", tower: "A" } },
    { id: "demo-fee-805", unit_id: "demo-unit-805", amount: 119500, month: "2026-05", status: "paid", due_date: "2026-05-15", paid_at: "2026-05-08T14:20:00.000Z", payment_method: "haulmer", units: { number: "805", tower: "A" } },
    { id: "demo-fee-1505", unit_id: "demo-unit-1505", amount: 141200, month: "2026-05", status: "overdue", due_date: "2026-05-05", units: { number: "1505", tower: "B" } },
    { id: "demo-fee-1802", unit_id: "demo-unit-1802", amount: 132800, month: "2026-05", status: "paid", due_date: "2026-05-15", paid_at: "2026-05-06T10:04:00.000Z", payment_method: "transfer", units: { number: "1802", tower: "B" } },
];

export const demoResidentPaymentHistory: DemoCondoFee[] = [
    { id: "demo-fee-1204-2026-04", unit_id: "demo-unit-1204", amount: 119500, month: "2026-04", status: "paid", due_date: "2026-04-15", paid_at: "2026-04-12T12:00:00.000Z", payment_method: "haulmer", units: { number: "1204", tower: "A" } },
    { id: "demo-fee-1204-2026-03", unit_id: "demo-unit-1204", amount: 122300, month: "2026-03", status: "paid", due_date: "2026-03-15", paid_at: "2026-03-14T12:00:00.000Z", payment_method: "transfer", units: { number: "1204", tower: "A" } },
];

export function getDemoCondoFees(): DemoCondoFee[] {
    if (typeof window === "undefined") return initialDemoCondoFees;
    try {
        const stored = JSON.parse(window.localStorage.getItem(demoFinanceStorageKey) || "[]") as DemoCondoFee[];
        return stored.length > 0 ? stored : initialDemoCondoFees;
    } catch {
        return initialDemoCondoFees;
    }
}

export function saveDemoCondoFees(fees: DemoCondoFee[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(demoFinanceStorageKey, JSON.stringify(fees));
}

export function markDemoCondoFeePaid(feeId: string, method = "haulmer") {
    const nextFees = getDemoCondoFees().map(fee =>
        fee.id === feeId
            ? { ...fee, status: "paid" as const, paid_at: new Date().toISOString(), payment_method: method }
            : fee
    );
    saveDemoCondoFees(nextFees);
    return nextFees;
}

export function getDemoResidentFees(unitNumber = "1204") {
    return [
        ...getDemoCondoFees().filter(fee => fee.units.number === unitNumber),
        ...demoResidentPaymentHistory,
    ].sort((a, b) => b.month.localeCompare(a.month));
}
