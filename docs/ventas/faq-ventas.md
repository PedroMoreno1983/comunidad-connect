# Preguntas frecuentes de venta — Convive Connect

Respuestas para usar en reuniones con administradores y comités. Lo marcado **próximamente** no está disponible hoy: no lo prometas con fecha.

## Producto

**¿Qué es CoCo y qué hace realmente?**
Es el asistente de IA de Convive Connect. Además de responder consultas, opera en el Agent Center: prepara la cobranza con una escalera de avisos, propone convenios a la medida, mantiene el plan preventivo de mantención con un riesgo predictivo, pide cotizaciones a proveedores verificados y arma el resumen semanal del comité. Siempre con el administrador en el circuito: lo que mueve plata, notifica a terceros o corre en lote pide confirmación.

**¿CoCo puede pagar, contratar o gastar por su cuenta?**
No. Elegir una cotización o proponer un convenio queda registrado; la decisión y el pago son humanos. Todo queda auditado.

**¿Cómo es la cobranza? A los vecinos no les gusta que los traten de morosos.**
Por eso los avisos van sin montos, sin lenguaje de deudor y sin amenazas, y siempre ofrecen una salida: conversar o pedir un convenio con reserva. Son tres etapas: recordatorio, ofrecimiento de ayuda a los 15 días y propuesta de convenio a los 30. Llegan dentro de la app (WhatsApp: próximamente).

**¿Cómo funcionan los convenios?**
La cuota apunta a cerca de media cuota de gasto común; se sugieren de 2 a 12 cuotas y el administrador puede llegar a 36. Si hay comité, el convenio queda pendiente de su aprobación. La primera cuota vence al firmar, y quien firma y paga queda habilitado para votar (Ley 21.442 art. 6; DS 7 art. 9). Los intereses por mora automáticos están **próximamente**.

**¿Las asambleas en línea cumplen la Ley 21.442?**
El módulo está construido sobre la Ley 21.442 y el DS 7 de 2025, con reglas revisadas en bcn.cl: citación de 5 a 15 días, quórum según la materia, derechos por unidad, certificado de copropietarios hábiles antes de votar, poderes, voto en línea verificado con imagen y voz, y acta con sus quórums. La validez de cada asamblea depende además de que la comunidad cite bien, cargue los derechos de su reglamento y que el reglamento permita la participación remota. La videollamada es un enlace externo. La consulta por escrito con sesión informativa está **próximamente**.

**¿Qué ve el comité?**
Un resumen semanal cada lunes a las 8:00 con datos agregados (unidades al día, convenios, mantención, solicitudes, lo que viene) y 2 o 3 decisiones sugeridas. Nunca nombra unidades, personas ni montos. Además revisa el gasto común y los convenios, y ve la rendición mensual.

**¿Tienen pago en línea del gasto común?**
**Próximamente.** La integración con el proveedor de pagos está en habilitación. Hoy los residentes pagan por transferencia y el pago se registra conciliando la cartola del banco.

**¿Se conecta con el banco?**
No en forma directa. Se carga la cartola (CSV o XLSX) y la app la cruza con los pagos y detecta depósitos sin imputar.

**¿Hacen remuneraciones?**
Sí: liquidaciones del personal y archivo para Previred.

**¿Qué pasa con los estacionamientos?**
Los vecinos pueden arrendar sus estacionamientos. El cobro se carga al arrendatario y, cuando está pagado, se liquida al dueño por transferencia, abono a sus gastos comunes o aporte al fondo de reserva, descontando la comisión que fije la comunidad (0 % por defecto).

**¿Hay app?**
Es una aplicación web que funciona en celular y computador. Las apps nativas para iOS y Android están **próximamente**.

**¿Tienen API?**
Sí, una API REST de solo lectura (unidades, cobros, pagos, saldos, rendición mensual y visitas), documentada en https://conviveconnect.com/developers. No entrega correos, teléfonos ni RUT de residentes. Escritura por API: **próximamente**.

**¿Qué incluye el aula de capacitación?**
Cursos base para administración, conserjería y residentes (asambleas y comité según la Ley 21.442, control de acceso, encomiendas, prevención de incendios, residuos, atención de residentes, convivencia, seguridad y datos personales, operación diaria) y la posibilidad de publicar cursos propios de la comunidad.

**¿Cuánto demora partir?**
El onboarding acompañado apunta a tener el primer gasto común emitido, conciliado y rendido al comité en 30 días (ver checklist). La nómina se puede subir en CSV, Excel, PDF o Word.

**¿Cuánto cuesta?**
Por unidad al mes, sin costo por usuario. [Completar con los planes que apruebe Pedro.] Ofrecemos un piloto sin costo para el primer edificio.

## Seguridad y datos personales

**¿Dónde están los datos y quién los ve?**
La plataforma corre sobre Supabase (base de datos y autenticación) y Vercel. Cada comunidad está aislada con políticas de seguridad a nivel de fila (RLS) y cada rol ve solo lo suyo: un residente ve su unidad; la deuda de cada unidad y el detalle de habilidad para votar los ve solo la administración; el comité ve agregados y lo que le corresponde revisar.

**¿Qué controles de seguridad tienen?**
Acceso por roles (administración, comité, residente, conserjería), RLS por comunidad, escrituras sensibles solo desde el servidor, auditoría de las acciones de CoCo y de las asambleas, encabezados de seguridad en la aplicación y fotos de mantención en almacenamiento privado. En julio de 2026 se hizo una auditoría externa del código y se corrigieron los hallazgos críticos de control de acceso.

**¿Usan IA con nuestros datos?**
Sí. CoCo usa proveedores externos de IA (principalmente Anthropic) para redactar y analizar. Las piezas sensibles se arman con reglas y no con la IA: los quórums, la asistencia y los resultados de las asambleas, y las cifras del resumen semanal, que además pasa un control de privacidad que bloquea unidades, personas y montos. Si la IA falla, hay un texto de respaldo determinista.

**¿Cumplen la Ley 21.719 de protección de datos personales?**
Estamos trabajando para alinearnos con ella antes de que entre en vigencia (1 de diciembre de 2026). Hoy tenemos: política de privacidad publicada que considera la Ley 19.628 y sus modificaciones por la Ley 21.719 (https://conviveconnect.com/privacy); un centro de privacidad en el perfil donde cada persona registra solicitudes de acceso, rectificación, supresión, oposición o portabilidad y les da seguimiento; un procedimiento interno de derechos y de respuesta a incidentes; y una evaluación de impacto en borrador para los tratamientos de IA. **No afirmamos cumplimiento total**: algunos puntos requieren validación jurídica y la designación formal de responsables, y la comunidad, como responsable de los datos de sus residentes, también tiene obligaciones propias.

**¿Qué pasa si hay una brecha de datos?**
Hay un procedimiento interno: contener, evaluar el alcance, escalar al responsable y evaluar con asesoría jurídica la notificación a la Agencia y a los titulares conforme a la Ley 21.719, documentando todo.

**Si dejamos Convive Connect, ¿qué pasa con nuestros datos?**
La información es de la comunidad. [Definir en el contrato cómo y en qué plazo se entrega la exportación y cuándo se eliminan los datos.] Hoy cada persona puede descargar sus datos desde el centro de privacidad, y la administración puede obtener unidades, cobros, pagos y rendiciones por la API de solo lectura.

**¿Tienen SLA?**
Sí, en borrador comercial: prioridades P1 a P4, con primera respuesta de 2 horas hábiles para incidentes críticos y soporte de lunes a viernes de 9:00 a 18:00. [Confirmar con `docs/comercial/soporte-sla.md` y el contrato antes de comprometerlo.]
