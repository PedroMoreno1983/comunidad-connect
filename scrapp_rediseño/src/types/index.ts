// frontend/src/types/index.ts
// ARCHIVO COMPLETO CORREGIDO

export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type SourceType =
  | 'WEB_SCRAPE'
  | 'RSS_FEED'
  | 'API'
  | 'LIVE_STREAM'
  | 'RADIO_STREAM'
  | 'SOCIAL_YOUTUBE'
  | 'SOCIAL_FACEBOOK'
  | 'SOCIAL_TWITTER'
  | 'SOCIAL_INSTAGRAM'
  | 'SOCIAL_LINKEDIN';
export type NotificationType = 'NEW_MENTION' | 'SYSTEM_ALERT' | 'INFO';
export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  name: string;
  keywords: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    mentions: number;
  };
}

export interface Source {
  id: string;
  name: string;
  url: string;
  type: SourceType;
  frequencyMins: number;
  status: string;
  config?: any;
  lastScrapedAt?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    mentions: number;
  };
}

export interface Mention {
  id: string;
  brandId: string;
  sourceId: string;
  title: string;
  excerpt: string;
  url: string;
  clipUrl?: string;      // ← AGREGADO para audio/video clips
  sentiment: Sentiment;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  brand?: Brand;
  source?: Source;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface MentionStats {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  positivePercentage: number;
  negativePercentage: number;
  byDate: Array<{
    date: string;
    count: number;
  }>;
}

export interface DashboardStats {
  totalMentions: number;
  totalBrands: number;
  totalSources: number;
  positiveMentions: number;
  neutralMentions: number;
  negativeMentions: number;
  recentMentions: Mention[];
  topBrands: Brand[];
}

export interface AuthResponse {
  user: User;
  token: string;
}