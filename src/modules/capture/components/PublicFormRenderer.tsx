import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formService, Form, FormField } from '../services/formService';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, ArrowRight, ArrowLeft, Activity } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { captureService } from '../services/captureService';
import { tracker } from '@/core/tracking/tracker';
import { partialSubmissionService } from '../services/partialSubmissionService';
import { usePixelTracking } from '@/modules/tracking/usePixelTracking';
import { newEventId } from '@/core/tracking/pixels';
import { ConsentimentoLGPD, type Consentimentos } from './ConsentimentoLGPD';

/**
 * Origem de quem embutiu o formulário.
 *
 * O aviso de envio ia com `targetOrigin: '*'`, que entrega a mensagem a
 * qualquer página que embuta o formulário. Num iframe de outra origem o
 * `document.referrer` é o endereço do embutidor, e é essa a origem correta.
 * Quando não há como determinar (referrer removido por política), volta ao
 * curinga — a carga não tem dado pessoal, só o id do formulário que o próprio
 * embutidor já conhece.
 */
function origemDoEmbutidor(): string {
  try {
    const ancestral = window.location.ancestorOrigins?.[0];
    if (ancestral) return ancestral;
    if (document.referrer) return new URL(document.referrer).origin;
  } catch {
    /* URL inválida: cai no curinga abaixo. */
  }
  return '*';
}

/**
 * Contato lido pelo TIPO do campo, não por um nome convencionado.
 *
 * Era `values.email` e `values.phone`, que só funcionava se o cliente tivesse
 * nomeado os campos exatamente assim. O servidor resolve do mesmo jeito dentro
 * de `form_submit_publico`; aqui é para a correspondência avançada do Pixel.
 */
function contatoDasRespostas(
  campos: Array<{ name: string; type: string }> | undefined,
  valores: Record<string, any>,
): { email?: string; phone?: string } {
  const pegar = (tipo: string) => {
    const campo = (campos ?? []).find((c) => c.type === tipo);
    const v = campo ? valores[campo.name] : undefined;
    const t = typeof v === 'string' ? v.trim() : '';
    return t || undefined;
  };
  return { email: pegar('email'), phone: pegar('phone') };
}

interface PublicFormRendererProps {
  slug: string;
}

export function PublicFormRenderer({ slug }: PublicFormRendererProps) {
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  /* `crypto.randomUUID` e não `Math.random`: a RLS de `form_partial_submissions`
     autoriza a leitura comparando este id com o cabeçalho `x-session-id`, então
     ele É a credencial do rascunho — nome, e-mail e telefone em digitação.
     `Math.random` no V8 é xorshift128+, previsível a partir de saídas
     observadas, e aqui dava ~52 bits contra os 122 do UUID v4. */
  const [sessionId] = useState(
    () => localStorage.getItem(`lf_session_${slug}`) || crypto.randomUUID(),
  );
  const [resumePrompt, setResumePrompt] = useState(false);
  /* Desmarcado. O art. 8º da LGPD pede manifestação livre e inequívoca — uma
     caixa já marcada é o contrário disso. */
  const [consentimentos, setConsentimentos] = useState<Consentimentos>({
    dados: false, marketing: false,
  });
  const [erroDeConsentimento, setErroDeConsentimento] = useState(false);
  const [partialData, setPartialData] = useState<any>(null);

  const { data: form, isLoading, error } = useQuery({
    queryKey: ['public-form', slug],
    queryFn: async () => {
      /* Uma chamada só: `form_publico` casa por slug OU id. O fallback antigo
         ia para `getFormById`, que lê a tabela direto — e o visitante anônimo
         não tem grant em `forms`. */
      return await formService.getPublicForm(slug);
    },
  });

  /* O que a URL do anúncio trouxe. Vai para o Pixel e para a CAPI — sem isto
     o evento do servidor saía sem identificador de clique nenhum, e a conversão
     do Google ficava só na correspondência por contato. */
  const tracking = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const qs = new URLSearchParams(window.location.search);
    const chaves = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'fbclid', 'gclid', 'wbraid', 'gbraid',
    ] as const;
    const out: Record<string, string> = {};
    for (const k of chaves) {
      const v = qs.get(k);
      if (v) out[k] = v;
    }
    return out;
  }, []);

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch, setValue, getValues, trigger } = useForm();

  /* Formulário tem um momento só: enviar É deixar o contato. Por isso aqui sai
     `Lead` e não também `CompleteRegistration` — os dois no mesmo clique
     contariam a mesma pessoa duas vezes no Gerenciador de Eventos. */
  const { trackLead } = usePixelTracking({
    companyId: form?.company_id,
    formId: form?.id,
    overrides: {
      metaPixelId: form?.settings?.meta_pixel_id,
      googleConversionId: form?.settings?.google_conversion_id,
      googleLeadLabel: form?.settings?.google_lead_label,
    },
    tracking,
    enabled: !!form,
  });

  // Iframe auto-resize notification
  useEffect(() => {
    const updateHeight = () => {
      const root = document.getElementById('root');
      const height = root ? root.scrollHeight : document.body.scrollHeight;
      
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: 'LEADFLOW_RESIZE', height: height + 20 },
          origemDoEmbutidor(),
        );
      }
    };

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateHeight);
    });
    
    observer.observe(document.body);
    window.addEventListener('load', updateHeight);
    window.addEventListener('resize', updateHeight);
    
    updateHeight();
    const timeout = setTimeout(updateHeight, 500);
    
    return () => {
      observer.disconnect();
      window.removeEventListener('load', updateHeight);
      window.removeEventListener('resize', updateHeight);
      clearTimeout(timeout);
    };
  }, [currentStep, submitted, resumePrompt, form, isLoading]);

  useEffect(() => {
    localStorage.setItem(`lf_session_${slug}`, sessionId);
    
    const loadPartial = async () => {
      if (form?.id) {
        const data = await partialSubmissionService.getPartial(slug, form.id, sessionId);
        if (data && data.status !== 'completed') {
          setPartialData(data);
          setResumePrompt(true);
        }
      }
    };

    loadPartial();
  }, [form?.id, sessionId, slug]);

  const handleResume = () => {
    if (partialData) {
      reset(partialData.answers);
      setCurrentStep(partialData.current_step_index || 0);
    }
    setResumePrompt(false);
  };

  /* O `score_preview` não vem mais daqui. Ele era `0` fixo, o que tornava
     impossível distinguir "lead quente abandonou no passo 3" de "alguém abriu
     e saiu" — agora é calculado dentro de `form_rascunho_salvar`, com as
     regras que já estão no banco. */
  const saveProgress = async (stepIndex: number) => {
    if (!form) return;
    await partialSubmissionService.savePartial({
      slug,
      formId: form.id,
      sessionId,
      answers: getValues(),
      stepIndex,
      tracking: { ...tracker.getTrackingParams(), ...(tracking ?? {}) },
      visitorId: tracker.getTrackingParams().visitor_id ?? undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-6 space-y-4 w-full animate-pulse">
        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
        <p className="text-[13px] text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
        <Card className="max-w-md border-none shadow-xl">
          <CardContent className="pt-6 space-y-4">
            <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-6 w-6 rotate-45" />
            </div>
            <h2 className="text-xl font-bold">Formulário não encontrado</h2>
            <p className="text-muted-foreground text-sm">
              Este formulário não existe ou foi despublicado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* Configuração por formulário: o cliente decide se exige, com que texto e
     apontando para qual política. */
  const exigeConsentimento = Boolean(
    (form?.settings as Record<string, unknown> | undefined)?.lgpd_exigir_consentimento,
  );
  const textoLgpd = (form?.settings as Record<string, any> | undefined)?.lgpd_texto as string | undefined;
  const politicaLgpd = (form?.settings as Record<string, any> | undefined)?.lgpd_politica_url as string | undefined;
  const pedirMarketing = Boolean(
    (form?.settings as Record<string, unknown> | undefined)?.lgpd_pedir_marketing,
  );

  const onSubmit = async (values: any) => {
    /* A checagem também existe no servidor (`form_submit_publico` recusa com
       `consentimento_obrigatorio`). Aqui é só para a pessoa ver o motivo sem
       perder o que digitou — travar só na tela não protegeria nada, porque
       qualquer um chama a API direto. */
    if (exigeConsentimento && !consentimentos.dados) {
      setErroDeConsentimento(true);
      return;
    }
    setErroDeConsentimento(false);
    try {
      const params = new URLSearchParams(window.location.search);
      /* `landing_page` e `page_url` vêm da página que EMBUTIU o formulário —
         o SDK os passa na URL do iframe. O `tracker` grava
         `window.location.pathname`, que dentro do iframe é
         `/embed-form/<id>`: foi o que o teste no site da Exata gravou, e com
         isso o cliente não consegue saber de qual página do site veio o lead.
         Os parâmetros da URL vencem. */
      const trackingData = {
        ...tracker.getTrackingParams(),
        landing_page: params.get('landing_page') || params.get('page_url')
          || tracker.getTrackingParams().landing_page,
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
        utm_content: params.get('utm_content') || undefined,
        utm_term: params.get('utm_term') || undefined,
        gclid: params.get('gclid') || undefined,
        // No iOS o Google manda um destes em vez do `gclid`.
        wbraid: params.get('wbraid') || undefined,
        gbraid: params.get('gbraid') || undefined,
        fbclid: params.get('fbclid') || undefined,
      };

      /* O id nasce aqui, não dentro do disparo, porque tem que ir para os dois
         lados: para a Meta (navegador + servidor, para contar um só) e para a
         linha do lead, que é o que permite reconciliar depois. */
      const eventId = newEventId();

      /* Uma chamada, uma transação: lead + etiquetas + submissão + histórico.
         Nome, e-mail, telefone, score, temperatura e etiquetas saem do
         servidor — o navegador não decide mais a qualificação de quem
         preenche. */
      const result = await captureService.submitPublicForm({
        slug,
        sessionId,
        answers: values,
        tracking: trackingData,
        eventId,
        consents: consentimentos,
      });

       if (result.success) {
         trackLead(
           contatoDasRespostas(form.form_fields, values),
           {
             content_name: form.name ?? 'formulario',
             ...(result.score != null ? { score: result.score } : {}),
             ...(result.temperature ? { temperatura: result.temperature } : {}),
           },
           eventId,
         );

         // Avisa a página que embutiu o formulário, para a medição dela.
         if (window.parent) {
           window.parent.postMessage({
             type: 'LEADFLOW_FORM_SUBMITTED',
             formId: form.id,
             formSlug: form.slug
           }, origemDoEmbutidor());
         }

        partialSubmissionService.clearLocal(form.id, sessionId);
        
        if (form.settings.redirect_url) {
          // Se houver redirect, dar um pequeno delay para o usuário ver o feedback ou garantir que as mensagens de sucesso sejam processadas
          setTimeout(() => {
            window.location.href = form.settings.redirect_url!;
          }, 500);
        } else {
          setSubmitted(true);
        }
      } else if (result.error === 'consentimento_obrigatorio') {
        setErroDeConsentimento(true);
      } else {
        toast.error('Não foi possível enviar. Tente novamente.');
      }
    } catch (err) {
      toast.error('Ocorreu um erro no envio.');
    }
  };

  if (submitted) {
    return (
      <div className="animate-in fade-in zoom-in-95 duration-500">
        <Card className="max-w-md mx-auto border-none shadow-2xl bg-card/50 backdrop-blur-sm">
          <CardContent className="pt-12 pb-12 text-center space-y-6">
            <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-[26px] font-semibold tracking-[-0.02em]">Tudo certo!</h2>
              <p className="text-muted-foreground font-medium">
                {form.settings.success_message}
              </p>
            </div>
            {form.settings.whatsapp_number && (
              <Button 
                className="w-full h-12 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold gap-2"
                onClick={() => window.open(`https://wa.me/${form.settings.whatsapp_number}`)}
              >
                Continuar no WhatsApp
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (resumePrompt) {
    return (
      <div className="max-w-md mx-auto p-8 animate-in fade-in zoom-in-95 duration-500">
        <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-md text-center p-8 space-y-6">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
            <Activity className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Continuar de onde parou?</h2>
            <p className="text-muted-foreground">Identificamos que você já começou a preencher este formulário.</p>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={handleResume} className="h-11 font-medium">Continuar</Button>
            <Button variant="ghost" onClick={() => setResumePrompt(false)} className="text-xs text-muted-foreground">Começar do zero</Button>
          </div>
        </Card>
      </div>
    );
  }

  const isMultiStep = form.type === 'multi_step' && form.form_steps && form.form_steps.length > 0;
  const sortedSteps = isMultiStep ? [...form.form_steps].sort((a, b) => a.sort_order - b.sort_order) : [];
  const currentStepFields = isMultiStep 
    ? form.form_fields.filter(f => f.step_id === sortedSteps[currentStep]?.id || !f.step_id && currentStep === 0)
    : [...form.form_fields].sort((a, b) => a.sort_order - b.sort_order);
  const progress = isMultiStep ? ((currentStep + 1) / sortedSteps.length) * 100 : 0;

  const handleNext = async () => {
    const fieldsInStep = currentStepFields.map(f => f.name || f.label.toLowerCase().replace(/[^a-z0-9]/g, '_'));
    const isValid = await trigger(fieldsInStep);
    
    if (!isValid) return;

    const nextStep = currentStep + 1;
    if (currentStep < sortedSteps.length - 1) {
      setCurrentStep(nextStep);
      saveProgress(nextStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleSubmit(onSubmit)();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="w-full h-full overflow-hidden flex flex-col">
      <form 
        onSubmit={handleSubmit(onSubmit)}
        className="w-full mx-auto p-0 animate-in fade-in duration-700 flex-1 min-h-0 flex flex-col" 
        style={{ color: 'var(--foreground)' }}
      >
        {/* Só esta parte rola; a barra de ação fica fora dela. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        <Card className="border-none shadow-none bg-transparent w-full overflow-visible" style={{ borderColor: 'var(--border)' }}>
        {isMultiStep && (
          /* `pr-12`: dentro do modal o botão de fechar fica no canto superior
             direito e cobria o "50% completo". A folga reserva o espaço dele. */
          <div className="pt-5 px-6 sm:px-8 pr-12 sm:pr-14">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Passo {currentStep + 1} de {sortedSteps.length}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                {Math.round(progress)}%
              </span>
            </div>
            <Progress value={progress} className="h-1" />
          </div>
        )}
        
        <CardHeader className="space-y-1.5 px-6 sm:px-8 pb-7 pt-5 border-none" style={{ borderColor: 'var(--border)' }}>
          {isMultiStep ? (
            <div className="text-center space-y-1">
               <CardTitle className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                {sortedSteps[currentStep]?.title || form.name}
              </CardTitle>
              {sortedSteps[currentStep]?.description && (
                <p className="text-sm text-muted-foreground">{sortedSteps[currentStep].description}</p>
              )}
            </div>
          ) : (
            /* O NOME do formulário é rótulo interno — "TESTE WORDPRESS - pode
               apagar" foi o que apareceu para o visitante no site do cliente,
               num bloco azul do tamanho de um cabeçalho. Quem quiser título
               visível escreve na DESCRIÇÃO; sem descrição, o formulário entra
               direto nos campos, que é o que uma página já contextualizou
               espera. */
            form.description ? (
              <div className="text-center space-y-1">
                <CardTitle className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                  {form.description}
                </CardTitle>
              </div>
            ) : null
          )}
        </CardHeader>
        <CardContent className="pb-8 pt-0 px-6 sm:px-8">
          <div className="space-y-6 max-w-2xl mx-auto">
            {currentStepFields.map((field) => (
              <div key={field.id} className="space-y-2.5 animate-in fade-in slide-in-from-right-2 duration-300">
                 <Label className="text-[13px] font-medium text-foreground">
                  {field.label} {field.required && <span className="text-destructive">*</span>}
                </Label>
                
                {field.type === 'textarea' ? (
                  <Textarea 
                    {...register(field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'), { required: field.required })}
                    placeholder={field.placeholder}
                     className="min-h-[116px] rounded-[10px] border border-input bg-background px-3.5 py-3 text-[15px] transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15"
                  />
                ) : field.type === 'select' ? (
                  <div className="relative group">
                    <select
                      {...register(field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'), { required: field.required })}
                       className="w-full h-12 rounded-[10px] border border-input bg-background px-3.5 text-[15px] transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 appearance-none pr-10"
                    >
                      <option value="">Selecione uma opção...</option>
                      {(field.options || []).map((option: any, i: number) => {
                        const label = typeof option === 'string' ? option : option.label;
                        const value = typeof option === 'string' ? option : (option.value || option.label);
                        return <option key={option.id || value || i} value={value}>{label}</option>;
                      })}
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                      <ChevronRight className="h-4 w-4 rotate-90" />
                    </div>
                  </div>
                ) : (
                  <Input
                    type={field.type === 'phone' ? 'tel' : field.type}
                    {...register(field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'), { 
                      required: field.required,
                      pattern: field.type === 'email' ? /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i : undefined
                    })}
                    placeholder={field.placeholder}
                    className="h-12 rounded-[10px] border border-input bg-background px-3.5 text-[15px] transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15"
                  />
                )}
                {errors[field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_')] && (
                  <span className="text-[12px] text-destructive block mt-1.5">
                    {errors[field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_')]?.type === 'pattern' 
                      ? 'E-mail inválido' 
                      : 'Campo obrigatório'}
                  </span>
                )}
              </div>
            ))}
            
            {/* Só na última etapa: pedir autorização no passo 1 de 5, antes de a
                  pessoa saber o que está preenchendo, reduz a conversão e não
                  melhora em nada a qualidade do consentimento. */}
              {(!isMultiStep || currentStep === sortedSteps.length - 1) && (exigeConsentimento || pedirMarketing) && (
                <div className="w-full">
                  <ConsentimentoLGPD
                    valor={consentimentos}
                    onMudar={(v) => { setConsentimentos(v); if (v.dados) setErroDeConsentimento(false); }}
                    texto={textoLgpd}
                    politicaUrl={politicaLgpd}
                    pedirMarketing={pedirMarketing}
                    erro={erroDeConsentimento}
                  />
                </div>
              )}

              {/* A assinatura fica ANTES da barra, dentro do que rola: depois
                  dela sobrava um vão esquisito embaixo do rodapé fixo, e a
                  barra parecia um divisor no meio do cartão em vez do fim
                  dele. */}
              <div className="pt-1 text-center">
                <span className="text-[11px] text-muted-foreground/70">
                  Formulário por <span className="font-medium text-foreground/60">LeadFlow</span>
                </span>
              </div>

          </div>
        </CardContent>
      </Card>
      </div>

        {/* Barra de ação FORA da área que rola.
            Tentei antes com `position: sticky` e NÃO funcionou — medido: numa
            janela de 560px o topo da barra ficava em 624px. Sticky só segura um
            elemento enquanto o contêiner dele ainda está em vista, e como a
            barra era o ÚLTIMO filho não havia espaço nenhum para ela grudar.
            O que funciona é tirá-la do que rola: a coluna é flex, os campos
            ficam em `flex-1 overflow-y-auto` e a barra é irmã, com `shrink-0`.
            Assim ela não depende de rolagem para estar visível. */}
        <div className="shrink-0 flex gap-3 border-t border-[var(--linha-sutil)] bg-background px-6 sm:px-8 py-4">
              {isMultiStep && currentStep > 0 && (
                <Button 
                  variant="outline"
                  onClick={handleBack}
                  className="h-12 px-6 font-medium"
                >
                  <ArrowLeft className="mr-2 h-5 w-5" /> Voltar
                </Button>
              )}
              
              <Button 
                type={isMultiStep ? "button" : "submit"}
                onClick={isMultiStep ? (e) => {
                  e.preventDefault();
                  handleNext();
                } : undefined}
                disabled={isSubmitting}
                className="flex-1 h-12 text-[15px] font-semibold tracking-[-0.01em] shadow-lg shadow-primary/20 transition-all hover:brightness-[1.06] active:scale-[0.99] bg-primary text-white"
              >
                {isSubmitting ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    {isMultiStep 
                      ? (currentStep === sortedSteps.length - 1 ? form.settings.submit_label : sortedSteps[currentStep].button_text || 'Próximo')
                      : form.settings.submit_label
                    }
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
      </form>
    </div>
  );
}
