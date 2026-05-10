import { providersService } from "@/lib/services/providersService";
import { ServiceProvider } from "@/lib/types";
import { ServicesCatalogClient } from "@/components/services/ServicesCatalogClient";

const CATEGORIES: { id: ServiceProvider['category']; name: string; iconName: 'wrench' | 'zap' | 'key' | 'cleaning' | 'toolbox'; gradient: string; description: string }[] = [
    {
        id: 'plumbing',
        name: 'Gasfiteria',
        iconName: 'wrench',
        gradient: 'from-blue-500 to-cyan-600',
        description: 'Fugas, griferia, flexibles y mantencion preventiva'
    },
    {
        id: 'electrical',
        name: 'Electricidad',
        iconName: 'zap',
        gradient: 'from-yellow-500 to-orange-600',
        description: 'Tableros, enchufes, luminarias y certificaciones'
    },
    {
        id: 'locksmith',
        name: 'Cerrajeria',
        iconName: 'key',
        gradient: 'from-purple-500 to-pink-600',
        description: 'Aperturas, cambios de chapa y control de accesos'
    },
    {
        id: 'cleaning',
        name: 'Limpieza',
        iconName: 'cleaning',
        gradient: 'from-[#10B981] to-[#0D9488]',
        description: 'Aseo profundo, post mudanza y espacios comunes'
    },
    {
        id: 'general',
        name: 'Multiservicios',
        iconName: 'toolbox',
        gradient: 'from-orange-500 to-red-600',
        description: 'Reparaciones menores y mantencion del hogar'
    }
];

export default async function ServicesPage() {
    const allProviders = await providersService.getAll();
    const categoryCounts = CATEGORIES.map(category => ({
        ...category,
        count: allProviders.filter(provider => provider.category === category.id).length
    }));

    return <ServicesCatalogClient categories={categoryCounts} providers={allProviders} />;
}
