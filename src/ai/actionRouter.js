const API = process.env.COMUNIDAD_API_URL || "http://localhost:3000/api";

export class ActionRouter {
  
  /**
   * Ejecuta la acción técnica decidida por CoCo IA.
   */
  static async executeAction(userId, parsedResponse, userCtx) {
    const { accion, parametros, tipo, urgencia } = parsedResponse.decision;
    const { community_id, token } = userCtx;

    const headers = {
      "Content-Type": "application/json",
      ...(token && { "Authorization": \`Bearer \${token}\` })
    };

    const call = (path, opts = {}) =>
      fetch(\`\${API}\${path}\`, { headers, ...opts }).then((r) => r.json()).catch(e => ({ error: e.message }));

    console.log(\`[ActionRouter] Ejecutando acción: \${accion} (Urgencia: \${urgencia})\`);

    switch (accion) {
      case 'responder_directo':
      case 'solicitar_clarificacion':
        // No hay acción de backend, solo respondemos
        return { status: 'success', message: 'No action needed' };

      case 'crear_ticket':
        return call("/claims", {
          method: "POST",
          body: JSON.stringify({
            unit_id: userCtx.unit_id,
            community_id: community_id,
            source: "COCO_IA",
            tipo: tipo,
            urgencia: urgencia,
            categoria: parametros.categoria,
            ubicacion: parametros.ubicacion,
            prioridad: parametros.prioridad_ticket,
            description: parsedResponse.decision.razon_breve
          }),
        });

      case 'escalar_admin':
      case 'notificar_admin':
        console.log("Notificando al admin por escalación...");
        // Implementa tu lógica de notificación (Resend, push, etc.)
        return { status: 'success', escalated: true };

      case 'protocolo_emergencia':
      case 'activar_emergencia':
        console.log("¡EMERGENCIA ACTIVADA! Notificando a conserjería y admin de turno.");
        return { status: 'success', emergency_triggered: true };

      case 'registrar_bitacora':
        // Acción de conserje
        return call("/bitacora", {
          method: "POST",
          body: JSON.stringify({
            user_id: userId,
            community_id: community_id,
            residente_afectado: parametros.residente_afectado,
            contenido: parsedResponse.decision.razon_breve,
            tipo_evento: tipo
          }),
        });

      case 'actualizar_ticket':
        return call(\`/claims/\${parametros.ticket_relacionado}\`, {
          method: "PATCH",
          body: JSON.stringify({
            update_notes: parsedResponse.decision.razon_breve,
            source: "COCO_IA_CONCIERGE"
          })
        });

      case 'consultar_gasto_comun':
        const month = new Date().toISOString().slice(0, 7);
        return call(\`/payments/\${userCtx.unit_id}?month=\${month}\`);

      default:
        console.warn(\`Acción no implementada o desconocida: \${accion}\`);
        return { status: 'unknown_action' };
    }
  }
}
