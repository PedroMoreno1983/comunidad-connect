// frontend/src/services/brandService.ts
import api from './api';

export interface Brand {
  id: string;
  name: string;
  keywords: string[];
  excludeKeywords: string[];
  isActive: boolean;
  ownerId?: string | null;
  owner?: {
    id: string;
    email: string;
    name: string | null;
  };
  _count?: {
    mentions: number;
  };
  createdAt: string;
  updatedAt: string;
}

export const brandService = {
  async getAll(): Promise<Brand[]> {
    const { data } = await api.get('/brands');
    return data;
  },

  async getById(id: string): Promise<Brand> {
    const { data } = await api.get(`/brands/${id}`);
    return data;
  },

  async create(data: {
    name: string;
    keywords: string[];
    ownerId?: string;
    isActive?: boolean;
  }): Promise<Brand> {
    const { data: result } = await api.post('/brands', data);
    return result;
  },

  async update(
    id: string,
    data: {
      name?: string;
      keywords?: string[];
      ownerId?: string;
      isActive?: boolean;
    },
  ): Promise<Brand> {
    const { data: result } = await api.put(`/brands/${id}`, data);
    return result;
  },

  async assignOwner(brandId: string, userId: string | null): Promise<Brand> {
    const { data } = await api.put(`/brands/${brandId}/assign-owner`, {
      userId,
    });
    return data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/brands/${id}`);
  },
};