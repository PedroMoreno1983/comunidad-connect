# Procedimiento de derechos y brechas de datos

## Solicitudes de titulares

1. La persona registra acceso, rectificación, supresión, oposición o portabilidad en `/privacy-center`.
2. El sistema conserva recepción, estado, vencimiento y respuesta sin exponer datos de terceros.
3. El responsable verifica identidad y separa datos eliminables de registros sujetos a conservación legal.
4. La respuesta y las acciones ejecutadas se documentan en la solicitud.
5. Los rechazos deben indicar motivo, base y canal de reclamación. El plazo operativo configurado es de 30 días y debe ajustarse si asesoría jurídica define uno menor.

## Incidentes

1. Contener: revocar credenciales, aislar la integración y preservar evidencia sin alterar logs.
2. Evaluar: datos, titulares, comunidades, ventana temporal, acceso real y probabilidad de daño.
3. Escalar de inmediato al responsable designado y al contacto de seguridad.
4. Evaluar con asesoría jurídica la notificación a la Agencia y a titulares conforme a la Ley 21.719.
5. Documentar decisiones, comunicaciones, remediación y acciones preventivas.

## Revisión retroactiva del incidente de julio de 2026

- Revisar logs de Supabase, Vercel, autenticación, operaciones y proveedores durante la ventana afectada.
- Buscar accesos o mutaciones entre comunidades, exportaciones masivas y uso de credenciales expuestas.
- Conservar hashes y exportaciones de evidencia en un repositorio de incidentes con acceso restringido.
- Emitir una conclusión firmada: exposición descartada, no concluyente o confirmada; no asumir que corregir el código descarta acceso previo.

Este documento define operación interna y no reemplaza la validación legal ni la designación formal de responsables.

