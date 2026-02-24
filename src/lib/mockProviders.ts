import { ServiceProvider, Review } from './types';

// ============================================
// ENHANCED SERVICE PROVIDERS
// ============================================

export const MOCK_PROVIDERS: ServiceProvider[] = [
    // PLUMBING (Gasfitería)
    {
        id: 'provider-1',
        name: 'Juan Carlos Pérez',
        category: 'plumbing',
        rating: 4.9,
        reviewCount: 47,
        contactPhone: '+56 9 8765 4321',
        email: 'jc.perez@proveedores.cl',
        photo: 'https://i.pravatar.cc/200?img=12',
        bio: 'Maestro gasfiter con más de 15 años de experiencia. Especializado en reparaciones urgentes y sistemas de calefacción. Atención rápida y garantía en todos mis trabajos.',
        yearsExperience: 15,
        specialties: [
            'Reparación de cañerías',
            'Instalación de calefones',
            'Destape de alcantarillado',
            'Sistemas de calefacción',
            'Instalación de lavadoras'
        ],
        certifications: [
            'Certificación SEC Clase A',
            'Instalador Autorizado Rheem',
            'Técnico en Sistemas de Calefacción'
        ],
        hourlyRate: 15000,
        availability: 'available',
        responseTime: '< 2 horas',
        completedJobs: 234,
        verified: true
    },
    {
        id: 'provider-2',
        name: 'María Fernanda Lagos',
        category: 'plumbing',
        rating: 4.8,
        reviewCount: 52,
        contactPhone: '+56 9 7654 3210',
        email: 'mf.lagos@gmail.com',
        photo: 'https://i.pravatar.cc/200?img=47',
        bio: 'Gasfiter profesional con enfoque en instalaciones nuevas y remodelaciones. Me apasiona mi trabajo y siempre busco la mejor solución para mis clientes.',
        yearsExperience: 12,
        specialties: [
            'Instalaciones sanitarias completas',
            'Remodelaciones de baños',
            'Sistemas de agua caliente',
            'Filtradores de agua',
            'Reparaciones de emergencia'
        ],
        certifications: [
            'Certificación SEC',
            'Instaladora Autorizada ESVAL',
            'Curso Avanzado de Plomería'
        ],
        hourlyRate: 18000,
        availability: 'available',
        responseTime: '< 3 horas',
        completedJobs: 198,
        verified: true
    },
    {
        id: 'provider-3',
        name: 'Roberto Silva',
        category: 'plumbing',
        rating: 4.6,
        reviewCount: 31,
        contactPhone: '+56 9 6543 2109',
        email: 'r.silva.gasfiter@outlook.com',
        photo: 'https://i.pravatar.cc/200?img=33',
        bio: 'Gasfiter con experiencia en proyectos residenciales y comerciales. Trabajo honesto y precios justos.',
        yearsExperience: 8,
        specialties: [
            'Mantención preventiva',
            'Reparación de goteras',
            'Instalación de griferías',
            'Cambio de WC y lavamanos'
        ],
        certifications: [
            'Certificación SEC Clase B'
        ],
        hourlyRate: 12000,
        availability: 'busy',
        responseTime: '< 4 horas',
        completedJobs: 87,
        verified: false
    },

    // ELECTRICAL (Electricidad)
    {
        id: 'provider-4',
        name: 'Carlos Andrés Muñoz',
        category: 'electrical',
        rating: 4.9,
        reviewCount: 63,
        contactPhone: '+56 9 5432 1098',
        email: 'ca.munoz.electricista@gmail.com',
        photo: 'https://i.pravatar.cc/200?img=51',
        bio: 'Electricista certificado SEC con amplia experiencia en instalaciones residenciales e industriales. Especializado en automatización del hogar y sistemas de ahorro energético.',
        yearsExperience: 18,
        specialties: [
            'Instalaciones eléctricas completas',
            'Automatización del hogar',
            'Paneles solares',
            'Sistemas de emergencia',
            'Certificaciones SEC',
            'Detección de fallas eléctricas'
        ],
        certifications: [
            'Electricista Autorizado SEC Clase A',
            'Instalador de Paneles Solares',
            'Técnico en Domótica',
            'Certificación en Baja y Media Tensión'
        ],
        hourlyRate: 20000,
        availability: 'available',
        responseTime: '< 1 hora',
        completedJobs: 312,
        verified: true
    },
    {
        id: 'provider-5',
        name: 'Patricia Rojas',
        category: 'electrical',
        rating: 4.7,
        reviewCount: 38,
        contactPhone: '+56 9 4321 0987',
        email: 'p.rojas.electric@yahoo.com',
        photo: 'https://i.pravatar.cc/200?img=45',
        bio: 'Electricista con enfoque en eficiencia energética y seguridad. Amplia experiencia en reparaciones y mejoras del hogar.',
        yearsExperience: 10,
        specialties: [
            'Reparación de cortocircuitos',
            'Instalación de luminarias',
            'Tableros eléctricos',
            'Enchufes y switches',
            'Iluminación LED'
        ],
        certifications: [
            'Electricista SEC Clase B',
            'Curso de Eficiencia Energética'
        ],
        hourlyRate: 16000,
        availability: 'available',
        responseTime: '< 2 horas',
        completedJobs: 145,
        verified: true
    },
    {
        id: 'provider-6',
        name: 'Diego Torres',
        category: 'electrical',
        rating: 4.5,
        reviewCount: 22,
        contactPhone: '+56 9 3210 9876',
        email: 'diego.torres.elec@hotmail.com',
        photo: 'https://i.pravatar.cc/200?img=68',
        bio: 'Electricista joven y dinámico. Me especializo en reparaciones rápidas y emergencias eléctricas.',
        yearsExperience: 5,
        specialties: [
            'Emergencias eléctricas',
            'Reparación de fallas',
            'Instalación de interruptores',
            'Conexión de electrodomésticos'
        ],
        certifications: [
            'Electricista SEC Clase C'
        ],
        hourlyRate: 14000,
        availability: 'available',
        responseTime: '< 30 minutos',
        completedJobs: 56,
        verified: false
    },

    // LOCKSMITH (Cerrajería)
    {
        id: 'provider-7',
        name: 'Sergio Vásquez',
        category: 'locksmith',
        rating: 4.8,
        reviewCount: 41,
        contactPhone: '+56 9 2109 8765',
        email: 's.vasquez.cerrajero@gmail.com',
        photo: 'https://i.pravatar.cc/200?img=56',
        bio: 'Maestro cerrajero con 20 años de experiencia. Atención 24/7 para emergencias. Especializado en cerraduras de alta seguridad y sistemas de acceso.',
        yearsExperience: 20,
        specialties: [
            'Apertura de puertas sin daño',
            'Instalación de cerraduras de seguridad',
            'Duplicado de llaves',
            'Cerraduras electrónicas',
            'Cajas fuertes',
            'Control de acceso'
        ],
        certifications: [
            'Cerrajero Profesional Certificado',
            'Instalador de Sistemas de Seguridad',
            'Técnico en Cerraduras Electrónicas'
        ],
        hourlyRate: 17000,
        availability: 'available',
        responseTime: '< 45 minutos',
        completedJobs: 267,
        verified: true
    },
    {
        id: 'provider-8',
        name: 'Andrea Castillo',
        category: 'locksmith',
        rating: 4.7,
        reviewCount: 29,
        contactPhone: '+56 9 1098 7654',
        email: 'a.castillo.locks@outlook.com',
        photo: 'https://i.pravatar.cc/200?img=44',
        bio: 'Cerrajera especializada en instalaciones residenciales. Trabajo rápido y limpio, con garantía en todos los servicios.',
        yearsExperience: 8,
        specialties: [
            'Cambio de combinaciones',
            'Instalación de chapas',
            'Mantenimiento de cerraduras',
            'Llaves codificadas',
            'Cerraduras antibumping'
        ],
        certifications: [
            'Cerrajera Certificada',
            'Curso de Cerraduras de Alta Seguridad'
        ],
        hourlyRate: 15000,
        availability: 'busy',
        responseTime: '< 1 hora',
        completedJobs: 112,
        verified: true
    },
    {
        id: 'provider-9',
        name: 'Francisco Morales',
        category: 'locksmith',
        rating: 4.6,
        reviewCount: 18,
        contactPhone: '+56 9 0987 6543',
        email: 'f.morales.cerrajeria@gmail.com',
        photo: 'https://i.pravatar.cc/200?img=15',
        bio: 'Cerrajero con experiencia en todo tipo de cerraduras. Servicio rápido y precios accesibles.',
        yearsExperience: 6,
        specialties: [
            'Apertura de emergencia',
            'Duplicado de llaves',
            'Instalación de cerraduras básicas',
            'Reparación de picaportes'
        ],
        certifications: [
            'Cerrajero Básico'
        ],
        hourlyRate: 12000,
        availability: 'available',
        responseTime: '< 1 hora',
        completedJobs: 73,
        verified: false
    }
];

// ============================================
// REVIEWS
// ============================================

export const MOCK_REVIEWS: Review[] = [
    // Reviews for Juan Carlos Pérez (provider-1)
    {
        id: 'review-1',
        providerId: 'provider-1',
        userId: 'user-1',
        userName: 'Carmen González',
        userAvatar: 'https://i.pravatar.cc/100?img=5',
        rating: 5,
        comment: 'Excelente profesional! Llegó rápido y solucionó el problema del calefón en menos de una hora. Muy recomendado.',
        createdAt: '2026-02-05T14:30:00Z',
        serviceType: 'Instalación de calefón'
    },
    {
        id: 'review-2',
        providerId: 'provider-1',
        userId: 'user-2',
        userName: 'Pedro Sánchez',
        rating: 5,
        comment: 'Juan Carlos es muy profesional y honesto. Explicó todo el trabajo antes de empezar y dejó todo impecable.',
        createdAt: '2026-01-28T10:15:00Z',
        serviceType: 'Reparación de cañería'
    },
    {
        id: 'review-3',
        providerId: 'provider-1',
        userId: 'user-3',
        userName: 'Lucía Martínez',
        userAvatar: 'https://i.pravatar.cc/100?img=9',
        rating: 5,
        comment: 'Súper rápido y eficiente. Solucionó una fuga de agua que otros no pudieron. 100% recomendado.',
        createdAt: '2026-01-20T16:45:00Z',
        serviceType: 'Destape urgencia'
    },

    // Reviews for María Fernanda Lagos (provider-2)
    {
        id: 'review-4',
        providerId: 'provider-2',
        userId: 'user-4',
        userName: 'Roberto Díaz',
        rating: 5,
        comment: 'María es excepcional. Hizo la remodelación completa de nuestro baño y quedó perfecto. Súper profesional.',
        createdAt: '2026-02-01T11:20:00Z',
        serviceType: 'Remodelación de baño'
    },
    {
        id: 'review-5',
        providerId: 'provider-2',
        userId: 'user-5',
        userName: 'Ana Vargas',
        userAvatar: 'https://i.pravatar.cc/100?img=26',
        rating: 4,
        comment: 'Muy buen trabajo, aunque se demoró un poco más de lo estimado. Pero el resultado final es excelente.',
        createdAt: '2026-01-15T14:00:00Z',
        serviceType: 'Instalación sanitaria'
    },

    // Reviews for Carlos Andrés Muñoz (provider-4)
    {
        id: 'review-6',
        providerId: 'provider-4',
        userId: 'user-6',
        userName: 'Jorge Ramírez',
        rating: 5,
        comment: 'El mejor electricista que he contratado. Instaló todo el sistema de domótica en mi casa. Impecable.',
        createdAt: '2026-02-03T09:30:00Z',
        serviceType: 'Automatización del hogar'
    },
    {
        id: 'review-7',
        providerId: 'provider-4',
        userId: 'user-7',
        userName: 'Daniela Herrera',
        userAvatar: 'https://i.pravatar.cc/100?img=31',
        rating: 5,
        comment: 'Carlos resolvió un problema eléctrico que nadie más pudo. Muy profesional y con todos los permisos al día.',
        createdAt: '2026-01-25T15:20:00Z',
        serviceType: 'Detección de fallas'
    },

    // Reviews for Sergio Vásquez (provider-7)
    {
        id: 'review-8',
        providerId: 'provider-7',
        userId: 'user-8',
        userName: 'Mónica Torres',
        rating: 5,
        comment: 'Servicio de emergencia excelente. Llegó en 30 minutos y abrió la puerta sin ningún daño. Súper recomendado!',
        createdAt: '2026-02-07T22:15:00Z',
        serviceType: 'Apertura de emergencia'
    },
    {
        id: 'review-9',
        providerId: 'provider-7',
        userId: 'user-9',
        userName: 'Felipe Castro',
        rating: 5,
        comment: 'Instaló cerraduras de alta seguridad en toda la casa. Trabajo impecable y muy buen asesoramiento.',
        createdAt: '2026-01-30T10:45:00Z',
        serviceType: 'Instalación de cerraduras'
    }
];
