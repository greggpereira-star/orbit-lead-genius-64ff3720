import { supabase } from '@/lib/supabase';

export const discoveryService = {
  async discoverMetaAssets(companyId: string) {
    // This will trigger an edge function that uses the stored tokens to fetch assets
    const { data, error } = await supabase.functions.invoke('discover-meta-assets', {
      body: { companyId }
    });
    return { data, error };
  },

  async discoverGoogleAssets(companyId: string) {
    const { data, error } = await supabase.functions.invoke('discover-google-assets', {
      body: { companyId }
    });
    return { data, error };
  },

  async toggleAsset(assetId: string, isActive: boolean, provider: 'meta' | 'google') {
    const table = provider === 'meta' ? 'meta_assets' : 'google_assets';
    const { error } = await supabase
      .from(table)
      .update({ is_active: isActive })
      .eq('id', assetId);
    return { error };
  }
};
