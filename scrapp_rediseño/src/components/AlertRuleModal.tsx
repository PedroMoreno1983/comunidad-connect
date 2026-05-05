// frontend/src/components/AlertRuleModal.tsx

import { useState, useEffect } from 'react';
import { X, Mail, Bell, Slack, Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query'; 
import { alertsService } from '../services/alertsService';
import toast from 'react-hot-toast';
import '../styles/alert-modal.css';

interface AlertRuleModalProps {
  rule: any;
  onClose: () => void;
}

export default function AlertRuleModal({ rule, onClose }: AlertRuleModalProps) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    priority: rule.priority,
    notifyEmail: rule.notifyEmail,
    notifyPush: rule.notifyPush,
    notifySlack: rule.notifySlack,
    emailRecipients: [] as string[],
    slackWebhook: rule.slackWebhook || ''
  });

  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    try {
      const emails = typeof rule.emailRecipients === 'string'
        ? JSON.parse(rule.emailRecipients)
        : rule.emailRecipients || [];
      setFormData(prev => ({ ...prev, emailRecipients: emails }));
    } catch (error) {
      console.error('Error parsing email recipients:', error);
    }
  }, [rule.emailRecipients]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => alertsService.updateRule(rule.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Regla actualizada correctamente');
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Error al actualizar regla');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const addEmail = () => {
    if (newEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      if (!formData.emailRecipients.includes(newEmail)) {
        setFormData(prev => ({
          ...prev,
          emailRecipients: [...prev.emailRecipients, newEmail]
        }));
        setNewEmail('');
      } else {
        toast.error('Este email ya está en la lista');
      }
    } else {
      toast.error('Email inválido');
    }
  };

  const removeEmail = (email: string) => {
    setFormData(prev => ({
      ...prev,
      emailRecipients: prev.emailRecipients.filter(e => e !== email)
    }));
  };

  const priorityColors = {
    LOW: { bg: '#dbeafe', color: '#1e40af', label: 'Baja' },
    MEDIUM: { bg: '#fef3c7', color: '#92400e', label: 'Media' },
    HIGH: { bg: '#fed7aa', color: '#9a3412', label: 'Alta' },
    URGENT: { bg: '#fecaca', color: '#991b1b', label: 'Urgente' }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Editar Regla de Alerta</h2>
          <button onClick={onClose} className="modal-close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Nombre */}
          <div className="form-group">
            <label className="form-label">Nombre de la regla</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {/* Descripción */}
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          {/* Estado */}
          <div className="form-group">
            <label className="form-checkbox-label">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              />
              <span>Regla activa</span>
            </label>
          </div>

          {/* Prioridad */}
          <div className="form-group">
            <label className="form-label">Prioridad</label>
            <div className="priority-buttons">
              {Object.entries(priorityColors).map(([key, { bg, color, label }]) => (
                <button
                  key={key}
                  type="button"
                  className={`priority-btn ${formData.priority === key ? 'active' : ''}`}
                  style={{
                    backgroundColor: formData.priority === key ? color : bg,
                    color: formData.priority === key ? '#fff' : color,
                    border: `2px solid ${color}`
                  }}
                  onClick={() => setFormData({ ...formData, priority: key })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Canales de Notificación */}
          <div className="form-group">
            <label className="form-label">Canales de notificación</label>
            
            <div className="notification-channels">
              {/* Email */}
              <div className="channel-item">
                <label className="channel-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.notifyEmail}
                    onChange={(e) => setFormData({ ...formData, notifyEmail: e.target.checked })}
                  />
                  <Mail size={18} />
                  <span>Email</span>
                </label>

                {formData.notifyEmail && (
                  <div className="channel-config">
                    <div className="email-input-group">
                      <input
                        type="email"
                        placeholder="nombre@ejemplo.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                        className="form-input-small"
                      />
                      <button
                        type="button"
                        onClick={addEmail}
                        className="btn-add-email"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    {formData.emailRecipients.length > 0 && (
                      <div className="email-tags">
                        {formData.emailRecipients.map((email) => (
                          <span key={email} className="email-tag">
                            {email}
                            <button
                              type="button"
                              onClick={() => removeEmail(email)}
                              className="email-tag-remove"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Push (En Sistema) */}
              <div className="channel-item">
                <label className="channel-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.notifyPush}
                    onChange={(e) => setFormData({ ...formData, notifyPush: e.target.checked })}
                  />
                  <Bell size={18} />
                  <span>Notificación en sistema</span>
                </label>
              </div>

              {/* Slack */}
              <div className="channel-item">
                <label className="channel-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.notifySlack}
                    onChange={(e) => setFormData({ ...formData, notifySlack: e.target.checked })}
                  />
                  <Slack size={18} />
                  <span>Slack</span>
                </label>

                {formData.notifySlack && (
                  <div className="channel-config">
                    <input
                      type="url"
                      placeholder="https://hooks.slack.com/services/..."
                      value={formData.slackWebhook}
                      onChange={(e) => setFormData({ ...formData, slackWebhook: e.target.value })}
                      className="form-input-small"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Información del tipo de regla */}
          <div className="rule-type-info">
            <h4>Tipo de regla: <strong>{getRuleTypeLabel(rule.ruleType)}</strong></h4>
            <p>{getRuleTypeDescription(rule.ruleType)}</p>
          </div>

          {/* Acciones */}
          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="btn-primary"
            >
              {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getRuleTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    BRAND_MENTION: 'Menciones de marca',
    NEGATIVE_SENTIMENT: 'Sentimiento negativo',
    COMPETITOR: 'Competencia',
    KEY_SPEAKER: 'Voceros clave',
    VOLUME_SPIKE: 'Pico de volumen'
  };
  return labels[type] || type;
}

function getRuleTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    BRAND_MENTION: 'Se activa cuando se detecta una mención de cualquier marca monitoreada en los medios.',
    NEGATIVE_SENTIMENT: 'Se activa cuando se detecta una mención con sentimiento negativo.',
    COMPETITOR: 'Se activa cuando se detecta una mención de competidores en el contexto.',
    KEY_SPEAKER: 'Se activa cuando se detectan voceros o figuras clave de la empresa.',
    VOLUME_SPIKE: 'Se activa cuando hay un aumento significativo en el volumen de menciones.'
  };
  return descriptions[type] || '';
}