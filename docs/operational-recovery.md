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

## Ensayo aislado de restauración

```powershell
node scripts/supabase-pglite-restore.mjs '<directorio privado>'
```

Importa datos reales en una instancia local PGlite con pgvector, restaura índices, restricciones, permisos y políticas, compara conteos y sumas financieras con la referencia de origen, comprueba aislamiento de lectura residente y verifica nuevamente los archivos de Storage. El resultado queda en `pglite-restore-report.json`; únicamente `passed: true` acredita el ensayo completo.

El ensayo no sustituye una recuperación del servicio gestionado: no ejecuta las APIs alojadas de Auth/Storage, webhooks, secretos, configuración OAuth ni integraciones externas. Los módulos de plataforma que dependen de procesos gestionados deben configurarse y validarse por separado en una recuperación real.

Ensayo completado el 7 de octubre de 2026: `passed: true`; 71 cuentas Auth, 14 perfiles, 6 comunidades, 8 unidades, 13 gastos, 15 tareas, 101,353 productos y 6,488,594 observaciones de precios coinciden con el origen. Se restauraron 236 políticas públicas y 1,479 restricciones. Las sumas de gastos ($958,200) y pagos ($1,000) coinciden. Un residente real del respaldo vio dos gastos propios y cero gastos ajenos. Se verificaron los 69 archivos de Storage. Estos números acreditan esta copia concreta, no futuras ejecuciones.

## Espacio de la base: revisión del 7 de octubre de 2026

El panel del proyecto Free muestra 2199 MB sobre una cuota de 500 MB y anuncia restricciones desde el 14 de octubre. No se ha contratado un plan pagado.

La tabla `supermarket_price_history` ocupa aproximadamente 1.99 GB y tiene 6,488,594 observaciones. Conservar siete días mantendría aproximadamente 561,033 filas y retiraría 5,927,561 observaciones antiguas, que ya están incluidas en la copia privada. El catálogo actual contiene 101,353 productos y no debe borrarse. Tampoco deben tocarse gastos, residentes ni historial de compras confirmadas.

El tamaño resultante estimado de la base es de unos 350 MB; debe medirse después de aplicar la retención. Un `DELETE` por sí solo no reduce el archivo físico. La compactación requiere un paso adicional, como `VACUUM FULL`, que bloquea la tabla mientras trabaja. Aplicar únicamente después de confirmar la eliminación del historial antiguo y coordinar esa operación. Ninguna limpieza se ejecuta al correr los scripts de respaldo o ensayo.
