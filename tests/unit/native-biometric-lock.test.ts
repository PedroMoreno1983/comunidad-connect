import { describe, expect, it } from 'vitest';
import {
  LOCK_AFTER_BACKGROUND_MS,
  POST_VERIFY_SUPPRESS_MS,
  biometricLabel,
  biometricLockStorageKey,
  initialLockState,
  isBiometricLockEnabled,
  onAppPause,
  onAppResume,
  onVerifyFailure,
  onVerifyStart,
  onVerifySuccess,
  setBiometricLockEnabled,
} from '@/lib/native/biometricLock';

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
    map,
  };
}

describe('ajuste del bloqueo biométrico', () => {
  it('es opcional, por persona y apagado por defecto', () => {
    const store = memoryStore();
    expect(isBiometricLockEnabled('u1', store)).toBe(false);
    setBiometricLockEnabled('u1', true, store);
    expect(isBiometricLockEnabled('u1', store)).toBe(true);
    expect(isBiometricLockEnabled('u2', store)).toBe(false);
    setBiometricLockEnabled('u1', false, store);
    expect(store.map.has(biometricLockStorageKey('u1'))).toBe(false);
  });

  it('sin almacenamiento (web antigua, modo privado) nunca bloquea', () => {
    expect(isBiometricLockEnabled('u1', null)).toBe(false);
  });
});

describe('cuándo pedir biometría', () => {
  it('al abrir la app, solo si el ajuste está activo', () => {
    expect(initialLockState(true).locked).toBe(true);
    expect(initialLockState(false).locked).toBe(false);
  });

  it('al volver del fondo tras el umbral bloquea; una salida corta no', () => {
    const open = initialLockState(false);
    const paused = onAppPause(open, 1_000);
    expect(onAppResume(paused, 1_000 + LOCK_AFTER_BACKGROUND_MS - 1, true).locked).toBe(false);
    expect(onAppResume(paused, 1_000 + LOCK_AFTER_BACKGROUND_MS, true).locked).toBe(true);
  });

  it('con el ajuste apagado nunca bloquea', () => {
    const paused = onAppPause(initialLockState(false), 0);
    expect(onAppResume(paused, 10 * 60_000, false).locked).toBe(false);
  });

  it('el propio aviso biométrico no provoca un nuevo bloqueo (sin bucle)', () => {
    let state = onVerifyStart(initialLockState(true));
    state = onAppPause(state, 0);           // Android abre la actividad del aviso
    expect(state.backgroundedAt).toBeNull();
    state = onVerifySuccess(state, 20_000);
    expect(state.locked).toBe(false);
    state = onAppResume(state, 20_100, true); // regreso de esa actividad
    expect(state.locked).toBe(false);
    state = onAppPause(state, 20_000 + POST_VERIFY_SUPPRESS_MS + 1);
    expect(state.backgroundedAt).not.toBeNull();
  });

  it('si la verificación falla, sigue bloqueada', () => {
    const state = onVerifyFailure(onVerifyStart(initialLockState(true)), 5_000);
    expect(state).toMatchObject({ locked: true, verifying: false });
  });
});

describe('textos', () => {
  it('nombra el método según la plataforma', () => {
    expect(biometricLabel('face', 'ios')).toBe('Face ID');
    expect(biometricLabel('fingerprint', 'android')).toBe('huella');
    expect(biometricLabel('face', 'android')).toBe('reconocimiento facial');
  });
});
