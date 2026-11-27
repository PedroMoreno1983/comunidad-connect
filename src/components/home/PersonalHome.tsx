import Link from "next/link";
import { ArrowRight, Store, Zap } from "lucide-react";
import { DisplayHeading } from "@/components/cc/Eyebrow";

const features = [
    { href: "/resident/servicios", name: "Cuentas", icon: Zap, description: "Organiza tus cuentas de luz, agua, gas, internet, TAG y celular." },
    { href: "/resident/supermercado", name: "Supermercado", icon: Store, description: "Arma tu lista de compras y compara precios." },
];

export function PersonalHome() {
    return (
        <section className="mx-auto max-w-4xl space-y-6">
            <DisplayHeading size={36}>Inicio</DisplayHeading>
            <div className="grid gap-4 sm:grid-cols-2">
                {features.map(({ href, name, icon: Icon, description }) => (
                    <Link key={href} href={href} className="rounded-2xl border p-5 transition-colors hover:bg-paper-warm"
                        style={{ borderColor: "var(--cc-line)", backgroundColor: "var(--cc-paper)" }}>
                        <div className="flex items-center gap-3">
                            <Icon size={21} style={{ color: "var(--cc-copper)" }} aria-hidden="true" />
                            <h2 className="flex-1 text-lg font-semibold cc-text-primary">{name}</h2>
                            <ArrowRight size={16} aria-hidden="true" />
                        </div>
                        <p className="mt-2 text-sm cc-text-secondary">{description}</p>
                    </Link>
                ))}
            </div>
            <p className="text-sm cc-text-secondary">
                <Link href="/bienvenida" className="font-semibold underline">Vincular mi comunidad</Link>
                {" "}para acceder a los servicios de tu condominio.
            </p>
        </section>
    );
}
