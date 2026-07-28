'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, MousePointer2, ShieldCheck } from 'lucide-react';

// El marcador solo inyecta el cargador desde nuestro dominio: así la lógica se
// actualiza sin que nadie tenga que volver a arrastrar nada.
const BOOKMARKLET = `javascript:(function(){var s=document.createElement('script');s.src='https://conviveconnect.com/coco-cargador.js?v='+Date.now();s.onerror=function(){alert('No se pudo cargar CoCo. Revisa tu conexion.')};document.body.appendChild(s);})();`;

export default function CargadorPage() {
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  // React bloquea href="javascript:..." en el JSX, así que se asigna por DOM.
  useEffect(() => {
    anchorRef.current?.setAttribute('href', BOOKMARKLET);
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/resident/supermercado"
        className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al supermercado
      </Link>

      <h1 className="mt-6 text-2xl font-bold cc-text-primary">Activar el cargador de CoCo</h1>
      <p className="mt-2 text-sm leading-6 cc-text-secondary">
        Una sola vez, y CoCo podrá llenar tu carro en el supermercado sin que
        busques producto por producto. No se descarga ningún archivo ni se
        instala ninguna extensión: solo arrastras un enlace a tu barra de
        marcadores.
      </p>

      <section
        className="mt-6 rounded-xl border p-5"
        style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}
      >
        <p className="text-xs font-bold uppercase tracking-wider cc-text-tertiary">Paso único</p>
        <p className="mt-2 text-sm cc-text-secondary">
          Arrastra este botón hasta la barra de marcadores de tu navegador
          (la fila bajo la barra de direcciones). Si no la ves, pulsa{' '}
          <kbd className="rounded border px-1 text-xs" style={{ borderColor: 'var(--cc-line)' }}>Ctrl</kbd>
          {' + '}
          <kbd className="rounded border px-1 text-xs" style={{ borderColor: 'var(--cc-line)' }}>Shift</kbd>
          {' + '}
          <kbd className="rounded border px-1 text-xs" style={{ borderColor: 'var(--cc-line)' }}>B</kbd>.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <a
            ref={anchorRef}
            draggable
            onClick={event => {
              event.preventDefault();
              window.alert(
                'No lo pulses aquí: arrástralo hasta tu barra de marcadores.\n\n'
                + 'Luego, ya dentro del supermercado y con tu sesión iniciada, '
                + 'pulsa ese marcador.',
              );
            }}
            className="cursor-grab rounded-lg px-5 py-3 text-sm font-bold text-white shadow-sm"
            style={{ background: 'var(--cc-ink)' }}
          >
            CoCo · Cargar carro
          </a>
          <MousePointer2 className="h-4 w-4 cc-text-tertiary" />
          <span className="text-xs cc-text-tertiary">Arrástralo, no lo pulses</span>
        </div>

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(BOOKMARKLET).then(() => setCopied(true)).catch(() => undefined);
          }}
          className="mt-4 inline-flex items-center gap-2 text-xs underline cc-text-tertiary"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiado' : '¿Prefieres crear el marcador a mano? Copia el enlace'}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold cc-text-primary">Cómo se usa después</h2>
        <ol className="mt-3 space-y-3 text-sm cc-text-secondary">
          {[
            'En Convive, pega tu lista y elige el supermercado más conveniente.',
            'Pulsa "Cargar carro": CoCo copia un código y abre la tienda en otra pestaña.',
            'Inicia sesión en el supermercado si aún no lo has hecho.',
            'Pulsa el marcador "CoCo · Cargar carro" y pega el código.',
            'CoCo agrega los productos. Tú revisas el carro, eliges la entrega y pagas.',
          ].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: 'var(--cc-paper-warm)', color: 'var(--cc-ink)' }}
              >
                {index + 1}
              </span>
              <span className="leading-6">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="mt-8 rounded-xl border p-5"
        style={{ borderColor: 'var(--cc-line)' }}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 cc-text-tertiary" />
          <div className="space-y-2 text-xs leading-5 cc-text-secondary">
            <p className="text-sm font-bold cc-text-primary">Qué hace y qué no hace</p>
            <p>
              El cargador solo se activa cuando <strong>tú</strong> pulsas el
              marcador, dentro de la pestaña del supermercado. Agrega productos
              y cantidades al carro, nada más.
            </p>
            <p>
              <strong>Nunca</strong> confirma la compra, paga, ni accede a tus
              contraseñas o medios de pago. Tampoco se ejecuta solo ni queda
              corriendo en segundo plano.
            </p>
            <p>
              El código que pegas solo contiene tu lista de compras, vence en 30
              minutos y no incluye datos personales ni de pago.
            </p>
          </div>
        </div>
      </section>

      <section
        className="mt-6 rounded-xl border p-5"
        style={{ borderColor: 'var(--cc-line)' }}
      >
        <p className="text-sm font-bold cc-text-primary">Diferencias por supermercado</p>
        <p className="mt-2 text-xs leading-5 cc-text-secondary">
          En <strong>Lider, Jumbo, Santa Isabel, Unimarc y Tottus</strong> CoCo
          carga todos los productos seguidos, en una sola pestaña.
        </p>
        <p className="mt-2 text-xs leading-5 cc-text-secondary">
          En <strong>aCuenta e Irurzun</strong>, sus sitios impiden el trabajo en
          segundo plano, así que CoCo avanza de a un producto y te pide un clic
          para continuar con el siguiente.
        </p>
        <p className="mt-2 text-xs leading-5 cc-text-secondary">
          Si el supermercado pide una verificación de seguridad (CAPTCHA) o que
          elijas despacho o comuna, CoCo se detiene y espera a que tú lo
          resuelvas. No intenta saltarse esas barreras.
        </p>
        <p className="mt-3 text-xs leading-5 cc-text-tertiary">
          Por ahora funciona en navegadores de computador (Chrome, Edge, Firefox,
          Safari). En el teléfono los navegadores no permiten marcadores de este
          tipo.
        </p>
      </section>
    </main>
  );
}
