import api from './api';
import type { Mention, MentionStats } from '../types';

export const mentionService = {
  async getAll(params?: {
    brandId?: string;
    sourceId?: string;
    sentiment?: string;
  }): Promise<Mention[]> {
    const { data } = await api.get('/pilot/mentions', { params });
    return data.mentions || data;
  },

  async getStats(brandId?: string): Promise<MentionStats> {
    const { data } = await api.get('/pilot/stats', {
      params: { brandId },
    });
    return data.mentions || data;
  },

  async runScraper(): Promise<any> {
    const { data } = await api.post('/scraper/run');
    return data;
  },
};