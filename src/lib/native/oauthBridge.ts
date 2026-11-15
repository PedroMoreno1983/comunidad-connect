/**
 * Entrar con Google desde la app nativa. Google bloquea su inicio de sesión
 * dentro de la vista web de una app, así que se abre en el navegador del
 * teléfono (@capacitor/browser) y Supabase vuelve a la app por un enlace
 * propio: com.conviveconnect.app://auth/callback?code=…
 *
 * La app recibe el enlace (@capacitor/app, `appUrlOpen`) y lleva la vista web
 * a /auth/callback con el mismo código. El verificador PKCE quedó en las
 * cookies de la vista web al pedir el inicio de sesión, así que el canje en
 * el servidor funciona igual que en la web.
 */
import { isNativeApp } from './biometricBridge';

export const NATIVE_OAUTH_CALLBACK = 'com.conviveconnect.app://auth/callback';

/** Ruta interna a la que llevar la vista web, o null si el enlace no es la vuelta de OAuth. */
export function webCallbackPathFor(url: string): string | null {
    if (!url.startsWith(NATIVE_OAUTH_CALLBACK)) return null;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    const params = new URLSearchParams();
    const code = parsed.searchParams.get('code');
    const next = parsed.searchParams.get('next');
    if (code) params.set('code', code);
    if (next) params.set('next', next);
    // Sin código (la persona canceló o Google falló): /auth/callback lleva a /login?oauth=error.
    return `/auth/callback${params.toString() ? `?${params.toString()}` : ''}`;
}

export async function openInSystemBrowser(url: string): Promise<void> {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
}

const HANDLED_KEY = 'convive.oauth.handled';

function wasHandled(url: string): boolean {
    try {
        return (JSON.parse(localStorage.getItem(HANDLED_KEY) ?? '[]') as string[]).includes(url);
    } catch {
        return false;
    }
}

function markHandled(url: string) {
    try {
        const list = JSON.parse(localStorage.getItem(HANDLED_KEY) ?? '[]') as string[];
        localStorage.setItem(HANDLED_KEY, JSON.stringify([url, ...list.filter(item => item !== url)].slice(0, 5)));
    } catch {
        // Sin almacenamiento no hay cómo recordarlo; el canje repetido falla y lleva a /login.
    }
}

/**
 * Escucha la vuelta desde el navegador (también si la app se abrió por el
 * enlace) y devuelve cómo dejar de escuchar.
 */
export async function listenNativeOAuthReturn(navigate: (path: string) => void): Promise<() => void> {
    if (!isNativeApp()) return () => undefined;
    const { App } = await import('@capacitor/app');
    const { Browser } = await import('@capacitor/browser');

    const handle = (url: string | undefined) => {
        const path = url ? webCallbackPathFor(url) : null;
        if (!path || !url) return;
        // En Android getLaunchUrl() no consume el intent: tras navegar, la vista
        // web se recarga y lo devolvería otra vez con el mismo código (de un uso).
        if (wasHandled(url)) return;
        markHandled(url);
        void Browser.close().catch(() => undefined);
        navigate(path);
    };

    const launch = await App.getLaunchUrl().catch(() => undefined);
    handle(launch?.url);
    const listener = await App.addListener('appUrlOpen', event => handle(event.url));
    return () => { void listener.remove(); };
}
