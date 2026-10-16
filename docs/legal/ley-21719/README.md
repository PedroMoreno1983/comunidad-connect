# Cumplimiento Ley 21.719 — ConviveConnect (BORRADORES)

> **Estos documentos son borradores de trabajo.** Fueron preparados a partir de una revisión del código del repositorio (migraciones, `schema.sql`, rutas API e integraciones) y del texto oficial de la ley. **No constituyen asesoría legal** y **deben ser revisados y aprobados por un abogado** con experiencia en protección de datos antes de publicarse, firmarse o usarse frente a clientes, titulares o la Agencia.

## Marco y fechas verificadas

| Hito | Dato | Fuente |
|---|---|---|
| Publicación en el Diario Oficial | 13-dic-2024 (promulgación 25-nov-2024) | LeyChile, Ley 21.719: https://www.bcn.cl/leychile/navegar?idNorma=1209272 |
| Entrada en vigencia | **1-dic-2026**: "el día primero del mes vigésimo cuarto posterior a la publicación" (art. 1° transitorio) | LeyChile, versión con vigencia diferida 01-DIC-2026: https://www.leychile.cl/leychile/navegar?idNorma=1209272&idVersion=2026-12-01 |
| Autoridad | Agencia de Protección de Datos Personales (art. 30 y ss. de la Ley 19.628 reformada) | Mismo texto |
| **Riesgo de postergación** | El Gobierno ingresó el 1-sep-2026 el Boletín 18.623-07 para postergar la vigencia al **1-dic-2027**. **No es ley** a la fecha de estos borradores (oct-2026): la fecha que rige sigue siendo el 1-dic-2026. | Ministerio de Economía: https://www.economia.gob.cl/2026/09/01/gobierno-propone-ampliar-plazo-para-implementar-nueva-ley-de-proteccion-de-datos-y-institucionalidad.htm ; Mensaje en Cámara: https://www.camara.cl/verDoc.aspx?prmID=18854&prmTIPO=INICIATIVA |
| Estado de la Agencia | El Senado rechazó en mayo de 2026 la primera propuesta de consejeros; en esta revisión no se identificaron instrucciones generales ni modelos tipo de contrato publicados por la Agencia. | Senado: https://www.senado.cl/comunicaciones/noticias/desestiman-propuesta-de-consejeros-para-la-agencia-de-proteccion-de-datos |

**Recomendación:** planificar para el 1-dic-2026 y revisar el estado del Boletín 18.623-07 y las instrucciones de la Agencia antes de publicar. La Agencia debe publicar modelos tipo de contratos de encargo (art. 15 bis) y una lista orientativa de tratamientos que requieren evaluación de impacto (art. 15 ter): cuando existan, estos borradores deben ajustarse a ellos.

Los artículos citados en estos documentos corresponden a la **Ley 19.628 en su texto reformado por la Ley 21.719** (p. ej. "art. 14 sexies" = deber de reportar vulneraciones).

## Documentos

| # | Archivo | Contenido |
|---|---|---|
| 1 | [registro-de-actividades-de-tratamiento.md](registro-de-actividades-de-tratamiento.md) | Inventario de datos encontrado en el código y registro por actividad (finalidad, base, categorías, encargados, transferencias, conservación, medidas). |
| 2 | [politica-de-privacidad.md](politica-de-privacidad.md) | Política para residentes y usuarios, en lenguaje claro (art. 14 ter). |
| 3 | [roles-y-contrato-de-encargo.md](roles-y-contrato-de-encargo.md) | Responsable vs. encargado, casos en que ConviveConnect es responsable, modelo de cláusulas de encargo y lista de subencargados. |
| 4 | [protocolo-de-brechas.md](protocolo-de-brechas.md) | Gestión y notificación de vulneraciones de seguridad (art. 14 sexies). |
| 5 | [derechos-arco-portabilidad.md](derechos-arco-portabilidad.md) | Procedimiento y plazos de acceso, rectificación, supresión, oposición, bloqueo, portabilidad y decisiones automatizadas; brechas del producto. |
| 6 | [brechas-del-producto.md](brechas-del-producto.md) | Lista priorizada de cambios técnicos (no implementados). |

Documentos previos relacionados (no reemplazados): `docs/privacy/EIPD-IA-IOT-FONDO-SOLIDARIO.md` y `docs/privacy/PROCEDIMIENTO-DERECHOS-Y-BRECHAS.md`. La política pública vigente está en `src/app/privacy/page.tsx`.

## Pendientes de gobierno (no técnicos)

1. **Designar un Delegado de Protección de Datos (DPO).** La ley lo contempla como parte del modelo de prevención de infracciones (arts. 49 y 50, designación por la máxima autoridad de la empresa). Aunque el modelo es voluntario, para ConviveConnect —que trata datos de muchas comunidades, datos financieros, datos sensibles del fondo solidario y usa IA con proveedores extranjeros— se considera **imprescindible** designarlo, con medios, autonomía y canal de contacto propio (p. ej. `privacidad@` / `dpo@`).
2. Identificar formalmente al responsable (razón social, RUT, representante legal, domicilio postal) en la política pública: hoy depende de variables `NEXT_PUBLIC_PRIVACY_RESPONSIBLE_*`.
3. Firmar contrato de encargo con cada comunidad/administración y revisar los DPA de cada subencargado.
4. Aprobar plazos de conservación (tabla del registro) con asesoría legal, contable y laboral.
5. Completar evaluaciones de impacto (art. 15 ter) para CoCo/IA, fondo solidario, IoT y tratamiento a gran escala.
6. Capacitar al equipo y a los administradores clientes.

## Alcance y limitaciones de esta revisión

- El inventario se hizo leyendo `schema.sql`, `supabase/migrations/*.sql`, `src/app/api/**`, `src/lib/**` y variables de entorno referenciadas, en la rama `master` al commit `0ff85e6`. No se revisó la base de producción: `schema.sql` advierte deriva (p. ej. la columna real `profiles.phone_number` no está en migraciones).
- No se revisaron los contratos ni las condiciones reales de los proveedores (regiones de alojamiento, DPA, retención de prompts).
- No se encontró en el código tratamiento de cámaras/CCTV, biometría ni grabación de voz de usuarios; sí enlaces de video de asambleas (`assemblies.video_url`) y lectura en voz alta local (`speechSynthesis` del navegador).
