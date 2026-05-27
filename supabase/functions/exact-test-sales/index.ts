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

type ExactResultsPayload<T> = {
  d?: {
    results?: T[];
    __next?: string;
  };
  results?: T[];
  __next?: string;
};

type ExactBulkGoodsDeliveryLineRow = {
  ID?: string;
  EntryID?: string;
  SalesOrderNumber?: string | number;
  LineNumber?: string | number;
  ItemCode?: string;
  Description?: string;
  Item?: string;
  DeliveryDate?: string;
  QuantityDelivered?: string | number | null;
  QuantityOrdered?: string | number | null;
};

type ExactGoodsDeliveryLineBatchRow = {
  BatchNumber?: string;
  Quantity?: string | number | null;
};

type ExactGoodsDeliveryRow = {
  EntryID?: string;
  DeliveryAddress?: string;
};

type ExactAddressRow = {
  ID?: string;
  Country?: string;
  CountryName?: string;
};

type ExactTestSalesLine = {
  id: string;
  exactGoodsDeliveryLineId?: string;
  itemId?: string;
  deliveryDate?: string;
  salesOrderNumber?: string;
  entryId?: string;
  lineNumber?: string;
  salesOrderLineId?: string;
  itemCode?: string;
  itemDescription?: string;
  quantityDelivered?: string;
  quantityOrdered?: string;
  batchNumber?: string;
  batchCount?: string;
  deliveryCountryCode?: string;
  deliveryCountryName?: string;
  description?: string;
};

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function createAdminClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
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
  if (!expiresAt || Number.isNaN(expiresAt)) return connection;
  if (expiresAt - Date.now() <= 60_000) {
    return refreshExactAccessToken(admin, connection);
  }
  return connection;
}

function createExactApiUrl(connection: ExactConnectionRow, endpoint: string) {
  const exactBaseUrl = Deno.env.get('EXACT_BASE_URL') || 'https://start.exactonline.nl';
  return new URL(`${exactBaseUrl}/api/v1/${connection.divisionCode}/${endpoint}`);
}

function buildExactUrl(
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

async function fetchExactRows<T extends Record<string, unknown>>(
  connection: ExactConnectionRow,
  endpoint: string,
  filter?: string,
  select?: string,
  expand?: string,
  top = '50',
) {
  const requestUrl = buildExactUrl(connection, endpoint, filter, select, expand, top);
  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Exact request mislukt voor ${endpoint}: ${await response.text()}`);
  }

  const bodyText = await response.text();
  const payload = JSON.parse(bodyText) as ExactResultsPayload<T>;
  return extractExactRows(payload) as T[];
}

function extractExactNextLink(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as Record<string, unknown>;
  const d = root.d;

  if (d && typeof d === 'object') {
    const dRecord = d as Record<string, unknown>;
    if (typeof dRecord.__next === 'string' && dRecord.__next) {
      return dRecord.__next;
    }
  }

  if (typeof root.__next === 'string' && root.__next) {
    return root.__next;
  }

  return undefined;
}

async function fetchExactPage<T extends Record<string, unknown>>(
  connection: ExactConnectionRow,
  endpointOrUrl: string,
  filter?: string,
  select?: string,
  expand?: string,
  top = '50',
) {
  const requestUrl = endpointOrUrl.startsWith('http')
    ? new URL(endpointOrUrl)
    : buildExactUrl(connection, endpointOrUrl, filter, select, expand, top);

  const response = await fetch(requestUrl.toString(), {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Exact request mislukt voor ${endpointOrUrl}: ${await response.text()}`);
  }

  const bodyText = await response.text();
  const payload = JSON.parse(bodyText) as ExactResultsPayload<T>;

  return {
    rows: extractExactRows(payload) as T[],
    next: extractExactNextLink(payload),
    requestUrl: requestUrl.toString(),
  };
}

async function fetchExactRowsPagedDebug<T extends Record<string, unknown>>(
  connection: ExactConnectionRow,
  endpoint: string,
  filter?: string,
  select?: string,
  expand?: string,
  pageSize = 200,
  maxPages = 20,
) {
  const rows: T[] = [];
  const debugPages: Array<Record<string, unknown>> = [];
  let nextUrl: string | undefined;
  let firstPage = true;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    try {
      const result = firstPage
        ? await fetchExactPage<T>(
            connection,
            endpoint,
            filter,
            select,
            expand,
            String(pageSize),
          )
        : await fetchExactPage<T>(connection, nextUrl || endpoint);

      rows.push(...result.rows);
      debugPages.push({
        page: pageIndex + 1,
        requestUrl: result.requestUrl,
        rowCount: result.rows.length,
        next: result.next || null,
      });

      if (!result.next) break;
      nextUrl = result.next;
      firstPage = false;
    } catch (error) {
      debugPages.push({
        page: pageIndex + 1,
        requestUrl: nextUrl || endpoint,
        error: error instanceof Error ? error.message : 'Onbekende pagineringsfout',
      });
      break;
    }
  }

  return { rows, debugPages };
}

async function fetchGoodsDeliveryLineBatches(
  connection: ExactConnectionRow,
  goodsDeliveryLineGuid?: string,
) {
  if (!goodsDeliveryLineGuid) return [] as ExactGoodsDeliveryLineBatchRow[];

  const rows = await fetchExactRows<Record<string, unknown>>(
    connection,
    'salesorder/GoodsDeliveryLines',
    `ID eq guid'${goodsDeliveryLineGuid}'`,
    'ID,BatchNumbers',
    'BatchNumbers',
    '1',
  );

  const line = rows[0];
  if (!line) return [] as ExactGoodsDeliveryLineBatchRow[];

  const batchCollection = line.BatchNumbers;
  if (Array.isArray(batchCollection)) {
    return batchCollection
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
      .map((row) => ({
        BatchNumber: row.BatchNumber ? String(row.BatchNumber) : undefined,
        Quantity: row.Quantity !== undefined && row.Quantity !== null ? String(row.Quantity) : undefined,
      }))
      .filter((row) => row.BatchNumber);
  }

  if (batchCollection && typeof batchCollection === 'object') {
    const nestedRows = extractExactRows({ d: batchCollection });
    return nestedRows
      .map((row) => ({
        BatchNumber: row.BatchNumber ? String(row.BatchNumber) : undefined,
        Quantity: row.Quantity !== undefined && row.Quantity !== null ? String(row.Quantity) : undefined,
      }))
      .filter((row) => row.BatchNumber);
  }

  return [] as ExactGoodsDeliveryLineBatchRow[];
}

async function fetchDeliveryAddressCountry(connection: ExactConnectionRow, deliveryAddressGuid?: string) {
  if (!deliveryAddressGuid) return {} as Pick<ExactTestSalesLine, 'deliveryCountryCode' | 'deliveryCountryName'>;

  for (const endpoint of ['crm/Addresses', 'bulk/CRM/Addresses']) {
    try {
      const rows = await fetchExactRows<ExactAddressRow>(
        connection,
        endpoint,
        `ID eq guid'${deliveryAddressGuid}'`,
        'ID,Country,CountryName',
        undefined,
        '1',
      );
      const address = rows[0];
      if (address?.Country || address?.CountryName) {
        return {
          deliveryCountryCode: address.Country ? String(address.Country) : undefined,
          deliveryCountryName: address.CountryName ? String(address.CountryName) : undefined,
        };
      }
    } catch {
      // Some Exact editions expose addresses through only one endpoint.
    }
  }

  return {} as Pick<ExactTestSalesLine, 'deliveryCountryCode' | 'deliveryCountryName'>;
}

async function fetchGoodsDeliveryCountry(connection: ExactConnectionRow, entryGuid?: string) {
  if (!entryGuid) return {} as Pick<ExactTestSalesLine, 'deliveryCountryCode' | 'deliveryCountryName'>;

  try {
    const rows = await fetchExactRows<ExactGoodsDeliveryRow>(
      connection,
      'salesorder/GoodsDeliveries',
      `EntryID eq guid'${entryGuid}'`,
      'EntryID,DeliveryAddress',
      undefined,
      '1',
    );

    return fetchDeliveryAddressCountry(connection, rows[0]?.DeliveryAddress ? String(rows[0].DeliveryAddress) : undefined);
  } catch {
    return {} as Pick<ExactTestSalesLine, 'deliveryCountryCode' | 'deliveryCountryName'>;
  }
}

function isRealItemCode(itemCode?: string) {
  const normalized = (itemCode ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return !['shipment', 'payment', 'verzendkosten'].includes(normalized);
}

async function fetchExactPreviewLines(connection: ExactConnectionRow, dateFrom: string, dateTo: string, salesOrderFilter: string) {
  const start = `${dateFrom}T00:00:00`;
  const end = `${dateTo}T23:59:59`;
  const paged = await fetchExactRowsPagedDebug<ExactBulkGoodsDeliveryLineRow>(
    connection,
    'salesorder/GoodsDeliveryLines',
    `DeliveryDate ge datetime'${start}' and DeliveryDate le datetime'${end}'`,
    'ID,EntryID,SalesOrderNumber,LineNumber,ItemCode,Description,Item,DeliveryDate,QuantityDelivered,QuantityOrdered',
    undefined,
    200,
    20,
  );
  const rows = paged.rows;

  const needle = salesOrderFilter.trim().toLowerCase();
  const filteredRows = needle
    ? rows.filter((row) => {
      const salesOrderNumber = row.SalesOrderNumber !== undefined && row.SalesOrderNumber !== null ? String(row.SalesOrderNumber) : '';
      const itemCode = row.ItemCode ? String(row.ItemCode) : '';
      const description = row.Description ? String(row.Description) : '';
      return salesOrderNumber.includes(needle)
        || itemCode.toLowerCase().includes(needle)
        || description.toLowerCase().includes(needle);
    })
    : rows;
  const deliveryCountryByEntry = new Map<string, Promise<Pick<ExactTestSalesLine, 'deliveryCountryCode' | 'deliveryCountryName'>>>();

  function getDeliveryCountry(entryGuid?: string) {
    if (!entryGuid) return Promise.resolve({} as Pick<ExactTestSalesLine, 'deliveryCountryCode' | 'deliveryCountryName'>);
    const existing = deliveryCountryByEntry.get(entryGuid);
    if (existing) return existing;

    const next = fetchGoodsDeliveryCountry(connection, entryGuid);
    deliveryCountryByEntry.set(entryGuid, next);
    return next;
  }

  const lineGroups = await Promise.all(filteredRows.map(async (row) => {
    const itemCode = row.ItemCode ? String(row.ItemCode) : undefined;
    const entryId = row.EntryID ? String(row.EntryID) : undefined;
    const exactGoodsDeliveryLineId = row.ID ? String(row.ID) : undefined;
    let batchRows: ExactGoodsDeliveryLineBatchRow[] = [];
    let deliveryCountry = {} as Pick<ExactTestSalesLine, 'deliveryCountryCode' | 'deliveryCountryName'>;

    if (isRealItemCode(itemCode)) {
      try {
        batchRows = await fetchGoodsDeliveryLineBatches(connection, exactGoodsDeliveryLineId);
      } catch {
        batchRows = [];
      }

      deliveryCountry = await getDeliveryCountry(entryId);
    }

    const shared = {
      exactGoodsDeliveryLineId,
      itemId: row.Item ? String(row.Item) : undefined,
      deliveryDate: row.DeliveryDate ? String(row.DeliveryDate) : undefined,
      salesOrderNumber: row.SalesOrderNumber !== undefined && row.SalesOrderNumber !== null ? String(row.SalesOrderNumber) : undefined,
      entryId,
      lineNumber: row.LineNumber !== undefined && row.LineNumber !== null ? String(row.LineNumber) : undefined,
      salesOrderLineId: undefined,
      itemCode,
      itemDescription: row.Description ? String(row.Description) : undefined,
      quantityOrdered: row.QuantityOrdered !== undefined && row.QuantityOrdered !== null ? String(row.QuantityOrdered) : undefined,
      ...deliveryCountry,
      description: row.Description ? String(row.Description) : undefined,
    } satisfies Omit<ExactTestSalesLine, 'id' | 'quantityDelivered' | 'batchNumber' | 'batchCount'>;

    if (batchRows.length === 0) {
      return [{
        id: exactGoodsDeliveryLineId || crypto.randomUUID(),
        ...shared,
        quantityDelivered: row.QuantityDelivered !== undefined && row.QuantityDelivered !== null ? String(row.QuantityDelivered) : undefined,
        batchNumber: undefined,
        batchCount: '0',
      } satisfies ExactTestSalesLine];
    }

    return batchRows.map((batchRow, index) => ({
      id: `${exactGoodsDeliveryLineId || crypto.randomUUID()}:${index}`,
      ...shared,
      quantityDelivered: batchRow.Quantity !== undefined && batchRow.Quantity !== null
        ? String(batchRow.Quantity)
        : row.QuantityDelivered !== undefined && row.QuantityDelivered !== null
          ? String(row.QuantityDelivered)
          : undefined,
      batchNumber: batchRow.BatchNumber ? String(batchRow.BatchNumber) : undefined,
      batchCount: String(batchRows.length),
    } satisfies ExactTestSalesLine));
  }));

  return {
    lines: lineGroups.flat(),
    raw: paged.debugPages,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const today = new Date();
    const defaultDateFrom = `${today.getFullYear()}-01-01`;
    const defaultDateTo = `${today.getFullYear()}-12-31`;
    const body = await request.json().catch(() => ({})) as { dateFrom?: string; dateTo?: string; filter?: string };
    const dateFrom = String(body.dateFrom ?? defaultDateFrom);
    const dateTo = String(body.dateTo ?? defaultDateTo);
    const parsedDateFrom = Date.parse(`${dateFrom}T00:00:00`);
    const parsedDateTo = Date.parse(`${dateTo}T23:59:59`);

    if (Number.isNaN(parsedDateFrom) || Number.isNaN(parsedDateTo) || parsedDateFrom > parsedDateTo) {
      throw new Error('Ongeldige periode voor Exact test-sync.');
    }

    const { admin, connection } = await getPrimaryConnection();
    const validConnection = await ensureValidConnection(admin, connection);
    const preview = await fetchExactPreviewLines(validConnection, dateFrom, dateTo, body.filter ?? '');

    await storeConnectionPatch(admin, {
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    });

    return new Response(JSON.stringify({
      lines: preview.lines,
      raw: preview.raw,
      debug: true,
      divisionCode: validConnection.divisionCode,
      period: { dateFrom, dateTo },
    }), {
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
