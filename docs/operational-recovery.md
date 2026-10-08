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

# Respaldo manual gratuito de Supabase

## Crear una copia privada

Requisitos: CLI Supabase autenticada y vinculada al proyecto correcto, variables de Supabase locales y PostgreSQL 17 para Windows. No se requieren Docker ni un cambio de plan.

```powershell
node scripts/supabase-manual-backup.js
```

El script obtiene credenciales temporales de la CLI sin mostrarlas, verifica que Database y Storage correspondan al mismo proyecto y usa una conexión de base de datos de solo lectura. Guarda el resultado fuera del repositorio, en `%LOCALAPPDATA%/ComunidadConnect/backups/<fecha>`.

Incluye el archivo completo `database.dump`, roles sin contraseñas, configuración de buckets, archivos originales de Storage y un manifiesto con hashes SHA-256. Lee todos los bloques del dump antes de marcar la copia como completa. Una ejecución interrumpida se puede retomar:

```powershell
node scripts/supabase-manual-backup.js --resume '<directorio privado>'
```

Los respaldos contienen datos personales, hashes de autenticación y documentos financieros. No subirlos a Git ni compartirlos públicamente. Limitar el acceso al directorio y conservar una segunda copia privada en otro dispositivo. Una copia local no protege contra la pérdida de este computador.

Para comprobar la copia de origen sin transferir datos, ejecutar `node scripts/copy-verified-backup.js '<directorio privado del respaldo>'`. Para copiar, agregar como segundo argumento una carpeta privada existente en otro dispositivo o una carpeta de red autorizada. El script rechaza el mismo disco, no sobrescribe una copia anterior y verifica SHA-256 antes y después. No incluye las bases temporales ni los SQL sin comprimir del ensayo. Un fallo deja una copia incompleta, sin informe `copy-verification.json` aprobado; no usarla como respaldo válido.

El 8 de octubre se verificaron 76 archivos y 220,459,396 bytes de origen. La copia externa continúa pendiente hasta contar con un destino privado indicado por el usuario.

## Ensayo aislado de restauración

```powershell
node scripts/supabase-pglite-restore.mjs '<directorio privado>'
```

Importa datos reales en una instancia local PGlite con pgvector, restaura índices, restricciones, permisos y políticas, compara conteos y sumas financieras con la referencia de origen, comprueba aislamiento de lectura residente y verifica nuevamente los archivos de Storage. El resultado queda en `pglite-restore-report.json`; únicamente `passed: true` acredita el ensayo completo.

El ensayo no sustituye una recuperación del servicio gestionado: no ejecuta las APIs alojadas de Auth/Storage, webhooks, secretos, configuración OAuth ni integraciones externas. Los módulos de plataforma que dependen de procesos gestionados deben configurarse y validarse por separado en una recuperación real.

### Ensayo de los servicios locales

Con Docker Desktop funcionando, ejecutar `node scripts/supabase-service-recovery.js '<directorio privado del respaldo>'`. Usa imágenes oficiales de PostgreSQL, Auth, PostgREST y Storage, una red interna y claves locales nuevas, conservadas fuera de Git. Restaura los datos reales del respaldo, reconstruye restricciones y permisos y comprueba conteos y sumas. Genera una sesión local mediante enlace de acceso para un usuario restaurado, comprueba su aislamiento por REST, recupera los objetos de Storage y compara sus descargas firmadas con los hashes originales. No envía correos ni modifica producción.

El informe privado queda en `service-recovery/service-recovery-report.json`; solo `passed: true` acredita la ejecución. Los contenedores se detienen al terminar, sin eliminar los volúmenes. `--verify-existing` como segundo argumento omite la importación y repite las comprobaciones sobre una restauración local ya completada.

Este ensayo de servicios no acredita el proveedor OAuth, SMTP, la clave de cifrado de MFA/Vault ni la conectividad con integraciones externas. Esas configuraciones requieren recuperación y verificación independientes antes de sustituir un proyecto de producción.

Ensayo aprobado el 8 de octubre de 2026, con PostgreSQL `17.6.1.063`, Auth `v2.196.0`, PostgREST `v14.17` y Storage `v1.80.2`: 71 cuentas Auth, 14 perfiles, 13 gastos, suma de gastos de $958,200, 101,353 productos, 6,488,594 observaciones de precios y 69 metadatos de objetos coinciden con el respaldo. Una cuenta restaurada inició una sesión local y leyó cuatro gastos de su comunidad por REST, sin filas de otras comunidades. Los 69 objetos se cargaron y sus descargas firmadas coincidieron en SHA-256; el documento financiero privado rechazó la descarga pública sin autorización. Los contenedores terminaron detenidos y producción no se modificó.

La versión `v1.74.0` de Storage fijada en el ejemplo de instalación consultado no soportaba los índices de versionado presentes en este respaldo y produjo `42P10` al cargar un objeto. Se usó la versión oficial compatible `v1.80.2`, sin añadir índices artificiales al esquema restaurado. En una recuperación real, verificar primero la compatibilidad de las versiones de servicios con las migraciones del respaldo.

Ensayo completado el 7 de octubre de 2026: `passed: true`; 71 cuentas Auth, 14 perfiles, 6 comunidades, 8 unidades, 13 gastos, 15 tareas, 101,353 productos y 6,488,594 observaciones de precios coinciden con el origen. Se restauraron 236 políticas públicas y 1,479 restricciones. Las sumas de gastos ($958,200) y pagos ($1,000) coinciden. Un residente real del respaldo vio dos gastos propios y cero gastos ajenos. Se verificaron los 69 archivos de Storage. Estos números acreditan esta copia concreta, no futuras ejecuciones.

## Espacio de la base: revisión del 7 de octubre de 2026

El panel del proyecto Free muestra 2199 MB sobre una cuota de 500 MB y anuncia restricciones desde el 14 de octubre. No se ha contratado un plan pagado.

La tabla `supermarket_price_history` ocupa aproximadamente 1.99 GB y tiene 6,488,594 observaciones. Conservar siete días mantendría aproximadamente 561,033 filas y retiraría 5,927,561 observaciones antiguas, que ya están incluidas en la copia privada. El catálogo actual contiene 101,353 productos y no debe borrarse. Tampoco deben tocarse gastos, residentes ni historial de compras confirmadas.

El tamaño resultante estimado de la base es de unos 350 MB; debe medirse después de aplicar la retención. Un `DELETE` por sí solo no reduce el archivo físico. La compactación requiere un paso adicional, como `VACUUM FULL`, que bloquea la tabla mientras trabaja. Aplicar únicamente después de confirmar la eliminación del historial antiguo y coordinar esa operación. Ninguna limpieza se ejecuta al correr los scripts de respaldo o ensayo.

### Limpieza aplicada con autorización el 7 de octubre de 2026

Se retiraron 5,929,451 observaciones anteriores al corte de siete días y se ejecutó `VACUUM (FULL, ANALYZE)` únicamente sobre `supermarket_price_history`. La base bajó de 2,185,546,899 a **337,366,163 bytes**, por debajo de los 500 MB. El historial conserva 562,116 observaciones y ocupa 144,326,656 bytes. Permanecieron iguales los 101,397 productos, 13 gastos, suma de gastos de $958,200, 14 perfiles y 71 cuentas Auth. El informe privado `price-history-maintenance.json` registra los valores antes y después.

`.github/workflows/supermarket-price-retention.yml` aplica diariamente la misma retención mediante el rol de servicio, usando las credenciales ya existentes de carga del catálogo. El fallo del proceso se refleja en GitHub Actions. Solo elimina observaciones por `observed_at`; no borra productos ni compras. PostgreSQL reutiliza el espacio liberado mediante su mantenimiento automático; ante un aumento sostenido, medir de nuevo y ejecutar la compactación con una copia verificada y autorización.

El tamaño físico actual y el promedio de facturación son métricas diferentes. Supabase actualiza sus métricas periódicamente y una advertencia de uso puede persistir mientras baja el promedio del periodo. No se contrató un plan pagado.

