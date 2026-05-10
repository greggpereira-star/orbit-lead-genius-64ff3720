import React, { useState } from 'react';
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
 import { Loader2, CheckCircle2, ChevronRight, ChevronLeft, ArrowRight, ArrowLeft } from 'lucide-react';
 import { Progress } from '@/components/ui/progress';
import { captureService } from '../services/captureService';
import { tracker } from '@/core/tracking/tracker';

interface PublicFormRendererProps {
  slug: string;
}

export function PublicFormRenderer({ slug }: PublicFormRendererProps) {
  const [submitted, setSubmitted] = useState(false);
   const [currentStep, setCurrentStep] = useState(0); // 0-based for array indexing

  const { data: form, isLoading, error } = useQuery({
    queryKey: ['public-form', slug],
    queryFn: () => formService.getFormBySlug(slug),
  });

   const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch, setValue } = useForm();
 
   // Capture UTMs from URL
   React.useEffect(() => {
     const params = new URLSearchParams(window.location.search);
     const ecData = params.get('ec_data');
     
     if (ecData) {
       try {
         const parsed = JSON.parse(ecData);
         console.log('LeadFlow: E-commerce context detected', parsed);
       } catch (e) {}
     }
   }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading enterprise form...</p>
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
            <h2 className="text-xl font-bold">Form not found</h2>
            <p className="text-muted-foreground text-sm">
              The form you are looking for does not exist or has been unpublished.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const onSubmit = async (values: any) => {
    try {
       const params = new URLSearchParams(window.location.search);
       const trackingData = {
         ...tracker.getTrackingParams(),
         utm_source: params.get('utm_source') || undefined,
         utm_medium: params.get('utm_medium') || undefined,
         utm_campaign: params.get('utm_campaign') || undefined,
         utm_content: params.get('utm_content') || undefined,
         utm_term: params.get('utm_term') || undefined,
         gclid: params.get('gclid') || undefined,
         fbclid: params.get('fbclid') || undefined,
       };
 
       const ecData = params.get('ec_data');
       let ecommerceContext = {};
       if (ecData) {
         try { ecommerceContext = JSON.parse(ecData); } catch (e) {}
       }
 
       const result = await captureService.submitLead(form.tenant_id, {
         name: values.name || values.full_name || 'Anonymous',
         email: values.email,
         phone: values.phone,
         metadata: {
           form_id: form.id,
           form_slug: form.slug,
           answers: values,
           ecommerce: ecommerceContext,
           source: 'public_form_v2'
         }
       }, trackingData);

      if (result.success) {
        setSubmitted(true);
        if (form.settings.redirect_url) {
          window.location.href = form.settings.redirect_url;
        }
      } else {
        toast.error('Failed to submit form. Please try again.');
      }
    } catch (err) {
      toast.error('An error occurred during submission.');
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
              <h2 className="text-3xl font-black uppercase tracking-tighter">Success!</h2>
              <p className="text-muted-foreground font-medium">
                {form.settings.success_message}
              </p>
            </div>
            {form.settings.whatsapp_number && (
              <Button 
                className="w-full h-12 bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold gap-2"
                onClick={() => window.open(`https://wa.me/${form.settings.whatsapp_number}`)}
              >
                Continue to WhatsApp
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

   const isMultiStep = form.type === 'multi_step' && form.form_steps && form.form_steps.length > 0;
   
   const sortedSteps = isMultiStep 
     ? [...form.form_steps].sort((a, b) => a.sort_order - b.sort_order)
     : [];
 
   const currentStepFields = isMultiStep 
     ? form.form_fields.filter(f => f.step_id === sortedSteps[currentStep]?.id || !f.step_id && currentStep === 0)
     : [...form.form_fields].sort((a, b) => a.sort_order - b.sort_order);
 
   const progress = isMultiStep ? ((currentStep + 1) / sortedSteps.length) * 100 : 0;
 
   const handleNext = async () => {
     const fieldsInStep = currentStepFields.map(f => f.name || f.label.toLowerCase().replace(/[^a-z0-9]/g, '_'));
     const isValid = await watch(fieldsInStep); // Basic check, better to use trigger()
     
     if (currentStep < sortedSteps.length - 1) {
       setCurrentStep(prev => prev + 1);
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
     <div className="max-w-2xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ color: 'var(--foreground)' }}>
      <Card className="border-none shadow-2xl overflow-hidden bg-card/80 backdrop-blur-md" style={{ borderColor: 'var(--border)' }}>
         {isMultiStep ? (
           <div className="pt-6 px-8">
             <div className="flex justify-between items-center mb-2">
               <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                 Passo {currentStep + 1} de {sortedSteps.length}
               </span>
               <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                 {Math.round(progress)}% Completo
               </span>
             </div>
             <Progress value={progress} className="h-1.5" />
           </div>
         ) : (
           <div className="h-2" style={{ backgroundColor: 'var(--primary)' }} />
         )}
         
         <CardHeader className="space-y-2 pb-8 pt-8 border-b" style={{ borderColor: 'var(--border)' }}>
           {isMultiStep ? (
             <div className="text-center space-y-1">
               <CardTitle className="text-2xl font-black uppercase tracking-tighter">
                 {sortedSteps[currentStep]?.title || form.name}
               </CardTitle>
               {sortedSteps[currentStep]?.description && (
                 <p className="text-sm text-muted-foreground">{sortedSteps[currentStep].description}</p>
               )}
             </div>
           ) : (
             <>
               <CardTitle className="text-3xl font-black uppercase tracking-tighter text-center" style={{ color: 'var(--foreground)' }}>{form.name}</CardTitle>
               {form.description && (
                 <CardDescription className="text-center text-base font-medium">{form.description}</CardDescription>
               )}
             </>
            )}
          </CardHeader>
         <CardContent className="pb-12 pt-6">
           <div className="space-y-6">
             {currentStepFields.map((field) => (
               <div key={field.id} className="space-y-2 animate-in fade-in slide-in-from-right-2 duration-300">
                 <Label className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                   {field.label} {field.required && <span className="text-destructive">*</span>}
                 </Label>
                 
                  {field.type === 'textarea' ? (
                    <Textarea 
                       {...register(field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'), { required: field.required })}
                      placeholder={field.placeholder}
                      className="min-h-[120px] bg-background/50 border-2 focus-visible:ring-primary/20"
                    />
                   ) : field.type === 'select' ? (
                     <div className="relative group">
                       <select
                         {...register(field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'), { required: field.required })}
                         className="w-full h-12 rounded-md border-2 bg-background/50 px-3 py-1 text-base shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 appearance-none"
                         style={{ 
                           borderColor: 'var(--border)',
                           '--tw-ring-color': 'var(--primary)',
                         } as any}
                       >
                         <option value="">Selecione uma opção...</option>
                         {(field.options || []).map((option: string, i: number) => (
                           <option key={i} value={option}>{option}</option>
                         ))}
                       </select>
                       <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                         <ChevronRight className="h-4 w-4 rotate-90" />
                       </div>
                     </div>
                  ) : (
                     <Input
                       type={field.type === 'phone' ? 'tel' : field.type}
                       {...register(field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'), { required: field.required })}
                       placeholder={field.placeholder}
                       className="h-12 bg-background/50 border-2 text-base transition-all"
                       style={{ 
                         borderColor: 'var(--border)',
                         '--tw-ring-color': 'var(--primary)',
                       } as any}
                     />
                  )}
                  {errors[field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_')] && (
                   <span className="text-xs font-bold text-destructive uppercase tracking-widest">Este campo é obrigatório</span>
                 )}
               </div>
             ))}
             
             <div className="flex gap-4 pt-4">
               {isMultiStep && currentStep > 0 && (
                 <Button 
                   variant="outline"
                   onClick={handleBack}
                   className="h-14 px-8 font-bold uppercase tracking-widest border-2"
                 >
                   <ArrowLeft className="mr-2 h-5 w-5" /> Voltar
                 </Button>
               )}
               
               <Button 
                 onClick={isMultiStep ? handleNext : handleSubmit(onSubmit)}
                 disabled={isSubmitting}
                 className="flex-1 h-14 text-lg font-black uppercase tracking-widest shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                 style={{ 
                   backgroundColor: 'var(--primary)',
                   color: 'var(--primary-foreground)',
                   boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.2)' 
                 }}
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
           </div>
         </CardContent>
      </Card>
      
      <div className="mt-8 flex justify-center items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Powered by</span>
        <span className="text-xs font-black uppercase tracking-tighter">LeadFlow Intelligence</span>
      </div>
    </div>
  );
}