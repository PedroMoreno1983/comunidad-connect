import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Tag, 
  Globe, 
  MessageSquare, 
  Radio,
  FileText,
  Sparkles,
  Settings,
  LogOut,
  ChevronRight
} from 'lucide-react';
import './sidebar.css';

interface SidebarProps {
  onLogout?: () => void;
}

export default function Sidebar({ onLogout }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const location = useLocation();

  const menuItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/dashboard/brands', icon: Tag, label: 'Marcas' },
    { path: '/dashboard/sources', icon: Globe, label: 'Fuentes' },
    { path: '/dashboard/mentions', icon: MessageSquare, label: 'Menciones' },
    { path: '/dashboard/live', icon: Radio, label: 'Monitor en vivo' },
    { path: '/dashboard/reports', icon: FileText, label: 'Reportes' },
    { path: '/dashboard/ai-analysis', icon: Sparkles, label: 'Análisis IA' },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside 
      className={`sidebar ${isExpanded ? 'sidebar-expanded' : ''}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="sidebar-content">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-icon">
            <span className="logo-text">S</span>
          </div>
          {isExpanded && <span className="logo-label">SCRAPP</span>}
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-item ${active ? 'sidebar-item-active' : ''}`}
                title={!isExpanded ? item.label : undefined}
              >
                <Icon className="sidebar-icon" size={20} strokeWidth={2.5} />
                {isExpanded && <span className="sidebar-label">{item.label}</span>}
                {active && <div className="sidebar-indicator"></div>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="sidebar-bottom">
          <Link
            to="/dashboard/settings"
            className="sidebar-item"
            title={!isExpanded ? 'Configuración' : undefined}
          >
            <Settings className="sidebar-icon" size={20} strokeWidth={2.5} />
            {isExpanded && <span className="sidebar-label">Configuración</span>}
          </Link>

          {onLogout && (
            <button
              onClick={onLogout}
              className="sidebar-item sidebar-logout"
              title={!isExpanded ? 'Cerrar sesión' : undefined}
            >
              <LogOut className="sidebar-icon" size={20} strokeWidth={2.5} />
              {isExpanded && <span className="sidebar-label">Cerrar sesión</span>}
            </button>
          )}
        </div>

        {/* Expand Indicator */}
        <div className="sidebar-expand-indicator">
          <ChevronRight size={16} className={isExpanded ? 'rotate-180' : ''} />
        </div>
      </div>
    </aside>
  );
}