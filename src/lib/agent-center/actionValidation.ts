import type { AgentAction } from '@/lib/agent-center/domain';

function text(value: unknown, label: string, min: number, max: number) {
    const cleaned = typeof value === 'string' ? value.trim().slice(0, max) : '';
    if (cleaned.length < min) throw new Error(`${label} es obligatorio.`);
    return cleaned;
}

function isoDate(value: unknown, label: string) {
    const cleaned = text(value, label, 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) || Number.isNaN(Date.parse(`${cleaned}T12:00:00Z`))) {
        throw new Error(`${label} debe tener formato YYYY-MM-DD.`);
    }
    return cleaned;
}

function time(value: unknown, label: string) {
    const cleaned = text(value, label, 4, 5);
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cleaned)) {
        throw new Error(`${label} debe tener formato HH:MM.`);
    }
    return cleaned;
}

export function validateAgentActionArgs(action: AgentAction): Record<string, unknown> {
    const args = action.args || {};

    if (action.toolName === 'get_resident_expenses') {
        const residentQuery = typeof args.residentQuery === 'string' ? args.residentQuery.trim().slice(0, 100) : '';
        const unitNumber = typeof args.unitNumber === 'string' ? args.unitNumber.trim().slice(0, 30) : '';
        if (!residentQuery && !unitNumber) throw new Error('Indica el nombre del residente o el numero de departamento.');
        return unitNumber ? { unitNumber } : { residentQuery };
    }

    if (action.toolName === 'create_booking') {
        const date = isoDate(args.date, 'La fecha de reserva');
        const startTime = time(args.startTime, 'La hora de inicio');
        const endTime = time(args.endTime, 'La hora de termino');
        if (startTime >= endTime) throw new Error('La hora de termino debe ser posterior a la hora de inicio.');
        return { amenityHint: text(args.amenityHint, 'El espacio comun', 2, 80), date, startTime, endTime };
    }

    if (action.toolName === 'create_marketplace_item') {
        const price = Number(args.price);
        if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) throw new Error('El precio de Marketplace no es valido.');
        const category = typeof args.category === 'string' ? args.category : 'other';
        if (!['electronics', 'furniture', 'clothing', 'other'].includes(category)) throw new Error('La categoria de Marketplace no es valida.');
        return {
            title: text(args.title, 'El titulo de la publicacion', 2, 120),
            description: text(args.description, 'La descripcion de la publicacion', 3, 1200),
            price,
            category,
        };
    }

    if (action.toolName === 'create_announcement') {
        const priority = typeof args.priority === 'string' ? args.priority : 'info';
        if (!['info', 'alert'].includes(priority)) throw new Error('La prioridad del comunicado no es valida.');
        return {
            title: text(args.title, 'El titulo del comunicado', 3, 120),
            content: text(args.content, 'El contenido del comunicado', 5, 2000),
            priority,
        };
    }

    if (action.toolName === 'register_visitor') {
        return {
            visitorName: text(args.visitorName, 'El nombre de la visita', 2, 100),
            purpose: typeof args.purpose === 'string' ? args.purpose.trim().slice(0, 200) : '',
        };
    }

    if (action.toolName === 'create_service_request') {
        return {
            description: text(args.description, 'La descripcion de la falla', 5, 1200),
            preferredDate: isoDate(args.preferredDate, 'La fecha preferida'),
            preferredTime: time(args.preferredTime, 'La hora preferida'),
        };
    }

    return args;
}
