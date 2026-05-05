// frontend/src/layouts/DashboardLayout.tsx

import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Tag,
  Globe,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Search,
  Settings,
  User,
  Moon,
  Sun,
  Heart,
  Radio,
  Bell,
  FileText,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useState, useEffect, useRef } from 'react';
import iconImg from '../img/icon.png';
import NotificationPanel from '../components/NotificationPanel';
import AICopilotWidget from '../components/AICopilotWidget';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Marcas', href: '/dashboard/brands', icon: Tag },
  { name: 'Fuentes', href: '/dashboard/sources', icon: Globe },
  { name: 'Menciones', href: '/dashboard/mentions', icon: MessageSquare },
  { name: 'Monitor en vivo', href: '/dashboard/live-transcripts', icon: Radio },
  { name: 'Alertas', href: '/dashboard/alerts', icon: Bell },
  { name: 'Reportes', href: '/dashboard/reports', icon: FileText },
];

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // ── Buscador global ──────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const openSearch = () => setSearchOpen(true);
  const closeSearch = () => { setSearchOpen(false); setSearchQuery(''); };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      navigate(`/dashboard/mentions?search=${encodeURIComponent(q)}`);
      closeSearch();
    }
  };

  useEffect(() => {
    if (searchOpen) {
      // pequeño delay para que el elemento sea visible antes del focus
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchOpen) closeSearch();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };


  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = () => setUserMenuOpen(false);
    if (userMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [userMenuOpen]);



  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-body)' }}>
      {/* Top Navigation Bar - Glassmorphism */}
      <header 
        className="sticky top-0 z-40 w-full transition-all duration-300 backdrop-blur-xl" 
        style={{ 
          backgroundColor: 'var(--bg-header)',
          borderBottom: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-[72px]">
            
            {/* Left: Logo & Nav */}
            <div className="flex items-center gap-8">
              {/* Logo */}
              <Link to="/dashboard" className="flex items-center gap-3 group">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/20 group-hover:scale-105 transition-transform">
                  <img src={iconImg} alt="Scrapp" className="h-6 w-6" style={{ filter: 'brightness(0) invert(1)' }} />
                </div>
                <span className="text-xl font-bold tracking-tight hidden sm:block" style={{ color: 'var(--text-primary)' }}>
                  Scrapp<span style={{ color: 'var(--primary)' }}>.</span>
                </span>
              </Link>
              
              {/* Desktop Nav */}
              <nav className="hidden lg:flex items-center space-x-1 p-1 rounded-full" style={{ background: 'var(--border-color)' }}>
                {navigation.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className="flex items-center px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200"
                      style={{
                        background: isActive ? 'rgba(79, 70, 229, 0.1)' : 'transparent',
                        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                      }}
                    >
                      <item.icon className="h-4 w-4 mr-2" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </div>
            
            {/* Right: Controls & User */}
            <div className="flex items-center gap-2 sm:gap-4">
              
              {/* Mobile Menu Button */}
              <button 
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Search */}
              <div className="hidden sm:block">
                {searchOpen ? (
                  <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 animate-fade-in">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar menciones..."
                      className="px-4 py-2 rounded-full border focus:outline-none w-64 text-sm backdrop-blur-sm"
                      style={{ 
                        background: 'var(--bg-body)', 
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <button type="submit" className="p-2 rounded-full transition-colors" style={{ background: 'var(--primary)', color: '#fff' }}>
                      <Search className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={closeSearch} className="p-2 rounded-full transition-colors" style={{ color: 'var(--text-muted)' }}>
                      <X className="h-4 w-4" />
                    </button>
                  </form>
                ) : (
                  <button onClick={openSearch} className="p-2 rounded-full transition-colors" style={{ color: 'var(--text-muted)' }} title="Buscar">
                    <Search className="h-5 w-5" />
                  </button>
                )}
              </div>

              <div className="h-6 w-px hidden sm:block" style={{ background: 'var(--border-color)' }}></div>

              {/* Theme & Notifications */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              
              <NotificationPanel />

              {/* User Dropdown */}
              <div className="relative ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserMenuOpen(!userMenuOpen);
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105 shadow-md border-2 border-white dark:border-gray-800"
                  style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)' }}
                >
                  <User className="h-5 w-5 text-white" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-3 w-56 rounded-2xl shadow-xl py-2 animate-fade-in" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                    <div className="px-4 py-3 mb-1" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {user?.firstName || 'Usuario'}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                    </div>
                    <Link
                      to="/dashboard/account"
                      className="flex items-center gap-2 px-4 py-2 text-sm transition-colors"
                      style={{ color: 'var(--text-secondary)' }}
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings className="h-4 w-4" />
                      Configuración
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm transition-colors"
                      style={{ color: 'var(--danger)' }}
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar Sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay (Only visible on < lg) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div 
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-slide-right">
            <div className="flex items-center justify-between h-[72px] px-6 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                Scrapp<span className="text-primary-600">.</span>
              </span>
              <button onClick={() => setSidebarOpen(false)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center px-4 py-3 text-sm font-semibold rounded-xl transition-all ${
                      isActive 
                        ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400'
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <item.icon className="h-5 w-5 mr-3" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content Area (Max Width Container) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-0 pb-8 animate-fade-in min-h-[calc(100vh-140px)]">
        <Outlet />
      </main>

      {/* Copiloto IA flotante */}
      <AICopilotWidget />

      {/* Footer */}
      <footer className="mt-auto border-t border-gray-200/50 dark:border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            Realizado con <Heart className="h-4 w-4 text-red-500 fill-current mx-1" /> por 
            <span className="font-semibold ml-1 text-gray-900 dark:text-white">Bigcode</span>
          </div>
          <div className="text-gray-400 dark:text-gray-500">
            © {new Date().getFullYear()} Scrapp Monitor
          </div>
        </div>
      </footer>
    </div>
  );
}