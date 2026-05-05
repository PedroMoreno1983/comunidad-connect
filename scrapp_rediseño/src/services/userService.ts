import api from './api';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  brands?: Array<{
    id: string;
    name: string;
  }>;
}

export const userService = {
  async getAll(): Promise<User[]> {
    const { data } = await api.get('/users');
    return data;
  },
};
