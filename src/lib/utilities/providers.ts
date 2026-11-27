import type { PersonalBillService, UtilityProvider, UtilityService } from '@/lib/types';

/**
 * Portales para pagar cuentas personales. Los identificadores se copian en
 * el navegador y se ingresan en el portal, nunca se agregan a la URL.
 */
export const UTILITY_PROVIDERS: readonly UtilityProvider[] = [
    { id: 'enel', name: 'Enel', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.enel.cl/es/clientes/servicios-en-linea/pago-de-cuenta.html', lookupUrl: 'https://www.enel.cl/es/clientes/servicios-en-linea/buscador-numero-cliente-mod.html',
        billUrl: 'https://www.enel.cl/es/clientes/servicios-en-linea/copia-boleta.html' },
    { id: 'cge', name: 'CGE', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.cge.cl', lookupUrl: 'https://sucursalvirtual.cge.cl/busqueda-cliente' },
    { id: 'aguas-andinas', name: 'Aguas Andinas', service: 'water', customerNumberLabel: 'N° de cuenta',
        payUrl: 'https://www.aguasandinas.cl' },
    { id: 'essbio', name: 'Essbio', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.essbio.cl/PagoExpress' },
    { id: 'esval', name: 'Esval', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.esval.cl' },
    { id: 'metrogas', name: 'Metrogas', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.metrogas.cl/pagar-mi-cuenta' },
    { id: 'lipigas', name: 'Lipigas', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://lipiappmicuenta.lipigas.cl/app' },
    { id: 'abastible', name: 'Abastible', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://pagodecuenta.abastible.cl/pago_abastible/' },
    { id: 'vtr-internet', name: 'VTR', service: 'internet', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://vtr.com/portaldepagos/initial' },
    { id: 'movistar-internet', name: 'Movistar Hogar', service: 'internet', customerNumberLabel: 'RUT o código de cliente',
        payUrl: 'https://pagos.movistar.cl/publico' },
    { id: 'entel-internet', name: 'Entel Hogar', service: 'internet', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://miperfil.entel.cl/PagoUnificado/Home' },
    { id: 'wom-internet', name: 'WOM Fibra', service: 'internet', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://wom.cl/paga-aqui/' },
    { id: 'movistar-mobile', name: 'Movistar Móvil', service: 'mobile', customerNumberLabel: 'RUT o código de cliente',
        payUrl: 'https://pagos.movistar.cl/publico' },
    { id: 'entel-mobile', name: 'Entel Móvil', service: 'mobile', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://miperfil.entel.cl/PagoUnificado/Home' },
    { id: 'wom-mobile', name: 'WOM Móvil', service: 'mobile', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://wom.cl/paga-aqui/' },
    { id: 'autopase', name: 'Autopase', service: 'highway', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.autopase.cl/paga_aqui_tu_cuenta/medios_electronicos' },
    { id: 'costanera-norte', name: 'Costanera Norte', service: 'highway', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://web.costaneranorte.cl/tu-cuenta/paga-tu-cuenta/' },
    { id: 'vespucio-norte', name: 'Vespucio Norte', service: 'highway', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.avn.cl/' },
    { id: 'sin-tag', name: 'Pasaste sin TAG', service: 'highway', customerNumberLabel: 'Patente',
        payUrl: 'https://www.pasastesintag.cl/' },
    { id: 'chilquinta', name: 'Chilquinta', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.chilquinta.cl/' },
    { id: 'saesa', name: 'Saesa', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://web.gruposaesa.cl/' },
    { id: 'frontel', name: 'Frontel', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://pagosonline.gruposaesa.cl/pagos?empresa=F' },
    { id: 'luz-osorno', name: 'Luz Osorno', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://web.gruposaesa.cl/web/luz-osorno' },
    { id: 'edelaysen', name: 'Edelaysen', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://web.gruposaesa.cl/web/edelaysen/agiliza-tus-tramites' },
    { id: 'crell', name: 'CRELL', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.crell.cl/' },
    { id: 'coopelan', name: 'Coopelan', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.coopelan.cl/pago-en-linea' },
    { id: 'copelec', name: 'Copelec', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.copelec.cl/copelec/webpay_ingreso' },
    { id: 'eepa', name: 'EEPA', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.eepa.cl/' },
    { id: 'edelmag', name: 'EDELMAG', service: 'electricity', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.edelmag.cl/' },
    { id: 'aguas-araucania', name: 'Aguas Araucanía', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.aguasaraucania.cl/pague', lookupUrl: 'https://pagowebpay.aguasaraucania.cl/' },
    { id: 'aguas-del-altiplano', name: 'Aguas del Altiplano', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.aguasdelaltiplano.cl/pague' },
    { id: 'aguas-antofagasta', name: 'Aguas Antofagasta', service: 'water', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.aguasantofagasta.cl/' },
    { id: 'aguas-chanar', name: 'Aguas Chañar', service: 'water', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.aguaschanar.cl/' },
    { id: 'aguas-del-valle', name: 'Aguas del Valle', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.aguasdelvalle.cl/' },
    { id: 'nuevosur', name: 'Nuevosur', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.nuevosur.cl/', lookupUrl: 'https://www.nuevosur.cl/index.php/index' },
    { id: 'suralis', name: 'Suralis', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.suralis.cl/' },
    { id: 'aguas-patagonia', name: 'Aguas Patagonia', service: 'water', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.aguaspatagonia.cl/lugares-y-medios-de-pago' },
    { id: 'aguas-magallanes', name: 'Aguas Magallanes', service: 'water', customerNumberLabel: 'N° de servicio',
        payUrl: 'https://www.aguasmagallanes.cl/' },
    { id: 'smapa', name: 'SMAPA', service: 'water', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.smapa.cl/' },
    { id: 'gasco', name: 'Gasco', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.gasco.cl/', lookupUrl: 'https://gasco.cl/PreguntasFrecuentes/' },
    { id: 'gasco-magallanes', name: 'Gasco Magallanes', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.gascomagallanes.cl/' },
    { id: 'gasvalpo', name: 'GasValpo', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.gasvalpo.cl/miscuentas.aspx' },
    { id: 'gas-sur', name: 'Gas Sur', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.gassur.cl/Atencion-Cliente/Centros-de-Pago', lookupUrl: 'https://www.gassur.cl/centro-atencion/conoce-tu-boleta' },
    { id: 'intergas', name: 'Intergas', service: 'gas', customerNumberLabel: 'N° de cliente',
        payUrl: 'https://www.intergas.cl/' },
    { id: 'claro-hogar', name: 'Claro Hogar', service: 'internet', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://sucursalvirtual.clarochile.cl/PagoExpress/index' },
    { id: 'mundo', name: 'Mundo', service: 'internet', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.tumundo.cl/medios-de-pago/' },
    { id: 'gtd', name: 'GTD', service: 'internet', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.gtd.cl/nuestra-empresa/medios-de-pago' },
    { id: 'telsur', name: 'Telsur', service: 'internet', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.telsur.cl/nuestra-empresa/medios-de-pago' },
    { id: 'claro-movil', name: 'Claro Móvil', service: 'mobile', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://sucursalvirtual.clarochile.cl/PagoExpress/index' },
    { id: 'virgin-mobile', name: 'Virgin Mobile', service: 'mobile', customerNumberLabel: 'Número de celular',
        payUrl: 'https://www.virginmobile.cl/ayuda/servicio-al-cliente/prefiere-nuestros-canales-digitales' },
    { id: 'vtr-movil', name: 'VTR Móvil', service: 'mobile', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://vtr.com/portaldepagos/initial' },
    { id: 'rutapass', name: 'RutaPass', service: 'highway', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.rutapass.cl/' },
    { id: 'ruta-del-maipo', name: 'Ruta del Maipo', service: 'highway', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.rutamaipo.cl/pagar-tu-cuenta/' },
    { id: 'vespucio-sur', name: 'Vespucio Sur', service: 'highway', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.vespuciosur.cl/' },
    { id: 'vespucio-oriente-avo', name: 'Vespucio Oriente (AVO)', service: 'highway', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.avo.cl/pago_cuenta/consulta' },
    { id: 'tag-total-unired', name: 'TAG Total (Unired)', service: 'highway', customerNumberLabel: 'RUT del titular',
        payUrl: 'https://www.tagtotal.cl/' },
];

export const UTILITY_SERVICE_LABELS: Record<PersonalBillService, string> = {
    electricity: 'Luz',
    water: 'Agua',
    gas: 'Gas',
    internet: 'Internet',
    highway: 'Autopistas / TAG',
    mobile: 'Celular',
};

export const UTILITY_SERVICES = Object.keys(UTILITY_SERVICE_LABELS) as PersonalBillService[];

export function isPersonalBillService(value: unknown): value is PersonalBillService {
    return typeof value === 'string' && Object.hasOwn(UTILITY_SERVICE_LABELS, value);
}

export function isUtilityService(value: unknown): value is UtilityService {
    return value === 'electricity' || value === 'water' || value === 'gas';
}

export function findUtilityProvider(id: string): UtilityProvider | undefined {
    return UTILITY_PROVIDERS.find(provider => provider.id === id);
}

/** Reconoce la empresa por el nombre que trae una boleta ("ENEL DISTRIBUCIÓN CHILE S.A." → enel). */
export function matchUtilityProvider(name: string): UtilityProvider | undefined {
    const normalized = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!normalized.trim()) return undefined;
    return UTILITY_PROVIDERS.filter(provider => isUtilityService(provider.service)
        && normalized.includes(provider.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()))
        .reduce<UtilityProvider | undefined>((match, provider) =>
            !match || provider.name.length > match.name.length ? provider : match, undefined);
}

/** Deja solo dígitos, letras y guion: "12.345.678-9" y "12345678-9" son la misma cuenta. */
export function normalizeCustomerNumber(value: unknown): string {
    return String(value ?? '').toUpperCase().replace(/[^0-9A-Z-]/g, '').slice(0, 40);
}

/**
 * Próximo vencimiento de una cuenta con vencimiento en `dueDay` de cada mes.
 * Un día 31 en un mes de 30 días vence el último día del mes.
 */
export function nextDueDate(dueDay: number, today: string): string {
    const [year, month, day] = today.split('-').map(Number);
    const clamp = (y: number, m: number) => Math.min(dueDay, new Date(Date.UTC(y, m, 0)).getUTCDate());
    const thisMonthDay = clamp(year, month);
    if (day <= thisMonthDay) return `${year}-${String(month).padStart(2, '0')}-${String(thisMonthDay).padStart(2, '0')}`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clamp(nextYear, nextMonth)).padStart(2, '0')}`;
}

/** Días entre dos fechas civiles AAAA-MM-DD. */
export function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/**
 * Compara una boleta con la anterior del mismo n° de cliente. Avisa si se
 * aleja más de un 40% (una fuga de agua, un medidor mal leído, un cobro doble).
 */
export function utilityAmountWarning(amount: number, previous: { amount: number; period: string } | null): string | null {
    if (!previous || previous.amount <= 0 || amount <= 0) return null;
    const change = (amount - previous.amount) / previous.amount;
    if (Math.abs(change) < 0.4) return null;
    const percent = Math.round(Math.abs(change) * 100);
    const money = `$${Math.round(previous.amount).toLocaleString('es-CL')}`;
    return change > 0
        ? `El monto sube ${percent}% frente a la boleta anterior (${previous.period}: ${money}). Revisa si hay una fuga o un error de lectura.`
        : `El monto baja ${percent}% frente a la boleta anterior (${previous.period}: ${money}). Comprueba que la boleta esté completa.`;
}
