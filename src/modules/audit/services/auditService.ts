 import { supabase } from '@/lib/supabase';
 
 export const auditService = {
   async logAction(companyId: string, userId: string, action: string, entity: { type: string; id?: string }, changes?: any) {
     const { error } = await supabase.from('audit_logs').insert({
       company_id: companyId,
       user_id: userId,
       action,
       entity_type: entity.type,
       entity_id: entity.id,
       changes
     });
 
     if (error) console.error('Audit log failed:', error);
   }
 };