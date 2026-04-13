export type Provider = 'codex' | 'claude' | 'ollama';
export type SyncStatus = 'synced' | 'pending' | 'error' | 'manual';
export type SourceType = 'subscription' | 'manual' | 'api' | 'proxy';

export interface PlanLimit {
  label: string;         // "Current Session" | "Weekly Limits"
  sublabel: string;      // "Resets in 3h 26m" | "Resets Fri 10:00 AM"
  percentUsed: number;   // 0–100
}

export interface PlanUsage {
  tier: string;          // "Pro" | "Plus" | "Free"
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
  tokens?: number;
  modelName?: string;
  sourceType: SourceType;
  planUsage?: PlanUsage;
  // Codex-specific
  sessionsToday?: number;
  sessionsWeek?: number;
  avgTokens?: number;
  // Ollama-specific
  liveData?: {
    connected: boolean;
    modelCount: number;
    models?: string[];
    error?: string;
  };
}

export interface UsageResponse {
  providers: ProviderStats[];
  refreshedAt: string;
}
