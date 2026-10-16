# Protocolo de gestión y notificación de vulneraciones de seguridad (BORRADOR)

> Borrador para revisión de abogado. Complementa `docs/privacy/PROCEDIMIENTO-DERECHOS-Y-BRECHAS.md`.

## 1. Qué dice la ley

| Obligación | Quién | Plazo / forma | Artículo |
|---|---|---|---|
| Reportar a la **Agencia** las vulneraciones que causen destrucción, filtración, pérdida o alteración accidental o ilícita de datos, o acceso/comunicación no autorizada, **cuando exista riesgo razonable** para los derechos y libertades de los titulares | Responsable (la comunidad), con apoyo del encargado | "Por los medios más expeditos posibles y **sin dilaciones indebidas**". La ley no fija horas; la Agencia puede precisarlo por instrucción general | 14 sexies inc. 1° |
| Registrar las comunicaciones: naturaleza, efectos, categorías de datos, número aproximado de titulares, medidas adoptadas | Responsable | Siempre que se reporte | 14 sexies inc. 2° |
| Comunicar también a los **titulares** cuando la vulneración afecte **datos sensibles**, **datos de niños y niñas menores de 14 años** o **datos de obligaciones económicas, financieras, bancarias o comerciales** | Responsable | Lenguaje claro y sencillo; a cada titular, y si no es posible, aviso en un medio de comunicación social masivo y de alcance nacional | 14 sexies inc. 3° |
| **Encargado** reporta la vulneración al responsable | ConviveConnect | La ley no fija plazo; el contrato de encargo propone **24 horas** | 15 bis |
| Acreditar las medidas de seguridad en caso de controversia | Responsable | — | 14 quinquies inc. final |
| Omitir **deliberadamente** la comunicación de vulneraciones es **infracción gravísima** (multa hasta 20.000 UTM) | — | — | 34 quáter f), 35 c) |

**Para ConviveConnect casi todo incidente relevante activará la notificación a titulares**, porque la plataforma trata deudas y pagos de gastos comunes (datos de obligaciones económicas) y, en el fondo solidario, datos de salud.

## 2. Plazos internos (objetivos operativos, no legales)

| Hito | Objetivo |
|---|---|
| Detección → apertura de incidente y contención inicial | Inmediato, máx. 1 hora |
| Clasificación preliminar de severidad | 4 horas |
| Aviso de ConviveConnect a cada comunidad/administración afectada (encargado → responsable) | **24 horas** desde el conocimiento |
| Decisión de notificar a la Agencia (con DPO y abogado) | 48 horas |
| Notificación a la Agencia | **72 horas** como objetivo interno de "sin dilaciones indebidas" (referencia de buena práctica; ajustar a lo que instruya la Agencia) |
| Notificación a titulares (si aplica) | En paralelo o inmediatamente después de la notificación a la Agencia, sin esperar el cierre de la investigación |
| Informe final y lecciones aprendidas | 30 días |

## 3. Roles

| Rol | Persona | Responsabilidad |
|---|---|---|
| Líder de incidente | [CTO / responsable técnico] | Coordina contención y evidencia |
| DPO | [por designar] | Evalúa riesgo para titulares, decide notificaciones, registra |
| Asesoría legal | [abogado] | Valida notificaciones y comunicaciones |
| Contacto con clientes | [cargo] | Avisa a cada administración afectada |
| Comunicaciones | [cargo] | Aviso público si no se puede notificar individualmente |

## 4. Pasos

1. **Detectar y abrir el incidente.** Fuentes: alertas de Supabase/Vercel, secret scan de CI, reportes de usuarios, proveedores, `platform_operation_events`, anomalías de `api_rate_limits`. Abrir un registro con hora de detección.
2. **Contener.** Revocar/rotar credenciales (`SUPABASE_SERVICE_ROLE_KEY`, llaves de IA, `community_api_keys`, `oversight_links`, secretos IoT y webhooks); desactivar la integración comprometida; bloquear cuentas afectadas.
3. **Preservar evidencia.** Exportar logs de Supabase (auth, API, Postgres), Vercel, proveedores; calcular hashes; no alterar logs.
4. **Evaluar.** Qué datos, qué comunidades, cuántos titulares, ventana temporal, si hubo acceso real o exfiltración, riesgo para los titulares. Marcar si incluye: datos sensibles (fondo solidario, salud de trabajadores), menores de 14 años, datos de deudas/pagos/cuentas bancarias, RUT.
5. **Avisar a los responsables** (comunidades) en 24 horas con: descripción, datos y titulares afectados, medidas tomadas, contacto del DPO.
6. **Notificar a la Agencia** (lo hace el responsable; ConviveConnect prepara el borrador) si hay riesgo razonable.
7. **Notificar a los titulares** cuando aplique el inciso 3° del art. 14 sexies (plantilla abajo).
8. **Remediar** y verificar.
9. **Registrar** en el registro de vulneraciones (sección 6), aunque se concluya que no había que notificar, con la justificación.
10. **Revisar** el incidente: causa raíz, cambios técnicos, actualización de la EIPD.

## 5. Plantillas

### 5.1 Encargado → responsable (comunidad)

> Asunto: Incidente de seguridad que afecta datos de [Comunidad] — [fecha]
> El [fecha y hora] detectamos [descripción]. Datos posiblemente afectados: [categorías]. Titulares aproximados: [n]. Ventana: [desde–hasta]. Medidas tomadas: [contención]. Próximos pasos: [..]. Evaluación preliminar de riesgo: [bajo/medio/alto]. Proponemos [notificar / no notificar] a la Agencia y a los titulares por [motivo]. Contacto: [DPO].

### 5.2 Responsable → Agencia

Contenido mínimo (art. 14 sexies): naturaleza de la vulneración; efectos; categorías de datos; número aproximado de titulares; medidas adoptadas para gestionarla y precaver incidentes futuros; responsable, encargado y contacto. [Usar el formulario o canal que la Agencia habilite.]

### 5.3 Responsable → titulares (lenguaje claro)

> Hola [nombre]. Te escribimos porque el [fecha] ocurrió un problema de seguridad en ConviveConnect, la plataforma que usa [Comunidad].
> **Qué pasó:** [explicación simple].
> **Qué datos tuyos se vieron afectados:** [p. ej., tu nombre, unidad y el detalle de tus pagos de gastos comunes].
> **Qué puede pasar:** [p. ej., podrías recibir mensajes falsos que pidan pagos].
> **Qué hicimos:** [medidas].
> **Qué te recomendamos:** [no responder correos sospechosos, cambiar contraseña, etc.].
> **Contacto:** [DPO / administración]. Puedes ejercer tus derechos y reclamar ante la Agencia de Protección de Datos Personales.

## 6. Registro de vulneraciones (formato)

| ID | Detección | Conocimiento por CC | Aviso a responsable | Notificación Agencia | Notificación titulares | Naturaleza | Datos | Titulares aprox. | Comunidades | Efectos | Medidas | Decisión y fundamento |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

Pendiente técnico: este registro no existe hoy en la base (ver `brechas-del-producto.md`, ítem P1-7).

## 7. Pendiente: revisión retroactiva del incidente de julio de 2026

`docs/privacy/PROCEDIMIENTO-DERECHOS-Y-BRECHAS.md` y las migraciones `20260717120000_fix_confirmed_privilege_escalation.sql` / `20260717140000_p0_remaining_rls_hardening.sql` documentan una escalada de privilegios y exposición de email/teléfono/departamento a `anon`. Esa revisión debe cerrarse con una conclusión firmada (exposición descartada, no concluyente o confirmada) **antes del 1-dic-2026**, y quedar en el registro de la sección 6.
