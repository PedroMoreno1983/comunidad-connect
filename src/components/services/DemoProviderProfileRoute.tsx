"use client";

import Link from "next/link";
import { Briefcase } from "lucide-react";
import { ProviderProfileClient } from "@/components/services/ProviderProfileClient";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { getDemoCreatedProviders } from "@/lib/services/demoProvidersStorage";

export function DemoProviderProfileRoute({ providerId }: { providerId: string }) {
    const provider = getDemoCreatedProviders().find(item => item.id === providerId);

    if (!provider) {
        return (
            <EmptyState
                icon={<Briefcase className="h-6 w-6" />}
                title="Proveedor demo no encontrado"
                description="El perfil pudo haber sido creado en otro navegador o se limpio la sesion local."
                action={
                    <Link href="/services/register">
                        <Button>Registrar proveedor</Button>
                    </Link>
                }
            />
        );
    }

    return <ProviderProfileClient provider={provider} reviews={[]} />;
}
