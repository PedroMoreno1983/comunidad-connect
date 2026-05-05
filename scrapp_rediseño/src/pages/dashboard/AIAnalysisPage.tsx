// frontend/src/pages/dashboard/AIAnalysisPage.tsx
// Chat IA conversacional con llama3.2:3b via Ollama.
// Las respuestas se fundamentan en datos reales de la DB y llegan en streaming.

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pilotMentionsService } from '../../services/pilotMentionsService';
import { useFilterStore } from '../../store/useFilterStore';
import DashboardFilters from '../../components/DashboardFilters';
import {
  Send, Bot, User, Sparkles, MessageSquare,
  Loader2, TrendingUp, BarChart3, Trash2
} from 'lucide-react';
import '../../styles/ai-analysis.css';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

// ─── Sugerencias contextuales ─────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  '¿Cuál es el sentimiento general de las menciones?',
  '¿Cuáles son los keywords más mencionados esta semana?',
  '¿Qué fuentes generan más menciones?',
  '¿Cómo ha evolucionado el volumen de menciones por día?',
  '¿Qué marca tiene más menciones y por qué?',
  'Resume las menciones más recientes',
];

const GREETING: Message = {
  id: 'greeting',
  role: 'assistant',
  content: `¡Hola! Soy **DataWise**, tu asistente de análisis de medios. Estoy conectado a los datos reales de monitoreo — menciones, sentimientos, fuentes y tendencias.

Puedo responderte preguntas como:
- ¿Cómo está el sentimiento de las menciones?
- ¿Qué keywords dominan esta semana?
- ¿Qué fuentes son más activas?

¿En qué te puedo ayudar hoy?`,
  timestamp: new Date(),
};

// ─── Render simple de markdown ────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    nodes.push(
      <ul key={key} style={{ margin: '6px 0 6px 16px', padding: 0 }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ marginBottom: '3px' }}
            dangerouslySetInnerHTML={{ __html: inlineMd(item) }} />
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((line, idx) => {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      listBuffer.push(line.slice(2));
    } else {
      flushList(`list-${idx}`);
      if (line.startsWith('### ')) {
        nodes.push(<h4 key={idx} style={{ margin: '10px 0 4px', fontSize: '14px', fontWeight: 700 }}
          dangerouslySetInnerHTML={{ __html: inlineMd(line.slice(4)) }} />);
      } else if (line.startsWith('## ')) {
        nodes.push(<h3 key={idx} style={{ margin: '12px 0 6px', fontSize: '15px', fontWeight: 700 }}
          dangerouslySetInnerHTML={{ __html: inlineMd(line.slice(3)) }} />);
      } else if (line === '') {
        nodes.push(<br key={idx} />);
      } else {
        nodes.push(<p key={idx} style={{ margin: '2px 0', lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />);
      }
    }
  });
  flushList('list-end');
  return nodes;
}

function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,   '<em>$1</em>')
    .replace(/`(.+?)`/g,     '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');
}

// ─── Componente burbuja de mensaje ────────────────────────────────────────────
function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`chat-message ${message.role}`} style={{
      display: 'flex', gap: '12px', marginBottom: '20px',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
    }}>
      {/* Avatar */}
      <div style={{
        flexShrink: 0, width: '36px', height: '36px', borderRadius: '10px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser
          ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
          : 'linear-gradient(135deg, #1e293b, #334155)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#fff',
      }}>
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>

      {/* Burbuja */}
      <div style={{
        maxWidth: '75%',
        background: isUser
          ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))'
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isUser ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding: '12px 16px',
        fontSize: '14px',
        color: 'var(--text-primary)',
        lineHeight: 1.6,
      }}>
        {isUser
          ? <p style={{ margin: 0 }}>{message.content}</p>
          : renderMarkdown(message.content)
        }

        {/* Cursor parpadeante mientras hace streaming */}
        {message.streaming && (
          <span style={{
            display: 'inline-block', width: '8px', height: '14px',
            background: '#6366f1', marginLeft: '2px', verticalAlign: 'text-bottom',
            animation: 'blink 1s step-end infinite', borderRadius: '1px',
          }} />
        )}

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'right' }}>
          {message.timestamp.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AIAnalysisPage() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput]       = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  const { selectedBrandId } = useFilterStore();

  const { data: mentions } = useQuery({
    queryKey: ['mentions-ai', selectedBrandId],
    queryFn:  () => pilotMentionsService.getAll(selectedBrandId || undefined, 200),
  });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    setIsLoading(true);

    // Agregar mensaje del usuario
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Agregar placeholder del asistente con streaming=true
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    }]);

    try {
      const token   = localStorage.getItem('token');
      const API_URL = (import.meta.env.VITE_API_URL as string) || 'https://datawiseconsultoria.com/api';

      // Historial de conversación (excluye greeting estático)
      const history = messages
        .filter(m => m.id !== 'greeting')
        .map(m => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: userText });

      const response = await fetch(`${API_URL}/pilot/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages:  history,
          brandId:   selectedBrandId || undefined,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Error del servidor: ${response.status}`);
      }

      // Leer stream SSE
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

          // Solo capturar errores de JSON.parse, no ocultar errores de la IA
          let parsed: any;
          try {
            parsed = JSON.parse(line.slice(6));
          } catch {
            continue; // línea JSON incompleta, esperar más datos
          }

          if (parsed.error) throw new Error(parsed.error);
          if (parsed.content) {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: m.content + parsed.content }
                : m
            ));
          }
          if (parsed.done) { streamDone = true; break; }
        }

        if (streamDone) break;
      }

      // Quitar cursor de streaming
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));

    } catch (error: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Lo siento, hubo un error al conectar con la IA: ${error.message}`, streaming: false }
          : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, selectedBrandId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => setMessages([{ ...GREETING, timestamp: new Date() }]);

  // Stats rápidos del header
  const pos = mentions?.filter((m: any) => m.sentiment === 'POSITIVE').length ?? 0;
  const neg = mentions?.filter((m: any) => m.sentiment === 'NEGATIVE').length ?? 0;

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-content">
          <div className="page-icon" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="page-title">Análisis IA</h1>
            <p className="page-subtitle">
              Chat con <strong>llama3.2:3b</strong> · Datos reales · Streaming en tiempo real
            </p>
          </div>
        </div>
        <div className="page-stats">
          <div className="stat-card">
            <TrendingUp size={20} />
            <div>
              <div className="stat-value">{mentions?.length ?? 0}</div>
              <div className="stat-label">Menciones</div>
            </div>
          </div>
          <div className="stat-card">
            <BarChart3 size={20} />
            <div>
              <div className="stat-value" style={{ color: pos > neg ? '#22c55e' : '#f87171' }}>
                {pos > 0 ? `${((pos / (mentions?.length || 1)) * 100).toFixed(0)}%` : '—'}
              </div>
              <div className="stat-label">Positivo</div>
            </div>
          </div>
        </div>
      </div>

      <div className="filters-section">
        <DashboardFilters />
      </div>

      {/* ── Chat ── */}
      <div className="glass-card chat-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)', minHeight: '500px' }}>

        {/* Barra superior del chat */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: isLoading ? '#f59e0b' : '#22c55e',
              animation: isLoading ? 'pulse 1s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {isLoading ? 'DataWise está pensando...' : 'DataWise · llama3.2:3b · En línea'}
            </span>
          </div>
          <button
            onClick={clearChat}
            title="Limpiar conversación"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '12px', padding: '4px 8px', borderRadius: '6px',
              transition: 'color 0.2s',
            }}
          >
            <Trash2 size={14} /> Limpiar
          </button>
        </div>

        {/* Mensajes */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Sugerencias — solo al inicio */}
        {messages.length === 1 && !isLoading && (
          <div style={{ padding: '0 20px 12px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Preguntas sugeridas:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {SUGGESTED_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setInput(p)}
                  style={{
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                    borderRadius: '20px', padding: '6px 14px', fontSize: '12px',
                    color: '#a5b4fc', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    gap: '6px', transition: 'background 0.2s',
                  }}
                >
                  <MessageSquare size={12} />
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: '10px', alignItems: 'flex-end',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Pregunta sobre tus menciones, tendencias o marcas..."
            rows={1}
            style={{
              flex: 1, resize: 'none', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
              padding: '10px 14px', fontSize: '14px', color: 'var(--text-primary)',
              outline: 'none', lineHeight: 1.5, overflow: 'hidden',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            style={{
              flexShrink: 0, width: '42px', height: '42px', borderRadius: '12px',
              background: (!input.trim() || isLoading)
                ? 'rgba(99,102,241,0.3)'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', cursor: (!input.trim() || isLoading) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', transition: 'background 0.2s',
            }}
          >
            {isLoading
              ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              : <Send size={18} />
            }
          </button>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0 10px' }}>
          Enter para enviar · Shift+Enter para nueva línea · Respuestas basadas en datos reales
        </p>
      </div>

      {/* CSS para el cursor parpadeante */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
