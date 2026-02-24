# Guía de Empaquetado y Publicación: ComunidadConnect Móvil

Este documento explica los pasos exactos a seguir ahora que tu proyecto web Next.js ha sido envuelto en un contenedor nativo de **Ionic Capacitor**. 

Tienes dos carpetas nuevas y críticas en la raíz de este proyecto:
- `/android/` (Proyecto nativo de Android Studio)
- `/ios/` (Proyecto nativo de Xcode)

---

## 🎨 1. Configurar Iconos y Pantalla de Carga (Splash Screen)

Para no tener que diseñar manualmente decenas de tamaños de iconos para Android y Apple, utilizaremos la herramienta oficial de Ionic para autogenerarlos.

### Prerrequisitos:
1. Crea una imagen cuadrada de alta calidad de tu logo (`logo.png`), preferiblemente de `1024x1024` píxeles sin fondo.
2. Crea una imagen de fondo para la pantalla de carga (`splash.png`), preferiblemente de `2732x2732` píxeles.

### Pasos:
1. En la raíz de tu proyecto, instala la herramienta oficial:
   ```bash
   npm install -g @capacitor/assets
   ```
2. Crea una carpeta llamada `assets` en la raíz de tu proyecto y coloca tus imágenes dentro:
   - `assets/icon.png` (Tu logo)
   - `assets/splash.png` (Tu fondo de inicio)
3. Ejecuta el generador automático:
   ```bash
   npx capacitor-assets generate
   ```
   > Esto inyectará automáticamente todos los recortes de imágenes en las carpetas nativas correspondientes de iOS y Android.

---

## 🤖 2. Compilar e Instalar en Android (APK / Play Store)

Necesitas tener instalado **Android Studio** en tu computadora Windows/Mac.

1. Abre el proyecto en Android Studio ejecutando este comando en tu terminal (en la raíz de tu proyecto web):
   ```bash
   npx cap open android
   ```
2. Android Studio se abrirá e indexará tu proyecto. Esto puede tardar unos minutos la primera vez.
3. Para probar la app física en tu móvil:
   - Conecta tu celular Android por cable USB y asegúrate de tener activada la "Depuración USB" en opciones de desarrollador.
   - En Android Studio, selecciona tu dispositivo en el menú superior y haz clic en el botón de **Play (▶️)** o presiona `Shift + F10`.
4. Para generar el archivo instalable final para lanzar a la Google Play Store (App Bundle) o para pasarlo a tus clientes (APK):
   - Ve al menú superior: **Build > Generate Signed Bundle / APK...**
   - Sigue el asistente para firmar digitalmente tu aplicación.

---

## 🍏 3. Compilar e Instalar en iOS (App Store)

> [!IMPORTANT]
> Apple requiere obligatoriamente una computadora con sistema operativo **macOS** para compilar aplicaciones iOS. No es posible hacerlo desde Windows nativamente. Necesitarás instalar **Xcode** desde la Mac App Store.

1. En tu Mac, abre la terminal en la raíz de tu proyecto y ejecuta el sincronizador (por si hubo cambios en tu código web):
   ```bash
   npm run build && npx cap sync
   ```
2. Abre el proyecto en Xcode:
   ```bash
   npx cap open ios
   ```
3. En Xcode, ve al panel de navegación izquierdo, haz clic en el proyecto "App" y selecciona la pestaña **Signing & Capabilities**.
   - Necesitarás una cuenta gratuita de Apple Developer para probar en tu propio iPhone (vía cable USB). Selecciona tu "Team" allí.
   - Necesitarás una membresía de pago de Apple Developer Program ($99/año) si deseas subirla a la App Store pública.
4. Conecta tu iPhone, selecciónalo en la lista desplegable superior y dale al botón de **Play (▶️) / Run**.

---

## 🔄 El Ciclo de Desarrollo Híbrido

A partir de este punto, cada vez que edites el código fuente de tu app en React / Next.js (`src/app/...`, `src/components/...`) deberás seguir estos **dos sencillos pasos** para "empujar" esos nuevos cambios web hacia la envoltura móvil temporal:

1. Compilar Next.js estáticamente:
   ```bash
   npm run build
   ```
2. Sincronizar hacia iOS y Android:
   ```bash
   npx cap sync
   ```

Una vez que haces `npx cap sync`, si luego abres las apps en Android Studio/Xcode o las lanzas de nuevo en los simuladores, ambas contendrán al instante tu nuevo diseño o funciones sin tener que programar nada en Java/Swift.
