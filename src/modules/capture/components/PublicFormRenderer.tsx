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
import { Loader2, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import { captureService } from '../services/captureService';
import { tracker } from '@/core/tracking/tracker';

interface PublicFormRendererProps {
  slug: string;
}

export function PublicFormRenderer({ slug }: PublicFormRendererProps) {
  const [submitted, setSubmitted] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const { data: form, isLoading, error } = useQuery({
    queryKey: ['public-form', slug],
    queryFn: () => formService.getFormBySlug(slug),
  });

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, watch } = useForm();

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
      const trackingData = tracker.getTrackingParams();
      const result = await captureService.submitLead(form.tenant_id, {
        name: values.name || values.full_name || 'Anonymous',
        email: values.email,
        phone: values.phone,
        metadata: {
          form_id: form.id,
          form_slug: form.slug,
          answers: values
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

  const sortedFields = [...form.form_fields].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Card className="border-none shadow-2xl overflow-hidden bg-card/80 backdrop-blur-md">
        <div className="h-2 bg-primary" />
        <CardHeader className="space-y-2 pb-8 pt-8">
          <CardTitle className="text-3xl font-black uppercase tracking-tighter text-center">{form.name}</CardTitle>
          {form.description && (
            <CardDescription className="text-center text-base font-medium">{form.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="pb-12">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {sortedFields.map((field) => (
              <div key={field.id} className="space-y-2">
                <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {field.label} {field.required && <span className="text-destructive">*</span>}
                </Label>
                
                {field.type === 'textarea' ? (
                  <Textarea 
                     {...register(field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'), { required: field.required })}
                    placeholder={field.placeholder}
                    className="min-h-[120px] bg-background/50 border-2 focus-visible:ring-primary/20"
                  />
                ) : (
                  <Input 
                    type={field.type === 'phone' ? 'tel' : field.type}
                     {...register(field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_'), { required: field.required })}
                    placeholder={field.placeholder}
                    className="h-12 bg-background/50 border-2 focus-visible:ring-primary/20 text-base"
                  />
                )}
                 {errors[field.name || field.label.toLowerCase().replace(/[^a-z0-9]/g, '_')] && (
                  <span className="text-xs font-bold text-destructive uppercase tracking-widest">This field is required</span>
                )}
              </div>
            ))}
            
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full h-14 text-lg font-black uppercase tracking-widest shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {isSubmitting ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  {form.settings.submit_label}
                  <ChevronRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      <div className="mt-8 flex justify-center items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Powered by</span>
        <span className="text-xs font-black uppercase tracking-tighter">LeadFlow Intelligence</span>
      </div>
    </div>
  );
}