import type { RichDoc } from './lib/richdoc';
import type { BlockStyle } from './lib/blockStyle';
export type { RichDoc };
export type { BlockStyle };

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
  | 'audio-call'
  | 'carousel'
  | 'comparison'
  | 'chart'
  | 'custom'
  // Layout (Funilix parity)
  | 'container'
  | 'spacer';

export interface BlockOption {
  id: string;
  label: string;
  value?: string;
  score?: number;
  emoji?: string;
  imageUrl?: string;      // mídia alternativa ao emoji (uma exclui a outra)
  tag?: string;
  preselected?: boolean;  // já vem marcada quando a etapa abre
  actionUrl?: string;     // ao clicar, abre esta URL em vez de avançar o fluxo
  jumpToBlockId?: string; // conditional branching
}

export type BlockLogicOp = 'eq' | 'neq' | 'contains' | 'gt' | 'lt';
export interface BlockLogicRule {
  fieldBlockId: string;   // block whose response we test
  op: BlockLogicOp;
  value: string | number;
  jumpToBlockId: string;  // where to go if true
}

// ============ Exibição condicional (Funilix parity) ============
// Mostra o bloco somente quando a condição sobre uma resposta anterior é verdadeira.
export type ShowIfOp = 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
export interface BlockShowIf {
  enabled: boolean;
  fieldBlockId: string;      // bloco cuja resposta é testada
  op: ShowIfOp;
  value: string | number;
  value2?: string | number;  // usado só quando op === 'between' (faixa)
  // Motor de variáveis/fórmulas (Funilix parity): quando true, a condição compara o
  // RESULTADO de `expression` (ex.: "peso/(altura/100)^2" pra IMC) em vez da resposta
  // crua de `fieldBlockId` — permite cruzar várias respostas numa única condição.
  useFormula?: boolean;
  expression?: string;
}

export interface QuizBlock {
  id: string;
  type: BlockType;
  title?: string;
  subtitle?: string;
  /**
   * Versão rica de `title`/`subtitle`.
   *
   * Os campos de texto simples CONTINUAM sendo gravados junto, com o texto puro
   * extraído do documento. Não é redundância à toa: nada de migração nos quizzes
   * que já existem, e o painel de etapas, o `aria-label` e a busca seguem tendo
   * uma string legível para mostrar. Quando o documento existe, ele manda na
   * renderização; quando não existe, cai no texto simples de sempre.
   */
  titleRich?: RichDoc;
  subtitleRich?: RichDoc;
  placeholder?: string;
  required?: boolean;
  /**
   * Escolha única: clicar na opção já avança a etapa.
   *
   * Ausente = true, que é o comportamento de sempre — desligar é que é a
   * novidade. Serve pra quando a pergunta precisa de conferência antes de
   * seguir (ex.: opção com preço), aí aparece um botão de continuar.
   */
  autoAdvance?: boolean;
  options?: BlockOption[];
  ctaLabel?: string;
  imageUrl?: string;
  maxRating?: number;
  /**
   * Máximo de opções marcáveis num bloco de múltipla escolha.
   *
   * Ausente = sem limite. Existe porque "escolha até três" escrito no
   * subtítulo não impedia nada: a tela prometia um limite que o quiz não
   * cumpria, e cada marcação extra ainda somava pontos, inflando a
   * classificação de quem só clicou em tudo.
   */
  maxSelections?: number;
  // Régua de peso/altura (Funilix parity): substitui o campo numérico simples por
  // um slider de arrastar, com faixa configurável e troca de unidade (kg/lb, cm/pol).
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  sliderDefaultValue?: number;
  allowUnitToggle?: boolean; // ausente = true (comportamento padrão)
  resultTitle?: string;
  resultBody?: string;
  resultBodyRich?: RichDoc;
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
  /**
   * Medidor por fórmula (bloco "Nível").
   *
   * Quando preenchida, substitui a porcentagem fixa do slider — no canvas e no
   * quiz publicado. Aceita expressão crua (`score*2`) ou com chaves
   * (`{{calc(score*2)}}`), e `score` é a pontuação acumulada da sessão.
   */
  meterFormula?: string;
  /** Legendas distribuídas embaixo da barra (ex.: Incomoda, Afeta, Evito praia). */
  meterCaptions?: string[];
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
  audioCallDuration?: string;
  carouselImages?: string[];
  comparisonLeftLabel?: string;
  comparisonLeftItems?: string[];
  comparisonRightLabel?: string;
  comparisonRightItems?: string[];
  chartType?: 'bar' | 'line';
  chartData?: ChartPoint[];
  customHtml?: string;
  // Tela de resultado
  ctaUrl?: string; // link do botão final — sem isso, o botão de resultado não navega
  resultBadgeHot?: string;
  resultBadgeWarm?: string;
  resultBadgeCold?: string;
  // Exibição condicional — mostra o bloco só quando a condição for verdadeira
  showIf?: BlockShowIf;
  // Motor de variáveis (Funilix parity): nome pelo qual a resposta deste bloco fica
  // disponível em qualquer texto do quiz via {{nome}}, ou em fórmulas via calc(nome).
  // Ausente = bloco não exporta variável (comportamento de hoje, sem mudança).
  outputVariable?: string;
  // Layout — Container (Funilix parity): agrupa outros blocos lado a lado (ou em
  // grade) dentro de uma única etapa, em vez de cada um virar sua própria tela.
  // Os ids em childBlockIds continuam existindo em schema.blocks normalmente, mas
  // NÃO aparecem em nenhum QuizStep.blockIds — o Container é a única referência a
  // eles, e é ele quem entra no blockIds da etapa.
  childBlockIds?: string[];
  containerLayoutMode?: 'flex' | 'grid';
  containerColumns?: number; // usado só no modo grid: 1 | 2 | 3 | 4 | 6
  containerGap?: number; // px
  containerAlign?: 'start' | 'center' | 'end' | 'stretch'; // align-items
  containerJustify?: 'start' | 'center' | 'end' | 'stretch'; // justify-content
  // Layout Responsivo (Funilix parity): as propriedades containerX acima são a base
  // "Mobile (padrão)" — Tablet/Desktop só precisam declarar o que muda; qualquer
  // campo ausente herda em cascata (Desktop herda de Tablet, que herda de Mobile).
  containerTablet?: ContainerBreakpointLayout;
  containerDesktop?: ContainerBreakpointLayout;
  /**
   * Estilo próprio do bloco (abas Layout e Aparência).
   *
   * Ausente = renderiza como sempre renderizou. Nenhum valor padrão é gravado
   * no schema de propósito: default gravado é o que trava troca de tema depois.
   */
  blockStyle?: BlockStyle;
  // Layout — Espaçamento: bloco "vazio" que só ocupa altura vertical.
  spacerHeight?: number; // px
}

export interface ContainerBreakpointLayout {
  layoutMode?: 'flex' | 'grid';
  columns?: number;
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'stretch';
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
  buttonStyle: ButtonStyle;
  progressStyle: 'bar' | 'dots' | 'steps' | 'none';
}

// Galeria de estilos de botão (Funilix parity): 4 estilos básicos + variantes com
// mais "efeito" (brilho, elevação, relevo 3D) — ver getButtonStyle() em lib/buttonStyles.ts.
export type ButtonStyle =
  | 'solid' | 'outline' | 'ghost' | 'gradient'
  | 'neon' | 'glow' | 'lift' | 'shimmer' | 'pulse'
  | 'soft-shadow' | 'relief' | 'capsule' | 'brutalist' | 'soft-3d' | 'tilt';

export interface QuizStep {
  id: string;
  blockIds: string[]; // um ou mais QuizBlock.id, na ordem de exibição dentro da etapa
  name?: string; // nome customizado (edição via fluxograma); ausente = "Etapa N"
  isGoal?: boolean; // marcada como meta de conversão (destaque visual no fluxograma)
}

/**
 * Faixa de classificação do lead pela pontuação do quiz.
 *
 * `minPercent` é percentual do MÁXIMO POSSÍVEL, não pontos absolutos. Parece
 * detalhe e não é: com corte absoluto, o dia em que alguém remove uma pergunta
 * pontuada o teto cai e a mesma resposta passa a cair noutra faixa — sem erro,
 * sem aviso, sem ninguém perceber. Em percentual, as faixas se reajustam.
 */
export interface ScoreTier {
  id: string;
  label: string;
  /** 0-100. A faixa vale para quem atingir este percentual ou mais. */
  minPercent: number;
  color?: string;
  /** Mensagem de WhatsApp disparada ao concluir. Vazia = não envia nada. */
  whatsappTemplate?: string;
}

export interface QuizSchema {
  blocks: QuizBlock[];
  steps?: QuizStep[]; // ausente = cada bloco é sua própria etapa (compatibilidade retroativa)
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

// ============ Engajamento: prova social flutuante + barra de urgência ============

export type SocialProofIcon = 'check' | 'gift' | 'users' | 'star' | 'fire' | 'bell';

export interface SocialProofMessage {
  id: string;
  icon: SocialProofIcon;
  title: string;
  body?: string;
}

export type SocialProofPosition = 'bottom-left' | 'bottom-right' | 'bottom-center' | 'top-center';

export interface SocialProofSettings {
  enabled: boolean;
  position: SocialProofPosition;
  messages: SocialProofMessage[];
  startDelaySeconds: number;
  displaySeconds: number;
  intervalSeconds: number;
}

export const DEFAULT_SOCIAL_PROOF: SocialProofSettings = {
  enabled: false,
  position: 'bottom-left',
  messages: [],
  startDelaySeconds: 4,
  displaySeconds: 6,
  intervalSeconds: 14,
};

export type UrgencyBarExpireBehavior = 'restart' | 'freeze' | 'hide';

export interface UrgencyBarSettings {
  enabled: boolean;
  label: string;
  minutes: number;
  onExpire: UrgencyBarExpireBehavior;
}

export const DEFAULT_URGENCY_BAR: UrgencyBarSettings = {
  enabled: false,
  label: 'Oferta especial expira em:',
  minutes: 15,
  onExpire: 'restart',
};
