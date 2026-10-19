/**
 * Bloqueo con Face ID o huella de la app nativa. Módulo puro: la política de
 * cuándo bloquear y dónde se guarda el ajuste. El puente con el plugin está en
 * `biometricBridge.ts` y la interfaz en `components/native/`.
 *
 * - El ajuste es opcional, por persona y dispositivo (localStorage). En web no
 *   existe: la app web nunca bloquea.
 * - Bloquea al abrir la app y al volver del fondo tras `LOCK_AFTER_BACKGROUND_MS`.
 * - El propio aviso biométrico saca la app de primer plano (en Android abre otra
 *   actividad), así que durante la verificación y un instante después se
 *   ignoran la pausa y el regreso: si no, el aviso se volvería a pedir en bucle.
 */
import type { BiometricLockState } from './types';

/** Fuera de la app menos que esto (p. ej. al elegir una foto) no vuelve a pedir biometría. */
export const LOCK_AFTER_BACKGROUND_MS = 10_000;
/** Ventana tras verificar en la que se ignoran pausa y regreso. */
export const POST_VERIFY_SUPPRESS_MS = 3_000;

const STORAGE_PREFIX = 'cc:biometric-lock:';

export function biometricLockStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function isBiometricLockEnabled(userId: string, store: StorageLike | null = storage()): boolean {
  if (!userId || !store) return false;
  try {
    return store.getItem(biometricLockStorageKey(userId)) === 'on';
  } catch {
    return false;
  }
}

export function setBiometricLockEnabled(userId: string, enabled: boolean, store: StorageLike | null = storage()): void {
  if (!userId || !store) return;
  try {
    if (enabled) store.setItem(biometricLockStorageKey(userId), 'on');
    else store.removeItem(biometricLockStorageKey(userId));
  } catch {
    // Sin almacenamiento el ajuste no persiste; la app sigue funcionando sin bloqueo.
  }
}

/** Al abrir la app: bloqueada si el ajuste está activo. */
export function initialLockState(enabled: boolean): BiometricLockState {
  return { locked: enabled, verifying: false, backgroundedAt: null, suppressUntil: 0 };
}

export function onAppPause(state: BiometricLockState, now: number): BiometricLockState {
  if (state.verifying || now < state.suppressUntil || state.locked) return state;
  return { ...state, backgroundedAt: state.backgroundedAt ?? now };
}

export function onAppResume(state: BiometricLockState, now: number, enabled: boolean): BiometricLockState {
  if (state.verifying || now < state.suppressUntil) return { ...state, backgroundedAt: null };
  const away = state.backgroundedAt === null ? 0 : now - state.backgroundedAt;
  const shouldLock = enabled && state.backgroundedAt !== null && away >= LOCK_AFTER_BACKGROUND_MS;
  return { ...state, locked: state.locked || shouldLock, backgroundedAt: null };
}

export function onVerifyStart(state: BiometricLockState): BiometricLockState {
  return { ...state, verifying: true };
}

export function onVerifySuccess(state: BiometricLockState, now: number): BiometricLockState {
  return { locked: false, verifying: false, backgroundedAt: null, suppressUntil: now + POST_VERIFY_SUPPRESS_MS };
}

export function onVerifyFailure(state: BiometricLockState, now: number): BiometricLockState {
  return { ...state, verifying: false, backgroundedAt: null, suppressUntil: now + POST_VERIFY_SUPPRESS_MS };
}

/** Nombre del método para los textos ("Face ID", "huella"). */
export function biometricLabel(kind: 'face' | 'fingerprint' | 'iris' | 'biometric', platform: 'ios' | 'android' | 'web'): string {
  if (kind === 'face') return platform === 'ios' ? 'Face ID' : 'reconocimiento facial';
  if (kind === 'fingerprint') return platform === 'ios' ? 'Touch ID' : 'huella';
  if (kind === 'iris') return 'iris';
  return 'biometría';
}
