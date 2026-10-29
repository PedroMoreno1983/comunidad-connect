/**
 * platformMap.ts — Mapa de conocimiento de Convive Connect para CoCo.
 *
 * Una entrada por pantalla de src/app: quién la ve, qué permite hacer y los
 * pasos típicos. CoCo lo usa de dos formas, ambas baratas en tokens:
 *   1. La pantalla actual se inyecta al prompt (una sola entrada).
 *   2. La herramienta get_platform_guide busca solo las 1–3 entradas
 *      relevantes para "¿cómo hago X?" / "¿dónde está X?".
 *
 * `npm run qa:coco-platform-map` falla si aparece una page.tsx en src/app que
 * no esté aquí (ni en PLATFORM_ALIASES ni en su lista de exclusiones).
 * Mantén cada entrada escueta: una línea de "does" y 2–4 pasos.
 *
 * Los tipos son locales a propósito: es un dato de CoCo, no del dominio.
 */

/** "committee" = residente designado en el comité (finance_committee_members). */
export type PlatformRole = 'resident' | 'committee' | 'admin' | 'concierge' | 'public';

export interface PlatformScreen {
    /** Ruta tal como en src/app, sin grupos "(...)"; los segmentos dinámicos van como [id]. */
    route: string;
    title: string;
    module: string;
    roles: readonly PlatformRole[];
    does: string;
    steps?: readonly string[];
    keywords: readonly string[];
}

export const PLATFORM_SCREENS: readonly PlatformScreen[] = [
    // ── Acceso ───────────────────────────────────────────────────────────────
    { route: '/login', title: 'Iniciar sesión', module: 'Acceso', roles: ['public'],
        does: 'Entrar con correo y contraseña o con una passkey registrada; recuperar la clave.',
        keywords: ['login', 'entrar', 'iniciar sesion', 'contrasena', 'clave', 'olvide', 'face id', 'huella', 'passkey'] },
    { route: '/resident-access', title: 'Acceso de residentes', module: 'Acceso', roles: ['public'],
        does: 'Solicitar un enlace personal para entrar si el correo figura en la nómina de una unidad.',
        steps: ['Abre Acceso de residentes', 'Escribe el correo registrado en la nómina', 'Abre el enlace que llega por correo'],
        keywords: ['residente', 'acceso', 'enlace', 'correo', 'nomina', 'entrar sin codigo'] },
    { route: '/signup', title: 'Registro con invitación', module: 'Acceso', roles: ['public'],
        does: 'Crear cuenta con el código de invitación que entrega Administración.',
        steps: ['Pide el código a Administración (Usuarios y accesos)', 'Ingresa código, correo y contraseña', 'Acepta términos y privacidad'],
        keywords: ['registro', 'registrarme', 'crear cuenta', 'codigo de invitacion', 'invitacion'] },
    { route: '/support', title: 'Soporte', module: 'Acceso', roles: ['public', 'resident', 'admin', 'concierge'],
        does: 'Contacto directo con soporte de Convive (correo y WhatsApp).',
        keywords: ['soporte', 'ayuda tecnica', 'contacto', 'error', 'falla de la app'] },
    { route: '/privacy', title: 'Política de privacidad', module: 'Acceso', roles: ['public', 'resident', 'admin', 'concierge'],
        does: 'Qué datos trata Convive y CoCo, con qué finalidad y cómo ejercer tus derechos.',
        keywords: ['privacidad', 'politica', 'datos personales', 'ley 21719'] },

    // ── Inicio y comunidad ──────────────────────────────────────────────────
    { route: '/home', title: 'Inicio', module: 'Inicio', roles: ['resident'],
        does: 'Resumen del residente: lo que debe, reservas, encomiendas y accesos rápidos.',
        keywords: ['inicio', 'dashboard', 'resumen', 'portada'] },
    { route: '/admin', title: 'Panel de administración', module: 'Inicio', roles: ['admin'],
        does: 'Resumen del edificio: residentes activos, cobranza del periodo y solicitudes abiertas.',
        keywords: ['inicio', 'panel', 'dashboard', 'resumen del edificio'] },
    { route: '/notifications', title: 'Notificaciones', module: 'Comunidad', roles: ['resident', 'admin'],
        does: 'Bandeja con todos tus avisos y alertas.',
        keywords: ['notificaciones', 'alertas', 'bandeja', 'avisos recibidos'] },
    { route: '/feed', title: 'Comunicaciones', module: 'Comunidad', roles: ['resident'],
        does: 'Avisos oficiales de Administración y publicaciones de la comunidad, con filtros.',
        steps: ['Abre Comunicaciones', 'Filtra por Todos, Urgentes, Mantención o Comunidad', 'Los avisos fijados aparecen arriba'],
        keywords: ['comunicaciones', 'avisos', 'circular', 'comunicado', 'noticias', 'comunidad'] },
    { route: '/comunicaciones', title: 'Comunicaciones y avisos', module: 'Comunidad', roles: ['admin', 'concierge'],
        does: 'Redactar y enviar comunicados a la comunidad por los canales elegidos.',
        steps: ['Abre Comunicaciones', 'Elige categoría y prioridad', 'Escribe título y mensaje', 'Elige canales, revisa la vista previa y envía'],
        keywords: ['circular', 'comunicado', 'aviso', 'enviar aviso', 'publicar aviso', 'mensaje a la comunidad'] },
    { route: '/social', title: 'Muro social', module: 'Comunidad', roles: ['resident'],
        does: 'Muro informal entre vecinos: publicaciones, fotos y comentarios.',
        steps: ['Escribe en "Comparte algo útil con tus vecinos"', 'Añade foto si quieres', 'Publica'],
        keywords: ['muro', 'social', 'publicar', 'post', 'vecinos', 'foto'] },
    { route: '/directorio', title: 'Directorio', module: 'Comunidad', roles: ['resident', 'admin', 'concierge'],
        does: 'Buscar vecinos, unidades y contactos que la comunidad comparte.',
        keywords: ['directorio', 'buscar vecino', 'contacto', 'telefono', 'unidad'] },
    { route: '/chat', title: 'CoCo pantalla completa', module: 'CoCo', roles: ['resident', 'admin', 'concierge'],
        does: 'Conversación con CoCo a pantalla completa (lo mismo que el botón CoCo).',
        keywords: ['coco', 'chat', 'asistente', 'ia'] },
    { route: '/profile', title: 'Mi perfil y privacidad', module: 'Ajustes', roles: ['resident', 'admin', 'concierge'],
        does: 'Datos personales, unidad, teléfono, avisos por WhatsApp, foto y privacidad.',
        steps: ['Abre Mi perfil (menú Ajustes)', 'Edita nombre, teléfono o foto', 'Activa o desactiva Notificaciones WhatsApp', 'Guarda'],
        keywords: ['perfil', 'mis datos', 'telefono', 'whatsapp', 'foto', 'privacidad', 'cambiar nombre'] },

    // ── Mi hogar (residente) ────────────────────────────────────────────────
    { route: '/expenses', title: 'Mis Gastos', module: 'Finanzas', roles: ['resident'],
        does: 'Cobros por pagar, cartola, respaldos de cada cobro, cuotas de convenio y pago directo en el entorno Haulmer.',
        steps: ['Abre Mis Gastos', 'Revisa "Cobros por pagar" y la cartola', 'Paga directamente en el entorno Haulmer'],
        keywords: ['gasto comun', 'gastos comunes', 'pagar', 'pago', 'cuanto debo', 'cartola', 'haulmer', 'comprobante', 'convenio', 'cuotas', 'boleta'] },
    { route: '/expenses/solidaridad', title: 'Apoyo mutuo', module: 'Convivencia', roles: ['resident'],
        does: 'Fondo solidario: conocerlo, postular de forma confidencial y sumarse a tareas vecinales.',
        keywords: ['fondo solidario', 'apoyo mutuo', 'solidaridad', 'ayuda economica', 'cesantia'] },
    { route: '/expenses/committee-review', title: 'Revisión del comité', module: 'Finanzas', roles: ['committee'],
        does: 'El comité aprueba o rechaza cobros y convenios que Administración le asigna.',
        steps: ['Abre Mis Gastos → "Revisión del comité"', 'Lee cada cobro o convenio', 'Deja una nota y aprueba o rechaza'],
        keywords: ['comite', 'revision', 'aprobar', 'apruebo', 'aprobar convenio', 'revisar'] },
    { route: '/expenses/committee-digest', title: 'Resumen semanal del comité', module: 'Finanzas', roles: ['committee'],
        does: 'Resumen semanal de la gestión financiera para el comité.',
        keywords: ['comite', 'resumen semanal', 'informe semanal'] },
    { route: '/resident/consumo', title: 'Mi Consumo de Agua', module: 'Agua', roles: ['resident'],
        does: 'Lecturas y consumo de agua de tu unidad por mes.',
        keywords: ['agua', 'consumo', 'lectura', 'medidor', 'boleta de agua'] },
    { route: '/resident/packages', title: 'Mis Encomiendas', module: 'Conserjería', roles: ['resident'],
        does: 'Paquetes que Conserjería recibió para tu unidad y si ya se retiraron.',
        keywords: ['encomienda', 'paquete', 'pedido', 'retirar', 'courier'] },
    { route: '/resident/invitations', title: 'Mis Invitaciones', module: 'Accesos', roles: ['resident'],
        does: 'Crear pases QR para visitas, compartirlos y ver la bitácora de ingresos.',
        steps: ['Abre Mis Invitaciones', 'Crea un pase para tu visita', 'Comparte el código QR', 'Conserjería lo valida al llegar'],
        keywords: ['invitar', 'invitacion', 'visita', 'qr', 'pase', 'acceso', 'invitado'] },
    { route: '/resident/cases', title: 'Mis Casos CoCo', module: 'Mantención', roles: ['resident'],
        does: 'Seguimiento de reclamos y reportes hechos a CoCo, con su estado.',
        keywords: ['caso', 'reclamo', 'reporte', 'estado de mi reclamo', 'seguimiento'] },

    // ── Servicios de la comunidad ───────────────────────────────────────────
    { route: '/amenities', title: 'Espacios Comunes', module: 'Reservas', roles: ['resident', 'admin', 'concierge'],
        does: 'Reservar quincho, sala, piscina u otros espacios por bloques; Administración crea los espacios.',
        steps: ['Abre Espacios Comunes', 'Elige el espacio y el día', 'Toma un turno libre y confirma', 'Admin: "Crear tipo de espacio común" con aforo, tarifa y duración'],
        keywords: ['reservar', 'reserva', 'quincho', 'sala', 'piscina', 'espacio comun', 'gimnasio', 'turno'] },
    { route: '/estacionamientos', title: 'Estacionamientos', module: 'Estacionamientos', roles: ['resident', 'admin', 'concierge'],
        does: 'Arrendar estacionamientos por Haulmer o con cargo a gastos comunes, y publicar el propio. Administración aprueba espacios y fija reglas.',
        steps: ['Registra tu vehículo (patente)', 'Busca un espacio libre en el horario', 'Reserva: se paga por Haulmer (o se carga a gastos comunes si la comunidad así lo definió)', 'Para ofrecer el tuyo, publícalo y espera la aprobación'],
        keywords: ['estacionamiento', 'parking', 'patente', 'vehiculo', 'auto', 'arrendar estacionamiento'] },
    { route: '/marketplace', title: 'Marketplace', module: 'Marketplace', roles: ['resident', 'admin'],
        does: 'Comprar, vender o permutar entre vecinos; el admin modera publicaciones.',
        steps: ['Abre Marketplace', '"Publicar producto": título, categoría, estado, precio y fotos', 'Gestiona tus avisos en "Mis Publicaciones"'],
        keywords: ['vender', 'comprar', 'marketplace', 'publicar producto', 'permuta', 'trueque', 'aviso de venta'] },
    { route: '/resident/supermercado', title: 'Supermercado', module: 'Supermercado', roles: ['resident'],
        does: 'Elegir tienda (Jumbo, Santa Isabel, Líder, Unimarc o aCuenta), buscar con foto y precio y armar el carro.',
        steps: ['Elige la tienda', 'Busca productos y agrégalos al carro', 'Opcional: compara con otras cadenas', 'Abre el carro en el sitio de la tienda para pagar allá'],
        keywords: ['supermercado', 'compras', 'carro', 'jumbo', 'lider', 'unimarc', 'santa isabel', 'acuenta', 'lista de compras'] },
    { route: '/resident/supermercado/comparador', title: 'Comparador de supermercados', module: 'Supermercado', roles: ['resident'],
        does: 'Comparar tu carro entre las cadenas que elijas, producto por producto.',
        keywords: ['comparar precios', 'comparador', 'mas barato', 'precio'] },
    { route: '/convivencia', title: 'Convivencia', module: 'Convivencia', roles: ['resident'],
        does: 'Mediación CNV, Banco de Tiempo, Abasto Comunitario, Plaza Social y Apoyo Mutuo.',
        steps: ['Abre Convivencia y elige la pestaña', 'Mediación: redacta la petición CNV (hecho, sentimiento, necesidad, petición)', 'Iniciativas nuevas quedan pendientes hasta que Administración las valida'],
        keywords: ['convivencia', 'ruido', 'vecino', 'mediacion', 'cnv', 'banco de tiempo', 'abasto', 'compra colectiva', 'plaza social', 'huerto', 'reciclaje'] },
    { route: '/services', title: 'Directorio de servicios', module: 'Servicios', roles: ['resident', 'admin'],
        does: 'Proveedores por categoría (gasfitería, electricidad, cerrajería, aseo) y tus solicitudes (?view=requests).',
        steps: ['Abre Directorio Servicios', 'Elige la categoría', 'Abre el perfil del proveedor y contáctalo'],
        keywords: ['gasfiter', 'electricista', 'cerrajero', 'aseo', 'proveedor', 'servicio', 'mis solicitudes'] },
    { route: '/services/[category]', title: 'Servicios por categoría', module: 'Servicios', roles: ['resident', 'admin'],
        does: 'Lista de proveedores de una categoría.',
        keywords: ['categoria', 'gasfiteria', 'electricidad'] },
    { route: '/services/provider/[id]', title: 'Perfil de proveedor', module: 'Servicios', roles: ['resident', 'admin'],
        does: 'Ficha, reseñas y contacto de un proveedor.',
        keywords: ['proveedor', 'resenas', 'contactar proveedor'] },
    { route: '/services/register', title: 'Registrarme como proveedor', module: 'Servicios', roles: ['resident'],
        does: 'Ofrecer tus servicios a la comunidad con un perfil verificable.',
        keywords: ['ofrecer servicios', 'ser proveedor', 'registrarme como proveedor'] },
    { route: '/services/provider-dashboard', title: 'Panel proveedor', module: 'Servicios', roles: ['resident'],
        does: 'Solicitudes recibidas y perfil, si eres proveedor.',
        keywords: ['panel proveedor', 'solicitudes recibidas'] },
    { route: '/votaciones', title: 'Votaciones', module: 'Gobernanza', roles: ['resident', 'admin'],
        does: 'Residente vota en consultas activas; admin crea votaciones y ve resultados.',
        steps: ['Abre Votaciones', 'Elige la consulta activa', 'Selecciona una opción y confirma tu voto'],
        keywords: ['votar', 'votacion', 'encuesta', 'consulta', 'crear votacion', 'resultados'] },
    { route: '/votaciones/asambleas', title: 'Asambleas', module: 'Gobernanza', roles: ['resident', 'committee'],
        does: 'Citaciones, asistencia, poderes, votación y actas de asambleas (Ley 21.442).',
        keywords: ['asamblea', 'citacion', 'poder', 'acta', 'quorum'] },

    // ── Conserjería ─────────────────────────────────────────────────────────
    { route: '/concierge', title: 'Turno activo', module: 'Conserjería', roles: ['concierge'],
        does: 'Centro del turno: nueva visita, validar QR, recibir paquete, bitácora, incidencias y entrega de turno.',
        steps: ['Elige "¿Qué necesitas registrar?"', 'Anota novedades en la bitácora', 'Al cerrar, deja la entrega de turno por escrito'],
        keywords: ['turno', 'bitacora', 'entrega de turno', 'incidencia', 'relevo', 'validar qr'] },
    { route: '/concierge/visitors', title: 'Registro de visitas', module: 'Conserjería', roles: ['concierge', 'admin'],
        does: 'Registrar ingreso y salida de visitas (solo nombre y unidad de destino).',
        steps: ['Abre Visitas', 'Nombre del visitante y unidad destino', 'Registra la entrada; marca la salida al irse'],
        keywords: ['visita', 'visitante', 'registrar visita', 'ingreso', 'acceso'] },
    { route: '/concierge/packages', title: 'Paquetería', module: 'Conserjería', roles: ['concierge', 'admin'],
        does: 'Registrar encomiendas, avisar al residente y marcar la entrega.',
        steps: ['Abre Paquetería', '"Registrar Encomienda": unidad y courier', 'Avisa al residente', 'Marca entregado al retirarla'],
        keywords: ['encomienda', 'paquete', 'registrar paquete', 'courier', 'entregar paquete'] },
    { route: '/staff/training', title: 'Aula Virtual IA', module: 'Capacitación', roles: ['admin', 'concierge'],
        does: 'Cursos para el equipo; admin crea y publica, conserjería estudia los de su rol.',
        keywords: ['curso', 'capacitacion', 'aula', 'formacion', 'training'] },

    // ── Administración ──────────────────────────────────────────────────────
    { route: '/agent-center', title: 'Agent Center', module: 'IA operativa', roles: ['admin'],
        does: 'CoCo propone acciones (p. ej. el cobro de una unidad puntual) y tú apruebas; trazabilidad.',
        keywords: ['agent center', 'agente', 'automatizar', 'cobro puntual', 'cobrar a una unidad'] },
    { route: '/admin/finanzas', title: 'Control Finanzas', module: 'Finanzas', roles: ['admin'],
        does: 'Recorrido del mes, del gasto común al cierre, y accesos a cada pantalla financiera.',
        keywords: ['finanzas', 'cobranza', 'morosidad', 'estado financiero'] },
    { route: '/admin/finanzas/egresos', title: 'Egresos y emisión', module: 'Finanzas', roles: ['admin'],
        does: 'Cargar egresos del mes, ver el prorrateo y emitir el gasto común.',
        steps: ['Carga cada egreso (o copia los del mes anterior)', 'Revisa el prorrateo por unidad', 'Emite con fecha de vencimiento'],
        keywords: ['egreso', 'emitir', 'emision', 'prorrateo', 'gasto comun', 'cobros del mes', 'cuenta de luz'] },
    { route: '/admin/finanzas/cobranza', title: 'Cobranza y pagos', module: 'Finanzas', roles: ['admin'],
        does: 'Saldo y cartola por unidad, registrar pagos recibidos, multas, cargos e interés por mora.',
        steps: ['Busca la unidad', 'Registra el pago con medio y N° de comprobante', 'Desde la cartola puedes imprimir el certificado'],
        keywords: ['registrar pago', 'cobranza', 'cartola', 'multa', 'cargo extraordinario', 'interes', 'saldo'] },
    { route: '/admin/finanzas/rendicion', title: 'Rendición y fondo de reserva', module: 'Finanzas', roles: ['admin'],
        does: 'Cierre del periodo: cobrado vs recaudado vs egresos, fondo de reserva y tasas.',
        keywords: ['rendicion', 'cierre', 'fondo de reserva', 'tasa de interes', 'informe mensual'] },
    { route: '/admin/finanzas/presupuesto', title: 'Presupuesto anual', module: 'Finanzas', roles: ['admin'],
        does: 'Presupuesto aprobado en asamblea contra lo gastado.',
        keywords: ['presupuesto', 'anual'] },
    { route: '/admin/finanzas/conciliacion', title: 'Conciliación bancaria', module: 'Finanzas', roles: ['admin'],
        does: 'Cruzar la cartola del banco con los pagos y detectar depósitos sin imputar.',
        keywords: ['conciliacion', 'banco', 'cartola bancaria', 'deposito'] },
    { route: '/admin/finanzas/convenios', title: 'Convenios de pago', module: 'Finanzas', roles: ['admin'],
        does: 'Abrir un convenio de 2 a 36 cuotas por unidad y registrar el pago de cada cuota.',
        keywords: ['convenio', 'cuotas', 'repactar'] },
    { route: '/admin/finanzas/remuneraciones', title: 'Remuneraciones', module: 'Finanzas', roles: ['admin'],
        does: 'Personal, liquidación del mes y marcarla pagada.',
        keywords: ['remuneraciones', 'sueldo', 'liquidacion', 'personal', 'conserje sueldo'] },
    { route: '/admin/finanzas/contabilidad', title: 'Libro diario', module: 'Finanzas', roles: ['admin'],
        does: 'Asientos y saldos por cuenta; asiento manual cuadrado.',
        keywords: ['contabilidad', 'libro diario', 'asiento'] },
    { route: '/admin/finanzas/certificado', title: 'Certificado', module: 'Finanzas', roles: ['admin'],
        does: 'Certificado imprimible del estado de cuenta de una unidad.',
        keywords: ['certificado', 'no adeudar'] },
    { route: '/admin/finanzas/facturacion', title: 'Facturación electrónica', module: 'Finanzas', roles: ['admin'],
        does: 'Datos del emisor y documentos tributarios, en modo pruebas o producción.',
        keywords: ['factura', 'boleta electronica', 'sii', 'emisor'] },
    { route: '/admin/finanzas/comite', title: 'Integrantes del comité', module: 'Finanzas', roles: ['admin'],
        does: 'Designar o retirar a los residentes que revisan cobros y convenios.',
        steps: ['Abre Control Finanzas → Integrantes del comité', 'Elige al residente', 'Designa; para retirarlo usa Terminar'],
        keywords: ['comite', 'designar comite', 'integrantes'] },
    { route: '/admin/units', title: 'Unidades', module: 'Copropiedad', roles: ['admin'],
        does: 'Crear unidades, asignar residentes y definir alícuotas en %.',
        steps: ['"Crear unidad" con número y torre', '"Asignar residente"', 'Edita la alícuota %: la suma debe dar 100 %'],
        keywords: ['unidad', 'departamento', 'depto', 'alicuota', 'asignar residente', 'crear unidad'] },
    { route: '/admin/users', title: 'Usuarios y accesos', module: 'Copropiedad', roles: ['admin'],
        does: 'Residentes y personal, estado de acceso y códigos de invitación.',
        steps: ['Abre Usuarios', 'Genera un código de invitación', 'Compártelo: la persona se registra en /signup'],
        keywords: ['usuario', 'invitar residente', 'codigo de invitacion', 'acceso', 'dar de alta', 'conserje nuevo'] },
    { route: '/admin/onboarding', title: 'Carga masiva', module: 'Copropiedad', roles: ['admin'],
        does: 'Subir planillas o documentos y que CoCo cree unidades y residentes.',
        keywords: ['carga masiva', 'importar', 'excel', 'planilla', 'subir residentes'] },
    { route: '/admin/asambleas', title: 'Asambleas', module: 'Gobernanza', roles: ['admin'],
        does: 'Crear, citar, conducir y cerrar asambleas (Ley 21.442).',
        keywords: ['asamblea', 'citar', 'convocar', 'acta'] },
    { route: '/admin/consumo', title: 'Control hídrico', module: 'Agua', roles: ['admin'],
        does: 'Lecturas por unidad, cierre mensual y alertas de sobreconsumo.',
        keywords: ['agua', 'lecturas', 'medidores', 'fuga', 'consumo'] },
    { route: '/admin/convivencia', title: 'Gestión de convivencia', module: 'Convivencia', roles: ['admin'],
        does: 'Validar iniciativas y coordinadores, casos escalados, compras comunitarias y apoyo mutuo.',
        keywords: ['convivencia', 'validar iniciativa', 'coordinador', 'mediacion', 'caso escalado', 'fondo solidario'] },
    { route: '/admin/mantenimiento', title: 'Mantenimiento', module: 'Mantención', roles: ['admin'],
        does: 'Cola operativa: de la alerta a la tarea cerrada, incluidos los casos detectados por CoCo.',
        keywords: ['mantenimiento', 'mantencion', 'reparacion', 'ascensor', 'falla', 'tarea'] },
    { route: '/admin/operations', title: 'Centro operativo', module: 'Operación', roles: ['admin'],
        does: 'Eventos de las últimas 24 h, acciones registradas e integraciones.',
        keywords: ['operaciones', 'auditoria', 'eventos', 'integraciones'] },
    { route: '/admin/whatsapp', title: 'WhatsApp CoCo', module: 'Comunidad', roles: ['admin'],
        does: 'Estado del canal WhatsApp y aviso a la comunidad con plantilla aprobada.',
        keywords: ['whatsapp', 'twilio', 'aviso masivo'] },
];

/** Rutas que solo redirigen: se resuelven a su destino. */
export const PLATFORM_ALIASES: Readonly<Record<string, string>> = {
    '/soporte': '/support',
    '/privacy-center': '/profile',
    '/resident/finances': '/expenses',
    '/marketplace/my-listings': '/marketplace',
    '/services/my-requests': '/services',
    '/admin/marketplace': '/marketplace',
    '/admin/votaciones': '/votaciones',
    '/admin/training': '/staff/training',
    '/training': '/staff/training',
};

const ROLE_LABEL: Record<PlatformRole, string> = {
    resident: 'residente', committee: 'comité', admin: 'administración', concierge: 'conserjería', public: 'público',
};

const STOPWORDS = new Set([
    'como', 'hago', 'hacer', 'donde', 'esta', 'estan', 'puedo', 'para', 'quiero', 'necesito', 'una', 'uno', 'unos',
    'las', 'los', 'del', 'que', 'con', 'por', 'mis', 'mi', 'el', 'la', 'de', 'en', 'un', 'se', 'me', 'al', 'lo',
    'hay', 'cual', 'coco', 'ayuda', 'ayudame', 'favor', 'pantalla', 'seccion', 'modulo', 'encuentro',
]);

function normalize(value: string): string {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Raíz gruesa en español: quita la terminación verbal o de plural y corta a 6 letras. */
function stem(token: string): string {
    const base = token.length > 4 ? token.replace(/(iendo|ando|amos|emos|imos|aron|ieron|ar|er|ir|as|es|os|a|e|o|s)$/, '') : token;
    return base.slice(0, 6);
}

function stems(value: string): string[] {
    return normalize(value).split(/[^a-z0-9]+/)
        .filter(token => token.length > 2 && !STOPWORDS.has(token))
        .map(stem);
}

function stemMatch(a: string, b: string): boolean {
    if (a === b) return true;
    return Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}

function hits(queryStems: readonly string[], candidate: string): boolean {
    return queryStems.some(q => stemMatch(q, candidate));
}

/** Convierte el rol de la cuenta en los roles del mapa que puede ver. */
export function platformRolesFor(role: string | null | undefined): PlatformRole[] {
    if (role === 'admin') return ['admin', 'public'];
    if (role === 'concierge') return ['concierge', 'public'];
    // El comité es un residente designado: se le muestran esas pantallas marcadas.
    return ['resident', 'committee', 'public'];
}

export function isScreenVisibleFor(screen: PlatformScreen, role: string | null | undefined): boolean {
    const allowed = platformRolesFor(role);
    return screen.roles.some(r => allowed.includes(r));
}

function patternMatches(pattern: string, pathname: string): boolean {
    const a = pattern.split('/').filter(Boolean);
    const b = pathname.split('/').filter(Boolean);
    return a.length === b.length && a.every((seg, i) => /^\[.+\]$/.test(seg) || seg === b[i]);
}

/** Entrada del mapa para una ruta real (resuelve alias, query y segmentos dinámicos). */
export function findScreen(pathname: string | null | undefined): PlatformScreen | undefined {
    if (!pathname) return undefined;
    let path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    path = PLATFORM_ALIASES[path] ?? path;
    return PLATFORM_SCREENS.find(s => s.route === path)
        ?? PLATFORM_SCREENS.find(s => s.route.includes('[') && patternMatches(s.route, path));
}

/** Rutas estáticas del mapa (navegables por CoCo). */
export function staticPlatformRoutes(): string[] {
    return PLATFORM_SCREENS.filter(s => !s.route.includes('[')).map(s => s.route);
}

/** Busca las pantallas más relevantes para una pregunta, filtradas por rol. */
export function searchPlatformMap(query: string, role: string | null | undefined, limit = 3): PlatformScreen[] {
    const qStems = [...new Set(stems(query))];
    if (qStems.length === 0) return [];
    const scored = PLATFORM_SCREENS
        // Quien pregunta ya tiene sesión: las pantallas solo públicas (login, registro) no son respuesta.
        .filter(screen => isScreenVisibleFor(screen, role) && !screen.route.includes('[')
            && !screen.roles.every(r => r === 'public'))
        .map(screen => {
            let score = 0;
            for (const kw of screen.keywords) {
                const parts = stems(kw);
                if (parts.length > 1) {
                    if (parts.every(part => hits(qStems, part))) score += 5;
                } else if (parts.length === 1 && hits(qStems, parts[0])) score += 3;
            }
            for (const s of new Set(stems(screen.title))) if (hits(qStems, s)) score += 2;
            for (const s of new Set(stems(`${screen.does} ${(screen.steps ?? []).join(' ')}`))) if (hits(qStems, s)) score += 1;
            return { screen, score };
        })
        .filter(item => item.score >= 3)
        .sort((x, y) => y.score - x.score);
    return scored.slice(0, limit).map(item => item.screen);
}

/** Texto compacto de una entrada (para prompt, respaldo local o resultado de herramienta). */
export function describeScreen(screen: PlatformScreen, role?: string | null): string {
    const onlyCommittee = role !== 'admin' && role !== 'concierge'
        && screen.roles.includes('committee') && !screen.roles.includes('resident');
    const who = onlyCommittee ? ' (solo integrantes vigentes del comité)' : '';
    const steps = screen.steps?.length ? ` Pasos: ${screen.steps.map((s, i) => `${i + 1}) ${s}`).join(' ')}.` : '';
    return `${screen.title} (${screen.route})${who}: ${screen.does}${steps}`;
}

/**
 * Fragmento por request para el prompt: solo la pantalla actual + una regla
 * de uso. ~60–120 tokens; el resto del mapa se consulta con la herramienta.
 */
export function buildPlatformContext(currentPage: string | null | undefined, role: string | null | undefined): string {
    const screen = findScreen(currentPage);
    const roles = platformRolesFor(role).filter(r => r !== 'public').map(r => ROLE_LABEL[r]).join('/');
    const here = screen
        ? `El usuario está mirando ${describeScreen(screen, role)}`
        : currentPage ? `El usuario está en ${currentPage} (pantalla sin ficha en el mapa).` : '';
    return [
        `**Mapa de la plataforma** (perfil: ${roles}). ${here}`,
        'Para "¿cómo hago X?" o "¿dónde está X?" usa get_platform_guide y responde con pasos numerados concretos y un enlace interno en markdown, p. ej. [Abrir Mis Gastos](/expenses). No indiques pantallas que su rol no ve. Usa NAVEGAR solo si pide que lo lleves.',
    ].join('\n');
}

export interface PlatformGuideResult {
    pantalla_actual?: string;
    resultados: { titulo: string; ruta: string; url: string; hace: string; pasos: readonly string[]; solo_comite?: boolean }[];
    nota?: string;
}

/** Resultado de la herramienta get_platform_guide. */
export function platformGuide(query: string, role: string | null | undefined, currentPage?: string | null, siteUrl = ''): PlatformGuideResult {
    const current = findScreen(currentPage);
    const matches = searchPlatformMap(query, role);
    const base = siteUrl.replace(/\/+$/, '');
    return {
        ...(current ? { pantalla_actual: `${current.title} (${current.route})` } : {}),
        resultados: matches.map(screen => ({
            titulo: screen.title,
            ruta: screen.route,
            url: `${base}${screen.route}`,
            hace: screen.does,
            pasos: screen.steps ?? [],
            ...(screen.roles.includes('committee') && !screen.roles.includes('resident') && role !== 'admin' ? { solo_comite: true } : {}),
        })),
        ...(matches.length === 0 ? { nota: 'No hay una pantalla para eso en el perfil de esta persona. Dilo con honestidad y ofrece la más cercana o pedirle a Administración.' } : {}),
    };
}
