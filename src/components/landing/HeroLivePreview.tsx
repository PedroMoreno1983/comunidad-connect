'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarCheck,
  PackageCheck,
  Receipt,
  HeartHandshake,
  ShieldCheck,
  Smartphone,
  Check,
  Clock,
} from 'lucide-react';

const liveEvents = [
  {
    id: 1,
    role: 'Residente · Dpto 702',
    unitTag: '702',
    action: '¿Está libre el quincho el sábado en la tarde?',
    response: 'Sí, disponible 13:00 a 20:00. Reserva confirmada a nombre de Dpto 702 ✓',
    tag: 'Amenidades',
    tagIcon: CalendarCheck,
    tagColor: 'var(--cc-sage)',
  },
  {
    id: 2,
    role: 'Conserjería · Turno Tarde',
    unitTag: 'CON',
    action: 'Encomienda registrada para Dpto 405 (Chilexpress #3981)',
    response: 'Aviso enviado automáticamente por WhatsApp al residente ✓',
    tag: 'Paquetería',
    tagIcon: PackageCheck,
    tagColor: 'var(--cc-copper)',
  },
  {
    id: 3,
    role: 'Administración · Finanzas',
    unitTag: 'ADM',
    action: 'Conciliación bancaria mensual: 99.4% gastos comunes acreditados',
    response: 'Comprobantes emitidos y estado de cuenta actualizado ✓',
    tag: 'Gastos Comunes',
    tagIcon: Receipt,
    tagColor: '#38bdf8',
  },
  {
    id: 4,
    role: 'Comité · Fondo Solidario',
    unitTag: 'COM',
    action: 'Solicitud confidencial de subsidio comunitario aprobada',
    response: 'Subsidio abonado a la unidad protegiendo identidad del residente ✓',
    tag: 'Apoyo Mutuo',
    tagIcon: HeartHandshake,
    tagColor: '#ec4899',
  },
];

export function HeroLivePreview() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % liveEvents.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const event = liveEvents[activeIdx];
  const TagIcon = event.tagIcon;

  return (
    <div className="relative w-full max-w-lg lg:max-w-md xl:max-w-lg select-none">
      {/* Glow aura behind card */}
      <div
        className="absolute -inset-1 rounded-3xl opacity-50 blur-xl transition-all duration-700 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(224,134,76,0.25) 0%, rgba(142,168,112,0.15) 50%, transparent 80%)',
        }}
      />

      {/* Main Glassmorphic Panel */}
      <div
        className="relative overflow-hidden rounded-3xl border p-5 shadow-2xl backdrop-blur-xl sm:p-6"
        style={{
          background: 'rgba(23, 21, 18, 0.82)',
          borderColor: 'rgba(244, 239, 230, 0.12)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Header with building title and live status */}
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'rgba(244, 239, 230, 0.1)' }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl font-bold text-white shadow-sm border"
              style={{
                background: 'var(--cc-sage)',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                fontFamily: 'var(--cc-font-display)',
              }}
            >
              <span className="text-xl">C</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">CoCo · Edificio Conectado</span>
                <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-700/50">
                  En línea
                </span>
              </div>
              <div className="text-[11px] text-white/50">Canal oficial de la comunidad</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/70 border border-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>24/7</span>
          </div>
        </div>

        {/* Dynamic Activity Feed Area */}
        <div className="my-5 min-h-[175px] sm:min-h-[165px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.99 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="space-y-3"
            >
              {/* Event Tag Header */}
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold border"
                  style={{
                    color: event.tagColor,
                    borderColor: `${event.tagColor}40`,
                    background: `${event.tagColor}15`,
                  }}
                >
                  <TagIcon className="h-3.5 w-3.5" />
                  {event.tag}
                </span>
                <span className="text-[11px] text-white/40 flex items-center gap-1 font-mono">
                  <Clock className="h-3 w-3" /> Ahora
                </span>
              </div>

              {/* User message */}
              <div className="flex items-start gap-2.5">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[10.5px] font-bold text-amber-200/90"
                  style={{
                    background: 'rgba(244, 239, 230, 0.08)',
                    borderColor: 'rgba(244, 239, 230, 0.15)',
                    fontFamily: 'var(--cc-font-mono)',
                  }}
                >
                  {event.unitTag}
                </div>
                <div
                  className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-[13px] text-white/90 shadow-sm border"
                  style={{
                    background: 'rgba(244, 239, 230, 0.06)',
                    borderColor: 'rgba(244, 239, 230, 0.08)',
                  }}
                >
                  <div className="text-[10.5px] font-medium text-amber-200/70 mb-0.5">{event.role}</div>
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
                  <div className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-200 mb-0.5">
                    <Check className="h-3 w-3" /> CoCo
                  </div>
                  {event.response}
                </div>
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
                  style={{
                    background: 'var(--cc-sage)',
                    fontFamily: 'var(--cc-font-display)',
                  }}
                >
                  C
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
                  activeIdx === idx ? 'w-6 bg-[var(--cc-copper)]' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11.5px] text-white/60">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" /> Aprobación y trazabilidad total
            </span>
          </div>
        </div>
      </div>

      {/* Floating Micro Badge 1 (Top Left) */}
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-3.5 -left-3.5 hidden sm:flex items-center gap-2.5 rounded-2xl border px-3.5 py-2 shadow-xl backdrop-blur-md"
        style={{
          background: 'rgba(23, 21, 18, 0.9)',
          borderColor: 'rgba(224, 134, 76, 0.35)',
        }}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <Smartphone className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-[11.5px] font-semibold text-white">Vía WhatsApp</div>
          <div className="text-[10px] text-white/50">Cero apps que descargar</div>
        </div>
      </motion.div>

      {/* Floating Micro Badge 2 (Bottom Right) */}
      <motion.div
        animate={{ y: [0, 5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -bottom-3.5 -right-3.5 hidden sm:flex items-center gap-2.5 rounded-2xl border px-3.5 py-2 shadow-xl backdrop-blur-md"
        style={{
          background: 'rgba(23, 21, 18, 0.9)',
          borderColor: 'rgba(142, 168, 112, 0.35)',
        }}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <ShieldCheck className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-[11.5px] font-semibold text-white">Roles Seguros</div>
          <div className="text-[10px] text-white/50">Admin · Conserje · Vecino</div>
        </div>
      </motion.div>
    </div>
  );
}
