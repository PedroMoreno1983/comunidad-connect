import 'server-only';
import { consultOfficialLegalSource, type OfficialLegalSource } from './officialLegalSources';

import { LEGAL_DRAFT_MARKER } from './legalDraftMarker';
export { LEGAL_DRAFT_MARKER };

interface LegalBasis { source: OfficialLegalSource; query: string }
interface DraftType {
    title: string;
    requiredFields: Record<string, string>;
    sections: string[];
    bases: LegalBasis[];
    cautions: string[];
}

const COMMUNITY = {
    nombre_condominio: 'Nombre del condominio',
    direccion: 'Dirección y comuna',
};

export const LEGAL_DRAFT_TYPES: Record<string, DraftType> = {
    reglamento_copropiedad: {
        title: 'Reglamento de copropiedad',
        requiredFields: {
            ...COMMUNITY, tipo_condominio: 'Tipo de condominio (A o B) y número de unidades',
            inscripcion_cbr: 'Inscripción en el Conservador (foja, número, año) si existe',
            criterio_alicuotas: 'Criterio y tabla de prorrateo/alícuotas por unidad',
            bienes_comunes: 'Bienes comunes y de uso exclusivo',
            administracion: 'Forma de administración (administrador, comité, subadministración)',
        },
        sections: ['Identificación del condominio', 'Definiciones', 'Bienes de dominio común y uso exclusivo', 'Derechos y obligaciones de los copropietarios', 'Gastos comunes, fondo común de reserva y prorrateo', 'Asambleas: convocatoria, quórum y mayorías', 'Comité de administración y administrador', 'Uso de unidades, convivencia y mascotas', 'Seguros y obras', 'Sanciones y procedimiento', 'Modificación del reglamento', 'Disposiciones transitorias'],
        bases: [
            { source: 'copropiedad', query: 'reglamento de copropiedad contenido' },
            { source: 'copropiedad', query: 'gastos comunes fondo común de reserva prorrateo' },
            { source: 'copropiedad', query: 'asamblea quórum mayoría' },
            { source: 'reglamento_copropiedad', query: 'reglamento de copropiedad inscripción' },
        ],
        cautions: ['Debe aprobarse en asamblea extraordinaria con el quórum legal y reducirse a escritura pública e inscribirse en el CBR.', 'Las alícuotas deben coincidir con los antecedentes del permiso y recepción; no las estimes.'],
    },
    contrato_trabajo_conserje: {
        title: 'Contrato de trabajo de conserje, mayordomo o personal de aseo',
        requiredFields: {
            ...COMMUNITY, empleador: 'Empleador (comunidad o empresa) y su RUT',
            representante: 'Representante del empleador y su RUT',
            trabajador: 'Nombre, RUT, nacionalidad, fecha de nacimiento y domicilio del trabajador',
            cargo: 'Cargo y funciones (conserje, mayordomo, aseo, nochero)',
            jornada: 'Jornada, turnos, horario y descansos',
            remuneracion: 'Remuneración bruta, gratificación y otros pagos',
            fecha_inicio: 'Fecha de inicio y duración (indefinido o plazo fijo)',
            prevision: 'AFP y sistema de salud',
        },
        sections: ['Comparecientes', 'Naturaleza de los servicios', 'Lugar de trabajo', 'Jornada y descansos', 'Remuneración y forma de pago', 'Obligaciones y prohibiciones', 'Duración', 'Previsión y salud', 'Reglamento interno', 'Firmas'],
        bases: [
            { source: 'trabajo', query: 'artículo 10 contrato de trabajo estipulaciones' },
            { source: 'trabajo', query: 'jornada ordinaria trabajadores de edificios' },
            { source: 'trabajo', query: 'remuneración gratificación' },
            { source: 'copropiedad', query: 'administrador contratar personal remuneraciones' },
        ],
        cautions: ['Remuneración no inferior al ingreso mínimo vigente: verifica el monto actual, no lo supongas.', 'Revisa si la jornada corresponde a una regla especial antes de fijarla.'],
    },
    contrato_administracion: {
        title: 'Contrato de administración del condominio',
        requiredFields: {
            ...COMMUNITY, administrador: 'Nombre o razón social y RUT del administrador',
            registro_administrador: 'Inscripción en el Registro Nacional de Administradores',
            honorarios: 'Honorarios y forma de pago',
            plazo: 'Plazo y causales de término',
            acta_nombramiento: 'Fecha del acta de asamblea que lo designa',
        },
        sections: ['Comparecientes', 'Objeto', 'Funciones y obligaciones del administrador', 'Rendición de cuentas', 'Garantía o póliza', 'Honorarios', 'Plazo y término', 'Confidencialidad y datos personales', 'Domicilio y firmas'],
        bases: [
            { source: 'copropiedad', query: 'administrador funciones obligaciones rendición de cuentas' },
            { source: 'administradores', query: 'registro nacional de administradores inscripción' },
            { source: 'copropiedad', query: 'garantía administrador' },
        ],
        cautions: ['Confirma la vigencia de la inscripción del administrador en el registro.'],
    },
    contrato_mantencion: {
        title: 'Contrato de prestación de servicios de mantención',
        requiredFields: {
            ...COMMUNITY, proveedor: 'Razón social y RUT del proveedor',
            servicio: 'Equipos o instalaciones (ascensores, bombas, gas, etc.)',
            frecuencia: 'Frecuencia, nivel de servicio y tiempos de respuesta',
            precio: 'Precio, reajuste y forma de pago',
            plazo: 'Plazo y término',
        },
        sections: ['Comparecientes', 'Objeto y alcance', 'Obligaciones del proveedor', 'Certificaciones y normas técnicas', 'Precio', 'Seguros y responsabilidad', 'Subcontratación y cumplimiento laboral', 'Plazo y término', 'Firmas'],
        bases: [
            { source: 'copropiedad', query: 'mantención instalaciones ascensores certificación' },
            { source: 'oguc', query: 'ascensores mantención certificación' },
            { source: 'trabajo', query: 'subcontratación responsabilidad solidaria' },
        ],
        cautions: ['Las exigencias técnicas dependen del equipo; verifica la norma técnica aplicable con un profesional.'],
    },
    acta_asamblea: {
        title: 'Acta de asamblea de copropietarios',
        requiredFields: {
            ...COMMUNITY, tipo_asamblea: 'Ordinaria o extraordinaria',
            fecha_lugar: 'Fecha, hora, lugar o medio remoto',
            asistentes: 'Asistentes y derechos representados (o porcentaje)',
            presidente_secretario: 'Quién preside y quién actúa como secretario',
            tabla: 'Tabla de materias',
            acuerdos: 'Acuerdos y votación de cada uno',
        },
        sections: ['Encabezado', 'Constitución y quórum', 'Tabla', 'Desarrollo y acuerdos', 'Votaciones', 'Cierre y firmas'],
        bases: [
            { source: 'copropiedad', query: 'asamblea acta quórum acuerdos' },
            { source: 'copropiedad', query: 'asamblea extraordinaria materias' },
        ],
        cautions: ['No declares quórum ni aprobación si no te entregan la asistencia y la votación.'],
    },
    convocatoria_asamblea: {
        title: 'Convocatoria a asamblea de copropietarios',
        requiredFields: {
            ...COMMUNITY, tipo_asamblea: 'Ordinaria o extraordinaria',
            fecha_lugar: 'Fecha, hora y lugar o medio remoto (primera y segunda citación)',
            tabla: 'Tabla de materias',
            convoca: 'Quién convoca (comité o administrador)',
        },
        sections: ['Encabezado', 'Citación', 'Tabla', 'Quórum y representación', 'Forma de participación', 'Firma'],
        bases: [
            { source: 'copropiedad', query: 'citación asamblea anticipación' },
            { source: 'copropiedad', query: 'asamblea quórum mayoría' },
        ],
        cautions: ['Verifica el plazo de anticipación de la citación en el texto oficial.'],
    },
    otro: {
        title: 'Documento de la comunidad',
        requiredFields: { ...COMMUNITY, objetivo: 'Qué debe lograr el documento y quiénes lo firman' },
        sections: ['Encabezado', 'Antecedentes', 'Contenido', 'Firmas'],
        bases: [{ source: 'copropiedad', query: 'comité administración facultades' }],
        cautions: [],
    },
};

export function legalDraftTypeNames() { return Object.keys(LEGAL_DRAFT_TYPES); }

function isPlaceholder(value: unknown) {
    const text = String(value ?? '').trim();
    return !text || /^(x+|n\/?a|pendiente|\?+|-+|\[.*\]|<.*>)$/i.test(text);
}

export async function prepareLegalDraft(input: { document_type?: string; known_data?: Record<string, unknown>; extra_queries?: Array<{ source?: string; query?: string }> }) {
    const type = LEGAL_DRAFT_TYPES[input.document_type || ''];
    if (!type) return { error: `Tipo de documento no disponible. Usa: ${legalDraftTypeNames().join(', ')}.` };
    const known = Object.fromEntries(Object.entries(input.known_data || {})
        .filter(([key, value]) => key in type.requiredFields && !isPlaceholder(value))
        .map(([key, value]) => [key, String(value).slice(0, 400)]));
    const missing = Object.entries(type.requiredFields).filter(([key]) => !(key in known)).map(([key, label]) => ({ key, label }));
    const extra = (input.extra_queries || []).slice(0, 3)
        .filter(item => item.source && item.query)
        .map(item => ({ source: item.source as OfficialLegalSource, query: String(item.query).slice(0, 180) }));
    const results = await Promise.all([...type.bases, ...extra].map(async basis => ({ basis, result: await consultOfficialLegalSource(basis.source, basis.query) })));
    const verified: Array<{ title: string; url: string; query: string; excerpts: string[]; consultedAt: string }> = [];
    const unverified: Array<{ source: string; query: string; reason: string }> = [];
    for (const { basis, result } of results) {
        const r = result as { title?: string; url?: string; excerpts?: string[]; found?: boolean; consultedAt?: string; error?: string };
        if (r.found && r.excerpts?.length && r.url && r.consultedAt) {
            verified.push({ title: r.title || basis.source, url: r.url, query: basis.query, excerpts: r.excerpts.slice(0, 2), consultedAt: r.consultedAt });
        } else {
            unverified.push({ source: basis.source, query: basis.query, reason: r.error || 'Sin fragmentos en el texto oficial.' });
        }
    }
    return {
        document_type: input.document_type, title: type.title, header: LEGAL_DRAFT_MARKER,
        known_data: known, missing_fields: missing, sections: type.sections,
        verified_sources: verified, unverified_references: unverified, cautions: type.cautions,
        instructions: [
            `La primera línea del documento debe ser exactamente: **${LEGAL_DRAFT_MARKER}**, seguida de una nota breve que indique que no es asesoría legal y debe revisarlo un abogado antes de usarlo o firmarlo.`,
            'Usa solo los datos de known_data. Para cada campo de missing_fields escribe un espacio a completar entre corchetes, por ejemplo [RUT del trabajador], y pide esos datos al final. No inventes nombres, RUT, montos, fechas ni porcentajes.',
            'Cita artículos solo si aparecen en los fragmentos de verified_sources, con el enlace oficial. Toda otra referencia legal márcala como "(referencia no verificada)". Lista al final las referencias de unverified_references como pendientes de verificar.',
            'Si se mencionó un reglamento de copropiedad o documento propio de la comunidad, indica que el borrador debe ajustarse a él.',
            'Formatea con títulos (##) y cláusulas numeradas. Al final indica que puede descargarse en Word con el botón del chat.',
        ],
    };
}
