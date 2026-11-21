import type { NetworkProviderRow } from './providers';
import type { CommunitySubscriptionStatus } from './users';

export type ReelAudience = 'administrators' | 'committee' | 'residents' | 'property_managers';

export type ReelTone = 'premium' | 'urgent' | 'warm' | 'educational';

export interface ReelAgentInput {
  objective: string;
  audience: ReelAudience;
  tone: ReelTone;
  durationSeconds: number;
  featureFocus: string;
  proofPoint?: string;
  offer?: string;
  callToAction?: string;
}

export interface ReelScene {
  time: string;
  visual: string;
  onScreenText: string;
  voiceOver: string;
  productionNote: string;
}

export interface ReelCreativePackage {
  id: string;
  title: string;
  angle: string;
  hook: string;
  audienceLabel: string;
  durationSeconds: number;
  coverText: string;
  scenes: ReelScene[];
  caption: string;
  hashtags: string[];
  audioDirection: string;
  productionChecklist: string[];
  editingPrompt: string;
  createdAt: string;
  modelSource: 'anthropic' | 'template';
}

export type MarketingReelStatus =
  | 'draft'
  | 'generated'
  | 'rendering'
  | 'rendered'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'blocked'
  | 'failed';

export type MarketingCampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

export type InstagramConnectionStatus = 'not_connected' | 'connected' | 'needs_reauth' | 'disabled';

export interface ReelRenderSpec {
  format: 'vertical_9_16';
  width: number;
  height: number;
  durationSeconds: number;
  brand: {
    name: string;
    domain: string;
    primaryColor: string;
    backgroundColor: string;
  };
  scenes: Array<ReelScene & { index: number }>;
  caption: string;
  hashtags: string[];
}

export interface MarketingCampaign {
  id: string;
  title: string;
  objective: string;
  audience: ReelAudience;
  tone: ReelTone;
  status: MarketingCampaignStatus;
  createdAt: string;
  updatedAt?: string | null;
}

export interface InstagramConnectionSummary {
  status: InstagramConnectionStatus;
  username?: string | null;
  instagramUserId?: string | null;
  pageId?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
}

export interface MarketingReelRecord {
  id: string;
  campaignId?: string | null;
  title: string;
  objective: string;
  audience: ReelAudience;
  tone: ReelTone;
  durationSeconds: number;
  featureFocus: string;
  status: MarketingReelStatus;
  creativePackage: ReelCreativePackage;
  renderSpec: ReelRenderSpec;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  caption: string;
  hashtags: string[];
  scheduledAt?: string | null;
  publishedAt?: string | null;
  instagramMediaId?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export type CommercialLeadSource =
  | 'landing_contact'
  | 'commercial_tour'
  | 'onboarding_preactivation';

export type CommercialLeadStatus =
  | 'received'
  | 'notified'
  | 'delivery_pending'
  | 'contacted'
  | 'closed';

export interface CommercialLeadRequest {
  adminName: string;
  adminEmail: string;
  condoName?: string;
  message?: string;
  source: CommercialLeadSource;
  website?: string;
}

export interface CommercialLeadResponse {
  ok: boolean;
  leadId?: string;
  emailSent: boolean;
  teamNotified: boolean;
  status: CommercialLeadStatus;
  message: string;
  error?: string;
}

export interface CommercialLeadFormProps {
  source: CommercialLeadSource;
}

export interface ContactAdminModalProps {
  onClose: () => void;
}

export interface SuperAdminPricingTier {
  id: string;
  name: string;
  price_per_unit: number;
  base_price: number;
  features: Record<string, boolean>;
}

export interface SuperAdminCommunity {
  id: string;
  name: string;
  address: string;
  tier_id: string;
  subscription_status: CommunitySubscriptionStatus;
  admin_code: string;
  resident_code: string;
  created_at: string;
}

export interface SuperAdminCommercialLead {
  id: string;
  admin_name: string;
  admin_email: string;
  condo_name: string;
  message: string | null;
  source: CommercialLeadSource;
  status: CommercialLeadStatus;
  delivery_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SuperAdminDashboardResponse {
  communities: SuperAdminCommunity[];
  tiers: SuperAdminPricingTier[];
  leads: SuperAdminCommercialLead[];
  error?: string;
}

// ─── Reels Agent (marketing) ────────────────────────────────────────────────

/** Lo que hay configurado hoy: cada bandera es una credencial presente o no. */
export interface MarketingCapabilities {
    aiScriptGeneration: boolean;
    videoRendering: boolean;
    professionalAudio: boolean;
    videoAiGeneration: boolean;
    videoAiProvider: string | null;
    instagramPublishing: boolean;
    instagramOAuth: boolean;
    cronSecretConfigured: boolean;
}

export interface MarketingReelsDashboard {
    campaigns: MarketingCampaign[];
    reels: MarketingReelRecord[];
    instagram: InstagramConnectionSummary;
    capabilities: MarketingCapabilities;
}

/** El POST devuelve el mismo panel más el reel recién generado. */
export interface MarketingReelsDashboardResponse extends Partial<MarketingReelsDashboard> {
    error?: string;
    reel?: MarketingReelRecord;
}

export interface SuperAdminProvidersResponse {
  network: NetworkProviderRow[];
  community: NetworkProviderRow[];
  communities: { id: string; name: string }[];
}
