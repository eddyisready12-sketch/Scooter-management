import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = env('SUPABASE_URL');
    const supabaseServiceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from('exact_connections')
      .select('id, provider, administrationName, divisionCode, exactUserName, redirectUri, connectedAt, tokenExpiresAt, lastSyncAt, lastError')
      .eq('id', 'primary')
      .maybeSingle();

    if (error) throw error;

    const payload = data
      ? {
        ...data,
        isConnected: Boolean(data.connectedAt),
      }
      : {
        id: 'primary',
        provider: 'exact',
        isConnected: false,
      };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Exact status failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
