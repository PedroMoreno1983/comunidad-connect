// frontend/src/services/socialMediaService.ts
import api from './api';

// ─── Types ────────────────────────────────────────────────────────────────────
export type SocialNetwork =
  | 'FACEBOOK'
  | 'TWITTER'
  | 'INSTAGRAM'
  | 'LINKEDIN'
  | 'YOUTUBE';

export interface SocialMentionResult {
  id: string;
  network: SocialNetwork;
  keyword: string;
  text: string;
  url: string;
  author: string;
  authorUrl?: string;
  publishedAt: string;
  sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  engagementScore?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  views?: number;
  thumbnailUrl?: string;
  sourceQuery: string;
}

export interface SearchSocialParams {
  keywords: string[];
  networks?: SocialNetwork[];
  brandId?: string;
  limit?: number;
  since?: string;
}

export interface SearchSocialResponse {
  ok: boolean;
  total: number;
  results: SocialMentionResult[];
  saved?: number;
}

export interface SocialStatsResponse {
  total: number;
  byNetwork: Record<string, number>;
  bySentiment: {
    POSITIVE: number;
    NEUTRAL: number;
    NEGATIVE: number;
  };
  latestMentions: Array<{
    keyword: string;
    sentiment: string | null;
    contextBefore: string | null;
    timestamp: string;
  }>;
}

export interface SocialNetworkInfo {
  key: SocialNetwork;
  label: string;
  strategy: string;
  requiresApiKey: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────
export const socialMediaService = {

  /**
   * Búsqueda manual (no persiste en BD).
   * Usar para vista previa en tiempo real.
   */
  async search(params: SearchSocialParams): Promise<SearchSocialResponse> {
    try {
      const { data } = await api.post<SearchSocialResponse>(
        '/social-media/search',
        params,
      );
      return data;
    } catch (err) {
      console.error('[socialMediaService] search error:', err);
      return { ok: false, total: 0, results: [] };
    }
  },

  /**
   * Búsqueda y persistencia en BD.
   * Requiere brandId para guardar correctamente.
   */
  async searchAndSave(params: SearchSocialParams): Promise<SearchSocialResponse> {
    try {
      const { data } = await api.post<SearchSocialResponse>(
        '/social-media/search-and-save',
        params,
      );
      return data;
    } catch (err) {
      console.error('[socialMediaService] searchAndSave error:', err);
      return { ok: false, total: 0, results: [], saved: 0 };
    }
  },

  /**
   * Búsqueda rápida via GET (para widgets o previsualizaciones rápidas).
   */
  async quickSearch(
    keywords: string[],
    networks?: SocialNetwork[],
    limit = 30,
  ): Promise<SearchSocialResponse> {
    try {
      const { data } = await api.get<SearchSocialResponse>(
        '/social-media/quick',
        {
          params: {
            keywords: keywords.join(','),
            networks: networks?.join(','),
            limit,
          },
        },
      );
      return data;
    } catch (err) {
      console.error('[socialMediaService] quickSearch error:', err);
      return { ok: false, total: 0, results: [] };
    }
  },

  /**
   * Estadísticas de menciones sociales guardadas.
   */
  async getStats(brandId?: string): Promise<SocialStatsResponse> {
    try {
      const { data } = await api.get<SocialStatsResponse>(
        '/social-media/stats',
        { params: brandId ? { brandId } : {} },
      );
      return data;
    } catch (err) {
      console.error('[socialMediaService] getStats error:', err);
      return {
        total: 0,
        byNetwork: {},
        bySentiment: { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 },
        latestMentions: [],
      };
    }
  },

  /**
   * Lista las redes soportadas y sus estrategias de extracción.
   */
  async getNetworks(): Promise<SocialNetworkInfo[]> {
    try {
      const { data } = await api.get<{ networks: SocialNetworkInfo[] }>(
        '/social-media/networks',
      );
      return data.networks;
    } catch {
      return [];
    }
  },
};
