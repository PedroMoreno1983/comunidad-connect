# App Android en Google Play

La app de Android es Capacitor: abre `https://conviveconnect.com` dentro de una vista web y suma lo nativo (huella o rostro para desbloquear, entrar con Google por el navegador del teléfono). Casi todo cambio de la app llega por Vercel sin publicar una versión nueva; solo hay que subir una versión cuando cambia algo nativo (plugins, permisos, ícono, nombre).

| Dato | Valor |
|---|---|
| ID (permanente) | `com.conviveconnect.app` |
| Nombre | Convive Connect |
| Versión | `versionName 1.1.0`, `versionCode 2` (en `android/app/build.gradle`) |
| SDK | min 24, target 36 |
| Llave de subida | `~/.android-keys/convive-upload.jks` (alias `upload`) |
| SHA-256 de la llave de subida | `54:06:DA:F8:AA:83:7D:2E:27:78:60:61:A5:55:35:BE:17:E1:3E:3C:7A:20:45:CA:64:CD:60:17:89:A1:D0:12` |

## Llave de subida

Google Play firma la app con su propia llave (Play App Signing). Nosotros firmamos con una **llave de subida**, que identifica quién sube las versiones:

- El archivo `~/.android-keys/convive-upload.jks` y su contraseña en `~/.android-keys/convive-upload.properties` están solo en el computador de Pedro. **Respáldalos** en un gestor de contraseñas o una bóveda; no van al repo (`android/.gitignore`).
- `android/keystore.properties` (también ignorado) apunta a esa llave. Sin ese archivo, el release se compila sin firmar, que es lo que hace la CI.
- Si la llave se pierde, Google Play permite cambiarla desde la consola (Integridad de la app → Solicitar restablecimiento de llave de subida). Es lento, pero no se pierde la app.

## Compilar una versión

```bash
npx cap sync android
```

```bash
cd android && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew.bat bundleRelease
```

El AAB queda en `android/app/build/outputs/bundle/release/app-release.aab`. Antes de cada envío, sube `versionCode` en 1 (y `versionName` si cambia algo visible).

Capacitor 8 necesita JDK 21: el de Android Studio sirve. `CAPACITOR_SERVER_URL` debe estar vacío para que la app apunte a producción.

Íconos y pantalla de inicio: `node scripts/android-assets.mjs` los regenera desde `resources/icon.png` y `resources/icon-foreground.png`.

## Primera publicación

1. **Cuenta de Google Play Console**: USD 25, pago único. Conviene crearla como **organización** (DataWise): pide número D-U-N-S, que es gratuito pero puede tardar días. Una cuenta **personal** creada hoy tiene que pasar una prueba cerrada con al menos 12 personas durante 14 días antes de poder publicar en producción.
2. Crear la app: nombre "Convive Connect", idioma español (Chile), app gratuita.
3. Ficha de la tienda:
   - Ícono 512×512: `resources/play-store-icon.png`.
   - Gráfico destacado 1024×500 y al menos 2 capturas de teléfono: pendientes.
   - Descripción corta (80 caracteres) y completa.
4. Políticas:
   - Política de privacidad: `https://conviveconnect.com/privacy`.
   - Seguridad de los datos: correo, nombre, teléfono, dirección y departamento; pagos y lecturas de agua del edificio; datos cifrados en tránsito; la persona puede pedir borrar su cuenta.
   - Clasificación de contenido, público objetivo (adultos), sin anuncios.
   - Acceso a la app: los revisores necesitan una cuenta de prueba (correo y contraseña) para entrar.
5. Subir `app-release.aab` primero a **Prueba interna** e instalarla desde el enlace de prueba. Después pasarla a producción.

### Riesgo de revisión

Google rechaza apps que solo envuelven un sitio web ("funcionalidad mínima"). A favor de Convive: hay funciones nativas (desbloqueo con huella o rostro, inicio de sesión de Google por el navegador del sistema) y es un servicio con cuenta. Si la rechazan, lo que más ayuda son las notificaciones push nativas.

## Entrar con Google desde la app

Google no permite iniciar sesión dentro de la vista web de una app. En la app nativa:

1. `AuthProvidersService.signInWithGoogle` pide la URL con `skipBrowserRedirect` y la abre en el navegador del teléfono (`@capacitor/browser`).
2. Supabase vuelve a `com.conviveconnect.app://auth/callback?code=…` (intent-filter en `AndroidManifest.xml` y `CFBundleURLTypes` en iOS).
3. `NativeOAuthReturn` (en `AppProviders`) recibe el enlace, cierra el navegador y lleva la vista web a `/auth/callback?code=…`, que canjea el código como en la web (el verificador PKCE quedó en las cookies de la vista web).

**Requisito en Supabase:** Authentication → URL Configuration → Redirect URLs debe incluir `com.conviveconnect.app://**`. Sin eso, Supabase manda a la persona al sitio web en el navegador y la app no recibe la sesión.

## Notificaciones push

Todo aviso nuevo en `notifications` (pagos, reservas, encomiendas, CoCo…) sale también como push al teléfono de la persona, sin tocar el código que crea los avisos:

1. Al iniciar sesión en la app, `NativePushRegistration` pide permiso, registra el token de FCM del teléfono en `push_devices` (`/api/push/devices`) y lo suelta al cerrar sesión.
2. El trigger `notifications_dispatch_push` (pg_net) llama a `/api/push/dispatch` con el id del aviso y la cabecera `x-push-secret`, solo si la persona tiene un teléfono registrado.
3. El endpoint valida el secreto, relee el aviso, lo marca con `push_sent_at` (una sola vez, solo si tiene menos de 10 minutos) y lo envía por FCM. Si nada salió por un error pasajero, libera la marca. Los tokens que FCM rechaza se borran.

La notificación usa visibilidad privada: en la pantalla bloqueada no se ve el contenido (montos, deudas). Por ahora solo Android: iOS necesita la capacidad Push en Xcode y el puente de Firebase Messaging.
4. Tocar la notificación abre la ruta del aviso (`link`) o `/notifications`.

**Requisitos (una vez):**

- Proyecto en [Firebase](https://console.firebase.google.com) con una app Android `com.conviveconnect.app`. Su `google-services.json` va en `android/app/` **antes de compilar**. No se versiona (gitleaks marcaría su clave de API); si se pierde, se rearma desde Firebase → Configuración del proyecto → app Android: sin él la app no puede registrarse para push.
- El servidor entra a Firebase **sin clave**: la organización de Google de DataWise prohíbe crear claves de cuentas de servicio (`iam.disableServiceAccountKeyCreation`). Vercel firma un token OIDC por despliegue (emisor `https://oidc.vercel.com/pedropedrofelipemoreno-7255`) y Google lo cambia por acceso a `firebase-adminsdk-fbsvc@convive-login`, solo con alcance de FCM (Workload Identity Federation: pool y proveedor `vercel` en el proyecto `convive-login`, que aceptan únicamente `comunidad-connect` en producción y preview).
- En Vercel: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_EMAIL` y `FIREBASE_WORKLOAD_IDENTITY_PROVIDER` (ver `CLAUDE.md`). No son secretos. Sin ellas (ni `FIREBASE_SERVICE_ACCOUNT`) el servidor no envía nada y el aviso queda solo dentro de la app.
- Secreto del despacho: el mismo valor aleatorio en Vercel (`PUSH_DISPATCH_SECRET`) y en Supabase Vault con el nombre `push_dispatch_secret` (`select vault.create_secret('<valor>', 'push_dispatch_secret');`). Sin ambos, no sale ningún push.
