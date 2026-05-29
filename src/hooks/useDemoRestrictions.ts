import { useAuth } from "@/lib/authContext";
import { isDemoEmail, isDemoModeEnabled } from "@/lib/runtimeMode";

export function useDemoRestrictions() {
    const { user } = useAuth();
    const isDemoUser = isDemoModeEnabled() && isDemoEmail(user?.email);

    return {
        isDemoUser,
        demoMessage: "Estás en un showcase compartido. Las acciones destructivas y envíos reales están deshabilitados para proteger el entorno comercial.",
    };
}
