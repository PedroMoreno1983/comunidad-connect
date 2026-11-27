import type { ParkingBookingStatus } from './amenities';
import type { PaymentProviderId } from './providers';
import type { CommunityGovernanceStatus } from './users';

export interface TimeBankOffer {
  id: string;
  profileId?: string;
  communityId?: string;
  neighborName: string;
  unitLabel: string;
  skill: string;
  description: string;
  availability: string;
  credits: number;
  requestsCount: number;
  governanceStatus: CommunityGovernanceStatus;
  coordinatorId?: string;
  coordinatorName?: string;
  governanceNote?: string;
  category: 'tools' | 'care' | 'digital' | 'home' | 'learning' | 'other';
  createdAt: string;
}

export interface SolidarityFund {
  id: string;
  community_id: string;
  balance: number | string;
  updated_at: string;
}

export interface SolidarityLedgerEntry {
  id: string;
  community_id: string;
  entry_type: 'contribution' | 'subsidize' | 'work_offset';
  amount: number | string;
  hours: number | string;
  description: string;
  created_at: string;
}

export interface ExpenseBreakdown {
  category: 'water' | 'electricity' | 'salaries' | 'maintenance' | 'security' | 'other';
  label: string;
  amount: number;
}

export interface ExpenseRecord {
  id: string;
  unitId: string;
  month: string; // YYYY-MM
  amount: number;
  breakdown: ExpenseBreakdown[];
  status: 'paid' | 'pending' | 'overdue';
  dueDate: string;
  paidAt?: string;
}

export interface ResidentFinanceExpense {
  id: string;
  unit_id: string;
  month: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  due_date: string;
  paid_at?: string;
  units?: {
    number: string;
  };
}

export type HaulmerFeeMode = 'base_percent' | 'mixed';

export interface HaulmerTariffRange {
  id: string;
  label: string;
  minInclusive: number;
  maxInclusive: number | null;
  basePercent: number;
  mixedPercent: number;
  mixedFixedFee: number;
}

export interface HaulmerFeeCalculation {
  baseAmount: number;
  feeMode: HaulmerFeeMode;
  range: HaulmerTariffRange;
  netFee: number;
  vat: number;
  vatRate: number;
  totalFee: number;
  totalWithFee: number;
}

export interface CommunityFinance {
  period: string;
  totalRevenue: number;
  totalBilled: number;
  totalExpenses: number;
  reserveFund: number;
  pendingAmount: number;
  overdueAmount: number;
  collectionRate: number; // 0-100
  totalUnits: number;
  billedUnits: number;
  paidUnits: number;
  pendingUnits: number;
  chronicDebtors: number;
  monthlyTrend: { month: string; monto: number }[];
  categoryBreakdown: { name: string; value: number; color?: string }[];
  recentActivity: {
    id: string;
    type: 'income' | 'expense';
    title: string;
    amount: number;
    date: string;
  }[];
}

/** Respuesta de iniciar un cobro en línea. El pago solo se confirma por la pasarela. */
export interface PaymentCheckout {
  provider: PaymentProviderId;
  url: string;
  token: string;
  reference: string;
  amount: number;
  baseAmount: number;
  serviceFee: number;
  redirectMethod: 'GET' | 'POST';
  tokenField: string | null;
}

/** Espejo del libro de cobros en la reserva. 'voided' = el cobro se anuló. */
export type ParkingPaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed' | 'voided';

/**
 * Estado de un cobro del libro parking_charges. Replica el CHECK de la base:
 * pending -> charged -> paid / failed / voided / refunded.
 */
export type ParkingChargeStatus = 'pending' | 'charged' | 'paid' | 'failed' | 'voided' | 'refunded';

/** Cómo se cobró: cargo en gastos comunes, pago en línea o nada (arriendo gratuito). */
export type ParkingChargeMethod = 'common_expenses' | 'haulmer' | 'none';

/** Método que la comunidad elige para cobrar los arriendos. */
export type ParkingBillingMethod = 'common_expenses' | 'haulmer';

/** Un cobro del libro de estacionamientos (uno por reserva). */
export interface ParkingCharge {
  id: string;
  bookingId: string;
  communityId: string;
  amount: number;
  status: ParkingChargeStatus;
  method: ParkingChargeMethod;
  unitId?: string;
  unitLabel?: string;
  needsReview: boolean;
  failureReason?: string;
  /** Link de pago en línea, solo cuando el método es Haulmer y está pendiente. */
  checkoutUrl?: string;
  chargedAt?: string;
  paidAt?: string;
  voidedAt?: string;
  refundedAt?: string;
  createdAt: string;
  /** Datos de la reserva, para la vista de administración. */
  spotLabel?: string;
  driverName?: string;
  driverPlate?: string;
  startsAt?: string;
  endsAt?: string;
  bookingStatus?: ParkingBookingStatus;
}

/** Resultado de procesar el cobro de una reserva en el servidor. */
export interface ParkingChargeProcessResult {
  charge: ParkingCharge | null;
  /** Proveedor que quedó a cargo del cobro. */
  provider: ParkingChargeMethod | null;
  /** Si el cobro se paga en línea, el link al que hay que llevar al conductor. */
  checkoutUrl: string | null;
  /** Por qué no se usó Haulmer, cuando la comunidad lo tenía elegido. */
  fallbackReason?: string;
}

// ============================================================================
// Finanzas del condominio
// ----------------------------------------------------------------------------
// Estaban definidos dentro de cada pagina de /admin/finanzas, contra la regla
// del CLAUDE.md. Un tipo que vive en la pagina no lo puede reutilizar nadie y
// se desincroniza del Service que produce esos datos: cuando cambia la forma de
// la respuesta, la pagina sigue compilando con la forma vieja.
//
// Varios llegaban con nombres que no sobreviven a un archivo compartido -Data,
// Txn, Report, Settings, Preview- asi que se renombraron por lo que son.
// ============================================================================

/** Certificado de deuda de una unidad. Antes `Certificate` en certificado/page. */
export interface DebtCertificate {
    availableCredit: number;
    community: { name: string; address: string | null };
    unit: { label: string; ownerName: string | null };
    issuedAt: string;
    issuedBy: string | null;
    balance: number;
    overdueAmount: number;
    oldestOverdueMonth: string | null;
    pendingByMonth: Array<{ month: string; concepts: Array<{ label: string; amount: number }>; total: number }>;
    isUpToDate: boolean;
}

/** Una linea del presupuesto anual frente a lo realmente gastado. */
export interface BudgetLine {
    category: string;
    categoryLabel: string;
    annualBudget: number;
    expectedToDate: number;
    actualToDate: number;
    variance: number;
    variancePercent: number;
}

/** Presupuesto contra ejecucion del año. Antes `Comparison` en presupuesto/page. */
export interface BudgetComparison {
    year: number;
    lines: BudgetLine[];
    totals: { annualBudget: number; expectedToDate: number; actualToDate: number; variance: number };
    monthsElapsed: number;
}

/** Rendicion mensual: que se gasto, que se cobro y que se recaudo. Antes `Report`. */
export interface MonthlyFinanceReport {
    month: string;
    expenses: { total: number; byCategory: Array<{ category: string; total: number }> };
    charged: { gastoComun: number; otherCharges: number; total: number };
    collected: { total: number; byMethod: Array<{ method: string; total: number }> };
    collectionRate: number;
    result: number;
}

/** Fondo de reserva del condominio y sus movimientos. Antes `Fund`. */
export interface ReserveFund {
    balance: number;
    totalContributions: number;
    totalWithdrawals: number;
    movements: Array<{ id: string; kind: string; amount: number; month: string; label: string }>;
    additionalFunds: Array<{ name: string; balance: number; totalContributions: number; totalWithdrawals: number }>;
}

/** Tasas que la comunidad define para su cobranza. Antes `Settings`. */
export interface FinanceSettings {
    lateInterestMonthlyRate: number;
    reserveFundRate: number;
}

/** Un movimiento de la cartola de una unidad. */
export interface StatementEntry {
    id: string;
    date: string;
    kind: string;
    label: string;
    amount: number;
    balance: number;
    reference: string | null;
    month?: string | null;
}

/** Cartola de una unidad: sus movimientos y el saldo que dejan. */
export interface ExpenseBalance {
    expenseId: string;
    amount: number;
    outstandingAmount: number;
}

export interface StatementChargeBalance {
    id: string;
    kind: string;
    label: string;
    month: string;
    dueDate: string | null;
    amount: number;
    outstandingAmount: number;
}

export interface UnitStatement {
    unitLabel: string;
    entries: StatementEntry[];
    balance: number;
    overdueAmount: number;
    totalCharged: number;
    totalPaid: number;
    expenseBalances: ExpenseBalance[];
    chargeBalances: StatementChargeBalance[];
    availableCredit: number;
}

/** Movimiento del banco a conciliar. Antes `Txn` en conciliacion/page. */
export interface BankTransaction {
    id: string;
    txnDate: string;
    amount: number;
    description: string;
    reference: string | null;
    importKey?: string | null;
    status: string;
    matchedPaymentId: string | null;
}

/** Pago registrado por una unidad. Antes `Payment`, demasiado generico. */
export interface UnitPayment {
    id: string;
    unitLabel: string;
    amount: number;
    paidAt: string;
    method: string;
    reference: string | null;
    matched: boolean;
}

/** Calce propuesto entre un movimiento del banco y un pago. */
export interface ReconciliationSuggestion {
    transactionId: string;
    paymentId: string;
    dayGap: number;
    referenceMatch: boolean;
}

/**
 * La glosa nombra una unidad. Si ya hay un pago de ese monto, se propone
 * cruzarlo. Si no, se propone registrarlo en el cobro abierto. Confirmar es
 * lo que mueve el saldo.
 */
export interface DepositSuggestion {
    kind: 'match' | 'record';
    transactionId: string;
    unitId: string;
    unitLabel: string;
    paymentId: string | null;
    expenseId: string | null;
    month: string | null;
    amountMatchesCharge: boolean;
    openCharges: DepositOpenCharge[];
}

export interface DepositUnitCandidate { id: string; number: string; tower: string }

export interface DepositOpenCharge { id: string; unitId: string; month: string; amount: number }

export interface DepositMovement { id: string; amount: number; description: string; reference?: string | null; date?: string }

export interface DepositPaymentCandidate { id: string; unitId: string; amount: number; paidAt?: string; reference?: string | null }

export interface FinancePaymentOptions { notify?: boolean }

export type FinancePageLoader<T> = (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>;

/** Todo lo que la pantalla de conciliacion necesita. Antes `Data`. */
export interface ReconciliationData {
    transactions: BankTransaction[];
    unmatchedPayments: UnitPayment[];
    suggestions: ReconciliationSuggestion[];
    depositSuggestions: DepositSuggestion[];
    summary: {
        totalTransactions: number;
        matched: number;
        pending: number;
        ignored: number;
        unexplainedDeposits: number;
        pendingInflowAmount: number;
    };
}

/** Gasto del condominio a prorratear entre las unidades. */
export interface CommunityExpense {
    id: string;
    category: string;
    label: string;
    amount: number;
    provider: string | null;
    document_url?: string | null;
    prorate_method: "share" | "equal" | "consumption";
}

export interface FinanceUnitOption {
    id: string;
    number: string;
    tower: string | null;
}

export interface PaymentAgreementInstallment {
    id: string;
    sequence: number;
    dueDate: string;
    amount: number;
    status: "pending" | "paid";
    paidAt: string | null;
}

export interface PaymentAgreement {
    id: string;
    unitId: string;
    unitLabel: string;
    title: string;
    totalAmount: number;
    installmentCount: number;
    status: "pending_committee" | "active" | "completed" | "cancelled" | "rejected";
    committeeReviewerId: string | null;
    committeeReviewedAt: string | null;
    committeeReviewNote: string | null;
    notes: string;
    createdAt: string;
    paidAmount: number;
    installments: PaymentAgreementInstallment[];
}

/** 'fixed' paga el monto tal cual; 'chile' calcula la liquidación legal. */
export type PayrollCalculation = "fixed" | "chile";

export type PayrollContractType = "indefinido" | "plazo_fijo" | "indefinido_11";

export type PayrollHealthSystem = "fonasa" | "isapre";

export interface PayrollEmployeeInput {
    id?: string;
    fullName: string;
    roleTitle: string;
    monthlyAmount: number;
    active?: boolean;
    calculation?: PayrollCalculation;
    rut?: string;
    afp?: string;
    healthSystem?: PayrollHealthSystem;
    isapreName?: string;
    isaprePlanUf?: number | null;
    contractType?: PayrollContractType;
    gratification?: boolean;
    taxableBonus?: number;
    mealAllowance?: number;
    transportAllowance?: number;
    familyDependents?: number;
    hireDate?: string;
    firstNames?: string;
    fatherLastName?: string;
    motherLastName?: string;
    sex?: "M" | "F" | null;
    foreignNational?: boolean;
    isapreCode?: string;
    partTime?: boolean;
}

/** Indicadores previsionales de un mes de remuneraciones, tal como los publica Previred. */
export interface PayrollIndicators {
    uf: number;
    utm: number;
    /** Ingreso mínimo mensual, base del tope de gratificación. */
    minimumWage: number;
    afpCapUf: number;
    unemploymentCapUf: number;
    /** Tasa total del trabajador por AFP (10% + comisión), en fracción. */
    afpWorkerRates: Record<string, number>;
    employerAfpRate: number;
    sisRate: number;
    /** Aportes del empleador al Seguro Social (Ley 21.735), por concepto. */
    socialInsuranceRates: Record<string, number>;
    unemployment: Record<PayrollContractType, { employer: number; worker: number }>;
    healthRate: number;
    familyAllowance: { upTo: number | null; amount: number }[];
}

export interface PayslipInput {
    calculation: PayrollCalculation;
    baseSalary: number;
    afp: string | null;
    healthSystem: PayrollHealthSystem;
    isaprePlanUf: number | null;
    contractType: PayrollContractType;
    gratification: boolean;
    taxableBonus: number;
    mealAllowance: number;
    transportAllowance: number;
    familyDependents: number;
    accidentRate: number;
}

export interface Payslip {
    calculation: PayrollCalculation;
    baseSalary: number;
    gratification: number;
    taxableBonus: number;
    taxableIncome: number;
    mealAllowance: number;
    transportAllowance: number;
    familyAllowance: number;
    grossPay: number;
    afp: { name: string; rate: number; amount: number } | null;
    health: { system: PayrollHealthSystem; amount: number; legalAmount: number };
    unemploymentWorker: number;
    taxBase: number;
    incomeTax: number;
    totalDeductions: number;
    netPay: number;
    employer: {
        sis: number;
        afp: number;
        socialInsurance: number;
        /** Por concepto (rentabilidadProtegida, expectativaDeVida), como van a Previred. */
        socialInsuranceDetail: Record<string, number>;
        unemployment: number;
        accidentInsurance: number;
        total: number;
    };
    /** Lo que la comunidad gasta: haberes más aportes del empleador. */
    employerCost: number;
}

export interface PayslipDocument {
    communityName: string;
    communityAddress: string | null;
    month: string;
    employee: { fullName: string; roleTitle: string; rut: string | null };
    slip: Payslip;
    indicatorsMonth: string | null;
}

/** Un trabajador del mes, tal como lo necesita el archivo de 105 campos de Previred. */
export interface PreviredWorker {
    fullName: string;
    rut: string | null;
    firstNames: string | null;
    fatherLastName: string | null;
    motherLastName: string | null;
    sex: "M" | "F" | null;
    foreignNational: boolean;
    contractType: PayrollContractType;
    hireDate: string | null;
    familyDependents: number;
    isapreCode: string | null;
    isaprePlanUf: number | null;
    partTime: boolean;
    slip: Payslip;
}

/** Datos previsionales del empleador (la comunidad). Códigos de las tablas 18 y 19 de Previred. */
export interface PayrollSettings {
    ccafCode: string;
    mutualCode: string;
    /** Tasa total de la Ley 16.744, en fracción (0.0093 = 0,93%). */
    accidentRate: number;
}

export interface PayrollLineRecord {
    id: string;
    full_name: string;
    role_title: string;
    /** Costo total para la comunidad. */
    amount: number;
    gross_amount: number | null;
    net_amount: number | null;
    breakdown: Payslip | null;
}

export interface PayrollRunRecord {
    id: string;
    month: string;
    status: "draft" | "paid";
    total_amount: number;
    paid_at: string | null;
    payment_reference: string | null;
    expense_note: string | null;
    created_at: string;
    indicators_month: string | null;
    payroll_lines: PayrollLineRecord[];
}

export interface LedgerAccountBalance {
    id: string;
    code: string;
    name: string;
    kind: string;
    debit: number;
    credit: number;
    balance: number;
}

export interface JournalLineView {
    id: string;
    account_id: string;
    debit: number;
    credit: number;
}

export interface JournalEntryView {
    id: string;
    entry_date: string;
    memo: string;
    source: string;
    created_at: string;
    journal_lines: JournalLineView[];
}

export interface JournalView {
    accounts: LedgerAccountBalance[];
    entries: JournalEntryView[];
}

/** Una emision de gastos comunes ya realizada. Antes `IssuedRun`. */
export interface IssuedBillingRun {
    id: string;
    total_amount: number;
    units_count: number;
    due_date: string;
    issued_at: string;
}

/** Lo que le tocaria pagar a una unidad en una emision. Antes `PreviewUnit`. */
export interface BillingPreviewUnit {
    unitId: string;
    label: string;
    sharePermille: number | null;
    total: number;
}

/** Simulacion de una emision antes de cursarla. Antes `Preview`. */
export interface BillingPreview {
    unitCount: number;
    totalExpenses: number;
    totalCharged: number;
    fellBackToEqualSplit: boolean;
    warnings: string[];
    units: BillingPreviewUnit[];
    billingMode?: "proration" | "fixed";
}

export interface FinanceCommitteeReviewSnapshot {
    totalExpenses: number;
    totalCharged: number;
    unitCount: number;
    warnings: string[];
    sourceExpenses: Array<{ id: string; label: string; category: string; amount: number; hasDocument: boolean; documentFingerprint: string | null }>;
    units: Array<{
        unitId: string;
        label: string;
        sharePermille: number | null;
        total: number;
        items: Array<{ expenseId: string; category: string; label: string; amount: number }>;
    }>;
}

export interface FinanceCommitteeReview {
    id: string;
    communityId: string;
    month: string;
    reviewerId: string;
    reviewerName: string;
    requestedBy: string;
    status: 'pending' | 'approved' | 'rejected';
    dueDate: string;
    quotaAmount: number | null;
    quotaMethod: 'share' | 'equal' | null;
    requestedAt: string;
    reviewedAt: string | null;
    reviewNote: string | null;
    snapshot: FinanceCommitteeReviewSnapshot;
    isCurrent?: boolean;
}

export interface FinanceCommitteeResidentOption {
    id: string;
    name: string;
    email: string;
}

export interface FinanceCommitteeMember {
    id: string;
    residentId: string;
    name: string;
    email: string;
    appointedAt: string;
    startsOn: string;
    endedAt: string | null;
}

export interface CommitteeReviewPanelProps {
    month: string;
    dueDate: string;
    quotaAmount?: number;
    quotaMethod: 'share' | 'equal';
    issued: boolean;
    refreshKey: number;
}

/** Totales del condominio que el art. 31 de la Ley 21.442 exige en el aviso de cobro. */
export interface BillNoticeCommunitySummary {
    monthIncome: number;
    monthExpenses: number;
    cashBalance: number;
    cashBalanceIsEstimate: boolean;
    reserveFundBalance: number;
}

/** Aviso de cobro de una unidad para un periodo. */
export interface BillNotice {
    month: string;
    community: { name: string; address: string | null };
    unit: {
        id: string;
        label: string;
        ownerName: string | null;
        sharePermille: number | null;
    };
    dueDate: string | null;
    items: Array<{ label: string; amount: number }>;
    gastoComun: number;
    reserveContribution: number;
    monthCharges: Array<{ label: string; kind: string; amount: number }>;
    previousBalance: number;
    periodCharges: number;
    paymentsSinceStart: number;
    totalDue: number;
    unpaidPenalties: Array<{ label: string; kind: string; amount: number; month: string }>;
    history: Array<{ month: string; amount: number }>;
    summary: BillNoticeCommunitySummary;
}

export type PaymentImportRowStatus = 'ready' | 'error' | 'recorded';

/** Una fila de la planilla de carga masiva, ya validada o con su error. */
export interface PaymentImportRow {
    line: number;
    rawUnit: string;
    unitId: string | null;
    unitLabel: string | null;
    amount: number;
    paidAt: string;
    method: string;
    reference: string | null;
    status: PaymentImportRowStatus;
    message: string | null;
}

/** Resultado de previsualizar o confirmar una carga masiva de pagos. */
export interface PaymentImportResult {
    committed: boolean;
    rows: PaymentImportRow[];
    readyCount: number;
    errorCount: number;
    totalAmount: number;
}

export interface FinancialStatementLine {
    label: string;
    total: number;
}

export interface FinancialStatementExpenseLine {
    category: string;
    label: string;
    total: number;
}

export interface FinancialStatementMonthFlow {
    month: string;
    inflow: number;
    outflow: number;
    net: number;
    closing: number;
}

/** Estado de resultado, flujo de caja y situación patrimonial del condominio. */
export interface FinancialStatements {
    year: number;
    cutoffMonth: string;
    openingCash: number;
    closure?: { closedAt: string; hasLaterChanges: boolean };
    income: {
        lines: FinancialStatementLine[];
        totalIncome: number;
        expenseLines: FinancialStatementExpenseLine[];
        totalExpenses: number;
        reserveTransfer: number;
        result: number;
    };
    cashFlow: {
        startingCash: number;
        months: FinancialStatementMonthFlow[];
        totalInflow: number;
        totalOutflow: number;
        endingCash: number;
    };
    position: {
        cash: number;
        receivables: number;
        totalAssets: number;
        advances: number;
        totalLiabilities: number;
        reserveFund: number;
        accumulatedSurplus: number;
        totalEquity: number;
        unitsWithDebt: number;
        journalBank: number;
    };
}

// ─── Gasto común visto por el residente ─────────────────────────────────────

/**
 * Fila cruda de `expenses` con su desglose. `unit_id` es TEXT en la base, no
 * UUID, y `amount` llega como número o texto segun el driver: por eso el tipo
 * los admite en vez de prometer lo que la base no garantiza.
 */
export interface ExpenseDatabaseRow {
    id: string;
    unit_id?: string | null;
    month?: string | null;
    amount?: number | string | null;
    status?: ExpenseRecord['status'] | null;
    due_date?: string | null;
    paid_at?: string | null;
    payment_metadata?: { amount?: number | string | null } | null;
    items?: ExpenseItemDatabaseRow[] | null;
}

export interface ExpenseItemDatabaseRow {
    category?: ExpenseBreakdown['category'] | null;
    label?: string | null;
    amount?: number | string | null;
}

/**
 * Lo que la pantalla del residente muestra: el cobro mas lo que se sabe del
 * pago. `ExpenseRecord` describe el cobro nomas y no tiene donde poner el monto
 * efectivamente pagado, que puede diferir del emitido.
 */
export interface UnitExpenseView extends Omit<ExpenseRecord, 'paidAt'> {
    outstandingAmount?: number;
    /** `null` es "no pagado" y llega asi desde la base; no es lo mismo que ausente. */
    paidAt?: string | null;
    paymentAmount?: number | null;
}

export interface BankStatementPreviewRow {
    txnDate: string;
    amount: number;
    description: string;
    reference: string;
    importKey?: string;
}

export interface FinanceDocumentDraft {
    fileName: string;
    label: string;
    amount: number;
    provider: string;
    category: string;
    documentDate: string;
    documentNumber: string;
    warnings: string[];
    /** Boleta de servicio básico: n° de cliente, período facturado (AAAA-MM), vencimiento y consumo. */
    utility?: UtilityBillFields;
    /** Mes de gastos comunes sugerido según el vencimiento de la boleta. */
    suggestedMonth?: string;
    /** Prorrateo recordado para ese n° de cliente. */
    suggestedProrateMethod?: 'share' | 'equal';
    /** El n° de cliente ya lo registró la administración antes: la boleta puede entrar sola. */
    knownUtilityAccount?: boolean;
}

export interface FinanceDocumentReview extends FinanceDocumentDraft {
    id: string;
    file: File;
    month: string;
    prorateMethod: 'share' | 'equal' | 'consumption';
    status: "pending" | "saving" | "saved";
}

export interface FinanceDocumentLink {
    id: string;
    label: string;
}

export interface BankTransactionInput {
    txnDate: string;
    amount: number;
    description?: string | null;
    reference?: string | null;
    /** Stable identity for one row of an uploaded bank statement. Manual entries omit it. */
    importKey?: string;
}

export interface FinancePaymentTarget {
    expenseId?: string | null;
    chargeId?: string | null;
}

export type FinancePageReader<T> = (cursor?: string) => PromiseLike<{ data: T[] | null; error: unknown }>;

export interface FinanceAllocationDebt {
    id: string;
    kind: 'expense' | 'charge';
    amount: number;
    date: string;
    settledAmount?: number;
}

export interface FinanceLegacyExpense {
    id: string;
    amount: number;
    status: string;
    payment_metadata?: unknown;
}

/** 33 = factura electrónica afecta a IVA; 34 = factura electrónica exenta. */
export type TaxDocumentType = 33 | 34;

/** Datos del emisor tal como los pide el SII. */
export interface InvoicingEmitter {
    rut: string;
    businessName: string;
    activity: string;
    /** Código de actividad económica del SII (Acteco). */
    activityCode: string;
    address: string;
    commune: string;
    /** Código de sucursal del SII, si la tiene. */
    branchCode?: string;
}

export interface TaxDocumentReceiver {
    rut: string;
    businessName: string;
    activity: string;
    address: string;
    commune: string;
}

export interface TaxDocumentItem {
    name: string;
    quantity: number;
    unitPrice: number;
}

export interface TaxDocumentDraft {
    type: TaxDocumentType;
    issueDate: string;
    receiver: TaxDocumentReceiver;
    items: TaxDocumentItem[];
}

export interface TaxDocumentTotals {
    net: number;
    exempt: number;
    tax: number;
    total: number;
}

export interface TaxDocument {
    id: string;
    environment: "test" | "production";
    type: TaxDocumentType;
    status: "pending" | "issued" | "failed";
    folio: number | null;
    receiver: TaxDocumentReceiver;
    items: TaxDocumentItem[];
    totals: TaxDocumentTotals;
    issueDate: string;
    hasPdf: boolean;
    warnings: string[];
    error: string | null;
    createdAt: string;
}

export interface InvoicingSettingsView {
    configured: boolean;
    environment: "test" | "production";
    emitter: InvoicingEmitter | null;
    /** Últimos 4 caracteres de la API key, para reconocerla sin mostrarla. */
    apiKeyHint: string | null;
    encryptionReady: boolean;
}

/** Clave JSON de una cuenta de servicio de Google (solo fuera de Vercel). */
export interface FirebaseServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** Acceso sin clave: OIDC de Vercel → Workload Identity Federation de Google. */
export interface FirebaseFederatedAccount {
  projectId: string;
  serviceAccountEmail: string;
  provider: string;
}

// ─── Servicios básicos: luz, agua y gas ─────────────────────────────────────

export type UtilityService = 'electricity' | 'water' | 'gas';
export type PersonalBillService = UtilityService | 'internet' | 'highway' | 'mobile';

export interface UtilityBillFields {
    customerNumber: string;
    servicePeriod: string;
    dueDate: string;
    consumptionValue: number | null;
    consumptionUnit: string;
}

/** Cuenta personal del residente. Privada: solo la ve su dueño. */
export interface PersonalBillExtract {
    customerNumber: string | null;
    dueDate: string | null;
    amount: number | null;
}

export interface ResidentUtilityAccount {
    id: string;
    service: PersonalBillService;
    provider: string;
    customerNumber: string;
    alias: string;
    dueDay: number | null;
    remindersEnabled: boolean;
    lastPaidPeriod: string | null;
    billDueDate?: string | null;
    billAmount?: number | null;
    lastPaidBillDueDate?: string | null;
}

export interface ResidentUtilityAccountInput {
    service: PersonalBillService;
    provider: string;
    customerNumber: string;
    alias?: string;
    dueDay?: number | null;
    remindersEnabled?: boolean;
    billDueDate?: string | null;
    billAmount?: number | null;
}

// ─── Boletas que llegan por correo ──────────────────────────────────────────

export interface InboundBillDocument {
    id: string;
    from: string;
    subject: string;
    fileName: string;
    status: 'pending' | 'registered' | 'discarded' | 'failed';
    /** Lo que leyó la IA (null si no se pudo leer). */
    draft: FinanceDocumentDraft | null;
    error: string | null;
    receivedAt: string;
}

export interface InboundBillRegisterInput {
    month: string;
    label: string;
    amount: number;
    category: string;
    provider: string;
    prorateMethod: 'share' | 'equal';
}
