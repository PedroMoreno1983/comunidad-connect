'use client';

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

export function openBlankRetailerTab(): Window | null {
  if (typeof window === 'undefined') return null;
  if (window.location.protocol === 'capacitor:') return null;
  return window.open('about:blank', '_blank');
}
