/**
 * Barrel de servicios de datos del cliente.
 *
 * La implementación vive en `src/lib/services/*`. Este archivo solo reexporta
 * para que `import { X } from "@/lib/api"` siga funcionando en los consumidores
 * existentes. Ver docs/deuda-arquitectonica.md.
 */

export { AdminDashboardService } from './services/admin-dashboard';
export { AdminFinanceService } from './services/admin-finance';
export { AdminUsersService } from './services/admin-users';
export { AmenitiesService } from './services/amenities';
export { AnnouncementsService } from './services/announcements';
export { CocoCasesService } from './services/coco-cases';
export { CommercialService } from './services/commercial';
export { CommunityCollaborationService } from './services/community-collaboration';
export { DirectoryService } from './services/directory';
export { ExpensesService } from './services/expenses';
export { HomeService } from './services/home';
export { MaintenanceService } from './services/maintenance';
export { MarketplaceMessagingService } from './services/marketplace';
export { MarketplaceService } from './services/marketplace';
export { NavigationService } from './services/navigation';
export { ParkingService } from './services/parking';
export { PollsService } from './services/polls';
export { ProductCapabilitiesService } from './services/product-capabilities';
export { ProfileService } from './services/profile';
export { SupermarketGroupService } from './services/supermarket-group';
export { WaterService } from './services/water';
