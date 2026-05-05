// frontend/src/services/analyticsService.ts
import api from './api';

export interface TimeSeriesData {
  timestamp: string;
  count: number;
  positive: number;
  neutral: number;
  negative: number;
}

export interface SentimentDistribution {
  sentiment: string;
  count: number;
}

export interface TopSource {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  count: number;
}

export interface OverallStats {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  positivePercentage: number;
  negativePercentage: number;
  neutralPercentage: number;
}

export const analyticsService = {
  async getMentionsByDay(brandId?: string): Promise<TimeSeriesData[]> {
    const { data } = await api.get('/analytics/mentions-by-day', {
      params: { brandId },
    });
    return data;
  },

  async getMentionsByHour(brandId?: string): Promise<TimeSeriesData[]> {
    const { data } = await api.get('/analytics/mentions-by-hour', {
      params: { brandId },
    });
    return data;
  },

  async getMentionsByRange(
    startDate: string,
    endDate: string,
    granularity: 'day' | 'hour' = 'day',
    brandId?: string,
  ): Promise<TimeSeriesData[]> {
    const { data } = await api.get('/analytics/mentions-by-range', {
      params: { startDate, endDate, granularity, brandId },
    });
    return data;
  },

  async getSentimentDistribution(
    days: number = 7,
    brandId?: string,
  ): Promise<SentimentDistribution[]> {
    const { data } = await api.get('/analytics/sentiment-distribution', {
      params: { days, brandId },
    });
    return data;
  },

  async getTopSources(
    limit: number = 5,
    brandId?: string,
  ): Promise<TopSource[]> {
    const { data } = await api.get('/analytics/top-sources', {
      params: { limit, brandId },
    });
    return data;
  },

  async getOverallStats(brandId?: string): Promise<OverallStats> {
    const { data } = await api.get('/analytics/overall-stats', {
      params: { brandId },
    });
    return data;
  },
};