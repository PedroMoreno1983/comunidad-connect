import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://www.datawiseconsultoria.com/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - agregar token a todas las peticiones
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('🔑 Token attached to request');
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.log('❌ Unauthorized - clearing token');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const baseUrl = import.meta.env.BASE_URL || '/';
      window.location.href = baseUrl + 'login';
    }
    return Promise.reject(error);
  }
);

export default api;