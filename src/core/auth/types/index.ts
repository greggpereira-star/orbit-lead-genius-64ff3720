  export type AuthState =
    | 'IDLE'
    | 'BOOTSTRAP_START'
    | 'INITIALIZING'
    | 'SESSION_LOADING'
    | 'AUTHENTICATING'
    | 'UNAUTHENTICATED'
    | 'PROFILE_LOADING'
   | 'AUTHENTICATING'
   | 'CREATING_ACCOUNT'
   | 'ACCOUNT_CREATED'
   | 'EMAIL_SENT'
   | 'WAITING_EMAIL_CONFIRMATION'
   | 'EMAIL_CONFIRMED'
   | 'SESSION_RECOVERED'
   | 'TENANT_VALIDATING'
   | 'TENANT_RECOVERING'
   | 'MEMBERSHIP_RECOVERING'
   | 'ROLE_RECOVERING'
   | 'PERMISSIONS_RECOVERING'
   | 'WORKSPACE_READY'
   | 'DASHBOARD_BOOTSTRAP'
    | 'READY'
    | 'AUTHENTICATED'
    | 'WORKSPACE_HYDRATING'
    | 'WORKSPACE_READY'
    | 'READY'
    | 'ERROR'
    | 'RECOVERY_MODE';
 
 export interface UserProfile {
   id: string;
   email: string;
   name: string;
   avatar_url?: string | null;
 }
 
 export interface Company {
   id: string;
   name: string;
   slug: string;
 }
 
 export interface Membership {
   id: string;
   user_id: string;
   company_id: string;
   role: string;
 }
 
 export interface WorkspaceContext {
   user: UserProfile | null;
   company: Company | null;
   membership: Membership | null;
   state: AuthState;
   error: string | null;
   traceId: string;
 }