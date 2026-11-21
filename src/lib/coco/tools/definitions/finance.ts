import 'server-only';

/** Definiciones de herramientas de CoCo: finance. Movidas tal cual desde tools.ts (21-11-2026). */
import { ALICUOTA_TOOL_DEFINITIONS } from '../../alicuotaTools';

export const FINANCE_TOOL_DEFINITIONS = [
    {
        name: 'get_payment_status',
        description: 'Consulta los gastos comunes del residente: cobros pendientes y vencidos de la unidad (los mismos que ve en Inicio y Mis Gastos), con monto, estado y vencimiento. Si omites month, NO filtres al mes en curso: devuelve todo lo impago. Usa month solo si preguntan por un mes concreto (YYYY-MM).',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string' },
                month: { type: 'string', description: 'Formato YYYY-MM. Opcional: solo cuando preguntan por un mes concreto. Si omites, devuelve todos los cobros pendientes/vencidos de la unidad.' },
            },
            required: ['unit_id'],
        },
    },
    {
        name: 'report_transfer',
        description: 'Avisa a la administración que el residente pagó su gasto común por transferencia, con monto, fecha, número de comprobante y mes al que corresponde. NO registra el pago: el saldo cambia cuando la administración verifica el comprobante. Úsalo para "ya transferí", "pagué por transferencia". Pide los datos que falten; nunca los inventes. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                amount: { type: 'integer', description: 'Monto transferido, en pesos.' },
                paid_at: { type: 'string', description: 'Fecha de la transferencia, AAAA-MM-DD.' },
                reference: { type: 'string', description: 'Número de comprobante u operación (al menos 4 caracteres).' },
                month: { type: 'string', description: 'Mes del gasto común que paga, YYYY-MM. Si no lo dice, usa get_payment_status y pregúntale cuál.' },
            },
            required: ['amount', 'paid_at', 'reference', 'month'],
        },
    },
    {
        name: 'request_payment_agreement',
        description: 'Avisa a la administración que el residente quiere conversar un convenio de pago de su gasto común. No crea el convenio ni menciona montos: lo propone la administración. Úsalo con tacto ("no alcanzo a pagar", "¿puedo pagar en cuotas?"). Requiere confirmación.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    // ── MÓDULO: ADMINISTRADOR ────────────────────────────────────────────────
    {
        name: 'get_defaulters_list',
        description: 'Obtiene la lista de unidades con gastos comunes impagos. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                community_id: { type: 'string' },
                month: { type: 'string', description: 'Formato YYYY-MM. Si omites, devuelve todos los impagos activos.' },
            },
            required: ['community_id'],
        },
    },
    {
        name: 'list_payment_agreements',
        description: 'Convenios de pago de la comunidad: agreement_id, unidad, estado (vigente, pendiente del comité, cerrado), total, pagado y cuotas pendientes con installment_id. SOLO administradores.',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'create_payment_agreement',
        description: 'Crea un convenio de pago para una unidad: total y número de cuotas (la primera vence hoy). Si la comunidad tiene comité, queda pendiente de su revisión (con varios integrantes, la herramienta pide elegir reviewer_id). Una unidad tiene un solo convenio activo. Pide total y cuotas; no los inventes. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_number: { type: 'string' },
                tower: { type: 'string', description: 'Solo si hay varias torres con ese número.' },
                total_amount: { type: 'integer', description: 'Monto total en pesos.' },
                installment_count: { type: 'integer', description: 'Número de cuotas.' },
                title: { type: 'string' },
                notes: { type: 'string' },
                reviewer_id: { type: 'string', description: 'Integrante del comité que revisa, si la herramienta lo pidió.' },
            },
            required: ['unit_number', 'total_amount', 'installment_count'],
        },
    },
    {
        name: 'cancel_payment_agreement',
        description: 'Anula un convenio vigente o pendiente del comité. Usa el agreement_id de list_payment_agreements. Requiere confirmación. SOLO administradores.',
        input_schema: { type: 'object' as const, properties: { agreement_id: { type: 'string' }, agreement_label: { type: 'string', description: 'Solo para la confirmación.' } }, required: ['agreement_id'] },
    },
    {
        name: 'pay_agreement_installment',
        description: 'Registra el pago de una cuota de convenio. Usa el installment_id de list_payment_agreements. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                installment_id: { type: 'string' },
                paid_at: { type: 'string', description: 'AAAA-MM-DD' },
                method: { type: 'string', enum: ['transfer', 'cash', 'check', 'card', 'online', 'other'] },
                reference: { type: 'string' },
            },
            required: ['installment_id', 'paid_at'],
        },
    },
    {
        name: 'get_unit_account',
        description: 'Cuenta de una unidad para la administración: saldo, vencido, cargos (charge_id, si es anulable) y pagos (payment_id). Úsalo antes de anular un cargo o un pago. SOLO administradores.',
        input_schema: { type: 'object' as const, properties: { unit_number: { type: 'string', description: 'Número de departamento.' },
                tower: { type: 'string', description: 'Solo si hay varias torres con ese número.' }, }, required: ['unit_number'] },
    },
    {
        name: 'add_unit_charge',
        description: 'Agrega un cargo puntual a una unidad: multa (fine), interés (interest), extraordinario (extraordinary), servicio (service) u otro (other); o un descuento del comité (kind committee, monto positivo). Pide monto, motivo y mes; no los inventes. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_number: { type: 'string', description: 'Número de departamento.' },
                tower: { type: 'string', description: 'Solo si hay varias torres con ese número.' },
                month: { type: 'string', description: 'AAAA-MM del gasto común al que se suma.' },
                kind: { type: 'string', enum: ['fine', 'interest', 'extraordinary', 'service', 'other', 'committee'] },
                label: { type: 'string', description: 'Motivo, como lo verá el residente.' },
                amount: { type: 'integer', description: 'Monto en pesos.' },
                due_date: { type: 'string', description: 'AAAA-MM-DD, opcional.' },
                notes: { type: 'string' },
            },
            required: ['unit_number', 'month', 'kind', 'label', 'amount'],
        },
    },
    {
        name: 'cancel_unit_charge',
        description: 'Anula un cargo puntual de una unidad (no el gasto común emitido: ese se corrige anulando la emisión). Usa el charge_id de get_unit_account. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: { charge_id: { type: 'string' }, charge_label: { type: 'string', description: 'Detalle, solo para la confirmación.' } },
            required: ['charge_id'],
        },
    },
    {
        name: 'delete_unit_payment',
        description: 'Anula un pago registrado por error en la cuenta de una unidad; la deuda se recalcula. Usa el payment_id de get_unit_account. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: { payment_id: { type: 'string' }, payment_detail: { type: 'string', description: 'Monto y fecha, solo para la confirmación.' } },
            required: ['payment_id'],
        },
    },
    {
        name: 'list_community_expenses',
        description: 'Gastos de la comunidad de un mes (expense_id, detalle, monto, proveedor) y si el mes ya está emitido. SOLO administradores.',
        input_schema: { type: 'object' as const, properties: { month: { type: 'string', description: 'AAAA-MM' } }, required: ['month'] },
    },
    {
        name: 'delete_community_expense',
        description: 'Borra un gasto de la comunidad mal ingresado, si el mes aún no está emitido. Usa el expense_id de list_community_expenses. Requiere confirmación. SOLO administradores.',
        input_schema: {
            type: 'object' as const,
            properties: { expense_id: { type: 'string' }, expense_label: { type: 'string', description: 'Detalle, solo para la confirmación.' } },
            required: ['expense_id'],
        },
    },
    // ── MÓDULO: ADMIN · GASTO COMÚN (unidades, alícuotas, egresos, emisión) ──
    // Alícuotas en % (‰ en la base), por el servicio de derechos: alicuotaTools.ts.
    ...ALICUOTA_TOOL_DEFINITIONS,
    {
        name: 'add_community_expense',
        description: 'Carga un egreso del edificio para un mes (luz, agua, remuneraciones, mantención, seguridad u otro), base para armar el gasto común. SOLO administradores. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                month: { type: 'string', description: 'Mes en formato AAAA-MM.' },
                label: { type: 'string', description: 'Descripción del egreso, ej: Cuenta de luz espacios comunes.' },
                amount: { type: 'string', description: 'Monto en pesos (entero, sin puntos).' },
                category: { type: 'string', description: 'water | electricity | gas | salaries | maintenance | security | other. Por defecto other.' },
                prorate_method: { type: 'string', description: 'share (por alícuota) o equal (partes iguales). Por defecto share.' },
                attachment_id: { type: 'string', description: 'Si la boleta o factura llegó como foto (viene un adjunto_id en el mensaje), pásalo: la foto queda guardada como respaldo del egreso.' },
            },
            required: ['month', 'label', 'amount'],
        },
    },
    {
        name: 'record_payment',
        description: 'Registra manualmente un pago que el administrador ya comprobó fuera de CoCo. No cobra ni verifica el banco. SOLO administradores; requiere referencia única y confirmación explícita. Nunca inventes datos faltantes.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string', description: 'Número o ID de la unidad.' },
                amount: { type: 'string', description: 'Monto recibido en pesos, entero sin puntos.' },
                paid_at: { type: 'string', description: 'Fecha real del pago, AAAA-MM-DD.' },
                method: { type: 'string', enum: ['transfer', 'cash', 'check', 'card', 'online', 'other'] },
                reference: { type: 'string', description: 'Referencia única del comprobante o transacción.' },
            },
            required: ['unit_id', 'amount', 'paid_at', 'method', 'reference'],
        },
    },
    {
        name: 'get_monthly_finance_report',
        description: 'Obtiene la rendición mensual real de la comunidad: egresos, cobros, recaudación y fondo de reserva. SOLO administradores. No crea un documento descargable.',
        input_schema: {
            type: 'object' as const,
            properties: { month: { type: 'string', description: 'Mes AAAA-MM.' } },
            required: ['month'],
        },
    },
    {
        name: 'preview_billing',
        description: 'Previsualiza el reparto del gasto común de un mes: cuánto se cobraría a cada unidad y el total, SIN emitir nada. SOLO administradores. Úsala SIEMPRE antes de emitir.',
        input_schema: {
            type: 'object' as const,
            properties: { month: { type: 'string', description: 'Mes en formato AAAA-MM.' } },
            required: ['month'],
        },
    },
    {
        name: 'issue_billing',
        description: 'Emite el gasto común del mes: crea el cobro real a cada unidad y notifica a los residentes. SOLO administradores. Requiere confirmación. Muestra SIEMPRE el preview (preview_billing) antes de proponerla.',
        input_schema: {
            type: 'object' as const,
            properties: {
                month: { type: 'string', description: 'Mes en formato AAAA-MM.' },
                due_date: { type: 'string', description: 'Fecha de vencimiento en formato AAAA-MM-DD.' },
            },
            required: ['month', 'due_date'],
        },
    },
    {
        name: 'cancel_issued_billing',
        description: 'Anula una emisión de gasto común que todavía no tiene pagos. Es el deshacer de issue_billing. SOLO administradores. Requiere confirmación. Pide antes el id de la emisión que devolvió issue_billing.',
        input_schema: {
            type: 'object' as const,
            properties: { run_id: { type: 'string', description: 'Id de la emisión a anular.' } },
            required: ['run_id'],
        },
    },
] as const;
