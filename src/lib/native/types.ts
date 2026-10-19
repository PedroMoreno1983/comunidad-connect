/** Tipos del bloqueo biométrico de la app nativa (Capacitor). */

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'biometric';

export interface BiometricAvailability {
  available: boolean;
  kind: BiometricKind;
  /** Motivo legible si no está disponible. */
  reason?: string;
}

export type BiometricVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed' | 'lockout' | 'unavailable' | 'error'; message: string };

/** Estado de la máquina de bloqueo. Módulo puro: `biometricLock.ts`. */
export interface BiometricLockState {
  locked: boolean;
  verifying: boolean;
  /** Instante (ms) en que la app pasó al fondo; null si está al frente. */
  backgroundedAt: number | null;
  /** Hasta cuándo (ms) se ignoran pausa y regreso: los provoca el propio aviso biométrico. */
  suppressUntil: number;
}

export interface BiometricLockSettingProps {
  userId: string;
}

export interface BiometricLockGateProps {
  userId: string;
}
