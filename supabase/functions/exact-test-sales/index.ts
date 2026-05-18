import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ExactConnectionRow = {
  id: string;
  provider: 'exact';
  administrationName?: string | null;
  divisionCode?: string | null;
  exactUserName?: string | null;
  redirectUri?: string | null;
  connectedAt?: string | null;
  tokenExpiresAt?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  scope?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

type ExactTestSalesLine = {
  id: string;
  deliveryDate?: string;
  salesOrderNumber?: string;
  itemCode?: string;
  itemDescription?: string;
  quantityDelivered?: string;
  quantityOrdered?: string;
  batchNumber?: string;
  description?: string;
};

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function createAdminClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

async function getPrimaryConnection(admin = createAdminClient()) {
  const { data, error } = await admin
    .from('exact_connections')
    .select('id, provider, administrationName, divisionCode, exactUserName, redirectUri, connectedAt, tokenExpiresAt, accessToken, refreshToken, scope, lastSyncAt, lastError')
    .eq('id', 'primary')
    .maybeSingle();

  if (error) throw error;
  if (!data?.accessToken || !data?.refreshToken || !data?.divisionCode) {
    throw new Error('Exact is nog niet volledig gekoppeld.');
  }

  return { admin, connection: data as ExactConnectionRow };
}

async function storeConnectionPatch(admin: ReturnType<typeof createAdminClient>, patch: Partial<ExactConnectionRow>) {
  const { error } = await admin
    .from('exact_connections')
    .upsert({
      id: 'primary',
      provider: 'exact',
      updatedAt: new Date().toISOString(),
      ...patch,
    });

  if (error) throw error;
}

async function refreshExactAccessToken(admin: ReturnType<typeof createAdminClient>, connection: ExactConnectionRow) {
  const exactBaseUrl = Deno.env.get('EXACT_BASE_URL') || 'https://start.exactonline.nl';
  const exactClientId = env('EXACT_CLIENT_ID');
  const exactClientSecret = env('EXACT_CLIENT_SECRET');

  const response = await fetch(`${exactBaseUrl}/api/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken || '',
      client_id: exactClientId,
      client_secret: exactClientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Exact token refresh failed: ${await response.text()}`);
  }

  const tokenData = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
  const nextConnection: ExactConnectionRow = {
    ...connection,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || connection.refreshToken,
    tokenExpiresAt,
    scope: tokenData.scope || connection.scope,
  };

  await storeConnectionPatch(admin, {
    accessToken: nextConnection.accessToken,
    refreshToken: nextConnection.refreshToken,
    tokenExpiresAt: nextConnection.tokenExpiresAt,
    scope: nextConnection.scope,
    lastError: null,
  });

  return nextConnection;
}

async function ensureValidConnection(admin: ReturnType<typeof createAdminClient>, connection: ExactConnectionRow) {
  const expiresAt = connection.tokenExpiresAt ? Date.parse(connection.tokenExpiresAt) : 0;
  if (!expiresAt || Number.isNaN(expiresAt) || expiresAt - Date.now() > 60_000) {
    return connection;
  }
  return refreshExactAccessToken(admin, connection);
}

async function fetchExactPreviewLines(connection: ExactConnectionRow, year: number) {
  const exactBaseUrl = Deno.env.get('EXACT_BASE_URL') || 'https://start.exactonline.nl';
  const start = `${year}-01-01T00:00:00`;
  const end = `${year}-12-31T23:59:59`;
  const requestUrl = new URL(`${exactBaseUrl}/api/v1/${connection.divisionCode}/salesorder/GoodsDeliveryLines`);
  requestUrl.searchParams.set('$select', 'ID,DeliveryDate,SalesOrderNumber,ItemCode,ItemDescription,QuantityDelivered,QuantityOrdered,Description,BatchNumbers');
  requestUrl.searchParams.set('$expand', 'BatchNumbers');
  requestUrl.searchParams.set('$filter', `DeliveryDate ge datetime'${start}' and DeliveryDate le datetime'${end}'`);
  requestUrl.searchParams.set('$orderby', 'DeliveryDate desc');
  requestUrl.searchParams.set('$top', '50');

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Exact verkoopregels ophalen mislukt: ${await response.text()}`);
  }

  const payload = await response.json() as {
    d?: {
      results?: Array<Record<string, unknown>>;
    };
  };

  const results = payload?.d?.results ?? [];
  return results.map((row) => {
    const batchResults = ((row.BatchNumbers as { results?: Array<Record<string, unknown>> } | undefined)?.results ?? []);
    const batchNumbers = batchResults
      .map((batchRow) => batchRow.BnrBatchNumber ? String(batchRow.BnrBatchNumber) : '')
      .filter(Boolean);
    return {
      id: String(row.ID ?? crypto.randomUUID()),
      deliveryDate: row.DeliveryDate ? String(row.DeliveryDate) : undefined,
      salesOrderNumber: row.SalesOrderNumber ? String(row.SalesOrderNumber) : undefined,
      itemCode: row.ItemCode ? String(row.ItemCode) : undefined,
      itemDescription: row.ItemDescription ? String(row.ItemDescription) : undefined,
      quantityDelivered: row.QuantityDelivered !== undefined && row.QuantityDelivered !== null ? String(row.QuantityDelivered) : undefined,
      quantityOrdered: row.QuantityOrdered !== undefined && row.QuantityOrdered !== null ? String(row.QuantityOrdered) : undefined,
      batchNumber: batchNumbers.join(', '),
      description: row.Description ? String(row.Description) : undefined,
    };
  }) as ExactTestSalesLine[];
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await request.json().catch(() => ({})) as { year?: number | string };
    const year = Number.parseInt(String(body.year ?? new Date().getFullYear()), 10);
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      throw new Error('Ongeldig jaar voor Exact test-sync.');
    }

    const { admin, connection } = await getPrimaryConnection();
    const validConnection = await ensureValidConnection(admin, connection);
    const lines = await fetchExactPreviewLines(validConnection, year);

    await storeConnectionPatch(admin, {
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    });

    return new Response(JSON.stringify({ year, lines }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    try {
      const admin = createAdminClient();
      await storeConnectionPatch(admin, {
        lastError: error instanceof Error ? error.message : 'Exact test-sync mislukt',
      });
    } catch {
      // ignore secondary logging failures
    }

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Exact test-sync mislukt' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
