// frontend/src/services/alertsService.ts

import api from './api';

export const alertsService = {
  async getAlerts(read?: boolean) {
    try {
      const params = read !== undefined ? { read: read.toString() } : {};
      const { data } = await api.get('/alerts', { params });
      return data;
    } catch (error) {
      console.error('Error fetching alerts:', error);
      return [];
    }
  },

  async getStats() {
    try {
      const { data } = await api.get('/alerts/stats');
      return data;
    } catch (error) {
      console.error('Error fetching alert stats:', error);
      return {
        total: 0,
        unread: 0,
        highPriority: 0,
        todayCount: 0,
        avgResponseTime: '0m'
      };
    }
  },

  async getRules() {
    try {
      const { data } = await api.get('/alerts/rules');
      return data;
    } catch (error) {
      console.error('Error fetching rules:', error);
      return [];
    }
  },

  async markAsRead(alertId: string) {
    try {
      const { data } = await api.put(`/alerts/${alertId}/read`);
      return data;
    } catch (error) {
      console.error('Error marking alert as read:', error);
      throw error;
    }
  },

  async markAllAsRead() {
    try {
      const { data } = await api.put('/alerts/read-all');
      return data;
    } catch (error) {
      console.error('Error marking all as read:', error);
      throw error;
    }
  },

  async dismissAlert(alertId: string) {
    try {
      const { data } = await api.put(`/alerts/${alertId}/dismiss`);
      return data;
    } catch (error) {
      console.error('Error dismissing alert:', error);
      throw error;
    }
  },

  async deleteAlert(alertId: string) {
    try {
      const { data } = await api.delete(`/alerts/${alertId}`);
      return data;
    } catch (error) {
      console.error('Error deleting alert:', error);
      throw error;
    }
  },

  async updateRule(ruleId: string, updates: any) {
    try {
      const { data } = await api.put(`/alerts/rules/${ruleId}`, updates);
      return data;
    } catch (error) {
      console.error('Error updating rule:', error);
      throw error;
    }
  },

  async toggleRule(ruleId: string) {
    try {
      const { data } = await api.put(`/alerts/rules/${ruleId}/toggle`);
      return data;
    } catch (error) {
      console.error('Error toggling rule:', error);
      throw error;
    }
  },

  async testEmail(email: string) {
    try {
      const { data } = await api.post('/alerts/test-email', { email });
      return data;
    } catch (error) {
      console.error('Error sending test email:', error);
      throw error;
    }
  }
};