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
