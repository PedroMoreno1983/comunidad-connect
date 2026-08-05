/**
 * Stub de 'server-only' para los tests.
 *
 * El paquete real solo existe para que el bundler falle si un módulo de
 * servidor se importa desde el cliente. En vitest no hay bundler y el paquete
 * no resuelve, así que sin este stub no se pueden testear módulos que lo
 * importan — entre ellos las herramientas de CoCo, que es justo lo que hay que
 * verificar.
 */
export {};
