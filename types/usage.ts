export type Provider = 'codex' | 'claude' | 'ollama';
export type SyncStatus = 'synced' | 'pending' | 'error' | 'manual';
export type SourceType = 'subscription' | 'manual' | 'api' | 'proxy';

export interface HourlyDataPoint {
  label: string;  // "00h", "01h", ..., "23h"
  value: number;
}

export interface WeeklyDataPoint {
  label: string;  // "Mon", "Tue", ..., "Sun"
  value: number;
}

export interface PlanLimit {
  label: string;         // "Current session" | "All models" | "Pro plan"
  sublabel: string;      // "Resets in 3 hr 26 min" | "Resets Fri 10:00 AM"
  percentUsed: number;   // 0–100
}

export interface PlanUsage {
  tier: string;          // "Pro" | "Max" | "Free" | "Pro Plan"
  limits: PlanLimit[];
  lastUpdated: string;   // ISO string
}

export interface ProviderStats {
  provider: Provider;
  displayName: string;
  accent: string;
  accentDim: string;
  totalUsage: number;
  usageUnit: string;
  latestSync: string | null;
  syncStatus: SyncStatus;
  hourlyData: HourlyDataPoint[];
  weeklyData: WeeklyDataPoint[];
  tokens?: number;
  estimatedCost?: number;
  modelName?: string;
  sourceType: SourceType;
  planUsage?: PlanUsage;
  liveData?: {
    connected: boolean;
    modelCount: number;
    error?: string;
  };
}

export interface UsageResponse {
  providers: ProviderStats[];
  refreshedAt: string;
}
