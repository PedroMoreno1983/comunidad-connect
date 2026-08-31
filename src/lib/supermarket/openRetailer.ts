'use client';

export function writeRetailerTabMessage(tab: Window | null, title: string, detail: string) {
  if (!tab || tab.closed) return;
  try {
    tab.document.open();
    tab.document.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:48px;color:#1c1917;background:#faf7f2">
  <p style="font-size:20px;font-weight:700;margin:0 0 8px">${escapeHtml(title)}</p>
  <p style="margin:0;color:#57534e">${escapeHtml(detail)}</p>
</body>
</html>`);
    tab.document.close();
  } catch {
    // about:blank a veces no deja escribir; la pestaña igual sirve para navegar.
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export async function openRetailerUrl(url: string, tab: Window | null): Promise<void> {
  const isNative = typeof window !== 'undefined' && window.location.protocol === 'capacitor:';
  if (isNative) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
    } catch {
      window.open(url, '_blank');
    }
    tab?.close();
    return;
  }

  if (tab && !tab.closed) {
    tab.location.assign(url);
    tab.focus();
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openBlankRetailerTab(store?: string): Window | null {
  if (typeof window === 'undefined') return null;
  if (window.location.protocol === 'capacitor:') return null;
  const tab = window.open('about:blank', '_blank');
  writeRetailerTabMessage(
    tab,
    store ? `Cargando el carro de ${store}…` : 'Cargando el carro…',
    'No cierres esta pestaña. En unos segundos se abre el checkout de la tienda.',
  );
  return tab;
}
