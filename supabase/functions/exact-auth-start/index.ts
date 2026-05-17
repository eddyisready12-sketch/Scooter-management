function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function cookieHeader(name: string, value: string, maxAgeSeconds: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

Deno.serve((request) => {
  try {
    const exactClientId = env('EXACT_CLIENT_ID');
    const supabaseUrl = env('SUPABASE_URL');
    const url = new URL(request.url);
    const state = crypto.randomUUID();
    const redirectUri = Deno.env.get('EXACT_REDIRECT_URI') || `${supabaseUrl}/functions/v1/exact-auth-callback`;
    const returnTo = url.searchParams.get('returnTo') || Deno.env.get('EXACT_APP_RETURN_URL') || url.origin;
    const exactBaseUrl = Deno.env.get('EXACT_BASE_URL') || 'https://start.exactonline.nl';

    const authUrl = new URL('/api/oauth2/auth', exactBaseUrl);
    authUrl.searchParams.set('client_id', exactClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('force_login', '0');
    authUrl.searchParams.set('state', state);

    const headers = new Headers();
    headers.set('Location', authUrl.toString());
    headers.append('Set-Cookie', cookieHeader('exact_oauth_state', state, 600));
    headers.append('Set-Cookie', cookieHeader('exact_return_to', returnTo, 600));

    return new Response(null, { status: 302, headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Exact auth start failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
