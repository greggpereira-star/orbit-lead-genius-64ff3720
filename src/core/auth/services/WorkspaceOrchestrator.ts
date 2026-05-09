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
 
   async validateAndRepair(userId: string, email: string, metadata: any, onProgress?: (state: AuthState) => void): Promise<WorkspaceContext> {
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
        onProgress?.('TENANT_VALIDATING');
        context.user = await this.ensureProfile(userId, email, metadata);

        onProgress?.('TENANT_RECOVERING');
        const workspace = await this.ensureWorkspace(userId, metadata, onProgress);
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
 
  private async ensureWorkspace(userId: string, metadata: any, onProgress?: (state: AuthState) => void): Promise<{ company: Company; membership: Membership }> {
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
      const { data: newCompany, error: compError } = await this.client.rpc('get_or_create_company', {
        p_name: companyName,
        p_slug: uniqueSlug,
        p_user_id: userId
      });

      if (compError) {
        logger.warn('RPC get_or_create_company missing, falling back to manual creation');
        const { data, error } = await this.client
          .from('companies')
          .insert({ name: companyName, slug: uniqueSlug, created_by: userId })
          .select()
          .single();
        if (error) throw new Error(`Company recovery failed: ${error.message}`);
        return this.finishWorkspaceSetup(userId, data, onProgress);
      }

      return this.finishWorkspaceSetup(userId, newCompany, onProgress);
    }

    private async finishWorkspaceSetup(userId: string, company: Company, onProgress?: (state: AuthState) => void): Promise<{ company: Company; membership: Membership }> {
      onProgress?.('MEMBERSHIP_RECOVERING');
      
      const { data: membership, error: memError } = await this.client
        .from('memberships')
        .insert({
          company_id: company.id,
          user_id: userId,
          role: 'owner'
        })
        .select()
        .single();

      if (memError && !memError.message.includes('unique_user_company_membership')) {
         throw new Error(`Membership recovery failed: ${memError.message}`);
      }

      const finalMembership = membership || await this.client
        .from('memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('company_id', company.id)
        .single()
        .then(res => res.data);

      onProgress?.('ROLE_RECOVERING');
      onProgress?.('WORKSPACE_READY');
      return {
        company,
        membership: finalMembership
      };
    } catch (error: any) {
      console.error('Workspace recovery failed:', error);
      throw error;
    }
  }
}
