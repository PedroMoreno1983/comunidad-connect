# Implementacion de cliente

Objetivo: activar una comunidad real en 48 horas habiles cuando el cliente entrega datos completos.

## Dia 0 - Preparacion

- Confirmar plan, dominio, administrador responsable y fecha de salida.
- Crear tenant/comunidad en Supabase.
- Configurar variables productivas en Vercel.
- Confirmar correo de envio, WhatsApp y datos de facturacion si aplican.

## Dia 1 - Datos

- Cargar unidades.
- Cargar residentes y roles.
- Cargar conserjes, administradores y proveedores.
- Validar datos duplicados, correos invalidos, unidades sin residente y residentes sin unidad.
- Enviar invitaciones controladas o preparar credenciales iniciales.

## Dia 2 - Operacion

- Configurar comunicaciones, reservas, marketplace y servicios.
- Activar CoCo IA con documentos legales y reglas internas disponibles.
- Ejecutar QA de flujos criticos.
- Capacitar administrador y conserjeria.

## Aceptacion

El cliente valida:

- Puede iniciar sesion.
- Puede crear comunicacion.
- Puede registrar visita/paquete.
- Puede cargar residentes.
- Puede generar votacion.
- Puede usar CoCo IA.
- Puede revisar reportes principales.

## Post salida

- Primer control a 7 dias.
- Segundo control a 30 dias.
- Ajuste de reglas, textos y reportes segun uso real.
