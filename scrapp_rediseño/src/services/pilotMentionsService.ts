// src/services/pilotMentionsService.ts
import api from './api';

export const pilotMentionsService = {
  // Para infinite scroll (MentionsPage)
  async getAllPaginated(brandId?: string, limit?: number, cursor?: string) {
    try {
      const params: any = {};
      if (brandId) params.brandId = brandId;
      if (limit) params.limit = limit;
      if (cursor) params.cursor = cursor;
      
      const { data } = await api.get('/pilot/mentions', { params });
      
      return {
        mentions: data.mentions || [],
        nextCursor: data.nextCursor,
        hasMore: !!data.nextCursor
      };
    } catch (error) {
      console.error('❌ Error:', error);
      return { mentions: [], nextCursor: null, hasMore: false };
    }
  },

  // Insight IA generado por Ollama
  // Retorna { text?, generatedAt?, generating, lastError } o null si hay error de red
  async getInsight() {
    try {
      const { data } = await api.get('/pilot/insight');
      // data = { success, insight: {text,generatedAt,stats}|null, generating, lastError }
      return {
        ...(data.insight ?? {}),
        generating: data.generating ?? false,
        lastError:  data.lastError  ?? null,
      };
    } catch (error) {
      console.error('❌ Error fetching insight:', error);
      return null;
    }
  },

  // Dispara generación en background — retorna de inmediato ({ generating: true })
  // El caller debe hacer polling a getInsight() para saber cuándo terminó
  async generateInsight() {
    const { data } = await api.post('/pilot/insight/generate');
    return data;
  },

  // Para componentes simples (Dashboard, Reports, AIAnalysis, etc.)
  async getAll(brandId?: string, limit: number = 500) {
    try {
      const params: any = {};
      if (brandId) params.brandId = brandId;
      params.limit = limit;

      const { data } = await api.get('/pilot/mentions', { params });
      const mentions = data.mentions || data || [];

      if (mentions.length > 0) {
        const tvRadio = mentions.filter((m: any) => {
          const t = m.source?.type || '';
          return t === 'LIVE_STREAM' || t === 'RADIO_STREAM';
        });
        console.log(`✅ getAll: total=${mentions.length}, TV/Radio=${tvRadio.length}, brandId=${brandId || 'all'}`);
        if (mentions.length < 3) console.log('🔍 Sample:', mentions[0]);
      } else {
        console.warn(`⚠️ getAll: 0 menciones — brandId=${brandId || 'all'}, API success=${data?.success}, error=${data?.error || 'none'}`);
      }

      return mentions;
    } catch (error) {
      console.error('❌ getAll Error:', error);
      return [];
    }
  },
};