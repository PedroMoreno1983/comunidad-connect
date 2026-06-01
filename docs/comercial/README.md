# Convive Connect - Paquete comercial

Este directorio deja cerrado el material base para vender, implementar y operar Convive Connect con un cliente real.

## Documentos

- `precios.md`: propuesta inicial de planes, onboarding y add-ons.
- `soporte-sla.md`: modelo de soporte y tiempos de respuesta.
- `contrato-base.md`: borrador contractual para revision legal.
- `implementacion-cliente.md`: flujo de activacion de un nuevo condominio.
- `terminos-operativos.md`: reglas de uso, datos, IA y canales.
- `cierre-produccion.md`: checklist tecnico para cerrar produccion pagada.

## Estado

El repositorio queda comercialmente presentable cuando:

1. El cliente tiene credenciales reales en un tenant propio.
2. Vercel tiene todas las variables productivas.
3. Supabase tiene migraciones aplicadas.
4. `npm run qa:readiness` reporta `Paid production readiness: READY`.
5. El contrato y terminos son revisados por abogado antes de firma.
