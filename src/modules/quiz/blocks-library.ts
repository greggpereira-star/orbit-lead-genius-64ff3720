import type { BlockType, QuizBlock } from '@/modules/quiz/types';
import {
  Rocket, ListChecks, CheckSquare, Type, AlignLeft, Mail, Phone, Star, Zap, Trophy,
  Video, Music, Image as ImageIcon, GitCompare, Quote, Timer, Minus,
  MessageSquareText, TrendingUp, Gauge, Hourglass, Bell, HelpCircle, ClipboardList,
  Scale, Ruler, Tag, Gift, BellRing, GalleryHorizontal, Columns3, BarChart3, Code2,
  PhoneCall, SeparatorHorizontal,
} from 'lucide-react';

export type BlockCategory =
  | 'captura'
  | 'conteudo'
  | 'interacao'
  | 'midia'
  | 'prova'
  | 'resultado'
  | 'oferta'
  | 'gamificacao'
  | 'layout'
  | 'livre';

export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = {
  captura: 'Captura',
  conteudo: 'Conteúdo',
  interacao: 'Interação',
  midia: 'Mídia',
  prova: 'Prova',
  resultado: 'Resultado',
  oferta: 'Oferta',
  gamificacao: 'Gamificação',
  layout: 'Layout',
  livre: 'Livre',
};

interface BlockDef {
  type: BlockType;
  label: string;
  description: string;
  category: BlockCategory;
  icon: React.ComponentType<{ className?: string }>;
  create: () => Omit<QuizBlock, 'id'>;
}

export const BLOCK_LIBRARY: BlockDef[] = [
  {
    type: 'intro',
    label: 'Intro',
    description: 'Tela inicial do quiz',
    category: 'conteudo',
    icon: Rocket,
    create: () => ({
      type: 'intro',
      title: 'Descubra em 60 segundos',
      subtitle: 'Responda algumas perguntas rápidas e receba um plano personalizado.',
      ctaLabel: 'Começar agora',
    }),
  },
  {
    type: 'single-choice',
    label: 'Escolha única',
    description: '1 resposta entre várias',
    category: 'interacao',
    icon: ListChecks,
    create: () => ({
      type: 'single-choice',
      title: 'Qual seu principal objetivo?',
      options: [
        { id: crypto.randomUUID(), label: 'Aumentar vendas' },
        { id: crypto.randomUUID(), label: 'Reduzir custos' },
        { id: crypto.randomUUID(), label: 'Escalar time' },
      ],
    }),
  },
  {
    type: 'multi-choice',
    label: 'Múltipla escolha',
    description: 'Várias respostas',
    category: 'interacao',
    icon: CheckSquare,
    create: () => ({
      type: 'multi-choice',
      title: 'Quais canais você já usa?',
      options: [
        { id: crypto.randomUUID(), label: 'Instagram' },
        { id: crypto.randomUUID(), label: 'WhatsApp' },
        { id: crypto.randomUUID(), label: 'Google Ads' },
      ],
    }),
  },
  {
    type: 'short-text',
    label: 'Texto curto',
    description: 'Campo de resposta simples',
    category: 'captura',
    icon: Type,
    create: () => ({ type: 'short-text', title: 'Qual seu nome?', placeholder: 'Digite seu nome' }),
  },
  {
    type: 'long-text',
    label: 'Texto longo',
    description: 'Resposta em parágrafo',
    category: 'conteudo',
    icon: AlignLeft,
    create: () => ({ type: 'long-text', title: 'Nos conte mais sobre você', placeholder: 'Escreva aqui...' }),
  },
  {
    type: 'email',
    label: 'E-mail',
    description: 'Captura de e-mail',
    category: 'captura',
    icon: Mail,
    create: () => ({ type: 'email', title: 'Qual seu melhor e-mail?', placeholder: 'voce@empresa.com', required: true }),
  },
  {
    type: 'phone',
    label: 'Telefone',
    description: 'Captura de WhatsApp',
    category: 'captura',
    icon: Phone,
    create: () => ({ type: 'phone', title: 'Qual seu WhatsApp?', placeholder: '(11) 99999-9999', required: true }),
  },
  {
    type: 'rating',
    label: 'Avaliação',
    description: 'Escala numérica',
    category: 'interacao',
    icon: Star,
    create: () => ({ type: 'rating', title: 'De 0 a 10, o quanto você quer isso?', maxRating: 10 }),
  },
  {
    type: 'cta',
    label: 'CTA',
    description: 'Botão de ação',
    category: 'interacao',
    icon: Zap,
    create: () => ({ type: 'cta', title: 'Pronto para o próximo passo?', ctaLabel: 'Falar com especialista' }),
  },
  {
    type: 'result',
    label: 'Resultado',
    description: 'Tela final personalizada',
    category: 'resultado',
    icon: Trophy,
    create: () => ({
      type: 'result',
      resultTitle: 'Seu diagnóstico está pronto',
      resultBody: 'Baseado nas suas respostas, montamos um plano sob medida para você.',
      ctaLabel: 'Ver meu plano',
    }),
  },
  {
    type: 'video',
    label: 'Vídeo',
    description: 'YouTube, Vimeo ou MP4',
    category: 'midia',
    icon: Video,
    create: () => ({
      type: 'video',
      title: 'Assista antes de continuar',
      mediaProvider: 'youtube',
      mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }),
  },
  {
    type: 'audio',
    label: 'Áudio',
    description: 'Player de áudio (MP3)',
    category: 'midia',
    icon: Music,
    create: () => ({ type: 'audio', title: 'Ouça essa mensagem', mediaUrl: '' }),
  },
  {
    type: 'image',
    label: 'Imagem',
    description: 'Imagem destacada',
    category: 'midia',
    icon: ImageIcon,
    create: () => ({
      type: 'image',
      mediaUrl: 'https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?w=1200',
    }),
  },
  {
    type: 'before-after',
    label: 'Antes/Depois',
    description: 'Comparador com slider',
    category: 'midia',
    icon: GitCompare,
    create: () => ({
      type: 'before-after',
      title: 'Veja a transformação',
      beforeUrl: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=800',
      afterUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
    }),
  },
  {
    type: 'testimonial',
    label: 'Depoimento',
    description: 'Prova social',
    category: 'prova',
    icon: Quote,
    create: () => ({
      type: 'testimonial',
      title: '"Resultado incrível em apenas 30 dias."',
      testimonialAuthor: 'Maria Silva',
      testimonialRole: 'CEO, Empresa X',
      testimonialAvatar: 'https://i.pravatar.cc/120?img=47',
    }),
  },
  {
    type: 'countdown',
    label: 'Countdown',
    description: 'Timer de urgência',
    category: 'resultado',
    icon: Timer,
    create: () => ({ type: 'countdown', title: 'Oferta expira em:', countdownMinutes: 15 }),
  },
  {
    type: 'divider',
    label: 'Divisor',
    description: 'Espaço visual',
    category: 'resultado',
    icon: Minus,
    create: () => ({ type: 'divider' }),
  },
  // ============ Fase B (Funilix parity) ============
  {
    type: 'argument',
    label: 'Argumento',
    description: 'Texto persuasivo com ícone',
    category: 'conteudo',
    icon: MessageSquareText,
    create: () => ({
      type: 'argument',
      title: 'Você não está sozinho nessa',
      subtitle: 'Milhares de pessoas já passaram pelo mesmo desafio e encontraram uma solução.',
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'argument-progress',
    label: 'Argumento c/ progresso',
    description: 'Texto + barra animada',
    category: 'conteudo',
    icon: TrendingUp,
    create: () => ({
      type: 'argument-progress',
      title: 'Estamos quase lá',
      subtitle: 'Só mais algumas perguntas para personalizar seu resultado.',
      progressValue: 70,
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'level',
    label: 'Nível',
    description: 'Medidor / gauge',
    category: 'conteudo',
    icon: Gauge,
    create: () => ({
      type: 'level',
      title: 'Seu nível atual',
      levelLabel: 'Intermediário',
      progressValue: 60,
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'loading',
    label: 'Carregamento',
    description: 'Tela de análise com auto-avanço',
    category: 'conteudo',
    icon: Hourglass,
    create: () => ({
      type: 'loading',
      title: 'Analisando suas respostas...',
      loadingSeconds: 3,
      loadingSteps: ['Coletando dados', 'Processando perfil', 'Montando resultado'],
    }),
  },
  {
    type: 'notification',
    label: 'Notificação',
    description: 'Alerta em destaque',
    category: 'conteudo',
    icon: Bell,
    create: () => ({
      type: 'notification',
      title: 'Vagas limitadas hoje',
      subtitle: 'Restam poucas vagas para esta condição especial.',
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'faq',
    label: 'FAQ',
    description: 'Perguntas frequentes',
    category: 'conteudo',
    icon: HelpCircle,
    create: () => ({
      type: 'faq',
      title: 'Perguntas frequentes',
      faqItems: [
        { id: crypto.randomUUID(), question: 'Quanto tempo leva?', answer: 'Menos de 2 minutos.' },
        { id: crypto.randomUUID(), question: 'Tem custo?', answer: 'Não, é totalmente gratuito.' },
      ],
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'form',
    label: 'Formulário',
    description: 'Nome, e-mail e telefone juntos',
    category: 'captura',
    icon: ClipboardList,
    create: () => ({
      type: 'form',
      title: 'Quase lá! Onde enviamos seu resultado?',
      formFields: { name: true, email: true, phone: true },
      ctaLabel: 'Enviar',
    }),
  },
  {
    type: 'weight',
    label: 'Peso',
    description: 'Campo numérico (kg)',
    category: 'captura',
    icon: Scale,
    create: () => ({ type: 'weight', title: 'Qual seu peso atual?', placeholder: 'Ex: 70', ctaLabel: 'Continuar' }),
  },
  {
    type: 'height',
    label: 'Altura',
    description: 'Campo numérico (cm)',
    category: 'captura',
    icon: Ruler,
    create: () => ({ type: 'height', title: 'Qual sua altura?', placeholder: 'Ex: 170', ctaLabel: 'Continuar' }),
  },
  {
    type: 'pricing',
    label: 'Card de preço',
    description: 'Oferta com preço e benefícios',
    category: 'oferta',
    icon: Tag,
    create: () => ({
      type: 'pricing',
      title: 'Plano recomendado para você',
      pricingPrice: 'R$ 97',
      pricingOriginalPrice: 'R$ 197',
      pricingPeriod: '/mês',
      pricingFeatures: ['Acesso completo', 'Suporte prioritário', 'Garantia de 7 dias'],
      ctaLabel: 'Quero essa oferta',
    }),
  },
  {
    type: 'reveal',
    label: 'Modal gamificado',
    description: 'Toque para revelar um prêmio',
    category: 'gamificacao',
    icon: Gift,
    create: () => ({
      type: 'reveal',
      title: 'Você desbloqueou um bônus!',
      revealLabel: 'Revelar prêmio',
      revealedTitle: '🎉 15% de desconto',
      revealedBody: 'Use esse desconto ao finalizar sua compra hoje.',
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'ios-notification',
    label: 'Notificações iOS',
    description: 'Prova social simulando notificação',
    category: 'gamificacao',
    icon: BellRing,
    create: () => ({
      type: 'ios-notification',
      notificationApp: 'Alt Quiz',
      notificationTime: 'agora',
      title: 'Ana acabou de garantir sua vaga',
      subtitle: 'Restam poucas unidades disponíveis.',
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'audio-call',
    label: 'Chamada de áudio',
    description: 'Simula uma ligação recebida',
    category: 'gamificacao',
    icon: PhoneCall,
    create: () => ({
      type: 'audio-call',
      title: 'Dra. Ana Silva',
      subtitle: 'Chamada de voz',
      audioCallDuration: '00:12',
      ctaLabel: 'Atender',
    }),
  },
  {
    type: 'carousel',
    label: 'Carrossel',
    description: 'Galeria de imagens',
    category: 'midia',
    icon: GalleryHorizontal,
    create: () => ({
      type: 'carousel',
      title: 'Veja alguns resultados',
      carouselImages: [
        'https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?w=800',
        'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=800',
      ],
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'comparison',
    label: 'Comparação',
    description: 'Antes x depois, nós x eles',
    category: 'prova',
    icon: Columns3,
    create: () => ({
      type: 'comparison',
      title: 'Por que escolher a gente',
      comparisonLeftLabel: 'Sem nós',
      comparisonLeftItems: ['Resultados lentos', 'Sem suporte', 'Preço alto'],
      comparisonRightLabel: 'Com a gente',
      comparisonRightItems: ['Resultados rápidos', 'Suporte 24/7', 'Preço justo'],
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'chart',
    label: 'Gráfico',
    description: 'Gráfico de barras simples',
    category: 'prova',
    icon: BarChart3,
    create: () => ({
      type: 'chart',
      title: 'Resultados comprovados',
      chartType: 'bar',
      chartData: [
        { id: crypto.randomUUID(), label: 'Antes', value: 30 },
        { id: crypto.randomUUID(), label: 'Depois', value: 85 },
      ],
      ctaLabel: 'Continuar',
    }),
  },
  {
    type: 'container',
    label: 'Container',
    description: 'Agrupa componentes lado a lado numa etapa',
    category: 'layout',
    icon: Columns3,
    create: () => ({
      type: 'container',
      childBlockIds: [],
      containerLayoutMode: 'flex',
      containerGap: 16,
      containerAlign: 'stretch',
      containerJustify: 'start',
    }),
  },
  {
    type: 'spacer',
    label: 'Espaçamento',
    description: 'Espaço vertical em branco',
    category: 'layout',
    icon: SeparatorHorizontal,
    create: () => ({ type: 'spacer', spacerHeight: 32 }),
  },
  {
    type: 'custom',
    label: 'Bloco customizável',
    description: 'HTML livre',
    category: 'livre',
    icon: Code2,
    create: () => ({
      type: 'custom',
      customHtml: '<div style="text-align:center;padding:24px"><h2>Conteúdo customizado</h2></div>',
    }),
  },
];
