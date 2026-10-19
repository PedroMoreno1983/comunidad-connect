/**
 * Puente con el plugin biométrico (@capgo/capacitor-native-biometric, gratuito,
 * MPL-2.0) y con el ciclo de vida de la app (@capacitor/app). Solo se cargan en
 * la app nativa: en web el plugin tiene una implementación de prueba que
 * siempre "verifica", así que aquí nunca se llama fuera de Capacitor.
 */
import { Capacitor } from '@capacitor/core';
import type { BiometricAvailability, BiometricKind, BiometricVerifyResult } from './types';

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): 'ios' | 'android' | 'web' {
  try {
    const platform = Capacitor.getPlatform();
    return platform === 'ios' || platform === 'android' ? platform : 'web';
  } catch {
    return 'web';
  }
}

async function plugin() {
  const mod = await import('@capgo/capacitor-native-biometric');
  return mod;
}

function kindOf(type: number, mod: Awaited<ReturnType<typeof plugin>>): BiometricKind {
  const { BiometryType } = mod;
  if (type === BiometryType.FACE_ID || type === BiometryType.FACE_AUTHENTICATION) return 'face';
  if (type === BiometryType.TOUCH_ID || type === BiometryType.FINGERPRINT) return 'fingerprint';
  if (type === BiometryType.IRIS_AUTHENTICATION) return 'iris';
  return 'biometric';
}

export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  if (!isNativeApp()) return { available: false, kind: 'biometric', reason: 'Disponible solo en la app del teléfono.' };
  try {
    const mod = await plugin();
    const result = await mod.NativeBiometric.isAvailable({ useFallback: false });
    if (result.isAvailable) return { available: true, kind: kindOf(result.biometryType, mod) };
    const notEnrolled = result.errorCode === mod.BiometricAuthError.BIOMETRICS_NOT_ENROLLED;
    return {
      available: false,
      kind: kindOf(result.biometryType, mod),
      reason: notEnrolled
        ? 'Activa Face ID o tu huella en los ajustes del teléfono para usar esta opción.'
        : 'Este teléfono no tiene Face ID ni huella disponibles.',
    };
  } catch {
    return { available: false, kind: 'biometric', reason: 'No pudimos revisar la biometría de este teléfono.' };
  }
}

export async function verifyBiometric(reason: string): Promise<BiometricVerifyResult> {
  if (!isNativeApp()) return { ok: false, reason: 'unavailable', message: 'Disponible solo en la app del teléfono.' };
  try {
    const mod = await plugin();
    await mod.NativeBiometric.verifyIdentity({
      reason,
      title: 'Convive Connect',
      subtitle: reason,
      negativeButtonText: 'Cancelar',
      useFallback: true,
      maxAttempts: 3,
    });
    return { ok: true };
  } catch (error) {
    const mod = await plugin().catch(() => null);
    const code = Number((error as { code?: unknown })?.code);
    if (mod) {
      const codes = mod.BiometricAuthError;
      if (code === codes.USER_LOCKOUT || code === codes.USER_TEMPORARY_LOCKOUT) {
        return { ok: false, reason: 'lockout', message: 'Hubo varios intentos. Espera un momento o desbloquea el teléfono y vuelve a intentarlo.' };
      }
      if (code === codes.BIOMETRICS_UNAVAILABLE || code === codes.BIOMETRICS_NOT_ENROLLED) {
        return { ok: false, reason: 'unavailable', message: 'Face ID o la huella no están disponibles en este teléfono.' };
      }
      if (code === codes.AUTHENTICATION_FAILED) {
        return { ok: false, reason: 'failed', message: 'No pudimos reconocerte. Vuelve a intentarlo.' };
      }
    }
    return { ok: false, reason: 'cancelled', message: 'Cuando quieras, vuelve a intentarlo.' };
  }
}

/**
 * Escucha pausa y regreso de la app. Usa @capacitor/app (`pause`/`resume`: en
 * iOS no se disparan con el aviso de Face ID) y devuelve cómo dejar de escuchar.
 */
export async function listenAppLifecycle(handlers: { onPause: () => void; onResume: () => void }): Promise<() => void> {
  if (!isNativeApp()) return () => undefined;
  const { App } = await import('@capacitor/app');
  const pause = await App.addListener('pause', handlers.onPause);
  const resume = await App.addListener('resume', handlers.onResume);
  return () => {
    void pause.remove();
    void resume.remove();
  };
}
