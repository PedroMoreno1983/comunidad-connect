// /var/www/datawiseconsultoria.com/app/frontend/src/components/ErrorBoundary.tsx

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🔴 ErrorBoundary caught:', error, errorInfo);
    
    // ✅ LOGGING ESPECÍFICO PARA ERRORES DE FECHA
    if (error.message.includes('Invalid time value')) {
      console.error('🗓️ Error de fecha detectado:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack
      });
    }
    
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{ padding: '40px', textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ color: '#ef4444' }}>⚠️ Error de visualización</h2>
          <p style={{ color: '#6b7280', marginBottom: '20px' }}>
            Ocurrió un error al mostrar este componente. Por favor, recarga la página.
          </p>
          
          {this.state.error?.message.includes('Invalid time value') && (
            <div style={{ 
              background: '#fef2f2', 
              border: '1px solid #fecaca',
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <p style={{ color: '#991b1b', fontWeight: 600 }}>
                Error de formato de fecha detectado
              </p>
              <p style={{ color: '#7f1d1d', fontSize: '14px' }}>
                Algunos datos tienen fechas inválidas. Contacta al equipo técnico.
              </p>
            </div>
          )}

          <details style={{ 
            marginTop: '20px', 
            textAlign: 'left', 
            background: '#f3f4f6',
            padding: '15px',
            borderRadius: '8px'
          }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: '10px' }}>
              Detalles técnicos
            </summary>
            <pre style={{ 
              background: '#1f2937', 
              color: '#e5e7eb',
              padding: '15px', 
              borderRadius: '6px',
              overflow: 'auto',
              fontSize: '12px',
              fontFamily: 'monospace'
            }}>
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.error?.stack}
              {'\n\n'}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>

          <div style={{ marginTop: '30px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button 
              onClick={this.handleReset}
              style={{
                padding: '12px 24px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Reintentar
            </button>
            <button 
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;