export class CoCoParser {
  /**
   * Extrae el contenido entre dos etiquetas XML usando Regex.
   */
  static extractTag(text, tag) {
    const regex = new RegExp(\`<\${tag}>([\\\\s\\\\S]*?)<\\\\/\${tag}>\`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Parsea la respuesta cruda del LLM y la convierte en un objeto estructurado.
   */
  static parseLLMResponse(llmOutput, role) {
    const analisisRaw = this.extractTag(llmOutput, 'analisis') || '';
    
    // Extraer bloque de decisión
    const decisionText = this.extractTag(llmOutput, 'decision');
    if (!decisionText) {
      // Fallback si Claude falló en usar el esquema (muy raro con buenos prompts)
      return {
        analisisRaw: llmOutput,
        decision: {
          tipo: 'desconocido',
          urgencia: 'baja',
          accion: 'responder_directo',
          parametros: {},
          razon_breve: 'Fallo al parsear XML'
        },
        respuestaUsuario: llmOutput // Devolvemos el texto completo como respuesta
      };
    }

    // Parsear campos individuales de la decisión
    const tipo = this.extractTag(decisionText, 'tipo') || 'desconocido';
    const urgencia = this.extractTag(decisionText, 'urgencia') || 'baja';
    const accion = this.extractTag(decisionText, 'accion') || 'responder_directo';
    const razon_breve = this.extractTag(decisionText, 'razon_breve') || '';

    // Extraer parámetros
    const parametrosText = this.extractTag(decisionText, 'parametros') || '';
    const parametros = {};
    
    if (role === 'resident' || role === 'residente') {
      parametros.categoria = this.extractTag(parametrosText, 'categoria');
      parametros.ubicacion = this.extractTag(parametrosText, 'ubicacion');
      parametros.prioridad_ticket = this.extractTag(parametrosText, 'prioridad_ticket');
      parametros.requiere_visita_tecnica = this.extractTag(parametrosText, 'requiere_visita_tecnica') === 'true';
    } else {
      parametros.ticket_relacionado = this.extractTag(parametrosText, 'ticket_relacionado');
      parametros.residente_afectado = this.extractTag(parametrosText, 'residente_afectado');
      parametros.requiere_seguimiento = this.extractTag(parametrosText, 'requiere_seguimiento') === 'true';
    }

    // Limpiar nulls en strings
    Object.keys(parametros).forEach(key => {
      if (parametros[key] === 'null') parametros[key] = null;
    });

    // Extraer respuesta final dependiendo del rol
    const respuestaTag = (role === 'resident' || role === 'residente') ? 'respuesta_residente' : 'respuesta_conserje';
    const respuestaUsuario = this.extractTag(llmOutput, respuestaTag) || 
                             "Lo siento, procesé tu solicitud pero ocurrió un error al formatear la respuesta.";

    return {
      analisisRaw,
      decision: {
        tipo,
        urgencia,
        accion,
        parametros,
        razon_breve
      },
      respuestaUsuario
    };
  }
}
