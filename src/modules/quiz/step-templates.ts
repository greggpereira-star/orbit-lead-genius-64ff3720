import type { QuizBlock } from './types';

/**
 * Modelos de etapa prontos: composições de blocos pré-configuradas que inserem
 * uma ETAPA inteira de uma vez (vários blocos agrupados numa tela só), no padrão
 * das etapas de alta conversão dos quizzes de referência. Os textos são
 * placeholders editáveis — o usuário personaliza no inspetor.
 */
export interface StepTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Blocos da etapa, em ordem — o último é o "terminal" (dono do botão). */
  create: () => Omit<QuizBlock, 'id'>[];
}

export const STEP_TEMPLATES: StepTemplate[] = [
  {
    id: 'welcome',
    name: 'Boas-vindas',
    description: 'Tela inicial com promessa e botão de começar',
    emoji: '👋',
    create: () => [
      {
        type: 'intro',
        title: 'Descubra seu plano ideal em 60 segundos',
        subtitle: 'Responda algumas perguntas rápidas e receba uma recomendação personalizada.',
        ctaLabel: 'Começar agora',
      },
    ],
  },
  {
    id: 'lead-capture',
    name: 'Captura de lead',
    description: 'Argumento de valor + formulário (nome, e-mail e telefone)',
    emoji: '🎯',
    create: () => [
      {
        type: 'argument',
        title: 'Seu resultado personalizado está pronto',
        subtitle: 'Preencha seus dados para receber o plano completo.',
      },
      {
        type: 'form',
        title: 'Para onde enviamos seu resultado?',
        formFields: { name: true, email: true, phone: true },
        ctaLabel: 'Receber meu plano agora',
      },
    ],
  },
  {
    id: 'urgent-offer',
    name: 'Oferta com urgência',
    description: 'Contador regressivo + card de preço com benefícios',
    emoji: '⏳',
    create: () => [
      {
        type: 'countdown',
        title: 'Oferta especial expira em:',
        countdownMinutes: 15,
      },
      {
        type: 'pricing',
        title: 'Plano recomendado para você',
        pricingPrice: 'R$ 97',
        pricingOriginalPrice: 'R$ 197',
        pricingPeriod: '/mês',
        pricingFeatures: ['Acesso completo', 'Suporte prioritário', 'Garantia de 7 dias'],
        ctaLabel: 'Quero essa oferta',
      },
    ],
  },
  {
    id: 'social-proof',
    name: 'Prova social',
    description: 'Depoimento real + chamada para ação',
    emoji: '⭐',
    create: () => [
      {
        type: 'testimonial',
        title: '“Resultado incrível já nas primeiras semanas. O método é simples e funciona de verdade.”',
        testimonialAuthor: 'Renata K.',
        testimonialRole: 'Cliente há 3 meses',
      },
      {
        type: 'cta',
        title: 'Quer o mesmo resultado?',
        ctaLabel: 'Quero essa transformação',
      },
    ],
  },
  {
    id: 'diagnosis',
    name: 'Diagnóstico animado',
    description: 'Tela de análise com etapas e avanço automático',
    emoji: '🔬',
    create: () => [
      {
        type: 'loading',
        title: 'Analisando suas respostas…',
        loadingSeconds: 4,
        loadingSteps: ['Processando seu perfil', 'Comparando com casos parecidos', 'Montando sua recomendação'],
      },
    ],
  },
];
