import { providersService } from "@/lib/services/providersService";
import { ServiceCategoryCard } from "@/components/services/ServiceCategoryCard";
import { ProviderCard } from "@/components/services/ProviderCard";
import { Search } from "lucide-react";
import Link from "next/link";

const CATEGORIES = [
    {
        id: 'plumbing',
        name: 'Gasfitería',
        iconName: 'wrench' as const,
        gradient: 'from-blue-500 to-cyan-600',
        description: 'Expertos en instalaciones y reparaciones de agua'
    },
    {
        id: 'electrical',
        name: 'Electricidad',
        iconName: 'zap' as const,
        gradient: 'from-yellow-500 to-orange-600',
        description: 'Electricistas certificados para tu hogar'
    },
    {
        id: 'locksmith',
        name: 'Cerrajería',
        iconName: 'key' as const,
        gradient: 'from-purple-500 to-pink-600',
        description: 'Servicios de cerrajería 24/7'
    }
];

export default async function ServicesPage() {
    // Fetch all providers to get counts per category
    const allProviders = await providersService.getAll();

    // Fetch featured providers
    const featuredProviders = await providersService.getFeatured(6);

    // Calculate provider count per category
    const categoryCounts = CATEGORIES.map(cat => ({
        ...cat,
        count: allProviders.filter(p => p.category === cat.id).length
    }));

    return (
        <div className="max-w-7xl space-y-8">
            {/* Header */}
            <div className="text-center max-w-3xl mx-auto">
                <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
                    Encuentra el Técnico Perfecto
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-300">
                    Conecta con profesionales verificados de confianza en tu comunidad
                </p>
            </div>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-3xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar técnicos por nombre o especialidad..."
                        className="w-full pl-12 pr-4 py-4 rounded-3xl border border-white/50 dark:border-slate-700/50 bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 shadow-xl shadow-slate-200/20 dark:shadow-black/40 transition-all"
                    />
                </div>
            </div>

            {/* Categories Grid */}
            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
                    Categorías de Servicio
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {categoryCounts.map((category) => (
                        <ServiceCategoryCard
                            key={category.id}
                            category={category}
                        />
                    ))}
                </div>
            </div>

            {/* Featured Providers */}
            {featuredProviders.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                            Técnicos Destacados
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Los mejor calificados de la semana
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {featuredProviders.map((provider, idx) => (
                            <div
                                key={provider.id}
                                className="animate-slide-up opacity-0 relative group"
                                style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'forwards' }}
                            >
                                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-3xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                                <div className="relative h-full">
                                    <ProviderCard provider={provider} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* CTA for Providers */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-cyan-700 dark:from-blue-900/80 dark:to-cyan-900/80 backdrop-blur-xl rounded-3xl p-8 md:p-12 text-center text-white shadow-2xl border border-blue-400/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                <div className="relative z-10">
                    <h2 className="text-3xl font-bold mb-4">
                        ¿Eres un Técnico Profesional?
                    </h2>
                    <p className="text-lg text-blue-100 dark:text-blue-200 mb-8 max-w-2xl mx-auto">
                        Únete a nuestra red de profesionales verificados y conecta con clientes en tu comunidad
                    </p>
                    <Link
                        href="/services/register"
                        className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-colors shadow-xl shadow-blue-950/20 hover:scale-105 active:scale-95 duration-200"
                    >
                        Registrarse como Técnico
                    </Link>
                </div>
            </div>
        </div>
    );
}
