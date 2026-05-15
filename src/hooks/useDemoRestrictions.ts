import { useAuth } from "@/lib/authContext";
import { isDemoEmail, isDemoModeEnabled } from "@/lib/runtimeMode";

export function useDemoRestrictions() {
    const { user } = useAuth();
    const isDemoUser = isDemoModeEnabled() && isDemoEmail(user?.email);

    return {
        isDemoUser,
        demoMessage: "Estas en una cuenta demo compartida. Las funciones destructivas y envios reales estan deshabilitados para proteger la demostracion.",
    };
}
