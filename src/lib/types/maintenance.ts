import type { CommunityDealPriceUnit } from './amenities';
import type { CocoCase, CocoCaseEvent } from './coco';
import type { ServiceRequestQueueItem } from './providers';

export interface NeighborMediationCase {
  id: string;
  reporterId: string;
  reporterName: string;
  communityId?: string;
  targetUnit: string;
  observation: string;
  feeling: string;
  need: string;
  request: string;
  draftedMessage: string;
  status: 'drafted' | 'sent' | 'agreement' | 'escalated';
  createdAt: string;
}

export interface BuildingAsset {
  id: string;
  name: string;
  category: 'elevator' | 'pump' | 'generator' | 'pool' | 'electrical' | 'fire' | 'other';
  brand: string;
  model: string;
  installationDate: string;
  location: string;
  healthStatus: 'optimal' | 'warning' | 'critical';
  lastMaintenance: string;
  nextMaintenance: string;
}

export interface MaintenanceTask {
  id: string;
  assetId: string;
  title: string;
  description: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually';
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
}

export interface MaintenanceLog {
  id: string;
  assetId: string;
  taskId?: string;
  performedBy: string;
  description: string;
  cost: number;
  date: string;
  attachments?: string[];
}

export interface MaintenanceServiceRow {
  id: string;
  user_id?: string | null;
  service_type?: string | null;
  category?: string | null;
  description?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  preferred_date?: string | null;
  created_at?: string | null;
}

export interface ResidentCasesSummary {
  cases: CocoCase[];
  eventsByCase: Record<string, CocoCaseEvent[]>;
}

export interface MaintenanceAdminOverview {
  services: MaintenanceServiceRow[];
  cases: CocoCase[];
  assets: BuildingAsset[];
  logs: MaintenanceLog[];
}

export interface MaintenanceDashboardData extends MaintenanceAdminOverview {
  tasks: MaintenanceTask[];
  serviceRequests: ServiceRequestQueueItem[];
}

export interface WaterReading {
  id: string;
  unit_id: string;
  reading_value: number;
  reading_date: string;
  month: string;
  year: number;
  created_at: string;
  created_by?: string;

  // Computed frontend fields (optional)
  consumption?: number;
}

export interface ConsumptionMetric {
  month: string;
  personal: number;
  average: number;
}

export interface CommunityDealQuote {
  id: string;
  dealId: string;
  providerName: string;
  contact: string;
  offer: string;
  price: number | null;
  priceUnit: CommunityDealPriceUnit;
  createdAt: string;
}

export interface CommunityDealQuoteInput {
  providerName: string;
  contact?: string;
  offer?: string;
  price?: number | null;
  priceUnit?: CommunityDealPriceUnit;
}
