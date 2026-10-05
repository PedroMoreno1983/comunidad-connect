# Finanzas: criterios para operar una comunidad real

No se considera suficiente que existan pantallas o que pase el build. Cada recorrido debe comprobar permisos, persistencia, saldos, auditoría y lo que ve el residente.

## Avance del 5 de octubre de 2026

Cobranza de Agent Center:

- Lee todos los cobros pendientes de la comunidad con paginación por ID, sin el límite anterior de 100.
- La propuesta y la ejecución utilizan la misma resolución de destinatarios.
- Tanto la unidad como el destinatario deben pertenecer a la comunidad.
- Los avisos son internos. Registrar un aviso no confirma su lectura ni implica envío por correo o WhatsApp.
- Los reintentos conservan el aviso existente y su estado de lectura.
- Si faltan destinatarios, guarda los cobros afectados y mantiene la tarea esperando revisión. El panel permite consultar las unidades afectadas.
- No termina si falla la verificación de los avisos o el registro de auditoría.
- Los recordatorios remiten al saldo actualizado: el importe nominal de una cuota no demuestra cuánto queda pendiente después de abonos.

Pruebas automatizadas: lectura de 1.005 cobros con límite de servidor de 73 filas, error en una página posterior, vínculos de otra comunidad, reintentos, preservación de lectura, verificación de comunidad, auditoría fallida y resultado pendiente.

La comprobación SQL de producción fue solo de lectura. La prueba de usuario administrador sigue pendiente; no se enviaron avisos reales como parte de esta validación.

## Próximas pruebas de aceptación

Usar una comunidad de prueba confirmada por su administrador. No publicar cobros ni enviar avisos a residentes reales como prueba.

| Recorrido | Criterio de aceptación |
| --- | --- |
| Documentos desordenados | Subir documentos sintéticos en formatos admitidos; revisar campos extraídos, corregirlos, guardar y volver a abrir. Un duplicado debe advertirse antes de contabilizarse. |
| Cierre del mes | Preparar egresos y prorrateo; revisar suma por unidades, fondos, descuentos y redondeo. Publicar solo después de la aprobación correspondiente. |
| Vista residente | Ver el cobro publicado, su detalle y documento; verificar que no puede consultar otra unidad o comunidad. |
| Transferencia y abono parcial | Informar el mes elegido por el residente; verificar comprobante como administrador y comprobar que se aplica a ese mes, no a otro. El saldo debe mostrar el abono parcial sin duplicarlo. |
| Conciliación | Importar una cartola sintética, revisar antes de guardar y comprobar que reimportarla no duplica movimientos. El saldo bancario y el libro deben explicar sus diferencias. |
| Cobranza | Revisar propuesta, aprobar en la comunidad de prueba y comprobar tarea, auditoría y avisos. Una unidad sin destinatario debe quedar pendiente y aparecer en el detalle. |

## Brechas que siguen abiertas

- Verificar el ciclo completo anterior con las cuentas administradora y residente.
- Revisar que la imputación del mes elegido sea consistente entre transferencias, pagos manuales, conciliación y estado de cuenta.
- Verificar aprobación del comité y trazabilidad del cierre mensual.
- Remuneraciones: comprobar alcance real antes de ofrecer liquidaciones y cotizaciones completas.
- Conexión bancaria automática: evaluar proveedor y credenciales; una importación manual no demuestra esa integración.
- Medir tiempos de respuesta y errores durante una operación mensual real.

La comparación comercial con otras plataformas debe basarse en estos resultados y en el uso real, sin declarar paridad a partir del listado de funciones.

## Segunda revisión: imputación de pagos

La revisión encontró que el estado de cuenta y la actualización de cobros ignoraban `expense_id` y sumaban todos los pagos para cubrir la deuda más antigua. Se corrigió con una asignación compartida:

- Un pago con destino explícito se reserva para ese cobro antes de distribuir los pagos sin destino.
- Los abonos parciales conservan el mes elegido.
- Un exceso en un mes elegido queda como crédito, sin reasignarlo automáticamente a otro mes.
- Los descuentos con signo negativo se consideran al calcular los saldos.
- El registro administrativo acepta `expenseId` y comprueba comunidad y unidad antes de insertar.
- Los errores al actualizar los estados se propagan; las escrituras se restringen por comunidad y unidad.

Validación automatizada: 83 pruebas financieras, incluidos casos del servicio de persistencia con datos aislados y del estado de cuenta. No se modificaron pagos de producción. La consulta de solo lectura encontró cero pagos registrados, por lo que no hubo datos previos que corregir.

Validación de navegador: la cuenta residente muestra dos cobros pendientes y un enlace al aviso PDF. No aparece un formulario de transferencias ni una cartola de abonos. La ruta administrativa redirige a Inicio con la sesión disponible. El usuario confirmó que aún no dispone de una comunidad de prueba construida. Por tanto, siguen pendientes la emisión, aprobación, publicación, reporte de transferencia y revisión administrativa de extremo a extremo.

## Tercera revisión: apertura histórica y prueba administradora

El usuario inició sesión como administrador y confirmó que «Mi Edificio» es una comunidad de prueba en la que se pueden crear datos sintéticos y comprobar avisos.

Se detectó una deuda inflada: cobranza mostraba $946.200 aunque $433.300 correspondían a tres cuotas antiguas marcadas pagadas sin movimientos en `unit_payments`. La corrección reconoce ajustes históricos de apertura separados de los ingresos bancarios, conserva sus importes en `payment_metadata.legacy_settled_amount` al reconciliar y marca estados modernos con `ledger_reconciled`. No se inventa una fecha de pago para una cuota histórica.

Antes de registrar dinero nuevo se fijan los ajustes históricos, de modo que el abono no se consuma en una cuota ya liquidada. Una eliminación de un pago moderno puede reabrir su cobro: no lo convierte en un ajuste histórico. Pruebas financieras: 87 aprobadas, incluidos estos casos y prevención de doble conteo.

Prueba de documento sintético: se extrajo concepto, monto ($10.000), proveedor y categoría; se revisó el reparto a partes iguales y se guardó. La base confirmó un egreso de $10.000 y la interfaz mostró cinco cuotas de $2.000, con suma exacta. El fixture es `tests/fixtures/finance-qa-receipt-20261005.txt`; no representa una factura ni un pago real.
