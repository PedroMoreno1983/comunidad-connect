// frontend/src/pages/dashboard/AlertsCenter.tsx

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alertsService } from '../../services/alertsService';
import { 
  AlertTriangle, 
  MoreVertical,
  Clock,
  Mail,
  Bell,
  Slack,
  Trash2,
  CheckCircle,
  Edit,
  Slash
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ClipPlayerModal from '../../components/ClipPlayerModal';
import AlertRuleModal from '../../components/AlertRuleModal';
import toast from 'react-hot-toast';
import PageHeader from '../../components/PageHeader';
import '../../styles/alerts.css';
import '../../styles/alert-modal.css';

type TabFilter = 'all' | 'unread' | 'read';

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: string;
  read: boolean;
  dismissed: boolean;
  createdAt: string;
  notifiedEmail: boolean;
  notifiedPush: boolean;
  notifiedSlack: boolean;
  rule: {
    id: string;
    name: string;
    type: string;
  };
  mention: {
    id: number;
    keyword: string;
    context: string;
    clipUrl: string | null;
    source: any;
  } | null;
}

interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  ruleType: string;
  priority: string;
  notifyEmail: boolean;
  notifyPush: boolean;
  notifySlack: boolean;
  emailRecipients: any;
  slackWebhook: string | null;
  keywords: any;
  sentiment: string | null;
  channels: any;
}

export default function AlertsCenter() {
  const [tabFilter, setTabFilter] = useState<TabFilter>('all');
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [selectedMentionId, setSelectedMentionId] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [showMenu, setShowMenu] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertsService.getAlerts(),
    refetchInterval: 30000,
  });

  const { data: stats = {} } = useQuery({
    queryKey: ['alert-stats'],
    queryFn: () => alertsService.getStats(),
    refetchInterval: 30000,
  });

  const { data: rules = [] } = useQuery<AlertRule[]>({
    queryKey: ['alert-rules'],
    queryFn: () => alertsService.getRules(),
  });

  const markAsReadMutation = useMutation({
    mutationFn: (alertId: string) => alertsService.markAsRead(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-stats'] });
    }
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => alertsService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-stats'] });
      toast.success('Todas las alertas marcadas como leídas');
    }
  });

  const dismissAlertMutation = useMutation({
    mutationFn: (alertId: string) => alertsService.dismissAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-stats'] });
      toast.success('Alerta descartada');
      setShowMenu(null);
    }
  });

  const deleteAlertMutation = useMutation({
    mutationFn: (alertId: string) => alertsService.deleteAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alert-stats'] });
      toast.success('Alerta eliminada');
      setShowMenu(null);
    }
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (ruleId: string) => alertsService.toggleRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
      toast.success('Regla actualizada');
    }
  });

  const filteredAlerts = useMemo(() => {
    let filtered = [...alerts];

    if (tabFilter === 'unread') {
      filtered = filtered.filter((a: Alert) => !a.read && !a.dismissed);
    } else if (tabFilter === 'read') {
      filtered = filtered.filter((a: Alert) => a.read);
    }

    // No mostrar alertas descartadas en ninguna vista
    filtered = filtered.filter((a: Alert) => !a.dismissed);

    return filtered.sort((a: Alert, b: Alert) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [alerts, tabFilter]);

  const formatTimeAgo = (date: any) => {
    try {
      const now = new Date();
      const past = new Date(date);
      const diffMs = now.getTime() - past.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Hace un momento';
      if (diffMins === 1) return 'Hace 1 min';
      if (diffMins < 60) return `Hace ${diffMins} min`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return 'Hace 1 hora';
      if (diffHours < 24) return `Hace ${diffHours} horas`;
      
      return format(past, "d 'de' MMM", { locale: es });
    } catch {
      return 'Ayer';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return { Icon: AlertTriangle, color: '#ef4444' };
      case 'ERROR': return { Icon: AlertTriangle, color: '#f97316' };
      case 'WARNING': return { Icon: AlertTriangle, color: '#eab308' };
      default: return { Icon: Bell, color: '#6366f1' };
    }
  };

  const handleAlertClick = (alert: Alert) => {
    setSelectedAlert(alert);
    if (!alert.read) {
      markAsReadMutation.mutate(alert.id);
    }
  };

  const handleMarkAllAsRead = () => {
    if (window.confirm('¿Marcar todas las alertas como leídas?')) {
      markAllAsReadMutation.mutate();
    }
  };

  const handleViewClip = (mentionId: number) => {
    setSelectedMentionId(mentionId.toString());
  };

  const handleDismissAlert = (alertId: string) => {
    dismissAlertMutation.mutate(alertId);
  };

  const handleDeleteAlert = (alertId: string) => {
    if (window.confirm('¿Eliminar esta alerta permanentemente?')) {
      deleteAlertMutation.mutate(alertId);
    }
  };

  const handleToggleRule = (ruleId: string) => {
    toggleRuleMutation.mutate(ruleId);
  };

  const handleEditRule = (rule: AlertRule) => {
    setEditingRule(rule);
  };

  if (isLoading) {
    return (
      <div className="alerts-page">
        <div className="alerts-loading">
          <div className="spinner-large"></div>
          <p>Cargando centro de alertas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-page">
      <PageHeader
        icon={<Bell size={24} />}
        title="Centro de Alertas"
        subtitle="Gestiona notificaciones y reglas de alerta personalizadas"
        badge={stats.unread > 0 ? `${stats.unread} nuevas` : undefined}
        badgeColor="red"
      />

      {/* Two Column Layout */}
      <div className="alerts-layout">
        {/* Left Column - Notificaciones */}
        <div className="alerts-feed-column">
          <div className="alerts-feed-header">
            <h2 className="alerts-feed-title">Notificaciones</h2>
            <div className="alerts-tabs">
              <button
                className={`alert-tab ${tabFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTabFilter('all')}
              >
                Todas ({alerts.filter((a: Alert) => !a.dismissed).length})
              </button>
              <button
                className={`alert-tab ${tabFilter === 'unread' ? 'active' : ''}`}
                onClick={() => setTabFilter('unread')}
              >
                Sin leer ({stats.unread})
              </button>
              <button
                className="alert-tab-action"
                onClick={handleMarkAllAsRead}
                disabled={stats.unread === 0}
              >
                <CheckCircle size={14} />
                Marcar todas como leídas
              </button>
            </div>
          </div>

          <div className="alerts-feed-list">
            {filteredAlerts.length === 0 ? (
              <div className="alerts-empty">
                <Bell size={48} />
                <h3>No hay alertas</h3>
                <p>Las notificaciones aparecerán aquí cuando se cumplan tus reglas</p>
              </div>
            ) : (
              filteredAlerts.map((alert: Alert) => {
                const { Icon, color } = getSeverityIcon(alert.severity);
                const isActive = selectedAlert?.id === alert.id;

                return (
                  <div
                    key={alert.id}
                    className={`alert-item ${!alert.read ? 'unread' : ''} ${isActive ? 'active' : ''}`}
                    onClick={() => handleAlertClick(alert)}
                  >
                    <div className="alert-item-icon" style={{ color }}>
                      <Icon size={20} />
                    </div>

                    <div className="alert-item-content">
                      <div className="alert-item-header">
                        <h3 className="alert-item-title">
                          {alert.title}
                          {!alert.read && <span className="unread-dot"></span>}
                        </h3>
                        <div className="alert-item-actions">
                          <button
                            className="alert-menu-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowMenu(showMenu === alert.id ? null : alert.id);
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>

                          {showMenu === alert.id && (
                            <div className="alert-dropdown-menu">
                              {!alert.read && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsReadMutation.mutate(alert.id);
                                    setShowMenu(null);
                                  }}
                                >
                                  <CheckCircle size={14} />
                                  Marcar como leída
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDismissAlert(alert.id);
                                }}
                              >
                                <Slash size={14} />
                                Descartar
                              </button>
                              <button
                                className="danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAlert(alert.id);
                                }}
                              >
                                <Trash2 size={14} />
                                Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <p className="alert-item-message">{alert.message}</p>

                      {/* Notification Badges */}
                      <div className="alert-notification-badges">
                        {alert.notifiedEmail && (
                          <span className="notification-badge email" title="Notificado por email">
                            <Mail size={10} />
                          </span>
                        )}
                        {alert.notifiedPush && (
                          <span className="notification-badge push" title="Notificación en sistema">
                            <Bell size={10} />
                          </span>
                        )}
                        {alert.notifiedSlack && (
                          <span className="notification-badge slack" title="Notificado en Slack">
                            <Slack size={10} />
                          </span>
                        )}
                      </div>

                      <div className="alert-item-footer">
                        <span className="alert-item-time">
                          <Clock size={12} />
                          {formatTimeAgo(alert.createdAt)}
                        </span>

                        {alert.mention?.clipUrl && (
                            <button
                              className="btn-view-clip"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (alert.mention) {
                                  handleViewClip(alert.mention.id);
                                }
                              }}
                            >
                              ▶️ Ver clip
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column - Reglas de Alerta */}
        <div className="alerts-sidebar-column">
          <div className="alerts-sidebar-section">
            <div className="alerts-sidebar-header">
              <h3 className="alerts-sidebar-title">Reglas de Alerta</h3>
            </div>

            <div className="alert-rules-list">
              {rules.map((rule: AlertRule) => (
                <div key={rule.id} className={`alert-rule-item ${!rule.enabled ? 'disabled' : ''}`}>
                  <div className="alert-rule-header">
                    <h4 className="alert-rule-name">{rule.name}</h4>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => handleToggleRule(rule.id)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <p className="alert-rule-description">{rule.description}</p>

                  <div className="alert-rule-footer">
                    <div className="alert-rule-channels">
                      {rule.notifyEmail && (
                        <span className="channel-badge email" title="Email">
                          <Mail size={12} />
                        </span>
                      )}
                      {rule.notifyPush && (
                        <span className="channel-badge push" title="En sistema">
                          <Bell size={12} />
                        </span>
                      )}
                      {rule.notifySlack && (
                        <span className="channel-badge slack" title="Slack">
                          <Slack size={12} />
                        </span>
                      )}
                    </div>

                    <button
                      className="btn-edit-rule"
                      onClick={() => handleEditRule(rule)}
                    >
                      <Edit size={14} />
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen de Alertas */}
          <div className="alerts-sidebar-section summary-section">
            <h3 className="alerts-sidebar-title">Resumen de Alertas</h3>
            
            <div className="summary-stats">
              <div className="summary-stat-item">
                <span className="summary-stat-label">Alertas hoy</span>
                <span className="summary-stat-value">{stats.todayCount || 0}</span>
              </div>

              <div className="summary-stat-item">
                <span className="summary-stat-label">Alta prioridad</span>
                <span className="summary-stat-value danger">{stats.highPriority || 0}</span>
              </div>

              <div className="summary-stat-item">
                <span className="summary-stat-label">Pendientes</span>
                <span className="summary-stat-value warning">{stats.unread || 0}</span>
              </div>

              <div className="summary-stat-item">
                <span className="summary-stat-label">Tiempo resp. prom.</span>
                <span className="summary-stat-value">{stats.avgResponseTime || '0m'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal para ver clip */}
      {selectedMentionId && (
        <ClipPlayerModal 
          mentionId={selectedMentionId} 
          onClose={() => setSelectedMentionId(null)} 
        />
      )}

      {/* Modal para editar regla */}
      {editingRule && (
        <AlertRuleModal
          rule={editingRule}
          onClose={() => setEditingRule(null)}
        />
      )}
    </div>
  );
}

