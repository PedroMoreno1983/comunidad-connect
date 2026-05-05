// frontend/src/services/clipService.ts

import api from './api';

export const clipService = {
  /**
   * Obtener todos los clips con filtros opcionales
   */
  async getAll(params?: {
    brandId?: string;
    sourceId?: string;
    limit?: number;
  }) {
    const { data } = await api.get('/clips', { params });  
    return data;
  },

  /**
   * Obtener clip por ID
   */
  async getById(id: string) {
    const { data } = await api.get(`/clips/${id}`);
    return data;
  },

  /**
   * Obtener clip por ID de mención
   */
  async getByMentionId(mentionId: string) {
    const { data } = await api.get(`/clips/mention/${mentionId}`);
    return data;
  },

  /**
   * Alias para compatibilidad con ClipPlayerModal
   */
  async getClipByMention(mentionId: string) {
    return this.getByMentionId(mentionId);
  },

  /**
   * 🆕 Obtener dominio base de la aplicación
   */
  _getBaseUrl(): string {
    // En producción: https://scrapp.bigcode.cl
    // En desarrollo: http://localhost:5173 (o el puerto que uses)
    
    // Opción 1: Usar window.location.origin
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    
    // Opción 2: Fallback desde variable de entorno
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    return apiUrl.replace('/api', '');
  },

  /**
   * 🔧 Obtener URL del video de un clip
   * Acepta: objeto clip, filename (clip_*.mp4), o ID del clip
   */
  getVideoUrl(clip: any): string {
    const baseUrl = this._getBaseUrl();
    
    // Caso 1: Es un objeto clip con videoPath
    if (clip && typeof clip === 'object') {
      if (clip.videoPath) {
        // videoPath = "clip_1761542276589_2s7hia653.mp4"
        return `${baseUrl}/storage/clips/${clip.videoPath}`;
      }
      // Si tiene id pero no videoPath, usar endpoint del API
      if (clip.id) {
        return `${baseUrl}/api/clips/${clip.id}/video`;
      }
    }
    
    // Caso 2: Es un string (filename o ID)
    if (typeof clip === 'string') {
      // Si contiene .mp4, es un filename
      if (clip.includes('.mp4')) {
        // Asegurarse de que no tenga path duplicado
        const filename = clip.replace(/^\/storage\/clips\//, '');
        return `${baseUrl}/storage/clips/${filename}`;
      }
      
      // Si parece un UUID (contiene guiones), usar endpoint del API
      if (clip.includes('-')) {
        return `${baseUrl}/api/clips/${clip}/video`;
      }
    }
    
    // Fallback
    console.warn('getVideoUrl: formato no reconocido', clip);
    return `${baseUrl}/storage/clips/error.mp4`;
  },

  /**
   * 🔧 Obtener URL del audio de un clip
   * Acepta: objeto clip, filename (clip_*.wav), o ID del clip
   */
  getAudioUrl(clip: any): string {
    const baseUrl = this._getBaseUrl();
    
    // Caso 1: Es un objeto clip con audioPath
    if (clip && typeof clip === 'object') {
      if (clip.audioPath) {
        return `${baseUrl}/storage/clips/${clip.audioPath}`;
      }
      // Si tiene id pero no audioPath, usar endpoint del API
      if (clip.id) {
        return `${baseUrl}/api/clips/${clip.id}/audio`;
      }
    }
    
    // Caso 2: Es un string (filename o ID)
    if (typeof clip === 'string') {
      // Si contiene .wav, es un filename
      if (clip.includes('.wav')) {
        // Asegurarse de que no tenga path duplicado
        const filename = clip.replace(/^\/storage\/clips\//, '');
        return `${baseUrl}/storage/clips/${filename}`;
      }
      
      // Si parece un UUID (contiene guiones), usar endpoint del API
      if (clip.includes('-')) {
        return `${baseUrl}/api/clips/${clip}/audio`;
      }
    }
    
    // Fallback
    console.warn('getAudioUrl: formato no reconocido', clip);
    return `${baseUrl}/storage/clips/error.wav`;
  },

  /**
   * Obtener clips recientes
   */
  async getRecent(limit: number = 10) {
    const { data } = await api.get('/clips/recent', { params: { limit } });
    return data;
  },

  /**
   * Buscar clips por transcripción
   */
  async search(query: string) {
    const { data } = await api.get('/clips/search', { params: { q: query } });
    return data;
  },

  /**
   * Obtener estadísticas de clips
   */
  async getStats() {
    const { data } = await api.get('/clips/stats');
    return data;
  },

  /**
   * Eliminar clip
   */
  async delete(id: string) {
    const { data } = await api.delete(`/clips/${id}`);
    return data;
  },
};