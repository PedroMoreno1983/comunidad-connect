'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ShieldCheck, Sparkles, CheckCircle2, Package, Users, ArrowUpRight, Flame } from 'lucide-react';

const liveEvents = [
  {
    id: 1,
    role: 'Residente · Dpto 702',
    avatar: '👨‍💼',
    action: '¿Está disponible el quincho el sábado?',
    response: 'Sí, de 13:00 a 20:00. Reserva confirmada ✓',
    tag: 'Amenidades',
    tagColor: 'var(--cc-sage)',
  },
  {
    id: 2,
    role: 'Conserjería · Turno Día',
    avatar: '👮‍♂️',
    action: 'Encomienda entregada a Dpto 405 (Chilexpress)',
    response: 'Notificación enviada por WhatsApp al residente ✓',
    tag: 'Paquetería',
    tagColor: 'var(--cc-copper)',
  },
  {
    id: 3,
    role: 'Administración',
    avatar: '📊',
    action: 'Conciliación bancaria de gastos comunes (99.4%)',
    response: 'Comprobantes emitidos automáticamente ✓',
    tag: 'Finanzas',
    tagColor: '#38bdf8',
  },
  {
    id: 4,
    role: 'Comunidad · Fondo Solidario',
    avatar: '🤝',
    action: 'Solicitud de apoyo mutuo confidencial aprobada',
    response: 'Subsidio abonado sin exponer identidad ✓',
    tag: 'Apoyo Mutuo',
    tagColor: '#f472b6',
  },
];

export function HeroLivePreview() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % liveEvents.length);
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  const event = liveEvents[activeIdx];

  return (
    <div className="relative w-full max-w-lg lg:max-w-md xl:max-w-lg select-none">
      {/* Glow aura behind card */}
      <div
        className="absolute -inset-1 rounded-3xl opacity-50 blur-xl transition-all duration-700"
        style={{
          background: 'radial-gradient(circle, rgba(224,134,76,0.3) 0%, rgba(142,168,112,0.15) 50%, transparent 80%)',
        }}
      />

      {/* Main Glassmorphic Panel */}
      <div
        className="relative overflow-hidden rounded-3xl border p-5 shadow-2xl backdrop-blur-xl sm:p-6"
        style={{
          background: 'rgba(23, 21, 18, 0.78)',
          borderColor: 'rgba(244, 239, 230, 0.14)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Header with building title and live status */}
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'rgba(244, 239, 230, 0.1)' }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-inner"
              style={{ background: 'linear-gradient(135deg, var(--cc-copper) 0%, #B85F2C 100%)' }}
            >
              <Sparkles className="h-5 w-5 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">CoCo · Edificio Inteligente</span>
                <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-700/50">
                  En Vivo
                </span>
              </div>
              <div className="text-[11.5px] text-white/50">Simulación en tiempo real</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/70 border border-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>24/7 Activo</span>
          </div>
        </div>

        {/* Dynamic Activity Feed Area */}
        <div className="my-5 min-h-[170px] sm:min-h-[160px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="space-y-3"
            >
              {/* Event Tag */}
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border"
                  style={{
                    color: event.tagColor,
                    borderColor: `${event.tagColor}40`,
                    background: `${event.tagColor}15`,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: event.tagColor }} />
                  {event.tag}
                </span>
                <span className="text-[11px] text-white/40 font-mono">hace unos segundos</span>
              </div>

              {/* User message */}
              <div className="flex items-start gap-2.5">
                <span className="text-xl shrink-0">{event.avatar}</span>
                <div
                  className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[13px] text-white/90 shadow-sm border border-white/5"
                  style={{ background: 'rgba(255, 255, 255, 0.07)' }}
                >
                  <div className="text-[11px] font-medium text-amber-200/80 mb-0.5">{event.role}</div>
                  {event.action}
                </div>
              </div>

              {/* CoCo Response */}
              <div className="flex items-start gap-2.5 justify-end">
                <div
                  className="max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13px] text-white shadow-md border"
                  style={{
                    background: 'linear-gradient(135deg, rgba(95, 122, 70, 0.85) 0%, rgba(70, 95, 50, 0.9) 100%)',
                    borderColor: 'rgba(142, 168, 112, 0.4)',
                  }}
                >
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-200 mb-0.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> CoCo Asistente
                  </div>
                  {event.response}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress indicators & quick metrics */}
        <div className="border-t pt-3.5 flex items-center justify-between" style={{ borderColor: 'rgba(244, 239, 230, 0.1)' }}>
          <div className="flex items-center gap-1.5">
            {liveEvents.map((e, idx) => (
              <button
                key={e.id}
                onClick={() => setActiveIdx(idx)}
                aria-label={`Ver evento ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  activeIdx === idx ? 'w-6 bg-amber-400' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 text-[11.5px] text-white/60">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" /> 100% Trazable
            </span>
          </div>
        </div>
      </div>

      {/* Floating Micro Badge 1 (Top Left) */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-4 -left-4 hidden sm:flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-lg backdrop-blur-md"
        style={{
          background: 'rgba(23, 21, 18, 0.85)',
          borderColor: 'rgba(224, 134, 76, 0.4)',
        }}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
          <Flame className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-white">Cero planillas</div>
          <div className="text-[9.5px] text-white/60">100% WhatsApp + Web</div>
        </div>
      </motion.div>

      {/* Floating Micro Badge 2 (Bottom Right) */}
      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -bottom-4 -right-4 hidden sm:flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-lg backdrop-blur-md"
        style={{
          background: 'rgba(23, 21, 18, 0.85)',
          borderColor: 'rgba(142, 168, 112, 0.4)',
        }}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-white">Auto-piloto</div>
          <div className="text-[9.5px] text-white/60">Aprobación con 1 clic</div>
        </div>
      </motion.div>
    </div>
  );
}
