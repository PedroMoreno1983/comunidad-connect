# Brechas técnicas del producto frente a la Ley 21.719 (BORRADOR)

> Lista priorizada de cambios **no implementados** en este PR. Prioridad: **P0** = antes del 1-dic-2026 y de alto riesgo de sanción o daño; **P1** = antes del 1-dic-2026; **P2** = primer semestre 2027. Revisar con abogado y DPO.

## Top 5

| # | Brecha | Por qué importa | Archivos / tablas afectados |
|---|---|---|---|
| **1 (P0)** | **Transferencia a DeepSeek (China) sin garantías** | CoCo (respaldo "light") y la redacción de asambleas pueden enviar prompts con datos de residentes a `api.deepseek.com`. No hay decisión de adecuación ni cláusulas identificadas (arts. 27-28) y el proveedor no aparece en la política pública | `src/lib/ai/deepseek.ts`, `src/lib/ai/modelRouter.ts` (tareas `light`), `src/lib/assemblies/aiWriter.ts`, `src/app/api/coco/route.ts`, `src/app/privacy/page.tsx` |
| **2 (P0)** | **Supresión no ejecutable y sin plazos de conservación automatizados** | El derecho de supresión (art. 7) y el principio de proporcionalidad exigen borrar o anonimizar; hoy `data_subject_requests` solo registra y no hay purgas de visitas, logs, conversaciones de IA ni onboarding (solo existe retención para precios de supermercado) | `data_subject_requests`, `profiles`, `agent_memories`, `coco_user_memory`, `agent_runs`, `visitor_logs`, `qr_invitations`, `intercom_calls`, `onboarding_import_rows.raw_data`, bucket `onboarding-documents`, `vercel.json` (crons), nueva migración de retención |
| **3 (P0)** | **Memoria y perfilado de CoCo sin consentimiento ni oposición** | Art. 8 bis (decisiones automatizadas: explicación, intervención humana, revisión) y art. 12 (consentimiento). `rememberFact` guarda hechos sin consultar `ai_processing`; `forgetUserMemory` no se usa; no hay "pedir revisión humana" en los casos | `src/lib/coco/tools.ts`, `src/lib/coco/user-memory.ts`, `src/app/api/coco/route.ts`, `coco_cases`, `privacy_consent_events`, `src/components/profile/PrivacySettings.tsx` |
| **4 (P0)** | **Datos bancarios y RUT en texto plano** | Cuentas bancarias y RUT de dueños de estacionamientos, RUT y previsión de salud de trabajadores, RUT/DNI de visitas. Una filtración de estos datos obliga a notificar a titulares (art. 14 sexies) y exige medidas como seudonimización/cifrado (art. 14 quinquies) | `parking_owner_payout_settings` (`bank_account_number`, `holder_rut`), `parking_payouts.bank_snapshot`, `community_employees` (`rut`, `health_system`, `isapre_*`), `qr_invitations.guest_dni` |
| **5 (P1)** | **Exportación de datos incompleta y sin bandeja de gestión para el responsable** | Acceso y portabilidad (arts. 5 y 9) con plazo de 30 días (art. 11): la exportación omite pagos, casos CoCo, visitas, asambleas, mensajes, archivos; la comunidad (responsable) no puede gestionar solicitudes | `src/app/api/privacy/export/route.ts`, `src/app/api/privacy/requests/route.ts`, `data_subject_requests` (RLS solo del titular; falta `blocking`, acuse, prórroga) |

## Lista completa

### P0

| ID | Cambio | Afecta |
|---|---|---|
| P0-1 | Desactivar DeepSeek o restringirlo a prompts sin datos personales; documentar proveedor y garantías | `src/lib/ai/deepseek.ts`, `src/lib/ai/modelRouter.ts`, `src/lib/assemblies/aiWriter.ts` |
| P0-2 | Motor de retención: tabla de políticas por entidad, cron de purga/anonimización y bloqueo legal | Nueva migración `privacy_retention_policies`; `vercel.json`; tablas de visitas, IA, logs, onboarding |
| P0-3 | Flujo de supresión por titular: borrado/anonimización por tabla, Storage y embeddings, con certificado | `data_subject_requests`, `profiles`, `auth.users`, buckets `avatars`/`social-images`/`marketplace`, `profiles.embedding_voyage`, `marketplace_items.embedding*` |
| P0-4 | Consentimiento `ai_processing` obligatorio para memoria persistente; "ver y borrar memoria"; oposición al perfilado | `src/lib/coco/tools.ts:1424`, `src/lib/coco/user-memory.ts`, `agent_memories`, `PrivacySettings.tsx` |
| P0-5 | "Solicitar revisión humana" y explicación en casos y acciones de CoCo/Agent Center; prohibir decisiones solo automatizadas sobre cobros, morosidad, fondo solidario y sanciones | `coco_cases`, `coco_case_events`, `agent_action_approvals`, `src/lib/agent-center/agentLoop.ts` |
| P0-6 | Cifrado a nivel de columna (pgcrypto/Vault o `INTEGRATION_ENCRYPTION_KEY`) de cuentas bancarias y RUT; enmascarar en UI | `parking_owner_payout_settings`, `parking_payouts`, `community_employees`, `qr_invitations` |
| P0-7 | Cerrar la revisión retroactiva del incidente de julio de 2026 con conclusión firmada | `docs/privacy/PROCEDIMIENTO-DERECHOS-Y-BRECHAS.md`, logs de Supabase/Vercel |
| P0-8 | Completar y publicar la política: identidad del responsable, DPO, todos los proveedores (faltan DeepSeek, Mapbox, Nominatim, VPS del supermercado), plazos de conservación, versión y fecha | `src/app/privacy/page.tsx`, variables `NEXT_PUBLIC_PRIVACY_*` |

### P1

| ID | Cambio | Afecta |
|---|---|---|
| P1-1 | Exportación completa (todas las tablas por `user_id`/`profile_id`/unidad, archivos, metadatos de tratamiento) en JSON + CSV | `src/app/api/privacy/export/route.ts` |
| P1-2 | Bandeja de solicitudes para admin de comunidad y DPO, con acuse automático, prórroga única, respuesta escrita archivada | `data_subject_requests` (nuevas columnas y RLS por comunidad), nueva página admin, `src/lib/email.ts` |
| P1-3 | Tipo `blocking` y bandera de bloqueo respetada por las consultas | `data_subject_requests`, `profiles` (o tabla `processing_restrictions`) |
| P1-4 | Banner de cookies: cargar Google Analytics solo con consentimiento | `src/app/layout.tsx` (`NEXT_PUBLIC_GA_ID`), `privacy_consent_events` (nuevo `consent_type` `analytics`) |
| P1-5 | Verificación de edad / declaración de mayoría de edad y flujo de consentimiento parental para menores de 14 | `src/app/api/auth/signup/route.ts`, `src/app/api/admin-onboarding/register/route.ts`, `profiles` |
| P1-6 | Minimizar datos enviados a IA: redactar RUT, teléfonos, cuentas y datos de salud antes de llamar a proveedores; no enviar votos nominativos | `src/app/api/coco/route.ts`, `src/lib/ai/*`, `src/lib/assemblies/aiWriter.ts`, extracción de onboarding (Gemini) |
| P1-7 | Registro de vulneraciones en base de datos (art. 14 sexies inc. 2°) y runbook de rotación de secretos | Nueva tabla `security_breach_log`; `.github/workflows/production-security.yml` |
| P1-8 | Registro de accesos de superadmin/soporte a datos de una comunidad (justificación y auditoría) | `SUPERADMIN_EMAILS`, `platform_operation_events` |
| P1-9 | Borrar originales y `raw_data` de onboarding tras sincronizar | `onboarding_import_documents`, `onboarding_import_rows.raw_data`, bucket `onboarding-documents` |
| P1-10 | Separar términos B2C y consentimiento propio para supermercado y estacionamientos con comisión (CC responsable) | `supermarket_*`, `profiles.supermarket_history_enabled`, `parking_*` |
| P1-11 | Canal de derechos para titulares sin cuenta (visitas, conductores, trabajadores) | Nueva ruta pública verificada |
| P1-12 | Corregir la deriva de esquema (`profiles.phone_number` fuera de migraciones) para que el inventario sea fiable | `schema.sql`, `supabase/migrations/` |
| P1-13 | Avisos de geolocalización (art. 16 sexies) y minimizar envío de direcciones a Mapbox/Nominatim | `src/app/api/geocode/address/route.ts`, `communities.address_*` |

### P2

| ID | Cambio | Afecta |
|---|---|---|
| P2-1 | Portabilidad responsable-a-responsable (exportación masiva por comunidad al cambiar de proveedor) | Nueva ruta admin |
| P2-2 | Seudonimización en analítica interna de IA (`ai_usage_events.user_id`) y métricas agregadas | `ai_usage_events`, `committee_digests` |
| P2-3 | Política de grabación de asambleas: aviso previo, consentimiento/base y plazo de conservación del enlace | `assemblies.video_url`, `src/lib/assemblies/compose.ts` |
| P2-4 | Evaluaciones de impacto formales (CoCo, fondo solidario, IoT, gran escala) vinculadas a la configuración | `docs/privacy/EIPD-IA-IOT-FONDO-SOLIDARIO.md` |
| P2-5 | Pruebas automáticas de privacidad en CI (exportación completa, supresión, RLS de solicitudes) | `tests/`, `.github/workflows/ci.yml` |
