import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ExactConnectionRow = {
  divisionCode?: string | null;
  accessToken?: string | null;
};

type ProbeBody = {
  goodsDeliveryLineId?: string;
  salesOrderNumber?: string;
  lineNumber?: string;
  salesOrderLineId?: string;
  itemCode?: string;
  itemId?: string;
  batchNumber?: string;
};

type ExactProbeResult = {
  endpoint: string;
  ok: boolean;
  count?: number;
  sample?: Array<Record<string, string>>;
  message?: string;
};

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function createAdminClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

async function getPrimaryConnection() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('exact_connections')
    .select('divisionCode, accessToken')
    .eq('id', 'primary')
    .maybeSingle();

  if (error) throw error;
  if (!data?.divisionCode || !data?.accessToken) throw new Error('Exact is nog niet gekoppeld.');
  return data as ExactConnectionRow;
}

function createExactApiUrl(connection: ExactConnectionRow, endpoint: string) {
  const exactBaseUrl = Deno.env.get('EXACT_BASE_URL') || 'https://start.exactonline.nl';
  return new URL(`${exactBaseUrl}/api/v1/${connection.divisionCode}/${endpoint}`);
}

function buildExactProbeUrl(
  connection: ExactConnectionRow,
  endpoint: string,
  filter?: string,
  select?: string,
  expand?: string,
  top?: string,
) {
  const requestUrl = createExactApiUrl(connection, endpoint);
  if (select) requestUrl.searchParams.set('$select', select);
  if (filter) requestUrl.searchParams.set('$filter', filter);
  if (expand) requestUrl.searchParams.set('$expand', expand);
  if (top) requestUrl.searchParams.set('$top', top);
  return requestUrl;
}

function extractExactRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const d = root.d;

  if (Array.isArray(d)) {
    return d.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
  }

  if (d && typeof d === 'object') {
    const dRecord = d as Record<string, unknown>;
    if (Array.isArray(dRecord.results)) {
      return dRecord.results.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
    }
    if (Object.keys(dRecord).length > 0) {
      return [dRecord];
    }
  }

  if (Array.isArray(root.results)) {
    return root.results.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
  }

  return [];
}

function summarizeRows(rows: Array<Record<string, unknown>>) {
  return rows.slice(0, 8).map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
        .slice(0, 20)
        .map(([key, value]) => [key, String(value)]),
    ),
  );
}

async function fetchExactRaw(
  connection: ExactConnectionRow,
  endpoint: string,
  filter?: string,
  select?: string,
  expand?: string,
  top?: string,
) {
  const requestUrl = buildExactProbeUrl(connection, endpoint, filter, select, expand, top);
  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: 'application/json',
    },
  });

  const bodyText = await response.text();

  return {
    requestUrl: requestUrl.toString(),
    ok: response.ok,
    bodyText,
  };
}

async function probeRows(
  connection: ExactConnectionRow,
  endpoint: string,
  filter?: string,
  select?: string,
  expand?: string,
  top = '3',
): Promise<ExactProbeResult> {
  try {
    const raw = await fetchExactRaw(connection, endpoint, filter, select, expand, top);
    if (!raw.ok) {
      return {
        endpoint: `${endpoint}\n${raw.requestUrl}`,
        ok: false,
        message: raw.bodyText,
      };
    }

    const payload = JSON.parse(raw.bodyText);
    const rows = extractExactRows(payload);
    return {
      endpoint: `${endpoint}\n${raw.requestUrl}`,
      ok: true,
      count: rows.length,
      sample: rows.length
        ? summarizeRows(rows)
        : [{ info: 'Geen resultaten', requestUrl: raw.requestUrl, rawBody: raw.bodyText.slice(0, 500) }],
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      message: error instanceof Error ? error.message : 'Onbekende Exact fout',
    };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await request.json().catch(() => ({})) as ProbeBody;
    const connection = await getPrimaryConnection();

    const goodsDeliveryLineId = body.goodsDeliveryLineId?.trim();
    const salesOrderNumber = body.salesOrderNumber?.trim();
    const lineNumber = body.lineNumber?.trim();
    const itemId = body.itemId?.trim();
    const batchNumber = body.batchNumber?.trim();
    const goodsDeliveryLineFilter = [
      salesOrderNumber ? `SalesOrderNumber eq ${salesOrderNumber}` : '',
      lineNumber ? `LineNumber eq ${lineNumber}` : '',
    ].filter(Boolean).join(' and ')
      || (goodsDeliveryLineId ? `ID eq guid'${goodsDeliveryLineId}'` : undefined);

    const probes = await Promise.all([
      probeRows(
        connection,
        'salesorder/GoodsDeliveryLines',
        goodsDeliveryLineFilter,
        'ID,SalesOrderNumber,LineNumber,ItemCode,Description,BatchNumbers',
        'BatchNumbers',
        '1',
      ),
      probeRows(
        connection,
        'salesorder/GoodsDeliveries',
        undefined,
        'EntryID,EntryNumber,Description,GoodsDeliveryLines',
        'GoodsDeliveryLines',
        '1',
      ),
      probeRows(
        connection,
        'inventory/StockBatchNumbers',
        [
          itemId ? `Item eq guid'${itemId}'` : '',
          batchNumber ? `BatchNumber eq '${batchNumber.replace(/'/g, "''")}'` : '',
        ].filter(Boolean).join(' and ') || undefined,
        'ID,BatchNumber,Item,StockTransactionType',
        undefined,
        '10',
      ),
      probeRows(
        connection,
        'inventory/BatchNumbers',
        [
          itemId ? `Item eq guid'${itemId}'` : '',
          batchNumber ? `BatchNumber eq '${batchNumber.replace(/'/g, "''")}'` : '',
        ].filter(Boolean).join(' and ') || undefined,
        'ID,BatchNumber,AvailableQuantity,Item',
        undefined,
        '10',
      ),
      probeRows(
        connection,
        'inventory/StockTransactions',
        itemId ? `Item eq guid'${itemId}'` : undefined,
        'ID,Item,Quantity,StockTransactionType,Created',
        undefined,
        '25',
      ),
      probeRows(
        connection,
        'inventory/StockTransactionLines',
        itemId ? `Item eq guid'${itemId}'` : undefined,
        'ID,Item,Quantity,Description',
        undefined,
        '25',
      ),
    ]);

    return new Response(JSON.stringify({ probes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Exact batch probe mislukt' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
