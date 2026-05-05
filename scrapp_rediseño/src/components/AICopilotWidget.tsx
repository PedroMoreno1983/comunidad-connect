// frontend/src/components/AICopilotWidget.tsx
// Widget flotante de Copiloto IA — accesible desde cualquier página del dashboard.
// Usa el mismo endpoint SSE /pilot/ai-chat que AIAnalysisPage pero en formato compacto.

import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFilterStore } from '../store/useFilterStore';
import {
  Bot, X, Send, Loader2, Maximize2, Trash2, MessageSquare, Sparkles,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

// Render inline markdown básico (negrita, itálica, código)
function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code style="background:rgba(255,255,255,0.12);padding:1px 5px;border-radius:4px;font-size:11px">$1</code>');
}

// Render líneas respetando listas y saltos
function renderText(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
          <span style={{ color: '#6366f1', flexShrink: 0 }}>•</span>
          <span dangerouslySetInnerHTML={{ __html: inlineMd(line.slice(2)) }} />
        </div>
      );
    }
    if (line === '') return <br key={i} />;
    return (
      <p key={i} style={{ margin: '2px 0', lineHeight: 1.5 }}
        dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />
    );
  });
}

const GREETING: Message = {
  id: 'greeting',
  role: 'assistant',
  content: '¡Hola! Soy **Scrapi**, tu asistente de medios con IA. Pregúntame sobre menciones, tendencias o marcas.',
};

const QUICK_PROMPTS = [
  '¿Cómo está el sentimiento hoy?',
  '¿Cuáles son las marcas con más menciones?',
  '¿Qué keywords dominan esta semana?',
];

// ─── Widget ───────────────────────────────────────────────────────────────────
export default function AICopilotWidget() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput]       = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [unread, setUnread]     = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const location       = useLocation();
  const { selectedBrandId } = useFilterStore();

  // No mostrar en AIAnalysisPage (chat ya está ahí)
  const isAIPage = location.pathname === '/dashboard/ai-analysis';

  // Auto-scroll al fondo
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
      setUnread(0);
    }
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const clearChat = () => setMessages([{ ...GREETING }]);

  const handleSend = useCallback(async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || isLoading) return;
    setInput('');
    setIsLoading(true);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true }]);

    try {
      const token   = localStorage.getItem('token');
      const API_URL = (import.meta.env.VITE_API_URL as string) || 'https://datawiseconsultoria.com/api';

      const history = messages
        .filter(m => m.id !== 'greeting')
        .map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: userText });

      const response = await fetch(`${API_URL}/pilot/ai-chat`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: history,
          brandId:  selectedBrandId || undefined,
        }),
      });

      if (!response.ok || !response.body) throw new Error(`Error ${response.status}`);

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let streamDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          // Parsear JSON — solo capturar SyntaxError, no otros errores
          let parsed: any;
          try {
            parsed = JSON.parse(line.slice(6));
          } catch {
            continue; // línea JSON incompleta, esperar más datos
          }

          // Manejar eventos FUERA del try/catch para que los errores propaguen
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.content) {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + parsed.content } : m
            ));
          }
          if (parsed.done) { streamDone = true; break; }
        }

        if (streamDone) break;
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));

      // Notificar si el widget está cerrado
      if (!open) setUnread(u => u + 1);

    } catch (error: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Error al conectar con la IA: ${error.message}`, streaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, selectedBrandId, open]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (isAIPage) return null;

  return (
    <>
      {/* ── Panel flotante ──────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: '88px',
            right: '24px',
            width: '360px',
            height: '520px',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1px solid rgba(99,102,241,0.3)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)',
            background: 'var(--bg-card)',
            animation: 'copilotSlideUp 0.2s ease-out',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={16} color="white" />
              </div>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Scrapi
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                  {isLoading ? (
                    <span style={{ color: '#f59e0b' }}>Pensando...</span>
                  ) : (
                    <span style={{ color: '#22c55e' }}>● En línea</span>
                  )}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Link
                to="/dashboard/ai-analysis"
                title="Abrir chat completo"
                style={{
                  padding: '6px', borderRadius: '6px', color: 'var(--text-muted)',
                  textDecoration: 'none', display: 'flex', alignItems: 'center',
                  transition: 'color 0.2s',
                }}
                onClick={() => setOpen(false)}
              >
                <Maximize2 size={14} />
              </Link>
              <button
                onClick={clearChat}
                title="Limpiar conversación"
                style={{
                  padding: '6px', borderRadius: '6px', color: 'var(--text-muted)',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Cerrar"
                style={{
                  padding: '6px', borderRadius: '6px', color: 'var(--text-muted)',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Mensajes */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  gap: '8px',
                  alignItems: 'flex-start',
                }}
              >
                {/* Avatar */}
                <div style={{
                  flexShrink: 0, width: '28px', height: '28px', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                    : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  {msg.role === 'user'
                    ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>Tú</span>
                    : <Bot size={14} color="#a5b4fc" />
                  }
                </div>
                {/* Burbuja */}
                <div style={{
                  maxWidth: '80%',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))'
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${msg.role === 'user' ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: msg.role === 'user' ? '12px 3px 12px 12px' : '3px 12px 12px 12px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  lineHeight: 1.5,
                }}>
                  {msg.role === 'user'
                    ? <p style={{ margin: 0 }}>{msg.content}</p>
                    : renderText(msg.content)
                  }
                  {msg.streaming && (
                    <span style={{
                      display: 'inline-block', width: '7px', height: '13px',
                      background: '#6366f1', marginLeft: '2px', verticalAlign: 'text-bottom',
                      animation: 'copilotBlink 1s step-end infinite', borderRadius: '1px',
                    }} />
                  )}
                </div>
              </div>
            ))}

            {/* Sugerencias — solo al inicio */}
            {messages.length === 1 && !isLoading && (
              <div style={{ marginTop: '4px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Preguntas rápidas:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {QUICK_PROMPTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(p)}
                      style={{
                        textAlign: 'left',
                        background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: '8px',
                        padding: '7px 12px',
                        fontSize: '12px',
                        color: '#a5b4fc',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'background 0.15s',
                      }}
                    >
                      <MessageSquare size={11} />
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', gap: '8px', alignItems: 'flex-end',
            flexShrink: 0,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={isLoading}
              placeholder="Pregunta sobre tus datos..."
              rows={1}
              style={{
                flex: 1, resize: 'none',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                outline: 'none',
                lineHeight: 1.4,
                maxHeight: '100px',
                overflow: 'auto',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              style={{
                flexShrink: 0, width: '36px', height: '36px', borderRadius: '10px',
                background: (!input.trim() || isLoading)
                  ? 'rgba(99,102,241,0.3)'
                  : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                cursor: (!input.trim() || isLoading) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', transition: 'background 0.2s',
              }}
            >
              {isLoading
                ? <Loader2 size={15} style={{ animation: 'copilotSpin 1s linear infinite' }} />
                : <Send size={15} />
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Botón flotante ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Cerrar Scrapi' : 'Abrir Scrapi — IA de Medios'}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: open
            ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
            : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          zIndex: 9999,
          boxShadow: '0 8px 24px rgba(99,102,241,0.5)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 32px rgba(99,102,241,0.65)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(99,102,241,0.5)';
        }}
      >
        {open ? <X size={22} /> : <Bot size={22} />}

        {/* Badge de mensajes no leídos */}
        {!open && unread > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            minWidth: '20px', height: '20px', borderRadius: '10px',
            background: '#ef4444', color: '#fff',
            fontSize: '11px', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
            border: '2px solid var(--bg-body)',
          }}>
            {unread}
          </span>
        )}
      </button>

      {/* ── Animaciones CSS ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes copilotSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes copilotBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes copilotSpin {
          from { transform: rotate(0deg);   }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
