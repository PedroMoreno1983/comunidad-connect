-- Confidencialidad de las conversaciones con CoCo (17-11-2026).
--
-- El aviso de privacidad de CoCo se acepta en el chat o por WhatsApp: la tabla
-- de evidencia acepta esos dos canales. La administración no recibe nada de las
-- conversaciones de los residentes (se resuelve en el código, sin interruptor).

DO $$
DECLARE c text;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.privacy_consent_events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%channel%'
    LOOP
        EXECUTE format('ALTER TABLE public.privacy_consent_events DROP CONSTRAINT %I', c);
    END LOOP;
END $$;

ALTER TABLE public.privacy_consent_events
    ADD CONSTRAINT privacy_consent_events_channel_check
    CHECK (channel IN ('signup', 'profile', 'privacy_center', 'admin_onboarding', 'chat', 'whatsapp'));

-- La administración no tiene acceso a lo que los residentes hacen con CoCo, ni
-- siquiera consultando la base directamente. Las pantallas ya filtran; aquí se
-- cierra también en RLS. El personal (admin, conserjería, superadmin) y el
-- sistema siguen viendo lo suyo. CoCo escribe con service_role (sin RLS).

CREATE OR REPLACE FUNCTION public.is_staff_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_profile_id AND role IN ('admin', 'concierge', 'superadmin')
    );
$$;
REVOKE ALL ON FUNCTION public.is_staff_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_profile(uuid) TO authenticated, service_role;

-- Bitácora: las acciones de CoCo hechas para un residente quedan fuera.
DROP POLICY IF EXISTS "Admins can read own community operation events" ON public.operation_events;
CREATE POLICY "Admins can read own community operation events" ON public.operation_events
    FOR SELECT USING (
        community_id = public.get_my_community_id()
        AND public.get_my_role() = 'admin'
        AND (action NOT LIKE 'coco.%' OR actor_role IS NULL OR actor_role IN ('admin', 'concierge', 'superadmin'))
    );

-- Consumo de IA: la administración ve el del personal, no quién de los residentes usó CoCo.
DROP POLICY IF EXISTS "ai_usage_admin_read" ON public.ai_usage_events;
CREATE POLICY "ai_usage_admin_read" ON public.ai_usage_events
    FOR SELECT USING (
        community_id = public.current_profile_community_id()
        AND public.current_profile_role() = 'admin'
        AND (user_id IS NULL OR public.is_staff_profile(user_id))
    );

-- Tareas del Agent Center: las que creó un residente (su recordatorio personal) no.
DROP POLICY IF EXISTS "agent_tasks_tenant_select" ON public.agent_tasks;
CREATE POLICY "agent_tasks_tenant_select" ON public.agent_tasks
    FOR SELECT USING (
        community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        AND (created_by IS NULL OR public.is_staff_profile(created_by))
    );
DROP POLICY IF EXISTS "agent_tasks_admin_write" ON public.agent_tasks;
CREATE POLICY "agent_tasks_admin_write" ON public.agent_tasks
    USING (
        community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        AND (created_by IS NULL OR public.is_staff_profile(created_by))
    )
    WITH CHECK (
        community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Reglas: el recordatorio personal de un residente (con su texto) no es de la administración.
DROP POLICY IF EXISTS "agent_trigger_rules_admin" ON public.agent_trigger_rules;
CREATE POLICY "agent_trigger_rules_admin" ON public.agent_trigger_rules
    USING (
        community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        AND (signal_key <> 'coco_reminder' OR created_by IS NULL OR public.is_staff_profile(created_by))
    )
    WITH CHECK (
        community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
