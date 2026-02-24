import { User, Unit, MarketplaceItem, ServiceRequest, VisitorLog, Package, ServiceProvider, Review, CommunityFinance, QRInvitation, Poll, PollOption, Vote, BuildingAsset, MaintenanceTask, MaintenanceLog, WaterReading, ConsumptionMetric } from './types';
import { MOCK_PROVIDERS, MOCK_REVIEWS } from './mockProviders';

// Mock Users
export const MOCK_USERS: User[] = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Admin Principal', email: 'admin@comunidad.cl', role: 'admin' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Juan Conserje', email: 'conserjeria@comunidad.cl', role: 'concierge' },
    { id: '33333333-3333-3333-3333-333333333333', name: 'Pedro Dueño', email: 'pedro@email.com', role: 'resident', unitId: '0198d8b2-7a4e-4836-b012-16e056012c7a' },
    { id: '44444444-4444-4444-4444-444444444444', name: 'Maria Arrendataria', email: 'maria@email.com', role: 'resident', unitId: '03edf6a0-6257-4938-826c-62ed327a0597' },
];

// Mock Units
export const MOCK_UNITS: Unit[] = [
    { id: 'u1', number: '101', floor: 1, tower: 'A', ownerId: '11111111-1111-1111-1111-111111111111' },
    { id: 'u2', number: '102', floor: 1, tower: 'A', tenantId: '22222222-2222-2222-2222-222222222222' },
];

// Mock Marketplace
export const MOCK_MARKETPLACE: MarketplaceItem[] = [
    {
        id: 'm1',
        title: 'Bicicleta de Montaña Trek',
        description: 'Bicicleta Trek Marlin 7, aro 29, frenos hidráulicos. Muy poco uso, como nueva.',
        price: 450000,
        sellerId: '33333333-3333-3333-3333-333333333333',
        category: 'other',
        imageUrl: 'https://images.unsplash.com/photo-1576435728678-68d0fbf94e91?q=80&w=1000&auto=format&fit=crop',
        createdAt: '2024-02-10T10:00:00Z',
        status: 'available',
        allowSale: true,
        allowBarter: true,
        barterDetails: 'Acepto Nintendo Switch o artículos Deportivos en parte de pago.',
    },
    {
        id: 'm2',
        title: 'Sofá Modular Gris',
        description: 'Sofá de 3 cuerpos más pouf. Tela ultra suave, ultra cómodo. Vendo por mudanza.',
        price: 280000,
        sellerId: '44444444-4444-4444-4444-444444444444',
        category: 'furniture',
        imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=1000&auto=format&fit=crop',
        createdAt: '2024-02-11T14:30:00Z',
        status: 'available',
        allowSale: true,
        allowSwap: true,
        swapDetails: 'Permuto por sofá cama de menor tamaño.',
    },
    {
        id: 'm3',
        title: 'MacBook Air M2 13"',
        description: '8GB RAM, 256GB SSD. Color medianoche. En su caja original, solo 6 meses de uso.',
        price: 950000,
        sellerId: '33333333-3333-3333-3333-333333333333',
        category: 'electronics',
        imageUrl: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?q=80&w=1000&auto=format&fit=crop',
        createdAt: '2024-02-12T09:15:00Z',
        status: 'available',
        allowSale: true,
        allowBarter: true,
        barterDetails: 'Acepto laptop gamer de menor valor + diferencia a mi favor.',
    },
    {
        id: 'm4',
        title: 'Lámpara de Pie Nórdica',
        description: 'Lámpara de diseño minimalista con detalles en madera. Incluye ampolleta inteligente.',
        price: 45000,
        sellerId: '44444444-4444-4444-4444-444444444444',
        category: 'furniture',
        imageUrl: 'https://images.unsplash.com/photo-1507473884658-cda0401202ae?q=80&w=1000&auto=format&fit=crop',
        createdAt: '2024-02-08T18:20:00Z',
        status: 'available',
        allowSale: true,
    },
    {
        id: 'm5',
        title: 'Consola Retro Anbernic',
        description: 'Portátil para emulación de consolas clásicas. Más de 1000 juegos incluidos.',
        price: 0,
        sellerId: '33333333-3333-3333-3333-333333333333',
        category: 'electronics',
        imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1000&auto=format&fit=crop',
        createdAt: '2024-02-13T11:00:00Z',
        status: 'available',
        allowSale: false,
        allowSwap: true,
        swapDetails: 'Solo permuto por juegos de PS5 o Xbox Series.',
    },
    {
        id: 'm6',
        title: 'Parka North Face Mujer',
        description: 'Talla M, color negro. Pluma 700, ideal para el invierno frío. Casi nueva.',
        price: 180000,
        sellerId: '44444444-4444-4444-4444-444444444444',
        category: 'clothing',
        imageUrl: 'https://images.unsplash.com/photo-1544923246-77307dd654ca?q=80&w=1000&auto=format&fit=crop',
        createdAt: '2024-02-05T15:45:00Z',
        status: 'available',
        allowSale: true,
        allowBarter: true,
        barterDetails: 'Abierto a escuchar ofertas de trueque interesantes.',
    }
];

// Export providers and reviews from mockProviders.ts
export { MOCK_PROVIDERS, MOCK_REVIEWS };


// Mock Service Requests
export const MOCK_REQUESTS: ServiceRequest[] = [
    {
        id: 'r1',
        requesterId: '33333333-3333-3333-3333-333333333333',
        providerId: 'provider-1',
        unitId: '101',
        serviceType: 'plumbing',
        description: 'Fuga de agua en el baño principal.',
        status: 'pending',
        createdAt: '2023-10-27T09:00:00Z',
    },
];

// Mock Visitor Log
export const MOCK_VISITORS: VisitorLog[] = [
    { id: 'v1', visitorName: 'Tía de Pedro', unitId: '101', entryTime: '2023-10-27T11:00:00Z' }
];

// Mock Packages
export const MOCK_PACKAGES: Package[] = [
    { id: 'pk1', recipientUnitId: '205', description: 'Caja Amazon', receivedAt: '2023-10-27T10:30:00Z', status: 'pending' }
];

// Mock Amenities
import { Amenity, Booking, Announcement, ExpenseRecord } from './types';

export const MOCK_AMENITIES: Amenity[] = [
    { id: 'a1', name: 'Quincho', description: 'Espacio con parrilla para 20 personas, incluye mobiliario y baño privado.', maxCapacity: 20, hourlyRate: 0, iconName: 'Flame', gradient: 'from-orange-500 to-red-600' },
    { id: 'a2', name: 'Piscina', description: 'Piscina temperada con vista panorámica. Horario: 8:00 - 22:00.', maxCapacity: 30, hourlyRate: 0, iconName: 'Waves', gradient: 'from-cyan-500 to-blue-600' },
    { id: 'a3', name: 'Sala de Eventos', description: 'Salón multiuso para reuniones y celebraciones.', maxCapacity: 50, hourlyRate: 15000, iconName: 'PartyPopper', gradient: 'from-purple-500 to-pink-600' },
    { id: 'a4', name: 'Gimnasio', description: 'Equipado con máquinas de cardio y pesas. 24/7.', maxCapacity: 15, hourlyRate: 0, iconName: 'Dumbbell', gradient: 'from-emerald-500 to-teal-600' },
    { id: 'a5', name: 'Cowork', description: 'Espacio de trabajo compartido con WiFi de alta velocidad.', maxCapacity: 10, hourlyRate: 0, iconName: 'Monitor', gradient: 'from-indigo-500 to-purple-600' },
    { id: 'a6', name: 'Sala de Juegos', description: 'Mesa de pool, ping-pong y futbolito.', maxCapacity: 12, hourlyRate: 0, iconName: 'Gamepad2', gradient: 'from-rose-500 to-orange-600' },
];

export const MOCK_BOOKINGS: Booking[] = [
    { id: 'b1', amenityId: 'a1', userId: '33333333-3333-3333-3333-333333333333', date: '2026-02-15', startTime: '18:00', endTime: '22:00', status: 'confirmed' },
    { id: 'b2', amenityId: 'a3', userId: '44444444-4444-4444-4444-444444444444', date: '2026-02-20', startTime: '10:00', endTime: '14:00', status: 'pending' },
];

export const MOCK_ANNOUNCEMENTS: Announcement[] = [
    { id: 'ann1', title: 'Mantención de Ascensores', content: 'Se informa que el día viernes 14 de febrero se realizará mantención preventiva de los ascensores entre las 09:00 y 13:00 hrs. Durante este período, los ascensores estarán fuera de servicio.', author: 'Administración', priority: 'alert', createdAt: '2026-02-08T10:00:00Z' },
    { id: 'ann2', title: 'Celebración Día de San Valentín', content: 'Los invitamos a la celebración comunitaria del Día de San Valentín que se realizará en la Sala de Eventos el 14 de febrero a las 19:00 hrs. Habrá música, comida y bebidas. ¡Esperamos verlos a todos!', author: 'Comité Social', priority: 'event', createdAt: '2026-02-07T15:30:00Z' },
    { id: 'ann3', title: 'Nuevo Horario de Gimnasio', content: 'A partir de marzo 2026, el gimnasio operará las 24 horas del día, los 7 días de la semana. Se requiere tarjeta de acceso para ingreso fuera de horario regular.', author: 'Administración', priority: 'info', createdAt: '2026-02-05T09:00:00Z' },
    { id: 'ann4', title: 'Corte de Agua Programado', content: 'El próximo lunes 17 de febrero habrá corte de agua potable desde las 10:00 hasta las 14:00 hrs por trabajos de la empresa sanitaria. Recomendamos almacenar agua.', author: 'Administración', priority: 'alert', createdAt: '2026-02-04T11:00:00Z' },
];

export const MOCK_EXPENSES: ExpenseRecord[] = [
    {
        id: 'e1',
        unitId: '101',
        month: '2026-02',
        amount: 85000,
        breakdown: [
            { category: 'water', label: 'Consumo Agua Individual', amount: 15000 },
            { category: 'electricity', label: 'Electricidad Áreas Comunes', amount: 8000 },
            { category: 'salaries', label: 'Sueldos y Previsión Personal', amount: 45000 },
            { category: 'maintenance', label: 'Mantención Ascensores', amount: 12000 },
            { category: 'other', label: 'Seguro Incendio', amount: 5000 },
        ],
        status: 'pending',
        dueDate: '2026-02-28'
    },
    {
        id: 'e2',
        unitId: '101',
        month: '2026-01',
        amount: 82000,
        breakdown: [
            { category: 'water', label: 'Consumo Agua Individual', amount: 12000 },
            { category: 'salaries', label: 'Sueldos Personal', amount: 45000 },
            { category: 'maintenance', label: 'Jardinería', amount: 10000 },
            { category: 'security', label: 'CCTV Mantención', amount: 15000 },
        ],
        status: 'paid',
        dueDate: '2026-01-31',
        paidAt: '2026-01-25'
    },
    {
        id: 'e6',
        unitId: '205',
        month: '2026-01',
        amount: 70000,
        breakdown: [
            { category: 'salaries', label: 'Sueldos Personal', amount: 45000 },
            { category: 'maintenance', label: 'Limpieza Piscina', amount: 25000 },
        ],
        status: 'overdue',
        dueDate: '2026-01-31'
    },
];

export const MOCK_FINANCES: CommunityFinance = {
    totalRevenue: 12450000,
    totalExpenses: 8900000,
    reserveFund: 45200000,
    collectionRate: 94.2,
    recentActivity: [
        { id: 'a1', type: 'income', title: 'Recaudación Depto 402', amount: 92000, date: '2026-02-12' },
        { id: 'a2', type: 'expense', title: 'Pago Enel - Áreas Comunes', amount: 1240500, date: '2026-02-11' },
        { id: 'a3', type: 'expense', title: 'Mantención Schindler Ascensores', amount: 850000, date: '2026-02-10' },
        { id: 'a4', type: 'income', title: 'Reserva Quincho Depto 105', amount: 15000, date: '2026-02-10' },
    ]
};

export const MOCK_INVITATIONS: QRInvitation[] = [
    {
        id: 'q1',
        residentId: '33333333-3333-3333-3333-333333333333',
        unitId: '101',
        guestName: 'Ana García',
        guestDni: '12.345.678-9',
        qrCode: 'INV-PRO-001-XYZ',
        validFrom: '2026-02-12T10:00:00Z',
        validTo: '2026-02-14T23:59:59Z',
        status: 'active',
        createdAt: '2026-02-12T09:00:00Z'
    },
    {
        id: 'q2',
        residentId: '33333333-3333-3333-3333-333333333333',
        unitId: '101',
        guestName: 'Roberto Soto',
        guestDni: '9.876.543-2',
        qrCode: 'INV-PRO-002-ABC',
        validFrom: '2026-01-10T10:00:00Z',
        validTo: '2026-01-10T23:59:59Z',
        status: 'expired',
        createdAt: '2026-01-09T08:00:00Z'
    }
];

export const MOCK_POLLS: Poll[] = [
    {
        id: 'p1',
        title: 'Nueva Pintura para Fachada',
        description: '¿Qué color prefiere para la renovación de la fachada exterior del edificio?',
        category: 'maintenance',
        status: 'active',
        endDate: '2026-02-28T23:59:59Z',
        createdAt: '2026-02-10T10:00:00Z',
        totalVotes: 45,
        options: [
            { id: 'o1', text: 'Gris Grafito', votes: 20 },
            { id: 'o2', text: 'Blanco Invierno', votes: 15 },
            { id: 'o3', text: 'Beige Arena', votes: 10 }
        ]
    },
    {
        id: 'p2',
        title: 'Horario de Uso de Piscina',
        description: 'Propuesta para extender el horario de la piscina hasta las 22:00 hrs los fines de semana.',
        category: 'rules',
        status: 'active',
        endDate: '2026-02-25T23:59:59Z',
        createdAt: '2026-02-12T08:00:00Z',
        totalVotes: 32,
        options: [
            { id: 'o4', text: 'A favor', votes: 25 },
            { id: 'o5', text: 'En contra', votes: 7 }
        ]
    }
];

export const MOCK_ASSETS: BuildingAsset[] = [
    {
        id: 'a1',
        name: 'Ascensor Principal Torre A',
        category: 'elevator',
        brand: 'Schindler',
        model: 'S5500',
        installationDate: '2022-05-15T00:00:00Z',
        location: 'Hall Central Torre A',
        healthStatus: 'optimal',
        lastMaintenance: '2026-01-15T10:00:00Z',
        nextMaintenance: '2026-02-15T10:00:00Z'
    },
    {
        id: 'a2',
        name: 'Bomba de Agua Impulsión 1',
        category: 'pump',
        brand: 'Wilo',
        model: 'Helix V',
        installationDate: '2022-03-10T00:00:00Z',
        location: 'Sala de Bombas Sub-2',
        healthStatus: 'warning',
        lastMaintenance: '2025-11-20T09:00:00Z',
        nextMaintenance: '2026-02-10T09:00:00Z'
    },
    {
        id: 'a3',
        name: 'Generador de Emergencia',
        category: 'generator',
        brand: 'Caterpillar',
        model: 'DE110',
        installationDate: '2021-12-01T00:00:00Z',
        location: 'Exterior Norte',
        healthStatus: 'critical',
        lastMaintenance: '2025-06-15T10:30:00Z',
        nextMaintenance: '2025-09-15T10:30:00Z'
    }
];

export const MOCK_MAINTENANCE_TASKS: MaintenanceTask[] = [
    {
        id: 't1',
        assetId: 'a1',
        title: 'Revisión Mensual de Seguridad',
        description: 'Certificación de cables de tracción y frenos de emergencia.',
        frequency: 'monthly',
        dueDate: '2026-02-15T23:59:59Z',
        priority: 'high',
        status: 'pending'
    },
    {
        id: 't2',
        assetId: 'a2',
        title: 'Cambio de Sellos Mecánicos',
        description: 'Mantenimiento preventivo por ruido en rodamiento.',
        frequency: 'quarterly',
        dueDate: '2026-02-10T23:59:59Z',
        priority: 'medium',
        status: 'overdue'
    },
    {
        id: 't3',
        assetId: 'a3',
        title: 'Prueba de Carga de Baterías',
        description: 'Verificación de arranque en frío y niveles de combustible.',
        frequency: 'monthly',
        dueDate: '2025-09-15T23:59:59Z',
        priority: 'high',
        status: 'overdue'
    }
];

export const MOCK_MAINTENANCE_LOGS: MaintenanceLog[] = [
    {
        id: 'l1',
        assetId: 'a1',
        performedBy: 'Elevadores Pro S.A.',
        description: 'Lubricación general y ajuste de puertas del piso 5.',
        cost: 150000,
        date: '2026-01-15T14:00:00Z'
    }
];

export const MOCK_WATER_READINGS: WaterReading[] = [
    {
        id: 'wr1',
        unit_id: 'u1',
        reading_value: 1255,
        reading_date: '2026-01-31',
        month: 'Enero',
        year: 2026,
        created_at: '2026-01-31T20:00:00Z',
        consumption: 15,
    },
    {
        id: 'wr2',
        unit_id: 'u1',
        reading_value: 1240,
        reading_date: '2025-12-31',
        month: 'Diciembre',
        year: 2025,
        created_at: '2025-12-31T20:00:00Z',
        consumption: 18,
    }
];

export const MOCK_WATER_METRICS: ConsumptionMetric[] = [
    { month: 'Ago', personal: 12, average: 14 },
    { month: 'Sep', personal: 15, average: 14 },
    { month: 'Oct', personal: 18, average: 15 },
    { month: 'Nov', personal: 14, average: 15 },
    { month: 'Dic', personal: 18, average: 16 },
    { month: 'Ene', personal: 15, average: 17 }
];
