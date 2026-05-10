import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Layers, 
  Zap, 
  ChevronRight, 
  ArrowLeft,
  Layout,
  Trophy,
  Target
} from 'lucide-react';

interface FormTypeSelectorProps {
  onSelect: (type: 'standard' | 'multi_step' | 'quiz', template?: any) => void;
  onBack: () => void;
}

export function FormTypeSelector({ onSelect, onBack }: FormTypeSelectorProps) {
  const types = [
    {
      id: 'standard',
      title: 'Formulário Normal',
      description: 'Ideal para captação rápida, contato simples, orçamento e landing pages diretas.',
      icon: FileText,
      color: 'blue'
    },
    {
      id: 'multi_step',
      title: 'Formulário Step-by-Step',
      description: 'Ideal para segmentar leads, qualificar intenção de compra e aumentar conversão em negócios consultivos.',
      icon: Layers,
      color: 'purple'
    },
    {
      id: 'quiz',
      title: 'Quiz de Qualificação',
      description: 'Ideal para perguntas com pontuação, segmentação e recomendação automática.',
      icon: Zap,
      color: 'orange'
    }
  ];

  const templates = [
    {
      id: 'imobiliaria',
      name: 'Qualificação Imobiliária Completa',
      type: 'multi_step',
      description: 'Template completo com scoring para imobiliárias.',
      icon: Layout,
      steps: [
        { title: 'Intenção', fields: [{ label: 'O que você procura?', type: 'select', options: ['Comprar para morar', 'Comprar para investir', 'Comprar para alugar', 'Comprar imóvel na planta', 'Ainda estou pesquisando'] }] },
        { title: 'Tipo de Imóvel', fields: [{ label: 'Qual tipo de imóvel você busca?', type: 'select', options: ['Apartamento', 'Casa', 'Cobertura', 'Studio', 'Lote/Terreno', 'Ainda não decidi'] }] },
        { title: 'Região', fields: [{ label: 'Em qual região você tem interesse?', type: 'select', options: ['Praia da Costa', 'Itapuã', 'Itaparica', 'Jardim Camburi', 'Enseada do Suá', 'Interlagos', 'Outra região'] }] },
        { title: 'Investimento', fields: [{ label: 'Qual faixa de valor pretende investir?', type: 'select', options: ['Até R$ 300 mil', 'R$ 300 mil a R$ 500 mil', 'R$ 500 mil a R$ 800 mil', 'R$ 800 mil a R$ 1,2 milhão', 'Acima de R$ 1,2 milhão', 'Ainda estou avaliando'] }] },
        { title: 'Entrada', fields: [{ label: 'Você possui entrada disponível?', type: 'select', options: ['Sim, acima de R$ 200 mil', 'Sim, entre R$ 100 mil e R$ 200 mil', 'Sim, entre R$ 50 mil e R$ 100 mil', 'Tenho menos de R$ 50 mil', 'Ainda não tenho entrada', 'Prefiro conversar com um consultor'] }] },
        { title: 'Pagamento', fields: [{ label: 'Como pretende comprar?', type: 'select', options: ['À vista', 'Financiamento', 'Financiamento + entrada', 'Consórcio', 'Ainda não sei'] }] },
        { title: 'Prazo', fields: [{ label: 'Quando pretende comprar?', type: 'select', options: ['Agora', 'Até 30 dias', '1 a 3 meses', '3 a 6 meses', 'Mais de 6 meses', 'Só pesquisando'] }] },
        { title: 'Contato', fields: [{ label: 'Nome', type: 'text', required: true }, { label: 'WhatsApp', type: 'phone', required: true }, { label: 'E-mail', type: 'email', required: true }] }
      ]
    },
    {
      id: 'facebook_ads',
      name: 'Facebook Lead Ads Style',
      type: 'standard',
      description: 'Otimizado para mobile e tráfego pago direto.',
      icon: Target,
      fields: [
        { label: 'Qual tipo de imóvel você procura?', type: 'select', options: ['Apartamento', 'Casa', 'Lote'] },
        { label: 'Região de interesse', type: 'text' },
        { label: 'Faixa de investimento', type: 'select', options: ['Até 500k', '500k a 1M', 'Acima de 1M'] },
        { label: 'Prazo de compra', type: 'select', options: ['Agora', '30 dias', '60 dias+'] },
        { label: 'Nome', type: 'text', required: true },
        { label: 'WhatsApp', type: 'phone', required: true }
      ]
    }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="text-left space-y-1">
          <h2 className="text-3xl font-black uppercase tracking-tighter">Escolha o tipo de formulário</h2>
          <p className="text-muted-foreground">O LeadFlow oferece diferentes estruturas para maximizar sua conversão.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {types.map((type) => (
          <Card 
            key={type.id} 
            className="group cursor-pointer hover:ring-2 hover:ring-primary transition-all overflow-hidden border-none shadow-sm flex flex-col"
            onClick={() => onSelect(type.id as any)}
          >
            <div className={`h-2 bg-${type.id === 'standard' ? 'blue' : type.id === 'multi_step' ? 'purple' : 'orange'}-500/20 group-hover:bg-primary transition-colors`} />
            <CardHeader>
              <div className={`w-12 h-12 rounded-xl bg-${type.id === 'standard' ? 'blue' : type.id === 'multi_step' ? 'purple' : 'orange'}-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <type.icon className={`h-6 w-6 text-${type.id === 'standard' ? 'blue' : type.id === 'multi_step' ? 'purple' : 'orange'}-500`} />
              </div>
              <CardTitle className="text-lg">{type.title}</CardTitle>
              <CardDescription className="min-h-[60px]">{type.description}</CardDescription>
            </CardHeader>
            <div className="p-4 bg-muted/50 border-t mt-auto flex justify-center">
              <Button variant="ghost" size="sm" className="font-bold uppercase tracking-widest text-[10px] gap-2">
                Usar este modo <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="pt-8 border-t">
        <div className="flex items-center gap-2 mb-6">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <h3 className="text-xl font-bold uppercase tracking-tight">Templates Imobiliários de Alta Conversão</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map((template) => (
            <Card 
              key={template.id} 
              className="flex flex-row items-center p-4 gap-4 cursor-pointer hover:bg-muted/50 transition-colors group"
              onClick={() => onSelect(template.type as any, template)}
            >
              <div className="w-16 h-16 rounded-lg bg-primary/5 flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-all">
                <template.icon className="h-8 w-8" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm">{template.name}</h4>
                  <Badge variant="outline" className="text-[8px] uppercase">{template.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{template.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
