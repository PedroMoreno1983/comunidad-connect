/**
 * Notificaciones push en la app nativa (@capacitor/push-notifications, FCM).
 * Solo se carga dentro de Capacitor. El servidor envía; aquí se pide permiso,
 * se registra el token del teléfono y se abre la ruta del aviso al tocarlo.
 */
import { isNativeApp, nativePlatform } from './biometricBridge';
import { PushService } from '@/lib/api';
import { pushLinkFor } from '@/lib/push/links';

const TOKEN_KEY = 'convive.push.token';

function rememberToken(token: string | null) {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        // Sin almacenamiento: al cerrar sesión no se podrá desregistrar, el servidor
        // igual pasa el token a la próxima cuenta que entre en el teléfono.
    }
}

function rememberedToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

/**
 * Pide permiso (Android 13+ e iOS muestran el diálogo una vez), registra el
 * teléfono y escucha los toques. Devuelve una función para dejar de escuchar.
 */
export async function startNativePush(navigate: (path: string) => void): Promise<() => void> {
    if (!isNativeApp()) return () => {};
    const platform = nativePlatform();
    if (platform === 'web') return () => {};

    const { PushNotifications } = await import('@capacitor/push-notifications');

    const handles = await Promise.all([
        PushNotifications.addListener('registration', ({ value }) => {
            rememberToken(value);
            void PushService.registerDevice(value, platform).catch(() => {});
        }),
        PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
            const data = notification.data as { link?: unknown } | undefined;
            navigate(pushLinkFor(data?.link) ?? '/notifications');
        }),
    ]);
    const stop = () => { handles.forEach(handle => void handle.remove()); };

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
        permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') return stop;

    if (platform === 'android') {
        await PushNotifications.createChannel({
            id: 'avisos',
            name: 'Avisos del edificio',
            description: 'Pagos, reservas, encomiendas y comunicados',
            importance: 4,
            visibility: 1,
        }).catch(() => {});
    }
    await PushNotifications.register();
    return stop;
}

/** Al cerrar sesión: el teléfono deja de recibir los avisos de esa cuenta. */
export async function forgetNativePushDevice(): Promise<void> {
    const token = rememberedToken();
    if (!isNativeApp() || !token) return;
    await PushService.unregisterDevice(token).catch(() => {});
    rememberToken(null);
}
