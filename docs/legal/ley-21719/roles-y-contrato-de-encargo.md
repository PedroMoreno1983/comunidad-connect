# Roles y contrato de encargo — ConviveConnect (BORRADOR)

> Borrador para revisión de abogado. Cuando la Agencia publique sus modelos tipo de contrato de encargo (art. 15 bis, inciso 3°), este modelo debe contrastarse con ellos.

## 1. Regla general

| Parte | Rol legal | Fundamento |
|---|---|---|
| Comunidad de copropietarios / administración contratante | **Responsable de datos** (art. 2 letra n): decide finalidades y medios de la administración del condominio | Ley 21.442 asigna a la administración la gestión de la copropiedad; contrata la plataforma |
| ConviveConnect (DataWise SPA u operador) | **Tercero mandatario o encargado** (art. 2 letra x): trata datos "por cuenta del responsable" | Contrato de servicio SaaS |
| Proveedores de ConviveConnect | **Subencargados** | Delegación con autorización específica y por escrito del responsable (art. 15 bis) |

Matiz a resolver con el abogado: cuando la administración es una empresa externa que atiende varios condominios, hay que definir si el responsable es la comunidad, la administradora o ambos (corresponsabilidad). El modelo de abajo asume que la comunidad es responsable y la administradora actúa como su mandataria.

## 2. Casos en que ConviveConnect actúa como responsable

Si ConviveConnect usa los datos para fines propios, es responsable de esos tratamientos. Y **si usa los datos del encargo para otro objeto o los cede sin autorización, pasa a ser responsable para todos los efectos legales, responde personalmente y solidariamente por los daños** (art. 15 bis, inciso 2°).

| Tratamiento | Por qué CC es responsable | Riesgo / acción |
|---|---|---|
| Seguridad, logs, prevención de fraude, auditoría de plataforma (`platform_operation_events`, `api_rate_limits`) | Finalidad propia de CC | Declararlo en la política; interés legítimo |
| Facturación del SaaS a comunidades/administradoras | Relación contractual propia | Base: contrato |
| Prospectos comerciales (`commercial_leads`) | Captación propia | Suprimir si no prospera (art. 14 d) |
| Analítica web (Google Analytics) y marketing (reels, Instagram) | Finalidad propia | Banner de consentimiento; no usar datos de residentes |
| Servicios B2C contratados por el residente: supermercado y compras grupales | CC define la finalidad frente al residente | Consentimiento propio; términos B2C separados |
| Marketplace de estacionamientos con comisión y pagos a dueños (`parking_payouts`, `parking_owner_payout_settings`) | CC podría intermediar pagos por cuenta propia | Definir contractualmente; si CC cobra comisión, es responsable de esos datos de pago |
| Mejora de CoCo, métricas agregadas de IA (`ai_usage_events`) | Finalidad propia | Usar solo datos agregados o anonimizados; **no entrenar modelos con datos de residentes** sin base |
| Embeddings y búsqueda semántica entre comunidades | Si se cruzaran tenants, sería tratamiento propio | Mantener aislamiento por comunidad |
| Superadmin de plataforma (`SUPERADMIN_EMAILS`) que accede a datos de comunidades | Acceso del encargado solo para soporte instruido | Registrar y justificar cada acceso |

## 3. Modelo de cláusulas de encargo de tratamiento

> Para anexar al contrato de servicio entre **[Comunidad / Administración]** ("el Responsable") y **[DataWise SPA]** ("el Encargado"). Contenido mínimo exigido por el art. 15 bis: objeto, duración, finalidad, tipo de datos, categorías de titulares, derechos y obligaciones.

**Primera. Objeto.** El Responsable encarga al Encargado el tratamiento de los datos personales necesarios para prestar el servicio ConviveConnect, consistente en [módulos contratados: administración de residentes y unidades, gastos comunes y pagos, asambleas, accesos y visitas, comunicaciones, CoCo, fondo solidario, estacionamientos, remuneraciones, IoT].

**Segunda. Duración.** El encargo dura lo mismo que el contrato de servicio. Las obligaciones de confidencialidad subsisten después de terminado (art. 14 bis).

**Tercera. Finalidad.** El Encargado tratará los datos solo para prestar el servicio y según las instrucciones documentadas del Responsable. Le queda prohibido tratarlos para un objeto distinto, cederlos o entregarlos sin autorización expresa y específica del Responsable.

**Cuarta. Tipo de datos y titulares.** Los indicados en el Anexo A (extracto del registro de actividades): identificación y contacto, vínculo con unidades, datos financieros y de deudas, asambleas y votos, accesos y visitas, patentes, conversaciones con IA, datos laborales y previsionales de trabajadores y, si se activa el fondo solidario, datos sensibles. Titulares: copropietarios, arrendatarios, residentes, visitas, conductores, trabajadores y proveedores del condominio.

**Quinta. Instrucciones.** Las instrucciones constan en este contrato, en la configuración de la plataforma realizada por el Responsable y en comunicaciones escritas. El Encargado avisará si una instrucción le parece contraria a la ley.

**Sexta. Confidencialidad.** El Encargado garantiza que las personas autorizadas a tratar los datos están obligadas a guardar secreto.

**Séptima. Seguridad.** El Encargado aplicará las medidas técnicas y organizativas del Anexo B (art. 14 quinquies): aislamiento por comunidad (RLS), control de acceso por rol, cifrado en tránsito y en reposo, registros de auditoría, respaldos y restauración, pruebas periódicas.

**Octava. Subencargados.** El Responsable **autoriza específicamente y por escrito** a los subencargados del Anexo C. El Encargado:
a) impondrá a cada subencargado obligaciones equivalentes a las de este contrato;
b) avisará con [30] días de anticipación cualquier alta o cambio de subencargado, y el Responsable podrá oponerse fundadamente;
c) seguirá siendo solidariamente responsable por lo que haga el subencargado (art. 15 bis).

**Novena. Transferencias internacionales.** Las transferencias a los subencargados fuera de Chile se ampararán en cláusulas contractuales u otros instrumentos con garantías adecuadas (art. 27 letra b), mientras la Agencia no declare un nivel adecuado del país de destino (art. 28). El Encargado entregará copia de esas garantías al Responsable si las solicita.

**Décima. Derechos de los titulares.** El Encargado asistirá al Responsable para responder dentro de los plazos legales (30 días corridos, prorrogables una vez por 30; art. 11): le derivará en un máximo de [3] días hábiles toda solicitud recibida directamente y pondrá a disposición herramientas de exportación, rectificación, supresión, bloqueo y oposición.

**Undécima. Vulneraciones de seguridad.** El Encargado **reportará al Responsable** toda vulneración (art. 15 bis) sin dilación indebida y a más tardar dentro de [24] horas desde que tenga conocimiento, con la información del `protocolo-de-brechas.md`, y lo asistirá en las comunicaciones a la Agencia y a los titulares (art. 14 sexies).

**Duodécima. Evaluaciones de impacto.** El Encargado entregará al Responsable la información necesaria para las evaluaciones de impacto que correspondan (art. 15 ter), en especial para CoCo/IA, fondo solidario e IoT.

**Decimotercera. Auditoría.** El Responsable podrá verificar el cumplimiento, mediante informes, certificaciones o auditorías con aviso de [15] días, una vez al año o tras una vulneración.

**Decimocuarta. Término.** Al terminar el servicio, el Encargado, según elija el Responsable, **devolverá** los datos en formato estructurado o los **suprimirá** (art. 15 bis), dentro de [30] días, y certificará la supresión, salvo obligación legal de conservarlos.

**Decimoquinta. Responsabilidad.** Si el Encargado trata los datos para otro objeto o los cede sin autorización, será considerado responsable de datos y responderá personalmente y solidariamente (art. 15 bis).

**Anexo A** — Extracto del registro de actividades de tratamiento.
**Anexo B** — Medidas de seguridad.
**Anexo C** — Lista de subencargados (sección 4).

## 4. Lista de subencargados (Anexo C, borrador)

| Subencargado | Servicio | Datos | Ubicación del tratamiento | Garantía | Estado |
|---|---|---|---|---|---|
| Supabase Inc. | Base de datos, autenticación, almacenamiento, edge functions | Todos los datos de la plataforma | EE. UU. [confirmar región del proyecto] | DPA + cláusulas | Revisar DPA |
| Vercel Inc. | Hosting, funciones serverless, crons | Datos en tránsito, logs | EE. UU. / red global | DPA | Revisar DPA |
| Anthropic PBC | IA (CoCo, Agent Center, asambleas) | Mensajes y contexto | EE. UU. | DPA comercial, no-entrenamiento | Revisar DPA |
| OpenAI | IA (imágenes, voz, auxiliares) | Prompts | EE. UU. | DPA | Revisar DPA |
| Google LLC (Gemini) | Extracción de documentos de onboarding, capacitación | Planillas y documentos, prompts | EE. UU. | Términos de procesamiento | Revisar |
| Voyage AI | Embeddings de búsqueda | Texto de perfiles y publicaciones | EE. UU. | DPA | Revisar |
| Resend | Email transaccional | Email, nombre, contenido | EE. UU. | DPA | Revisar |
| Twilio Inc. | WhatsApp | Teléfono, mensajes | EE. UU. | DPA | Revisar |
| Haulmer / Tuu | Pagos, documentos tributarios | Datos de pago, receptor DTE | Chile [confirmar] | Contrato de encargo | Firmar |
| Transbank (si se activa) | Pagos | Datos de pago | Chile | Contrato | — |
| Mapbox / OpenStreetMap Nominatim | Geocodificación | Dirección del condominio | EE. UU. / UE | Términos | Minimizar |
| Proveedor VPS del worker de supermercado | Automatización de compras | Listas y pedidos | [confirmar] | Contrato | Identificar |
| **DeepSeek** | Respaldo de IA "light" | Prompts de CoCo / asambleas | **China** | No hay garantía identificada | **No autorizar**: desactivar o justificar |
| Google Analytics | Medición (responsable propio de CC) | Navegación | EE. UU. | Consentimiento + términos | — |

Proveedores solo de marketing (HeyGen, Creatomate, Higgsfield, Meta/Instagram) no deben recibir datos de residentes y no forman parte del encargo.
