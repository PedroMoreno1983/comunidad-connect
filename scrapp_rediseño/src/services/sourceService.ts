import api from './api';
import type { Source } from '../types';

export const sourceService = {
  async getAll(): Promise<Source[]> {
    const { data } = await api.get('/sources');
    return data;
  },

  async getOne(id: string): Promise<Source> {
    const { data } = await api.get(`/sources/${id}`);
    return data;
  },

  async create(source: {
    name: string;
    url: string;
    type: string;
    frequencyMins?: number;
    config?: any;
  }): Promise<Source> {
    const { data } = await api.post('/sources', source);
    return data;
  },

  async update(id: string, source: Partial<Source>): Promise<Source> {
    const { data } = await api.patch(`/sources/${id}`, source);
    return data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/sources/${id}`);
  },
};
