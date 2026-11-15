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
    // Solo Android por ahora: en iOS el plugin entrega un token de APNs (no de FCM)
    // y falta la capacidad Push + el puente de Firebase Messaging en el proyecto Xcode.
    const platform = nativePlatform();
    if (platform !== 'android') return () => {};

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

    // Privado (0): en la pantalla bloqueada no se ve el contenido (montos, deudas).
    await PushNotifications.createChannel({
        id: 'avisos',
        name: 'Avisos del edificio',
        description: 'Pagos, reservas, encomiendas y comunicados',
        importance: 4,
        visibility: 0,
    }).catch(() => {});
    await PushNotifications.register();
    return stop;
}

/** Al cerrar sesión: el teléfono deja de recibir los avisos de esa cuenta. */
export async function forgetNativePushDevice(): Promise<void> {
    if (!isNativeApp()) return;
    const token = rememberedToken();
    if (token) await PushService.unregisterDevice(token).catch(() => {});
    // Además se anula el token en el propio teléfono: aunque el DELETE falle (sin
    // red), FCM lo rechaza desde ahora y el servidor borra la fila en el próximo envío.
    try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.unregister();
        rememberToken(null);
    } catch {
        // Si tampoco se pudo anular, se guarda el token para reintentar en el próximo cierre.
    }
}
