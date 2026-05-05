import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import toast from 'react-hot-toast';
import { Eye, EyeOff, LogIn } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    setLoading(true);

    try {
      console.log('🔐 Intentando login con:', email);

      const response = await authService.login(email, password);

      console.log('✅ Login exitoso:', response);

      toast.success('¡Bienvenido!');

      setTimeout(() => {
        navigate('/');
      }, 500);

    } catch (error: any) {
      console.error('❌ Error en login:', error);

      if (error.response?.status === 401) {
        toast.error('Credenciales incorrectas');
      } else if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Error al iniciar sesión. Verifica tu conexión.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-body)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            <LogIn className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Scrapp Monitor
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Inicia sesión para continuar
          </p>
        </div>

        <div
          className="rounded-2xl shadow-lg p-8"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="input-field w-full"
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field w-full pr-12"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  style={{ color: 'var(--text-muted)' }}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Iniciando sesión...
                </>
              ) : (
                <>
                  <LogIn className="h-5 w-5" />
                  Iniciar Sesión
                </>
              )}
            </button>
          </form>

          <div
            className="mt-6 p-4 rounded-lg"
            style={{ backgroundColor: 'var(--bg-body)' }}
          >
            <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
              Credenciales de prueba:
            </p>
            <div className="space-y-1 text-sm">
              <p style={{ color: 'var(--text-secondary)' }}>
                <strong>Email:</strong> admin@scrapp.cl
              </p>
              <p style={{ color: 'var(--text-secondary)' }}>
                <strong>Contraseña:</strong> Admin123
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            © 2025 Scrapp Monitor. Powered by Bigcode
          </p>
        </div>
      </div>
    </div>
  );
}
