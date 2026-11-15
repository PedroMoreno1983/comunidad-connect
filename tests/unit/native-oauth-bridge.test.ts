import { describe, expect, it } from 'vitest';
import { NATIVE_OAUTH_CALLBACK, webCallbackPathFor } from '@/lib/native/oauthBridge';

describe('vuelta de Google a la app nativa', () => {
  it('lleva el código y el destino a /auth/callback', () => {
    expect(webCallbackPathFor(`${NATIVE_OAUTH_CALLBACK}?next=%2Fbienvenida&code=abc123`))
      .toBe('/auth/callback?code=abc123&next=%2Fbienvenida');
  });

  it('sin código (canceló) igual pasa por /auth/callback, que manda a /login?oauth=error', () => {
    expect(webCallbackPathFor(`${NATIVE_OAUTH_CALLBACK}?error=access_denied`)).toBe('/auth/callback');
  });

  it('ignora enlaces que no son la vuelta de OAuth', () => {
    expect(webCallbackPathFor('com.conviveconnect.app://otra-cosa?code=x')).toBeNull();
    expect(webCallbackPathFor('https://conviveconnect.com/auth/callback?code=x')).toBeNull();
  });

  it('no deja meter otro destino que una ruta: el servidor valida next', () => {
    expect(webCallbackPathFor(`${NATIVE_OAUTH_CALLBACK}?code=a&next=https%3A%2F%2Fevil.com`))
      .toBe('/auth/callback?code=a&next=https%3A%2F%2Fevil.com');
  });
});
