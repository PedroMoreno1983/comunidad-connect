import { redirect } from "next/navigation";

// Marketplace unificado: la vista de administración (moderación) ahora vive en
// /marketplace, que detecta el rol admin. Esta ruta se conserva como redirect
// para no romper enlaces antiguos.
export default function AdminMarketplacePage() {
    redirect("/marketplace");
}
