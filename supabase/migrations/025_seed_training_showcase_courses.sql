-- ============================================
-- SHOWCASE TRAINING COURSES
-- Public IA-guided courses for commercial walkthroughs
-- ============================================

CREATE TABLE IF NOT EXISTS training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  target_audience TEXT DEFAULT 'all',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO training_modules (id, title, description, target_audience, is_active)
VALUES
(
  '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c101',
  'Convivencia y Ley de Copropiedad',
  'Clase guiada por CoCo IA para entender deberes, ruidos, reglamento interno, gastos comunes y convivencia diaria.',
  'all',
  true
),
(
  '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c102',
  'Seguridad, datos personales y comunidad',
  'Curso practico sobre privacidad, camaras, datos de residentes, autorizaciones y buenas practicas segun Ley 21.719.',
  'admin',
  true
),
(
  '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c103',
  'Operacion diaria: conserjeria, mantencion y emergencias',
  'Entrenamiento operativo para registrar novedades, escalar urgencias, coordinar proveedores y dejar trazabilidad.',
  'concierge',
  true
)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_audience = EXCLUDED.target_audience,
    is_active = EXCLUDED.is_active;

INSERT INTO training_lessons (id, module_id, title, content, order_index)
VALUES
(
  '9f6a1b41-4e1b-4472-8b11-bf3b98600101',
  '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c101',
  'Clase principal',
  '[{"id":"slide-1","title":"Convivencia con reglas claras","bullets":["La Ley 21.442 ordena la vida en copropiedad","El reglamento interno traduce la ley a acuerdos concretos","La buena convivencia requiere registro, criterio y trazabilidad"],"visual_theme":"default","notes":"Explicar que CoCo no reemplaza asesoria juridica, pero ayuda a ordenar casos y decisiones."},{"id":"slide-2","title":"Ruidos, molestias y uso de unidades","bullets":["Registrar fecha, hora, unidad y evidencia","Distinguir hecho aislado de reincidencia","Escalar a administracion cuando afecta tranquilidad o seguridad"],"visual_theme":"sunset-orange","notes":"Usar ejemplo de ruido recurrente fuera de horario y mostrar como se transforma en caso CoCo."},{"id":"slide-3","title":"Gastos comunes y morosidad","bullets":["El aviso de cobro debe ser claro y trazable","Evitar exponer deudas a vecinos no autorizados","Las medidas de cobro requieren procedimiento y autorizacion"],"visual_theme":"blue-glass","notes":"Conectar con modulo de finanzas y centro operativo."},{"id":"slide-4","title":"Como actuar dentro de Convive Connect","bullets":["Crear comunicados para normas generales","Crear caso CoCo para situaciones concretas","Usar votaciones para decisiones comunitarias"],"visual_theme":"nature-green","notes":"Cerrar con recorrido por comunicaciones, casos y votaciones."}]',
  0
),
(
  '9f6a1b41-4e1b-4472-8b11-bf3b98600102',
  '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c102',
  'Clase principal',
  '[{"id":"slide-1","title":"Datos personales en comunidad","bullets":["Telefonos, correos, RUT, deudas e imagenes son datos protegidos","El acceso debe depender del rol y la finalidad","La administracion debe minimizar datos visibles"],"visual_theme":"default","notes":"Explicar con ejemplos de directorio, morosidad y camaras."},{"id":"slide-2","title":"Camaras y seguridad","bullets":["Usar imagenes solo para fines legitimos de seguridad","Evitar difusion informal por chats","Registrar solicitudes y accesos relevantes"],"visual_theme":"tech-abstract","notes":"Conectar con conserjeria y casos de seguridad."},{"id":"slide-3","title":"WhatsApp y notificaciones","bullets":["Enviar solo mensajes necesarios y pertinentes","Respetar autorizacion del residente","Mantener trazabilidad de envios importantes"],"visual_theme":"blue-glass","notes":"Mostrar que votaciones y avisos pueden distribuirse por app y WhatsApp cuando esta configurado."},{"id":"slide-4","title":"Practica recomendada","bullets":["Definir responsables","Auditar acciones criticas","Revisar periodicamente permisos e integraciones"],"visual_theme":"nature-green","notes":"Cerrar en Centro Operativo."}]',
  0
),
(
  '9f6a1b41-4e1b-4472-8b11-bf3b98600103',
  '4b7f3d4b-5a7f-4c9b-a6c1-6ef2e7a8c103',
  'Clase principal',
  '[{"id":"slide-1","title":"Turno operativo sin improvisacion","bullets":["Cada novedad importante debe quedar registrada","Los estados evitan perder seguimiento","El cambio de turno necesita contexto claro"],"visual_theme":"default","notes":"Explicar bitacora, paqueteria y visitantes."},{"id":"slide-2","title":"Mantencion y emergencias","bullets":["Distinguir solicitud normal, urgencia y emergencia","Registrar ubicacion, evidencia y accion ya tomada","Escalar a administracion o proveedor segun protocolo"],"visual_theme":"sunset-orange","notes":"Usar ejemplo de filtracion activa."},{"id":"slide-3","title":"Proveedores y cierre de casos","bullets":["Aceptar solicitudes con horario claro","Marcar avances y completar trabajos","Notificar al residente cuando cambia el estado"],"visual_theme":"blue-glass","notes":"Conectar con Directorio Servicios y Panel Proveedor."},{"id":"slide-4","title":"Trazabilidad profesional","bullets":["Lo que no queda registrado se pierde","El Centro Operativo permite auditar acciones criticas","CoCo ayuda a resumir patrones y riesgos"],"visual_theme":"nature-green","notes":"Cerrar mostrando auditoria operacional."}]',
  0
)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    content = EXCLUDED.content,
    order_index = EXCLUDED.order_index;
