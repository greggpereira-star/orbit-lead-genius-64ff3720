import type { BlockType, QuizBlock } from '@/modules/quiz/types';
import {
  Rocket, ListChecks, CheckSquare, Type, AlignLeft, Mail, Phone, Star, Zap, Trophy,
  Video, Music, Image as ImageIcon, GitCompare, Quote, Timer, Minus,
} from 'lucide-react';

interface BlockDef {
  type: BlockType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  create: () => Omit<QuizBlock, 'id'>;
}

export const BLOCK_LIBRARY: BlockDef[] = [
  {
    type: 'intro',
    label: 'Intro',
    description: 'Tela inicial do quiz',
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
    icon: Type,
    create: () => ({ type: 'short-text', title: 'Qual seu nome?', placeholder: 'Digite seu nome' }),
  },
  {
    type: 'long-text',
    label: 'Texto longo',
    description: 'Resposta em parágrafo',
    icon: AlignLeft,
    create: () => ({ type: 'long-text', title: 'Nos conte mais sobre você', placeholder: 'Escreva aqui...' }),
  },
  {
    type: 'email',
    label: 'E-mail',
    description: 'Captura de e-mail',
    icon: Mail,
    create: () => ({ type: 'email', title: 'Qual seu melhor e-mail?', placeholder: 'voce@empresa.com', required: true }),
  },
  {
    type: 'phone',
    label: 'Telefone',
    description: 'Captura de WhatsApp',
    icon: Phone,
    create: () => ({ type: 'phone', title: 'Qual seu WhatsApp?', placeholder: '(11) 99999-9999', required: true }),
  },
  {
    type: 'rating',
    label: 'Avaliação',
    description: 'Escala numérica',
    icon: Star,
    create: () => ({ type: 'rating', title: 'De 0 a 10, o quanto você quer isso?', maxRating: 10 }),
  },
  {
    type: 'cta',
    label: 'CTA',
    description: 'Botão de ação',
    icon: Zap,
    create: () => ({ type: 'cta', title: 'Pronto para o próximo passo?', ctaLabel: 'Falar com especialista' }),
  },
  {
    type: 'result',
    label: 'Resultado',
    description: 'Tela final personalizada',
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
    icon: Music,
    create: () => ({ type: 'audio', title: 'Ouça essa mensagem', mediaUrl: '' }),
  },
  {
    type: 'image',
    label: 'Imagem',
    description: 'Imagem destacada',
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
    icon: Timer,
    create: () => ({ type: 'countdown', title: 'Oferta expira em:', countdownMinutes: 15 }),
  },
  {
    type: 'divider',
    label: 'Divisor',
    description: 'Espaço visual',
    icon: Minus,
    create: () => ({ type: 'divider' }),
  },
];
