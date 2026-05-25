# Instrucciones para Configurar tu Base de Datos Supabase

Sigue estos pasos para configurar tu base de datos Supabase con el schema de ComunidadConnect.

## 📝 Paso 1: Obtener tus Credenciales

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. En el menú lateral, ve a **Settings** → **API**
3. Copia los siguientes valores:
   - **Project URL** (ejemplo: `https://abcdefgh.supabase.co`)
   - **Project API keys** → **anon/public** key

## 🔑 Paso 2: Configurar Variables de Entorno

1. Abre el archivo `.env.local` en la raíz del proyecto
2. Reemplaza los valores vacíos con tus credenciales:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

> ⚠️ **IMPORTANTE**: Asegúrate de que `.env.local` esté en tu `.gitignore` para no subir las credenciales a Git.

## 🗄️ Paso 3: Ejecutar Migraciones SQL

### Opción A: Usar el SQL Editor de Supabase (Recomendado)

1. Ve a **SQL Editor** en el menú lateral de Supabase
2. Crea una nueva query
3. Copia el contenido de `supabase/migrations/001_initial_schema.sql`
4. Pega y ejecuta (botón **Run**)
5. Repite con `supabase/migrations/002_rls_policies.sql`

### Opción B: Usar Supabase CLI

Si tienes el CLI de Supabase instalado:

```bash
# Vincula tu proyecto
npx supabase link --project-ref tu-project-ref

# Aplica las migraciones
npx supabase db push
```

## ✅ Paso 4: Verificar la Instalación

Después de ejecutar las migraciones, verifica que todo está correcto:

1. Ve a **Table Editor** en Supabase
2. Deberías ver todas estas tablas:
   - ✓ profiles
   - ✓ units
   - ✓ marketplace_items
   - ✓ service_providers
   - ✓ service_requests
   - ✓ amenities
   - ✓ bookings
   - ✓ announcements
   - ✓ expenses
   - ✓ visitors
   - ✓ packages

3. Ve a **Authentication** → **Policies**
4. Verifica que cada tabla tenga políticas RLS activas

## 🌱 Paso 5: (Opcional) Poblar con Datos Iniciales

Si quieres agregar datos de prueba:

1. Puedes crear usuarios desde **Authentication** → **Users** → **Add user**
2. Los perfiles se crearán automáticamente gracias al trigger `handle_new_user()`
3. Para el primer usuario admin:
   - Crea un usuario
   - Ve a **Table Editor** → **profiles**
   - Encuentra el usuario recién creado
   - Cambia el campo `role` de `resident` a `admin`

## 🤖 Paso 6: Automatización de Búsqueda Semántica con Webhooks

Para que las búsquedas semánticas del Marketplace funcionen en tiempo real de forma automática cada vez que se agregue o modifique un producto, configura un Webhook en tu Dashboard de Supabase:

1. Ve a **Database** ➔ **Webhooks** en Supabase.
2. Haz clic en **Create Webhook**.
3. Rellena los datos de configuración:
   - **Name:** `embed_marketplace_items`
   - **Table:** `marketplace_items`
   - **Events:** Activa `INSERT` y `UPDATE`.
   - **Type:** `HTTP POST`
   - **URL:** `https://<tu-dominio-de-vercel>.vercel.app/api/marketplace-items/embed` (o tu túnel de ngrok si estás probando en local).
   - **Headers:**
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer <tu-token-de-seguridad-webhook>` (debe coincidir con el valor de la variable de entorno `WHATSAPP_WEBHOOK_SECRET` que declaraste en Vercel para autorizar llamadas).
4. Guarda y activa el Webhook. ¡Listo! Cada cambio en el catálogo se indexará en pgvector en tiempo real.

## 🔐 Notas de Seguridad

- ✅ Las políticas RLS protegen los datos por rol
- ✅ Los residentes solo ven sus propios datos
- ✅ Los administradores tienen acceso completo
- ✅ Los conserjes solo acceden a visitantes y paquetes
- ✅ El trigger auto-crea perfiles al registrarse

## 🚀 Siguiente Paso

Una vez completada la configuración, puedes:
- Ejecutar el proyecto con `npm run dev`
- Probar el registro/login
- Verificar que los datos se persistan correctamente

Si tienes problemas, revisa:
1. Que las variables de entorno estén correctas
2. Que las migraciones se ejecutaron sin errores
3. Que RLS esté habilitado en todas las tablas
