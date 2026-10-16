# Onboarding del primer edificio — paso a paso y checklist de 30 días

Guía para dejar operando la primera comunidad de un cliente (o un piloto). Las rutas son de https://conviveconnect.com. Lo marcado **próximamente** todavía no está disponible: no lo prometas en la implementación.

## Antes de partir: lo que pedimos al cliente

| Qué | Formato | Para qué |
|---|---|---|
| Nómina de unidades con derechos | CSV, Excel, PDF o Word. Ideal: plantilla `nomina-unidades.csv` (columnas `unidad;nombre;email;telefono;derechos_porcentaje`) | Crear unidades y residentes, prorratear el gasto común y contar votos en asamblea |
| Fuente de los derechos | Artículo del reglamento de copropiedad o escritura | Marcar los derechos como **verificados** (sin fuente quedan provisorios) |
| Administrador responsable | Nombre y correo | Cuenta de administración |
| Integrantes vigentes del comité | Nombre, unidad y correo | Aprobación del gasto común y de los convenios; resumen semanal |
| Cartola bancaria del último mes | CSV o XLSX descargado del banco | Primera conciliación |
| Egresos del mes y saldos pendientes por unidad | Planilla o documentos | Primer período de gasto común |
| Reglamento interno y de copropiedad | PDF | Respuestas de CoCo y reglas de convivencia |
| Conserjería y proveedores frecuentes | Nombres y contactos | Accesos de conserjería y cotizaciones de mantención |

## Paso 1 — Crear la comunidad y el administrador (día 1)

1. El administrador se registra en **/admin-onboarding**: plan (o "Decidir después"), datos del edificio y su cuenta.
2. Acepta términos y la política de privacidad.
3. Revisamos juntos el panel **/admin** y el recorrido mensual de **/admin/finanzas**.

## Paso 2 — Cargar la nómina con derechos (días 1–3)

1. En **/admin/onboarding**, subir la nómina. CoCo interpreta el archivo y propone la estructura; nada se guarda hasta que el administrador lo aprueba.
2. Revisar las filas marcadas con brechas: correos inválidos, duplicados, unidades sin residente.
3. Revisar la columna **Derechos (%)**: deben sumar **100 % ± 0,05**. Se acepta coma decimal ("0,532"). Si vienen en ‰ o como "prorrateo/alícuota", el sistema los reconoce.
4. Registrar la **fuente** ("Reglamento de copropiedad, art. X") para que queden verificados.
5. Sincronizar. Si los derechos no cuadran, las unidades se crean igual y aparece la tarea **"Cargar derechos de cada unidad"** en **/admin/asambleas#derechos**.

> Los derechos para votar los fija el reglamento de copropiedad (Ley 21.442, arts. 3 y 15). Suelen coincidir con el prorrateo, pero no siempre: no copiar valores como definitivos sin la fuente.

## Paso 3 — Usuarios, conserjería y comité (días 3–5)

1. Revisar en **/admin/users** que cada residente quede asociado a su unidad y asignar los roles de administración y conserjería.
2. En **/admin/finanzas/comite**, designar a los integrantes vigentes del comité. Cada alta y baja queda registrada. Desde ese momento el comité revisa el gasto común y los convenios.
3. Enviar las invitaciones de forma controlada (primero comité y conserjería, luego residentes).

## Paso 4 — Banco y fondo de reserva (días 5–7)

1. **Cuentas bancarias:** hoy la app no guarda una ficha de cuentas de la comunidad ni se conecta directo al banco. El movimiento bancario entra cargando la **cartola (CSV o XLSX)** en **/admin/finanzas/conciliacion**, que la cruza con los pagos y detecta depósitos sin imputar. Los datos de transferencia de la comunidad se comunican a los residentes por aviso.
2. Revisar el **fondo de reserva** (fondo legal de la Ley 21.442) y su aporte en cada emisión en **/admin/finanzas**.
3. Si la comunidad arrienda estacionamientos, fijar la comisión (0 % por defecto) en la vista de estacionamientos.
4. **Pago en línea del gasto común: próximamente** (integración con el proveedor de pagos en habilitación). Mientras tanto, los residentes pagan por transferencia y el pago se registra con la cartola.

## Paso 5 — Primer período de gasto común (días 7–15)

1. Registrar los **egresos** del mes en **/admin/finanzas/egresos**, cada uno con su método de prorrateo (alícuota, partes iguales o consumo) y su respaldo.
2. Revisar con el equipo de Convive cómo entran las deudas que trae cada unidad desde el sistema anterior (cobros individuales por unidad; la importación masiva de saldos históricos no está en el onboarding automático). El saldo inicial de caja se ingresa en contabilidad y requiere revisión contable.
3. Enviar a revisión del comité (si hay comité vigente) y **emitir el cobro**.
4. Cuando lleguen los pagos, **conciliar** con la cartola.
5. Revisar saldos y avisos en **/admin/finanzas/cobranza**. Los avisos de CoCo van sin montos ni lenguaje de deudor; el administrador confirma antes de enviarlos.
6. Preparar la **rendición** al comité en **/admin/finanzas/rendicion** y **guardar el corte** del mes en **/admin/finanzas/contabilidad**.

## Paso 6 — Activar CoCo y la operación (días 10–20)

1. En el **Agent Center (/agent-center)**, revisar la política de confirmación: todo lo que mueve plata, notifica a terceros o corre en lote requiere aprobación.
2. Cargar los activos de mantención (ascensores, bombas, portones, etc.) en **/admin/mantenimiento** y activar el plan preventivo.
3. Registrar proveedores verificados para las cotizaciones.
4. Generar el primer **resumen semanal para el comité** a pedido, revisarlo y publicarlo. Después llega solo cada lunes a las 8:00.
5. Asignar a conserjería los cursos base del **aula de capacitación** (control de acceso, encomiendas, incendios, residuos, atención de residentes).

## Paso 7 — Asamblea (si corresponde en el período)

1. Confirmar que los derechos estén cargados y, ojalá, verificados.
2. Crear la asamblea en **/admin/asambleas**: el tipo y el quórum salen de la materia. La citación debe salir con 5 a 15 días de anticipación.
3. El día de la sesión: acreditar asistencia, emitir el **certificado de copropietarios hábiles** antes de la primera votación y verificar imagen y voz en los votos en línea. La videollamada es un enlace externo.
4. Firmar el acta dentro de 30 días.

---

## Checklist de 30 días

**Semana 1 — Datos**
- [ ] Comunidad y administrador creados
- [ ] Nómina cargada y sincronizada, sin filas con errores
- [ ] Derechos suman 100 % ± 0,05 (verificados con fuente o marcados como provisorios)
- [ ] Roles de administración y conserjería asignados
- [ ] Comité designado en /admin/finanzas/comite
- [ ] Invitaciones enviadas a comité y conserjería

**Semana 2 — Primer gasto común**
- [ ] Egresos del mes registrados con respaldo y método de prorrateo
- [ ] Deudas anteriores por unidad y saldo inicial de caja revisados con contabilidad
- [ ] Gasto común revisado por el comité y emitido
- [ ] Invitaciones a residentes enviadas
- [ ] Fondo de reserva revisado

**Semana 3 — Cobro y operación**
- [ ] Primera cartola cargada y conciliada
- [ ] Avisos de cobranza revisados y aprobados por el administrador
- [ ] Activos de mantención cargados y plan preventivo activo
- [ ] Al menos un proveedor verificado por rubro crítico
- [ ] Conserjería registrando visitas y encomiendas en la app
- [ ] Cursos base asignados a conserjería

**Semana 4 — Cierre y comité**
- [ ] Rendición del mes enviada al comité
- [ ] Corte del mes guardado en contabilidad
- [ ] Primer resumen semanal publicado al comité
- [ ] Reunión de revisión a 30 días con administrador y comité: qué funcionó, qué ajustar
- [ ] Plan para el segundo período (y para la asamblea, si viene)

**Criterio de éxito a 30 días:** gasto común emitido, conciliado y rendido al comité dentro de la app; comité recibiendo el resumen semanal; conserjería operando en la app.
