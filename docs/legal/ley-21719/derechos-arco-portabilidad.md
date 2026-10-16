# Derechos de los titulares: acceso, rectificación, supresión, oposición, bloqueo, portabilidad y decisiones automatizadas (BORRADOR)

> Borrador para revisión de abogado. Actualiza `docs/privacy/PROCEDIMIENTO-DERECHOS-Y-BRECHAS.md`.

## 1. Derechos y plazos legales

| Derecho | Contenido | Artículo |
|---|---|---|
| Acceso | Confirmar si se tratan sus datos, acceder a ellos y a la información del tratamiento | 5 |
| Rectificación | Corregir datos inexactos, desactualizados o incompletos; comunicar la corrección a quienes se cedieron | 6 |
| Supresión | Eliminar datos innecesarios, con consentimiento revocado sin otra base, ilícitos, caducos, por orden o tras oposición. **No procede** si el tratamiento es necesario para cumplir una obligación legal o ejecutar un contrato, o para defensa de reclamaciones, entre otros | 7 |
| Oposición | A un tratamiento específico basado en interés legítimo, entre otros casos | 8 |
| Decisiones automatizadas | Oponerse y no ser objeto de decisiones basadas solo en tratamiento automatizado (incluido perfilado) que produzcan efectos jurídicos o le afecten significativamente; en todos los casos: información, **explicación, intervención humana, expresar su punto de vista y pedir revisión** | 8 bis |
| Bloqueo | Suspensión temporal del tratamiento mientras se resuelve una solicitud de rectificación, supresión u oposición, o como alternativa a la supresión | 8 ter |
| Portabilidad | Copia en formato electrónico estructurado, genérico y de uso común, y transmisión a otro responsable cuando sea técnicamente posible; aplica si el tratamiento es automatizado **y** basado en consentimiento | 9 |

| Plazo / regla | Detalle | Artículo |
|---|---|---|
| Canal | Solicitud escrita a un correo, formulario de contacto o medio electrónico equivalente | 11 |
| Contenido mínimo de la solicitud | Identificación y autenticación del titular (según lo que defina la Agencia), dirección para responder, datos o tratamiento afectado, y fundamentos según el derecho | 11 |
| **Acuse de recibo y respuesta** | **Máximo 30 días corridos** desde el ingreso; **prórroga única de hasta 30 días corridos** | 11 |
| Forma de la respuesta | Por escrito al domicilio o correo del titular; guardar respaldo de envío, fecha y contenido íntegro | 11 |
| Rechazo | Fundado, informando que el titular tiene **30 días hábiles** para reclamar ante la Agencia (art. 41) | 11 |
| Sin respuesta | El titular puede reclamar directamente ante la Agencia | 11 |
| Costo | Medios expeditos, sin trabas (portabilidad); la regla general es gratuidad [validar con abogado] | 9, 11 |
| Varios responsables | El titular puede ejercer sus derechos ante cualquiera de ellos | 10 |
| Sanción | Omitir, responder incompleto o fuera de plazo es infracción leve (hasta 5.000 UTM) | 34 bis c), 35 a) |

## 2. Procedimiento propuesto

1. **Recepción.** Canales: Centro de privacidad (`/privacy-center` → `/profile#privacidad`, componente `src/components/profile/PrivacySettings.tsx`), correo [privacidad@dominio] o la administración. Toda solicitud se registra en `data_subject_requests` con fecha de ingreso.
2. **Acuse de recibo** automático por email en el mismo día, con número de solicitud y fecha límite.
3. **Enrutamiento por rol.**
   - Datos de administración del condominio (residentes, pagos, asambleas, accesos): **la comunidad responde** como responsable; ConviveConnect deriva en máx. 3 días hábiles y ejecuta técnicamente.
   - Tratamientos propios de ConviveConnect (seguridad, analítica, prospectos, supermercado, marketing): responde ConviveConnect.
4. **Verificación de identidad** proporcional (cuenta autenticada basta para acceso/portabilidad desde la app; por email, verificación adicional).
5. **Bloqueo** inmediato si el titular lo pide junto con rectificación, supresión u oposición.
6. **Análisis**: separar lo que se puede suprimir de lo que debe conservarse por ley (cobros, pagos, DTE, actas, votos, remuneraciones) → para lo segundo, **bloqueo** en vez de supresión, informando la base.
7. **Ejecución** (exportación, corrección, supresión/anonimización, cese del tratamiento) y propagación a subencargados (IA, email, WhatsApp, embeddings).
8. **Respuesta escrita** con lo hecho, lo no hecho y su fundamento, y el aviso de reclamación ante la Agencia (30 días hábiles).
9. **Archivo** de evidencia de envío y contenido.
10. **Prórroga**: si se necesita, notificar antes del día 30, con motivo, una sola vez.

## 3. Decisiones automatizadas de CoCo y Agent Center

| Función | ¿Efecto significativo? | Tratamiento propuesto |
|---|---|---|
| CoCo responde preguntas generales | No | Información |
| CoCo clasifica casos y urgencia (`coco_cases.urgency`, `category`) | Puede afectar la atención | Revisión humana disponible; explicar criterio |
| CoCo / Agent Center ejecutan acciones (reservas, estacionamientos, tareas) | Puede | Confirmación humana previa (existe: `agent_action_approvals`, acciones atómicas) |
| Redacción de citaciones y actas de asamblea | Sí (efectos jurídicos de la asamblea) | Siempre revisión y firma humana (existe revisión del admin) |
| Cobros, morosidad, convenios, fondo solidario, sanciones de convivencia | Sí | **Prohibir decisión solo automatizada**; la IA solo sugiere |
| IoT autónomo | Puede afectar a residentes de la unidad | Opt-in por comunidad (existe); registrar y permitir oposición |
| Memoria persistente de CoCo (`coco_user_memory`, `agent_memories`) | Perfilado | Requiere consentimiento `ai_processing`, ver/borrar memoria, oposición |

## 4. Qué falta en el producto para cumplir

| # | Brecha | Evidencia en el código | Cambio necesario |
|---|---|---|---|
| D1 | **Exportación incompleta** | `src/app/api/privacy/export/route.ts` exporta 12 tablas; faltan, entre otras, `coco_user_memory`, `coco_cases`, `coco_case_events`, `agent_runs`, `unit_charges`, `unit_payments`, `payment_agreements`, `transfer_reports`, `visitor_logs`, `qr_invitations`, `intercom_calls`, `assembly_attendance`, `assembly_votes`, `assembly_proxies`, `parking_*`, `marketplace_conversation_messages`, `social_posts`, `social_comments`, `time_bank_offers`, `neighbor_mediations`, `supermarket_*`, `ai_usage_events`, archivos de Storage (`avatars`, `social-images`, `marketplace`) | Exportación completa y documentada (esquema JSON + CSV), incluida la lista de destinatarios y fuentes; excluir datos de terceros |
| D2 | **Sin supresión ejecutable** | `data_subject_requests` solo registra; no hay flujo que borre/anonimice; `auth.admin.deleteUser` solo se usa al revertir registros fallidos | Job de supresión/anonimización por tabla (borrar, anonimizar o bloquear según base legal), borrado en Storage y en embeddings, certificación |
| D3 | **Sin bandeja de gestión para responsables** | RLS de `data_subject_requests` solo permite al titular ver lo suyo; no hay vista de administración | Panel para admin de comunidad y DPO: asignar, verificar identidad, prorrogar, responder, adjuntar evidencia |
| D4 | **Falta el derecho de bloqueo** y la prórroga | CHECK de `request_type` no incluye `blocking`; no hay columna de prórroga ni de acuse | Agregar `blocking`, `acknowledged_at`, `extended_until`, `extension_reason`, `legal_basis_retained`, y una bandera de bloqueo que las consultas respeten |
| D5 | **Oposición a decisiones automatizadas de CoCo no implementada** | No existe `consent_type` ni preferencia para oponerse al perfilado; `ai_processing` existe en el CHECK pero no se consulta en `src/app/api/coco/route.ts` ni en `src/lib/coco/tools.ts` | Preferencia "no usar memoria / no perfilado", y "solicitar revisión humana" en cada caso CoCo |
| D6 | **Memoria de CoCo sin consentimiento ni borrado accesible** | `rememberFact` (`src/lib/coco/tools.ts:1424`) guarda hechos sin verificar consentimiento; `forgetUserMemory` existe en `src/lib/coco/user-memory.ts` pero no se llama desde ninguna parte | Exigir consentimiento `ai_processing`; botón "ver y borrar lo que CoCo recuerda"; incluir `agent_memories` |
| D7 | **Rectificación solo parcial** | No se identificó un flujo de rectificación para datos que gestiona el admin (unidad, onboarding, pagos) ni propagación a subencargados (revisar edición de perfil existente) | Flujo de rectificación con aprobación del admin y propagación (embeddings, email/WhatsApp) |
| D8 | **Portabilidad a otro responsable** | Solo descarga JSON | Formato documentado y opción de envío directo (p. ej. si la comunidad cambia de proveedor, exportación masiva por comunidad) |
| D9 | **Acuse y respuesta escrita** | No se envía email de acuse ni se guarda la respuesta enviada | Emails con Resend + almacenamiento de la respuesta íntegra |
| D10 | **Titulares sin cuenta** (visitas, conductores, trabajadores) | No pueden usar el Centro de privacidad | Formulario público verificado o canal por email |
