import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { oauthService } from '../services/oauthService';
import { discoveryService } from '../services/discoveryService';

export function useIntegration(companyId: string | undefined, provider: 'meta' | 'google') {
  const [connection, setConnection] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      fetchConnection();
      fetchAssets();
    }
  }, [companyId]);

  const fetchConnection = async () => {
    if (!companyId) return;
    const { data } = await oauthService.getConnection(companyId, provider);
    setConnection(data);
    setIsLoading(false);
  };

  const fetchAssets = async () => {
    if (!companyId) return;
    const table = provider === 'meta' ? 'meta_assets' : 'google_assets';
    const { data } = await supabase
      .from(table)
      .select('*')
      .eq('company_id', companyId);
    setAssets(data || []);
  };

  const connect = async () => {
    if (!companyId) return;
    const url = await oauthService.getAuthUrl(provider, companyId);
    window.location.href = url;
  };

  const discover = async () => {
    if (!companyId) return;
    setIsLoading(true);
    if (provider === 'meta') await discoveryService.discoverMetaAssets(companyId);
    else await discoveryService.discoverGoogleAssets(companyId);
    await fetchAssets();
    setIsLoading(false);
  };

   const toggleAsset = async (assetId: string, isActive: boolean) => {
     await discoveryService.toggleAsset(assetId, isActive, provider);
     await fetchAssets();
   };

   const updateMapping = async (assetId: string, mapping: any) => {
     const table = provider === 'meta' ? 'meta_assets' : 'google_assets';
     await supabase
       .from(table)
       .update({ conversion_mapping: mapping })
       .eq('id', assetId);
     await fetchAssets();
   };

   return { connection, assets, isLoading, connect, discover, toggleAsset, updateMapping };
}
