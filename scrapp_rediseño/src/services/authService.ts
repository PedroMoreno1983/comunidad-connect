import axios from 'axios';
import type { User, AuthResponse } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface BackendUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
  createdAt?: string;
  updatedAt?: string;
}

interface BackendAuthResponse {
  user: BackendUser;
  token: string;
  access_token?: string;
}

const mapBackendUser = (backendUser: BackendUser): User => {
  return {
    id: backendUser.id,
    email: backendUser.email,
    firstName: backendUser.firstName || '',
    lastName: backendUser.lastName || '',
    role: backendUser.role,
    createdAt: backendUser.createdAt || new Date().toISOString(),
    updatedAt: backendUser.updatedAt || new Date().toISOString(),
  };
};

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await axios.post<BackendAuthResponse>(`${API_URL}/auth/login`, {
      email,
      password,
    });

    const token = response.data.token || response.data.access_token || '';
    const user = mapBackendUser(response.data.user);

    return { user, token };
  },

  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ): Promise<AuthResponse> {
    const response = await axios.post<BackendAuthResponse>(`${API_URL}/auth/register`, {
      email,
      password,
      firstName,
      lastName,
    });

    const token = response.data.token || response.data.access_token || '';
    const user = mapBackendUser(response.data.user);

    return { user, token };
  },

  logout() {
    // Implementación de logout si es necesario
  },

  getToken(): string | null {
    return localStorage.getItem('token');
  },
};