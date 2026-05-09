 import React, { useState } from 'react';
 import { useForm } from 'react-hook-form';
 import { zodResolver } from '@hookform/resolvers/zod';
 import * as z from 'zod';
 import { Button } from '@/components/ui/button';
 import {
   Form,
   FormControl,
   FormField,
   FormItem,
   FormLabel,
   FormMessage,
 } from '@/components/ui/form';
 import { Input } from '@/components/ui/input';
 import { toast } from 'sonner';
import { LGPDConsent } from './LGPDConsent';
 import { captureService } from '../services/captureService';
 import { tracker } from '@/core/tracking/tracker';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 
 const formSchema = z.object({
   name: z.string().min(2, 'Name is too short'),
   email: z.string().email('Invalid email'),
   phone: z.string().optional(),
   company: z.string().optional(),
 });
 
 export function CaptureForm() {
   const [step, setStep] = useState(1);
  const [consents, setConsents] = useState({ marketing: true, tracking: true });
   const form = useForm<z.infer<typeof formSchema>>({
     resolver: zodResolver(formSchema),
     defaultValues: {
       name: '',
       email: '',
       phone: '',
       company: '',
     },
   });
 
   const { company } = useAuth();
 
   const onSubmit = async (values: z.infer<typeof formSchema>) => {
     if (!company) {
       toast.error('No company context found');
       return;
     }
 
     const trackingData = tracker.getTrackingParams();
     
     const result = await captureService.submitLead(company.id, {
       name: values.name,
       email: values.email,
       phone: values.phone,
      metadata: { 
        company_name: values.company,
        consents,
        consent_version: '2.4.0-2024'
      }
     }, trackingData);
 
     if (result.success) {
       toast.success('Lead captured successfully!');
       form.reset();
     } else {
       toast.error('Error capturing lead');
       console.error(result.error);
     }
   };
 
   const nextStep = () => {
     const fieldsToValidate = step === 1 ? ['name', 'email'] : ['phone', 'company'];
     form.trigger(fieldsToValidate as any).then(isValid => {
       if (isValid) setStep(s => s + 1);
     });
   };
 
   return (
     <Form {...form}>
       <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
         <div className="flex justify-between mb-8">
           {[1, 2].map((i) => (
             <div key={i} className="flex items-center gap-2">
               <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= i ? 'bg-primary text-primary-foreground shadow-lg' : 'bg-muted text-muted-foreground border'}`}>
                 {i}
               </div>
               <span className={`text-xs font-medium ${step >= i ? 'text-foreground' : 'text-muted-foreground'}`}>
                 {i === 1 ? 'Information' : 'Business'}
               </span>
             </div>
           ))}
         </div>
 
         {step === 1 && (
           <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
             <FormField
               control={form.control}
               name="name"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel className="text-sm font-semibold">What is your full name?</FormLabel>
                   <FormControl>
                     <Input placeholder="John Doe" className="h-12 text-lg focus-visible:ring-2" {...field} />
                   </FormControl>
                   <FormMessage />
                 </FormItem>
               )}
             />
             <FormField
               control={form.control}
               name="email"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel className="text-sm font-semibold">Your work email address</FormLabel>
                   <FormControl>
                     <Input placeholder="john@example.com" className="h-12 text-lg focus-visible:ring-2" {...field} />
                   </FormControl>
                   <FormMessage />
                 </FormItem>
               )}
             />
             <Button type="button" onClick={nextStep} className="w-full h-12 text-base font-bold shadow-md hover:shadow-lg transition-all">
               Continue to next step
             </Button>
           </div>
         )}
 
         {step === 2 && (
           <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
             <FormField
               control={form.control}
               name="phone"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel className="text-sm font-semibold">Phone number (optional)</FormLabel>
                   <FormControl>
                     <Input placeholder="+1..." className="h-12 text-lg focus-visible:ring-2" {...field} />
                   </FormControl>
                   <FormMessage />
                 </FormItem>
               )}
             />
             <FormField
               control={form.control}
               name="company"
               render={({ field }) => (
                 <FormItem>
                   <FormLabel className="text-sm font-semibold">Company name (optional)</FormLabel>
                   <FormControl>
                     <Input placeholder="Acme Inc" className="h-12 text-lg focus-visible:ring-2" {...field} />
                   </FormControl>
                   <FormMessage />
                 </FormItem>
               )}
             />
              <LGPDConsent onConsentChange={setConsents} />
             <div className="flex gap-3">
               <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 h-12">
                 Back
               </Button>
               <Button type="submit" className="flex-[2] h-12 text-base font-bold bg-primary hover:bg-primary/90 shadow-md transition-all" disabled={form.formState.isSubmitting}>
                 {form.formState.isSubmitting ? 'Processing...' : 'Complete Registration'}
               </Button>
             </div>
           </div>
         )}
       </form>
     </Form>
   );
 }