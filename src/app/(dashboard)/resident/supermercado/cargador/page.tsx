import Link from 'next/link';
import { ArrowLeft, ExternalLink, Monitor, ShieldCheck, ShoppingCart } from 'lucide-react';
import { CART_LOADER_VERSION } from '@/lib/supermarket/cartLoader';

const SUPPORTED_STORES = [
  'Lider',
  'Jumbo',
  'Santa Isabel',
  'Unimarc',
  'Tottus',
  'aCuenta',
  'Irurzun',
];

export default function CargadorPage() {
  const installUrl = process.env.NEXT_PUBLIC_CART_LOADER_INSTALL_URL;
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const temporaryPackageUrl = isPreview
    ? '/downloads/convive-cart-loader-preview-pr53.zip'
    : '/downloads/convive-cart-loader.zip';

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/resident/supermercado"
        className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al supermercado
      </Link>

      <h1 className="mt-6 text-2xl font-bold cc-text-primary">Activa la carga automática</h1>
      <p className="mt-2 text-sm leading-6 cc-text-secondary">
        Se activa una sola vez en Chrome o Edge. Después, desde Convive pulsas
        <strong> Cargar lista nueva</strong>, confirmas el reemplazo y CoCo vacía el carro anterior
        antes de agregar y verificar esta compra. Tú continúas al pago.
      </p>

      <section
        className="mt-6 rounded-xl border p-5"
        style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper-warm)' }}
      >
        <div className="flex items-start gap-3">
          <Monitor className="mt-0.5 h-5 w-5 shrink-0 cc-text-primary" />
          <div>
            <p className="text-sm font-bold cc-text-primary">Cargador de Convive para computador</p>
            <p className="mt-1 text-xs leading-5 cc-text-secondary">
              Compatible con {SUPPORTED_STORES.join(', ')}. No tienes que copiar códigos,
              crear marcadores ni volver a completar la lista.
            </p>
          </div>
        </div>

        {installUrl ? (
          <a
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-bold text-white"
            style={{ background: 'var(--cc-ink)' }}
          >
            Activar cargador en Chrome o Edge <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <div
            role="status"
            className="mt-5 rounded-lg border px-4 py-3"
            style={{ borderColor: 'var(--cc-amber)', background: 'var(--cc-paper)' }}
          >
            <p className="text-sm font-semibold cc-text-primary">
              {isPreview ? 'Paquete temporal para probar este PR' : 'Actualización manual disponible'}
            </p>
            <p className="mt-1 text-xs leading-5 cc-text-secondary">
              Descarga y descomprime el ZIP. En <code>chrome://extensions</code>, activa
              “Modo desarrollador”, pulsa “Cargar extensión sin empaquetar” y elige la
              carpeta descomprimida.
              {isPreview
                ? ' Este paquete solo autoriza esta vista previa.'
                : ' La publicación en Chrome Web Store sigue pendiente; este es el paquete oficial temporal de Convive.'}
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 cc-text-primary">
              Si ya cargaste una versión anterior, elimínala o reemplaza su carpeta y pulsa
              “Recargar” en Chrome. Descargar el ZIP por sí solo no actualiza la extensión instalada.
            </p>
            <a
              href={temporaryPackageUrl}
              download
              className="mt-3 inline-flex items-center gap-2 text-xs font-bold underline cc-text-primary"
            >
              Descargar cargador {CART_LOADER_VERSION}
            </a>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold cc-text-primary">Así funciona</h2>
        <ol className="mt-3 space-y-3 text-sm cc-text-secondary">
          {[
            'Elige el supermercado y pulsa “Cargar lista nueva”.',
            'Confirma que quieres reemplazar el carro anterior de esa tienda.',
            'CoCo abre una sola pestaña, comprueba que el carro quedó en cero y agrega cada producto.',
            'Si la tienda pide login, ubicación o CAPTCHA, CoCo espera y luego continúa.',
            'Al terminar abre el carro oficial. Tú revisas, eliges entrega y pagas.',
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
            <p className="text-sm font-bold cc-text-primary">El pago siempre queda en tus manos</p>
            <p>
              El cargador solo actúa en los siete dominios autorizados. No lee contraseñas,
              tarjetas ni medios de pago, y nunca confirma una compra.
            </p>
            <p>
              Un producto solo se informa como agregado cuando la tienda muestra un cambio
              verificable en el carro. Los faltantes quedan identificados para revisión.
            </p>
          </div>
        </div>
      </section>

      <section
        className="mt-6 flex items-start gap-3 rounded-xl border p-5"
        style={{ borderColor: 'var(--cc-line)', background: 'var(--cc-paper)' }}
      >
        <ShoppingCart className="mt-0.5 h-5 w-5 shrink-0 cc-text-tertiary" />
        <p className="text-xs leading-5 cc-text-secondary">
          Este activador cubre Chrome y Edge en computador. Los navegadores móviles no admiten
          esta extensión; la cobertura móvil completa necesita el cargador nativo de la app.
        </p>
      </section>
    </main>
  );
}
