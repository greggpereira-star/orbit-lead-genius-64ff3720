import { supabase } from '@/lib/supabase';

/**
 * Legacy OAuth helper — Google Ads only.
 * Meta OAuth uses the modern server-function flow in `src/lib/meta-oauth.functions.ts`
 * with the `/integrations/meta` route.
 */
export const oauthService = {
  async getAuthUrl(provider: 'google', companyId: string) {
    const baseUrl = window.location.origin;
    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-callback`;
    const state = btoa(JSON.stringify({ companyId, provider, origin: baseUrl }));

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const scopes = [
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
      'profile',
    ].join(' ');

    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scopes}&response_type=code&access_type=offline&prompt=consent`;
  },

  async getConnection(companyId: string, provider: 'google' | 'meta') {
    const { data, error } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('company_id', companyId)
      .eq('provider', provider)
      .maybeSingle();

    return { data, error };
  },
};
