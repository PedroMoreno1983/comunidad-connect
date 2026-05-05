import { createClient } from '@supabase/supabase-js';

// Inicializar cliente Supabase (asume que estas variables existen en el entorno)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);


export class MemoryService {
  /**
   * Genera un vector de embeddings usando Voyage AI (recomendado por Anthropic).
   * Modelo: voyage-3 (dimensión 1024). Usando fetch para evitar bugs del SDK en Vercel.
   */
  static async embedText(text) {
    try {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`
        },
        body: JSON.stringify({
          input: [text],
          model: "voyage-3"
        })
      });
      
      const data = await response.json();
      return data.data[0].embedding;
    } catch (err) {
      console.error("Error al generar embedding con Voyage AI REST:", err);
      // Fallback seguro de 1024 ceros si falla la API
      return Array(1024).fill(0);
    }
  }

  /**
   * Genera un puntaje de importancia usando un llamado ligero a la API (puede omitirse por un cálculo estático si se desea ahorrar)
   */
  static async scoreImportance(memoryContent) {
    // Para ahorrar tokens y tiempo, podemos hacer un fallback simple o llamar a un LLM pequeño.
    // Por simplicidad, asignaremos un 5 base, o buscar palabras clave.
    let score = 5;
    const lower = memoryContent.toLowerCase();
    if (lower.includes('emergencia') || lower.includes('urgente') || lower.includes('filtración')) score = 9;
    if (lower.includes('reclamo') || lower.includes('molestia')) score = 7;
    return score;
  }

  /**
   * Guarda una nueva memoria en el stream (PostgreSQL con pgvector)
   */
  static async addMemory(condominioId, userId, role, content) {
    try {
      const embedding = await this.embedText(content);
      const importance = await this.scoreImportance(content);
      
      const { data, error } = await supabase
        .from('agent_memories')
        .insert([{
          condominio_id: condominioId,
          user_id: userId,
          role: role,
          content: content,
          embedding: embedding, // Supabase pgvector maneja arrays de JS
          importance: importance
        }]);

      if (error) throw error;
      console.log(`✅ Memoria guardada (importancia: ${importance})`);
      return data;
    } catch (err) {
      console.error("Error guardando memoria:", err);
    }
  }

  /**
   * Recupera los recuerdos más relevantes usando pgvector
   */
  static async getRelevantMemories(condominioId, userId, queryText, limit = 5) {
    try {
      const queryEmbedding = await this.embedText(queryText);
      
      // Llamamos a una función RPC de Supabase que implemente el match
      // Como alternativa, podemos hacer una query cruda si usamos el SDK pg puro.
      // Aquí asumimos que crearás una función 'match_agent_memories' en Supabase.
      // Si no existe, devolveremos un array vacío para que no rompa.
      
      const { data, error } = await supabase.rpc('match_agent_memories', {
        query_embedding: queryEmbedding,
        match_condominio_id: condominioId,
        match_user_id: userId,
        match_threshold: 0.5,
        match_count: limit
      });

      if (error) {
        // Fallback silente si la función no existe aún
        console.warn("No se pudo ejecutar la búsqueda vectorial (¿Falta la función RPC?):", error.message);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error("Error buscando memorias:", err);
      return [];
    }
  }
}
