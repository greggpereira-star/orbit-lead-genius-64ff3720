export type QuizStatus = 'draft' | 'published' | 'archived';
export type QuizLayoutMode = 'fullscreen' | 'card' | 'split' | 'story' | 'inline' | 'modal';
export type QuizTemperature = 'hot' | 'warm' | 'cold';

export interface QuizFunnel {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  niche: string | null;
  description: string | null;
  status: QuizStatus;
  layout_mode: QuizLayoutMode;
  published_version_id: string | null;
  settings: Record<string, unknown>;
  design: Record<string, unknown>;
  identity: Record<string, unknown>;
  integrations: Record<string, unknown>;
  stats: Record<string, unknown>;
  last_response_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuizTemplate {
  id: string;
  slug: string;
  name: string;
  niche: string | null;
  description: string | null;
  cover_url: string | null;
  schema: Record<string, unknown>;
  sort_order: number;
}
