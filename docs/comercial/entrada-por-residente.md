# Entrada por residente: registrarse sin que el edificio esté en Convive

Diseño, 2026-11-13. Estado: fases 1 y 2 en producción (PR #241); fases 3 y 4 en el PR siguiente.

## Para qué

Hoy un residente solo entra con el código que entrega su administración (`/api/auth/signup` busca `resident_code`, `concierge_code` o `admin_code`). Si el edificio no contrató, no hay forma de entrar.

La estrategia es crecer desde abajo. El residente usa Convive solo, invita a sus vecinos, y cuando hay suficientes, la administración recibe una razón concreta para contratar: "15 vecinos de tu edificio ya lo usan".

Tres condiciones:

1. **El residente tiene que encontrar valor solo.** Nada de pantallas vacías esperando a la administración.
2. **Convive no puede hacerse pasar por la administración.** Los gastos comunes, los avisos oficiales y las votaciones siguen siendo del edificio que contrata.
3. **El costo de IA de alguien que no paga tiene que tener techo.**

## El concepto: comunidad "sin administrar"

Una fila más en `communities`, marcada como no administrada. Se crea cuando el primer vecino se registra con la dirección de su edificio. Los siguientes vecinos se suman a la misma comunidad.

```sql
ALTER TABLE communities
  ADD COLUMN managed BOOLEAN NOT NULL DEFAULT TRUE,     -- false: la crearon residentes
  ADD COLUMN claimed_at TIMESTAMPTZ,                     -- cuando una administración la tomó
  ADD COLUMN created_by_resident UUID REFERENCES profiles(id);
CREATE UNIQUE INDEX communities_unmanaged_place_idx
  ON communities (address_place_id) WHERE managed = FALSE;   -- una por edificio
ALTER TABLE profiles
  ADD COLUMN residence_verified BOOLEAN NOT NULL DEFAULT TRUE; -- false en comunidades sin administrar
```

Así no cambian ni la RLS, que ya separa todo por `community_id`, ni el resto de la plataforma. Cada vecino sigue teniendo su `community_id` y ve solo lo de su edificio.

La dirección se resuelve con la misma geocodificación del onboarding de administradores (`address_place_id`, `address_geocoding_source` en `/api/admin-onboarding/register`). El `place_id` evita crear dos comunidades para el mismo edificio.

## El flujo

### 1. Registro por dirección

En `/signup` se agrega la opción "Mi edificio todavía no usa Convive".

1. La persona escribe la dirección y elige el resultado sugerido.
2. Indica su departamento y, si corresponde, la torre.
3. El sistema busca una comunidad con ese `place_id`:
   - **Hay una administrada** (el edificio ya contrató): no se entra sin código. Se le dice "Tu edificio ya usa Convive: pide el código a tu administración", con un botón que le avisa a la administración que alguien pidió acceso.
   - **Hay una sin administrar:** se suma a ella.
   - **No hay ninguna:** se crea la comunidad sin administrar, con el nombre que la persona escriba ("Edificio Los Aromos") y la dirección.
4. El perfil queda con `residence_verified = false`.

No se pide prueba de residencia. Eso permite que alguien diga que vive en un edificio donde no vive, y se compensa así:

- La comunidad sin administrar no tiene datos sensibles: ni deudas, ni accesos, ni gastos.
- Entre vecinos no verificados se muestra la marca "vecino no verificado".
- Cuando la administración toma el edificio, valida a cada persona (paso 4).

### 2. Modo vecino: qué hay y qué no

| Funciona sin administración | Se muestra pero invita a la administración | No existe hasta que contraten |
|---|---|---|
| CoCo (con tope diario más bajo) | Gastos comunes | Conserjería, accesos, encomiendas |
| Supermercado: listas, comparador, compra comunitaria | Reservas de espacios comunes | Avisos oficiales y circulares |
| Red Convive de maestros, reseñas | Votaciones | Panel de administración |
| Marketplace entre vecinos | Estacionamientos y bodegas | |
| Consultas legales (Ley 21.442, Norma) | | |
| Recordatorios | | |

La columna del medio no muestra una pantalla vacía. Muestra para qué sirve el módulo y el botón "Invitar a mi administración".

Estacionamientos y bodegas van en esa columna porque sin el edificio no hay forma de dejar entrar el auto ni de cobrar en los gastos comunes.

Se implementa en tres lugares:

- `roleAccess.ts`: rutas permitidas según `managed`.
- `isToolOfferedFor` en `src/lib/coco/tools.ts`, que ya filtra por rol y canal: sumar la comunidad, para que CoCo no ofrezca gastos, reservas ni avisos a la comunidad.
- `authContext.tsx`: exponer `communityManaged` para la navegación.

**Costo de IA.** Cada comunidad sin administrar nace con su fila en `ai_budgets` en plan `demo`. Esa fila tiene límites bajos: por ejemplo, 1 M tokens al mes por comunidad y 20 k al día por residente. Los valores por defecto actuales (10 M al mes, 100 k diarios por residente) son para un edificio que paga.

### 3. El contador: de vecinos a reunión con la administración

- Cada comunidad sin administrar cuenta sus vecinos registrados. (La idea era contar solo los activos en 30 días, pero no hay registro de actividad por persona; en esta etapa casi todos los registros son recientes. Cuando haga falta, se agrega un `last_active_at`.)
- Los vecinos ven "Somos 12 vecinos en Convive" y un botón "Invitar a mi administración". Ese botón arma un correo o un WhatsApp con un enlace a `/admin-onboarding?claim=<token>`.
- En superadmin, una lista nueva, "Edificios por conquistar", muestra las comunidades sin administrar ordenadas por vecinos activos, con su dirección. Es la lista de prospectos comerciales.
- Umbrales de partida, para ajustar con datos: avisar al equipo comercial con 5 vecinos activos y mostrar la invitación destacada desde 10.

### 4. La administración toma el edificio

1. La administración entra por el enlace de invitación, o se registra normalmente en `/admin-onboarding` con la misma dirección y el sistema detecta la comunidad sin administrar.
2. **Convive aprueba el reclamo desde superadmin.** Cualquiera podría decir que administra un edificio, y el reclamo le da acceso a todos los vecinos registrados.
3. Al aprobar:
   - la comunidad pasa a `managed = true` y `claimed_at = now()`;
   - se generan los códigos;
   - sigue el onboarding normal: plan, unidades, alícuotas.
4. Los vecinos que ya estaban se mantienen, pero aparecen en una lista "Por validar" para la administración. Por cada uno, aprueba (queda `residence_verified = true` y se vincula a su unidad real) o lo quita de la comunidad.
5. Si la administración ya había creado su comunidad por separado, superadmin tiene un "Unir comunidades" que mueve a los vecinos.
6. Se guarda quién invitó a la administración (`referred_by`), para premiarlo.

## Precio para el residente

Mi recomendación es no cobrarle al residente después de 30 días:

- **Gratis siempre,** con los límites del modo vecino.
- **Premio para quien trae a su edificio:** por ejemplo, 3 meses de plan personal o un descuento acordado con la administración.
- **Plan personal opcional y barato:** más uso de CoCo y beneficios de supermercado. Queda para después, porque los pagos con Haulmer todavía no están habilitados.

Cobrarle al residente al día 31 corta justo el contagio entre vecinos, que es lo que hace funcionar la estrategia.

## Riesgos

- **Dos comunidades para el mismo edificio.** Pasa con edificios de varias torres o entradas con distinto `place_id`. Se corrige con "Unir comunidades" en superadmin y con un aviso al registrarse cuando hay otra comunidad a menos de 50 m.
- **Fraude en marketplace o compra comunitaria entre vecinos no verificados.** La marca visible ayuda. Hay que decidir si la compra comunitaria se permite antes de la validación (decisión 2).
- **Privacidad.** Que un edificio "existe en Convive con N vecinos" solo lo ven sus vecinos y superadmin, nunca alguien de afuera. El consentimiento es el mismo del registro actual (`consentEvents`).
- **Relación con la administración.** Los avisos y la información del modo vecino no pueden parecer comunicaciones oficiales del edificio. Todo lo que ahí se diga es entre vecinos.

## Decisiones (2026-11-13)

1. **Residente de un edificio que ya contrató y que no tiene código:** se bloquea, y puede avisarle a su administración.
2. **Compra comunitaria y marketplace entre vecinos no verificados:** se permiten, con la marca "vecino no verificado".
3. **Umbrales del contador:** 5 vecinos activos para avisar al equipo y 10 para destacar la invitación.
4. **Premios:** los de la sección siguiente.

## Premios

Tienen que costarle poco a Convive y funcionar sin cobros, porque Haulmer todavía no está habilitado.

**Para el edificio (es lo que hace decir que sí a la administración):**

- Si contrata con 10 o más vecinos activos, el onboarding ($149.000) queda bonificado y el primer mes es gratis.
- Es justo: los vecinos ya están registrados y la implementación cuesta menos.
- Le da al equipo comercial un argumento con fecha: "la bonificación vale mientras tengan 10 vecinos activos".

**Para quien trae al edificio (el vecino cuya invitación terminó en contrato, por `referred_by`):**

- **Vecino fundador:** una marca en su perfil y el reconocimiento en el aviso de bienvenida del edificio ("gracias a María, del 504").
- **12 meses de CoCo sin topes de modo vecino**, con el uso de un edificio Pro. Es inmediato y barato: solo cambia su límite diario en `ai_budgets`.
- Cuando exista el plan personal pagado, esos 12 meses pasan a ser 12 meses de ese plan.

**Para los primeros 10 vecinos de cada comunidad sin administrar:**

- La marca "vecino fundador" (sin el beneficio de CoCo). Cuesta cero y empuja a registrarse temprano.

**Lo que no recomiendo:** premios en dinero o descuentos en los gastos comunes del vecino. Los gastos comunes son del edificio, no de Convive, y prometer plata sin pagos habilitados es comprometer algo que todavía no se puede cumplir.

## Fases de implementación

1. **Base (1 PR):**
   - migración de `managed` / `residence_verified`;
   - registro por dirección;
   - creación o unión de la comunidad sin administrar;
   - presupuesto de IA `demo`.
2. **Modo vecino (1 PR):** gating de rutas y de CoCo, y pantallas de invitación en los módulos de la administración.
3. **Contador y prospectos (1 PR):** contador visible para los vecinos, botón para invitar a la administración y lista en superadmin.
4. **Reclamo (1 PR):** reclamo con aprobación de Convive, validación de vecinos y "Unir comunidades".

Las fases 1 y 2 juntas ya permiten probar con 2 o 3 edificios reales. La 3 y la 4 se hacen cuando haya vecinos que convertir.
