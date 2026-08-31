'use client';

import { AlertCircle, CheckCircle2, Loader2, Puzzle, ShoppingCart } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useSupermarketShoppingAssistant } from '@/hooks/useSupermarketShoppingAssistant';
import type { ShoppingAssistantButtonProps } from '@/lib/types';

export function ShoppingAssistantButton({ basket }: ShoppingAssistantButtonProps) {
  const { toast } = useToast();
  const assistant = useSupermarketShoppingAssistant(basket);
  const progress = assistant.progress;
  const running = progress?.status === 'opening' || progress?.status === 'loading';
  const done = progress?.status === 'completed' || progress?.status === 'completed_with_issues';
  const paused = progress?.status === 'paused';

  const load = () => {
    if (assistant.availability === 'checking') {
      toast({ title: 'Conectando el asistente', description: 'Espera un instante y vuelve a intentarlo.' });
      return;
    }
    if (assistant.availability !== 'ready') {
      toast({
        title: assistant.availability === 'outdated' ? 'Actualiza el Asistente de Compras' : 'Falta el Asistente de Compras',
        description: 'La carga automática necesita la extensión oficial de Convive instalada en este navegador.',
      });
      return;
    }
    const replaceCart = window.confirm(
      `¿Vaciar el carro de ${basket.store} y cargar solamente esta lista?\n\n`
      + 'Cancelar no modifica el carro existente.',
    );
    if (!replaceCart) return;
    assistant.start({ replaceCart: true });
  };

  return (
    <div className="min-w-[260px] space-y-2">
      <button
        type="button"
        onClick={load}
        disabled={running || basket.items.length === 0}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: 'var(--cc-ink)' }}
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
        {running ? `Cargando en ${basket.store}…` : `Cargar compra en ${basket.store}`}
      </button>

      {assistant.availability === 'unavailable' && (
        <p className="flex items-start gap-1.5 text-[11px] leading-4 cc-text-secondary">
          <Puzzle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Instala una vez el Asistente oficial del navegador. No descargues el cargador ZIP anterior.
        </p>
      )}
      {assistant.availability === 'outdated' && (
        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-amber-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          La versión instalada no puede verificar correctamente el carro.
        </p>
      )}
      {progress && (
        <p className={`flex items-start gap-1.5 text-[11px] leading-4 ${
          done
            ? 'text-emerald-700'
            : progress.status === 'failed'
              ? 'text-rose-700'
              : paused
                ? 'text-amber-700'
                : 'cc-text-secondary'
        }`}>
          {done
            ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            : progress.status === 'failed' || paused
              ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              : <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />}
          {progress.detail} ({progress.added}/{progress.total} cargados)
        </p>
      )}
      <p className="text-[10px] leading-4 cc-text-tertiary">
        CoCo prepara el carro; tú revisas disponibilidad, eliges despacho y pagas en la tienda.
      </p>
      {assistant.installedVersion && (
        <p className="text-[10px] cc-text-tertiary">Asistente v{assistant.installedVersion}</p>
      )}
    </div>
  );
}
