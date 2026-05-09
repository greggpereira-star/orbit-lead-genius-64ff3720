 import { SupabaseClient } from '@supabase/supabase-js';
 import { logger } from '@/core/observability/logger';
 import { AuthState, WorkspaceContext, UserProfile, Company, Membership } from '../types/index';
 
 export class WorkspaceOrchestrator {
   private client: SupabaseClient;
   private traceId: string;
 
   constructor(client: SupabaseClient, traceId: string) {
     this.client = client;
     this.traceId = traceId;
   }
 
   async validateAndRepair(userId: string, email: string, metadata: any): Promise<WorkspaceContext> {
     logger.info('WorkspaceOrchestrator: Starting validation', { userId, traceId: this.traceId });
     
     const context: WorkspaceContext = {
       user: null,
       company: null,
       membership: null,
       state: 'TENANT_VALIDATING',
       error: null,
       traceId: this.traceId
     };
 
     try {
       // 1. Validate Profile
       context.user = await this.ensureProfile(userId, email, metadata);
       
       // 2. Validate/Repair Company & Membership
       const workspace = await this.ensureWorkspace(userId, metadata);
       context.company = workspace.company;
       context.membership = workspace.membership;
       
       context.state = 'READY';
       logger.info('WorkspaceOrchestrator: Validation successful', { userId, companyId: context.company?.id });
       return context;
       
     } catch (err: any) {
       logger.error('WorkspaceOrchestrator: Critical failure', { error: err.message, userId });
       return {
         ...context,
         state: 'ERROR',
         error: err.message
       };
     }
   }
 
   private async ensureProfile(userId: string, email: string, metadata: any): Promise<UserProfile> {
     logger.info('WorkspaceOrchestrator: Ensuring profile', { userId });
     
     const { data: profile, error } = await this.client
       .from('profiles')
       .select('*')
       .eq('id', userId)
       .maybeSingle();
 
     if (error) throw new Error(`Profile check failed: ${error.message}`);
 
     if (!profile) {
       logger.info('WorkspaceOrchestrator: Profile missing, creating...', { userId });
       const { data: newProfile, error: createError } = await this.client
         .from('profiles')
         .insert({
           id: userId,
           full_name: metadata.full_name || email.split('@')[0],
           avatar_url: metadata.avatar_url
         })
         .select()
         .single();
 
       if (createError) throw new Error(`Profile creation failed: ${createError.message}`);
       return {
         id: newProfile.id,
         email,
         name: newProfile.full_name,
         avatar_url: newProfile.avatar_url
       };
     }
 
     return {
       id: profile.id,
       email,
       name: profile.full_name,
       avatar_url: profile.avatar_url
     };
   }
 
   private async ensureWorkspace(userId: string, metadata: any): Promise<{ company: Company; membership: Membership }> {
     logger.info('WorkspaceOrchestrator: Ensuring workspace integrity', { userId });
 
     // Check existing membership
     const { data: membership, error: memError } = await this.client
       .from('memberships')
       .select('*, companies(*)')
       .eq('user_id', userId)
       .maybeSingle();
 
     if (memError) throw new Error(`Membership validation failed: ${memError.message}`);
 
     if (membership && membership.companies) {
       return {
         company: membership.companies,
         membership: {
           id: membership.id,
           user_id: membership.user_id,
           company_id: membership.company_id,
           role: membership.role
         }
       };
     }
 
     // If missing, we are in Recovery Mode or first-time setup
     logger.warn('WorkspaceOrchestrator: Workspace missing, initiating Recovery Engine', { userId });
     
     const companyName = metadata.company_name || 'Enterprise Workspace';
     const baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'workspace';
     const uniqueSlug = `${baseSlug}-${userId.substring(0, 5)}-${Math.floor(Math.random() * 1000)}`;
 
     // Atomic recovery transaction (emulated via JS as we don't have Rpc here)
     const { data: newCompany, error: compError } = await this.client
       .from('companies')
       .insert({ name: companyName, slug: uniqueSlug })
       .select()
       .single();
 
     if (compError) throw new Error(`Company recovery failed: ${compError.message}`);
 
     const { data: newMembership, error: newMemError } = await this.client
       .from('memberships')
       .insert({
         company_id: newCompany.id,
         user_id: userId,
         role: 'owner'
       })
       .select()
       .single();
 
     if (newMemError) {
       // Cleanup orphan company if membership fails
       await this.client.from('companies').delete().eq('id', newCompany.id);
       throw new Error(`Membership recovery failed: ${newMemError.message}`);
     }
 
     return {
       company: newCompany,
       membership: newMembership
     };
   }
 }