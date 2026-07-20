# Evaluación de impacto en protección de datos (borrador operativo)

Estado: requiere validación del responsable de datos y asesoría jurídica antes de habilitar tratamiento sensible o automatización IoT en producción.

## Tratamientos evaluados

1. Fondo solidario: categoría de vulnerabilidad y descripción libre potencialmente sensible.
2. CoCo: conversaciones, memoria contextual, clasificación y proveedores externos de IA.
3. IoT autónomo: eventos de sensores que pueden originar acciones operativas sin una instrucción humana inmediata.

## Necesidad y proporcionalidad

- Fondo: limitar la descripción al mínimo necesario, consentimiento expreso separado y acceso solo a personal autorizado.
- CoCo: no solicitar RUT ni información sensible innecesaria; permitir revisión humana y oposición al perfilamiento.
- IoT: secreto independiente por comunidad, unidad validada dentro del tenant y automatización desactivada por defecto.

## Riesgos y controles

| Riesgo | Control implementado | Riesgo residual |
|---|---|---|
| Acceso entre comunidades | RLS, tenant derivado del usuario y pruebas de cruce de tenant | Bajo, sujeto a pruebas continuas |
| Exposición de datos sensibles | Consentimiento versionado, acceso administrativo y respuestas API genéricas | Medio |
| Decisión automatizada perjudicial | Confirmación humana en CoCo; IoT autónomo opt-in por comunidad | Medio |
| Transferencia internacional no informada | Política pública con proveedores nominados | Medio, requiere garantías contractuales |
| Conservación excesiva | Solicitudes de supresión/exportación y política de retención por aprobar | Medio hasta aprobar plazos |

## Condiciones de puesta en producción

- [ ] Identidad y domicilio exactos del responsable publicados.
- [ ] DPA y transferencias validados por abogado.
- [ ] Plazos de retención aprobados y automatización de purga verificada.
- [ ] Habilitación IoT registrada con fecha, administrador responsable y alcance.
- [ ] Simulacro de incidente y procedimiento de derechos probado.

