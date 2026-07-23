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

// ============ Builder schema ============

export type BlockType =
  | 'intro'
  | 'single-choice'
  | 'multi-choice'
  | 'short-text'
  | 'long-text'
  | 'email'
  | 'phone'
  | 'rating'
  | 'cta'
  | 'result'
  | 'video'
  | 'audio'
  | 'image'
  | 'before-after'
  | 'testimonial'
  | 'countdown'
  | 'divider'
  // Fase B (Funilix parity)
  | 'argument'
  | 'argument-progress'
  | 'level'
  | 'loading'
  | 'notification'
  | 'faq'
  | 'form'
  | 'weight'
  | 'height'
  | 'pricing'
  | 'reveal'
  | 'ios-notification'
  | 'carousel'
  | 'comparison'
  | 'chart'
  | 'custom';

export interface BlockOption {
  id: string;
  label: string;
  value?: string;
  score?: number;
  emoji?: string;
  tag?: string;
  jumpToBlockId?: string; // conditional branching
}

export type BlockLogicOp = 'eq' | 'neq' | 'contains' | 'gt' | 'lt';
export interface BlockLogicRule {
  fieldBlockId: string;   // block whose response we test
  op: BlockLogicOp;
  value: string | number;
  jumpToBlockId: string;  // where to go if true
}

export interface QuizBlock {
  id: string;
  type: BlockType;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  required?: boolean;
  options?: BlockOption[];
  ctaLabel?: string;
  imageUrl?: string;
  maxRating?: number;
  resultTitle?: string;
  resultBody?: string;
  // Rich media (Phase 3)
  mediaUrl?: string;
  mediaProvider?: 'youtube' | 'vimeo' | 'mp4' | 'file';
  posterUrl?: string;
  autoplay?: boolean;
  beforeUrl?: string;
  afterUrl?: string;
  testimonialAuthor?: string;
  testimonialRole?: string;
  testimonialAvatar?: string;
  countdownEndsAt?: string;
  countdownMinutes?: number;
  // Logic (Phase 4)
  logicRules?: BlockLogicRule[];
  scoreWeight?: number; // multiplier for rating/choice blocks
  // A/B test (Fase 3)
  abTest?: {
    enabled: boolean;
    variants: BlockVariant[];
  };
  // Fase B (Funilix parity)
  argumentIcon?: string;
  progressValue?: number; // 0-100, used by argument-progress and level
  levelLabel?: string;
  loadingSeconds?: number;
  loadingSteps?: string[];
  faqItems?: FaqItem[];
  formFields?: { name?: boolean; email?: boolean; phone?: boolean };
  pricingPrice?: string;
  pricingOriginalPrice?: string;
  pricingPeriod?: string;
  pricingFeatures?: string[];
  revealLabel?: string;
  revealedTitle?: string;
  revealedBody?: string;
  notificationApp?: string;
  notificationTime?: string;
  carouselImages?: string[];
  comparisonLeftLabel?: string;
  comparisonLeftItems?: string[];
  comparisonRightLabel?: string;
  comparisonRightItems?: string[];
  chartType?: 'bar' | 'line';
  chartData?: ChartPoint[];
  customHtml?: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface ChartPoint {
  id: string;
  label: string;
  value: number;
}

export interface BlockVariant {
  id: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  imageUrl?: string;
}

export interface QuizDesign {
  presetId: string;
  primary: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  radius: number;
  fontHeading: string;
  fontBody: string;
  buttonStyle: 'solid' | 'outline' | 'ghost' | 'gradient';
  progressStyle: 'bar' | 'dots' | 'steps' | 'none';
}

export interface QuizSchema {
  blocks: QuizBlock[];
  design: QuizDesign;
  results?: unknown[];
}

export interface DesignPreset {
  id: string;
  name: string;
  description: string;
  design: QuizDesign;
}

// ============ Access rules (Fase 2) ============

export interface AccessRules {
  enabled: boolean;
  utmSource?: string;
  utmCampaign?: string;
  devices?: Array<'mobile' | 'desktop'>;
  countries?: string[]; // ISO 3166-1 alpha-2 codes, uppercase
  fallbackUrl: string;
}

export const DEFAULT_ACCESS_RULES: AccessRules = {
  enabled: false,
  utmSource: '',
  utmCampaign: '',
  devices: [],
  countries: [],
  fallbackUrl: '',
};
