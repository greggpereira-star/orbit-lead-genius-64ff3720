 import React from 'react';
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
       metadata: { company_name: values.company }
     }, trackingData);
 
     if (result.success) {
       toast.success('Lead captured successfully!');
       form.reset();
     } else {
       toast.error('Error capturing lead');
       console.error(result.error);
     }
   };
 
   return (
     <Form {...form}>
       <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
         <FormField
           control={form.control}
           name="name"
           render={({ field }) => (
             <FormItem>
               <FormLabel>Full Name</FormLabel>
               <FormControl>
                 <Input placeholder="John Doe" {...field} />
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
               <FormLabel>Email</FormLabel>
               <FormControl>
                 <Input placeholder="john@example.com" {...field} />
               </FormControl>
               <FormMessage />
             </FormItem>
           )}
         />
         <div className="grid grid-cols-2 gap-4">
           <FormField
             control={form.control}
             name="phone"
             render={({ field }) => (
               <FormItem>
                 <FormLabel>Phone (optional)</FormLabel>
                 <FormControl>
                   <Input placeholder="+55..." {...field} />
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
                 <FormLabel>Company (optional)</FormLabel>
                 <FormControl>
                   <Input placeholder="Acme Inc" {...field} />
                 </FormControl>
                 <FormMessage />
               </FormItem>
             )}
           />
         </div>
         <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
           {form.formState.isSubmitting ? 'Sending...' : 'Request Contact'}
         </Button>
       </form>
     </Form>
   );
 }