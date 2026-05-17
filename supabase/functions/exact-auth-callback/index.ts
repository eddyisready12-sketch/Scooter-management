import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function readCookie(request: Request, key: string) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const parts = cookieHeader.split(';').map((item) => item.trim());
  const match = parts.find((part) => part.startsWith(`${key}=`));
  return match ? decodeURIComponent(match.slice(key.length + 1)) : '';
}

function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

Deno.serve(async (request) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const error = requestUrl.searchParams.get('error');
  const returnTo = readCookie(request, 'exact_return_to') || Deno.env.get('EXACT_APP_RETURN_URL') || requestUrl.origin;

  if (error) {
    const redirectUrl = new URL(returnTo);
    redirectUrl.searchParams.set('exact_error', error);
    return Response.redirect(redirectUrl.toString(), 302);
  }

  try {
    if (!code) throw new Error('Missing authorization code.');

    const expectedState = readCookie(request, 'exact_oauth_state');
    if (!state || !expectedState || state !== expectedState) throw new Error('Invalid OAuth state.');

    const supabaseUrl = env('SUPABASE_URL');
    const supabaseServiceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const exactClientId = env('EXACT_CLIENT_ID');
    const exactClientSecret = env('EXACT_CLIENT_SECRET');
    const redirectUri = Deno.env.get('EXACT_REDIRECT_URI') || `${supabaseUrl}/functions/v1/exact-auth-callback`;
    const exactBaseUrl = Deno.env.get('EXACT_BASE_URL') || 'https://start.exactonline.nl';

    const tokenResponse = await fetch(`${exactBaseUrl}/api/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: exactClientId,
        client_secret: exactClientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const tokenText = await tokenResponse.text();
      throw new Error(`Exact token request failed: ${tokenText}`);
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope?: string;
    };

    const meResponse = await fetch(`${exactBaseUrl}/api/v1/current/Me?$select=CurrentDivision,FullName,Email`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/json',
      },
    });

    if (!meResponse.ok) {
      const meText = await meResponse.text();
      throw new Error(`Exact current/Me request failed: ${meText}`);
    }

    const meData = await meResponse.json() as {
      d?: { results?: Array<{ CurrentDivision?: number | string; FullName?: string; Email?: string }> };
    };

    const me = meData?.d?.results?.[0] ?? {};
    const divisionCode = me.CurrentDivision ? String(me.CurrentDivision) : '';
    const exactUserName = me.FullName || me.Email || '';
    const tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
    const { error: upsertError } = await admin
      .from('exact_connections')
      .upsert({
        id: 'primary',
        provider: 'exact',
        administrationName: divisionCode ? `Exact administratie ${divisionCode}` : 'Exact Online',
        divisionCode: divisionCode || null,
        exactUserName: exactUserName || null,
        redirectUri: redirectUri,
        connectedAt: new Date().toISOString(),
        tokenExpiresAt,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        scope: tokenData.scope || null,
        lastError: null,
        updatedAt: new Date().toISOString(),
      });

    if (upsertError) throw upsertError;

    const redirectUrl = new URL(returnTo);
    redirectUrl.searchParams.set('exact', 'connected');
    const response = Response.redirect(redirectUrl.toString(), 302);
    response.headers.append('Set-Cookie', clearCookie('exact_oauth_state'));
    response.headers.append('Set-Cookie', clearCookie('exact_return_to'));
    return response;
  } catch (callbackError) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceRoleKey) {
      const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      await admin
        .from('exact_connections')
        .upsert({
          id: 'primary',
          provider: 'exact',
          lastError: callbackError instanceof Error ? callbackError.message : 'Exact callback failed',
          updatedAt: new Date().toISOString(),
        });
    }

    const redirectUrl = new URL(returnTo);
    redirectUrl.searchParams.set('exact_error', callbackError instanceof Error ? callbackError.message : 'Exact callback failed');
    const response = Response.redirect(redirectUrl.toString(), 302);
    response.headers.append('Set-Cookie', clearCookie('exact_oauth_state'));
    response.headers.append('Set-Cookie', clearCookie('exact_return_to'));
    return response;
  }
});
