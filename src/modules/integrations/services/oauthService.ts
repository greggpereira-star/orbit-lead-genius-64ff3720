import { supabase } from '@/lib/supabase';

export const oauthService = {
  async getAuthUrl(provider: 'meta' | 'google', companyId: string) {
    const { data: { publicUrl } } = supabase.storage.from('system').getPublicUrl('oauth'); // Just to get base URL
    const baseUrl = window.location.origin;
    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback`;
    
    const state = btoa(JSON.stringify({ companyId, provider, origin: baseUrl }));
    
    if (provider === 'meta') {
      const appId = import.meta.env.VITE_META_APP_ID;
      const scopes = [
        'ads_management',
        'ads_read',
        'business_management',
        'leads_retrieval',
        'pages_read_engagement',
        'pages_manage_metadata'
      ].join(',');
      
      return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&scope=${scopes}&response_type=code`;
    } else {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const scopes = [
        'https://www.googleapis.com/auth/adwords',
        'https://www.googleapis.com/auth/userinfo.email',
        'openid',
        'profile'
      ].join(' ');
      
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scopes}&response_type=code&access_type=offline&prompt=consent`;
    }
  },

  async getConnection(companyId: string, provider: string) {
    const { data, error } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('company_id', companyId)
      .eq('provider', provider)
      .maybeSingle();
    
    return { data, error };
  }
};
