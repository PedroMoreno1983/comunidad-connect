// src/components/ClipPlayerModal.tsx - AGREGAR MÁS DEBUG

import { useEffect, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface ClipPlayerModalProps {
  mentionId: string;
  onClose: () => void;
}

export default function ClipPlayerModal({ mentionId, onClose }: ClipPlayerModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadClip = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const token = localStorage.getItem('token');
        const API_URL = import.meta.env.VITE_API_URL || 'https://datawiseconsultoria.com/api';
        
        // URL correcta del clip
        const url = `${API_URL}/pilot/clips/mention/${mentionId}`;
        
        console.log('🎬 Loading clip for mentionId:', mentionId);
        console.log('🔗 URL:', url);
        console.log('🔑 Token:', token ? 'Present' : 'Missing');
        
        // Verificar que el clip existe
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        console.log('📡 Response status:', response.status);
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Response error:', errorText);
          throw new Error(`Clip no disponible (${response.status})`);
        }
        
        console.log('✅ Clip loaded successfully');
        setClipUrl(url);
        
      } catch (err: any) {
        console.error('❌ Error loading clip:', err);
        setError(err.message || 'Error al cargar el clip');
      } finally {
        setLoading(false);
      }
    };
    
    if (mentionId) {
      loadClip();
    }
  }, [mentionId]);

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-card, #1a1a24)',
          borderRadius: '16px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary, #ffffff)'
          }}>
            Reproducir Clip - ID: {mentionId}
          </h3>
          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--bg-secondary, #26263a)',
              color: 'var(--text-muted, #9ca3af)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-secondary, #26263a)';
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          {loading && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              color: 'var(--text-muted, #9ca3af)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(99, 102, 241, 0.2)',
                borderTopColor: 'var(--primary-color, #6366f1)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <p style={{ marginTop: '16px', fontSize: '14px' }}>Cargando clip...</p>
            </div>
          )}

          {error && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              color: '#ef4444'
            }}>
              <AlertCircle size={48} />
              <p style={{ marginTop: '16px', fontSize: '15px', textAlign: 'center' }}>{error}</p>
              <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Mention ID: {mentionId}
              </p>
              <button
                onClick={onClose}
                style={{
                  marginTop: '20px',
                  padding: '10px 24px',
                  background: 'var(--primary-color, #6366f1)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>
          )}

          {!loading && !error && clipUrl && (
            <video
              controls
              autoPlay
              style={{
                width: '100%',
                maxHeight: '500px',
                borderRadius: '8px',
                backgroundColor: '#000'
              }}
            >
              <source src={clipUrl} type="video/mp4" />
              Tu navegador no soporta video HTML5.
            </video>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}