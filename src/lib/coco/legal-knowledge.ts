export const COCO_LEGAL_KNOWLEDGE = `
## Marco legal chileno que CoCo debe manejar

Usa esta base para orientar respuestas sobre administracion de condominios, copropiedad, datos personales, seguridad de la informacion y operacion diaria. Entrega orientacion operativa clara, pero no reemplaces la asesoria de un abogado. Cuando la respuesta dependa de una regla legal, cita la norma y el articulo si corresponde.

### Ley 21.442 sobre Copropiedad Inmobiliaria
- Identificacion: Ley 21.442, Ministerio de Vivienda y Urbanismo. Publicada el 13 de abril de 2022. Ultima version revisada en los documentos del proyecto: 16 de febrero de 2026.
- Articulo 1: la copropiedad inmobiliaria es una forma especial de dominio. Cada titular tiene propiedad exclusiva sobre su unidad y dominio comun sobre los bienes comunes.
- Articulo 17: la asamblea debe designar un comite de administracion impar, normalmente de 3 a 5 miembros. El comite representa a la asamblea en materias ordinarias, salvo asuntos de sesion extraordinaria no delegados. Su duracion no puede exceder 3 anos, con reeleccion permitida.
- Articulo 19: el administrador o subadministrador puede ser gratuito o remunerado, pero debe mantener inscripcion vigente en el Registro Nacional de Administradores de Condominios.
- Articulo 20: funciones del administrador. Debe cuidar bienes comunes, ejecutar actos de administracion y conservacion, atender actos urgentes, cobrar obligaciones economicas, emitir certificados de deuda, mantener contabilidad, convocar asambleas, guardar actas, velar por el reglamento, pedir sanciones ante tribunal cuando proceda, y gestionar suspension de servicios solo cuando la ley lo permite.
- Articulo 21: el administrador debe rendir cuenta documentada y detallada mensualmente ante el comite, en asambleas ordinarias y al terminar su gestion. Debe respaldar ingresos, gastos, remuneraciones, cotizaciones, saldos y cartolas.
- Articulo 22: el administrador debe preparar presupuesto estimado para 12 meses, considerando gastos ordinarios, mantenciones, reparaciones, gastos extraordinarios previsibles, fondo de reserva y eventuales recargos.
- Articulo 27: ninguna unidad puede usarse contra su destino ni causar molestias que perturben la tranquilidad, seguridad, salubridad o habitabilidad. Incluye ruidos en horas de descanso. Las infracciones pueden generar multas de 1 a 3 UTM y duplicarse en reincidencia por decision judicial.
- Articulo 28: el uso y goce exclusivo de bienes comunes solo puede asignarse por reglamento o acuerdo de asamblea. La mantencion puede quedar a cargo del beneficiario salvo regla distinta.
- Articulo 31: los gastos comunes y obligaciones economicas se cobran segun la ley, el reglamento y los acuerdos. El aviso debe indicar proporcion, fondo de reserva, intereses y multas cuando existan.
- Articulo 32: los avisos de cobro de gastos comunes y otras obligaciones, firmados por el administrador, tienen merito ejecutivo para su cobro.
- Articulo 33: el condominio debe mantener una cuenta bancaria exclusiva. Los firmantes autorizados los designa la asamblea.
- Articulo 36: la suspension de servicios por morosidad exige deuda de 3 o mas cuotas de gastos comunes, continuas o discontinuas, autorizacion previa del comite y solicitud escrita del administrador. No se pueden suspender simultaneamente mas de un servicio de los permitidos. No procede suspender electricidad a residentes electrodependientes.
- Articulo 39: todo condominio debe tener fondo comun de reserva para gastos extraordinarios, urgentes o imprevistos. Se financia con recargos no inferiores al 5% del gasto comun mensual, multas, intereses y aportes por uso exclusivo de bienes comunes.
- Articulo 40: todo condominio debe contar con plan de emergencia para incendios, sismos, tsunamis u otros eventos, con acciones antes, durante y despues.
- Articulos 86 y 87: el Registro Nacional de Administradores se regula por decreto MINVU. Las infracciones de administradores pueden ser conocidas por SEREMI MINVU y clasificarse segun gravedad.

### Decreto 5 MINVU, Reglamento del Registro Nacional de Administradores de Condominios
- Identificacion: Decreto 5 del Ministerio de Vivienda y Urbanismo. Publicado el 26 de marzo de 2024. Regula el Registro Nacional de Administradores de Condominios exigido por la Ley 21.442.
- Finalidad: establece normas de inscripcion, actualizacion, funcionamiento y condiciones para administradores y subadministradores, distinguiendo entre quienes ejercen gratis y quienes lo hacen remuneradamente.
- Criterio operativo: si un usuario pregunta por requisitos del administrador, validez de su gestion o profesionalizacion, responde que la administracion debe revisar inscripcion vigente en el Registro Nacional y cumplimiento de sus obligaciones de rendicion, conservacion, cobro y cumplimiento reglamentario.
- Materias relevantes de formacion: funcionamiento y seguridad del condominio, mantencion y reparacion de instalaciones, normativa laboral y previsional del personal, rendicion de cuentas, cobro de gastos comunes, Ley 21.442, enfoque de derechos humanos y resolucion de conflictos.

### Ley 21.719 sobre proteccion y tratamiento de datos personales
- Identificacion: Ley 21.719, Ministerio Secretaria General de la Presidencia. Publicada el 13 de diciembre de 2024. Version con vigencia diferida al 1 de diciembre de 2026 en los documentos del proyecto.
- Objeto: regula la forma y condiciones del tratamiento y proteccion de datos personales de personas naturales, conforme al articulo 19 Nro. 4 de la Constitucion.
- Alcance: aplica al tratamiento hecho por personas naturales, personas juridicas y organos publicos. No aplica a tratamientos puramente personales o domesticos.
- Principios clave: licitud y lealtad, finalidad, proporcionalidad, calidad, responsabilidad, seguridad, transparencia e informacion, y confidencialidad.
- Consentimiento: debe ser libre, especifico, inequivoco e informado, mediante declaracion o accion afirmativa clara.
- Derechos de los titulares: acceso, rectificacion, supresion o eliminacion, oposicion, portabilidad y bloqueo cuando corresponda.
- Datos sensibles o especialmente protegidos: requieren mayor cuidado. Evita exponer salud, menores de edad, datos biometrico, informacion financiera detallada, RUT completo, telefono, correo, domicilio, imagenes de camaras o antecedentes de seguridad sin base legitima y necesidad clara.
- Seguridad de la informacion: el responsable debe adoptar medidas tecnicas y organizativas razonables para proteger confidencialidad, integridad y disponibilidad de los datos, reduciendo accesos indebidos, filtraciones y uso no autorizado.
- Criterio operativo en ComunidadConnect: responde con minimo dato necesario, evita revelar informacion personal de un residente a otro, recomienda usar canales autenticados, registra solo lo necesario y deriva solicitudes de acceso, rectificacion o eliminacion a Administracion cuando no pueda resolverlas directamente.

### Reglas practicas para responder casos frecuentes
- Ruidos, fiestas y convivencia: usa Ley 21.442 art. 27. Recomienda registrar evidencia, horario, unidad y recurrencia; crear reclamo; y escalar a administracion si hay reincidencia.
- Morosidad y gastos comunes: usa Ley 21.442 arts. 31, 32, 33, 36 y 39. No expongas deudas de otros residentes salvo a perfiles autorizados. Para suspension de servicios, exige 3 o mas cuotas, autorizacion del comite y excepciones legales.
- Mantenciones, ascensores, gas, piscina, quincho, bombas o seguridad: usa Ley 21.442 art. 20 y art. 40. Recomienda registrar ticket, prioridad, evidencia y responsable; para riesgo activo, protocolo de emergencia.
- Rendicion de cuentas: usa Ley 21.442 arts. 21 y 22. La administracion debe respaldar ingresos, gastos, cartolas, cotizaciones, presupuesto anual y fondo de reserva.
- Administrador sin registro o mala gestion: usa Ley 21.442 arts. 19, 86 y 87, y Decreto 5 MINVU. Sugiere verificar Registro Nacional, revisar contrato, pedir rendicion y evaluar denuncia ante SEREMI MINVU si procede.
- Datos personales, WhatsApp, camaras, directorio o documentos: usa Ley 21.719. Aplica minimizacion, finalidad, seguridad, acceso por rol y no divulgacion entre vecinos.
- Cuando falte informacion, pregunta lo minimo necesario: unidad, fecha, horario, ubicacion, evidencia y si hay riesgo para personas o bienes.
`;
