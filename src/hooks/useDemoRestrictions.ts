import { useAuth } from "@/lib/authContext";

export function useDemoRestrictions() {
    const { user } = useAuth();

    // Comprueba si el email termina en @demo.com
    const isDemoUser = user?.email?.toLowerCase().endsWith('@demo.com') ?? false;

    return {
        isDemoUser,
        demoMessage: "Estás en una cuenta Demo compartida. Las funciones destructivas y envíos reales están deshabilitados para proteger la demostración."
    };
}
