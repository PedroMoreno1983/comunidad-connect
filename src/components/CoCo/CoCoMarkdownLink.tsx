"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSafeCoCoNavigation } from "@/lib/coco/navigation";

/**
 * Enlace dentro de una respuesta de CoCo.
 *
 * Un enlace interno ("/expenses") navega en la misma pestaña, pero solo si la
 * ruta está en la lista blanca de CoCo: el texto del modelo puede traer
 * contenido de terceros (avisos, perfiles), así que una ruta desconocida se
 * muestra como texto plano. Los enlaces externos abren en otra pestaña.
 */
export function CoCoMarkdownLink({ href, children, className }: { href?: string; children?: ReactNode; className: string }) {
    const router = useRouter();

    if (href?.startsWith("/") && !href.startsWith("//")) {
        const path = href.split(/[?#]/)[0];
        const safe = getSafeCoCoNavigation(path);
        if (!safe) return <span>{children}</span>;
        return (
            <a
                href={href}
                onClick={event => {
                    event.preventDefault();
                    router.push(href);
                }}
                className={className}
            >
                {children}
            </a>
        );
    }

    if (!href || !/^(https?:\/\/|mailto:)/i.test(href)) return <span>{children}</span>;
    return (
        <a href={href} target="_blank" rel="noreferrer" className={className}>
            {children}
        </a>
    );
}
