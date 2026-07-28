import { redirect } from "next/navigation";

// Votaciones unificadas: la gestión de votaciones ahora vive en /votaciones,
// que detecta el rol admin y muestra el PollManager. Esta ruta se conserva como
// redirect para no romper enlaces antiguos.
export default function AdminVotacionesPage() {
    redirect("/votaciones");
}
