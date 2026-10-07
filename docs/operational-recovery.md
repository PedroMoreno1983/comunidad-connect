# Recuperación y comprobación de flujos

## Comandos reproducibles

- `npm run qa:operational-recovery`: aplica la migración de solicitudes en PostgreSQL aislado, prueba las restricciones y restaura un respaldo físico con datos sintéticos desde disco. Verifica filas, saldo y claves foráneas. El resultado y respaldo quedan en `artifacts/operational-recovery/`.
- `npm run qa:operational-lifecycle`: crea dos comunidades temporales, cuentas administradoras y residentes, y verifica el API publicado y las reglas de acceso reales. Incluye solicitudes, avisos, confirmación del residente, cobranza reanudable, conservación de lectura, diagnóstico de un ticket vencido y participación en Convivencia. Comprueba la limpieza de los datos al terminar. `QA_BASE_URL` permite probar una versión de ensayo.
- `npm run test:unit -- --maxWorkers=2`: regresiones de finanzas, listas, equivalencias y traspaso de carros.
- `npm test --prefix services/supermarket-cart-worker`: contratos del carro remoto, cantidades exactas y reintentos.

El ensayo aislado **no acredita una recuperación completa de Supabase**, sus cuentas de Auth, objetos de Storage, configuración externa ni el servidor del navegador remoto.

## Restauración completa del servicio gestionado

1. Revisar en el panel del proyecto la disponibilidad, fecha y retención del último respaldo y de PITR. Registrar el punto de recuperación elegido y el tiempo máximo de interrupción aceptable.
2. Exportar y conservar aparte los objetos de Storage y la configuración de Vercel, Supabase Auth y del worker remoto. Las claves se conservan en el gestor de secretos, nunca en el repositorio ni en el informe de pruebas.
3. Restaurar primero en un proyecto aislado usando el procedimiento oficial de Supabase. La restauración sobre el proyecto activo requiere una ventana coordinada: suspende escrituras y puede descartar cambios posteriores al punto elegido.
4. En el entorno recuperado, verificar usuarios y roles, acceso entre comunidades, saldos por unidad, abonos por periodo, documentos firmados, avisos, pasos de Agent Center y conectividad del worker. Comparar conteos y sumas con el manifiesto del respaldo.
5. Registrar duración, diferencias y resultado. Solo después de validar esos controles, cambiar el tráfico al entorno recuperado y reanudar escrituras.

Referencias oficiales: [Backups de Supabase](https://supabase.com/docs/guides/platform/backups), [Restaurar un proyecto](https://supabase.com/docs/guides/platform/clone-project).

## Verificación publicada del 7 de octubre de 2026

- `qa:operational-lifecycle` pasó contra `https://conviveconnect.com`: 34 comprobaciones, incluidas la limpieza de comunidades y cuentas sintéticas. Cartola y certificado devolvieron $60.000 para un cobro de $100.000 con un abono de $40.000. Se probaron roles reales de dos comunidades, entrega de avisos, confirmación de servicios, reanudación de cobranza y mantenimiento y aceptación de participación.
- En la sesión residente, una lista de ocho líneas encontró los ocho productos. Papel higiénico de cuatro rollos coincidió con el envase de cuatro unidades. Seis huevos produjo una caja de seis, no seis cajas. Volver a pulsar la tienda seleccionada conservó el carro completo.
- Evidencia local: `artifacts/operational-lifecycle/resultado.json` y `supermercado-publicado.jpg`. Estos archivos de ejecución no se incluyen en Git.
- La restauración probada fue PostgreSQL aislado; sigue pendiente ensayar la recuperación completa del servicio gestionado, con Auth y Storage.
- El navegador remoto abrió Líder en tamaño real y conservó la misma sesión tras recargar. Líder pidió ubicación o despacho; no se introdujeron datos personales ni se completó una compra. La carga final y sus cantidades siguen pendientes de ese paso humano. Evidencia: `artifacts/operational-lifecycle/remoto-publicado.jpg`.

## Criterios de cierre

- Una tarea de cobranza con cobros sin destinatario queda pendiente y avisa al administrador. Se vincula un perfil de la misma comunidad y se pulsa **Retomar y verificar**; no se asigna una deuda a otro vecino para cerrar la prueba.
- Un servicio pasa por pendiente, aceptado, finalización informada y confirmación del solicitante. Los avisos se guardan en la misma transacción que el cambio; sin responsable no se confirma la creación.
- El diagnóstico de mantenimiento revisa todos los tickets abiertos. Su resultado no acredita asignación ni ejecución del trabajo técnico.
- Las canastas incompletas siguen disponibles para continuar con sus productos encontrados. El subtotal parcial no se presenta como precio de la compra completa.
