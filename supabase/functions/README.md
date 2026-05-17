# Exact Online koppeling

Deze projectbasis gebruikt drie Supabase Edge Functions:

- `exact-auth-start`
- `exact-auth-callback`
- `exact-connection-status`

## Benodigde secrets

Zet deze secrets in Supabase voordat je de functions deployt:

- `EXACT_CLIENT_ID`
- `EXACT_CLIENT_SECRET`
- `EXACT_REDIRECT_URI`
- `EXACT_APP_RETURN_URL`
- `EXACT_BASE_URL` (optioneel, standaard `https://start.exactonline.nl`)

## Callback-URL in Exact

Gebruik als callback-URL in Exact:

`https://<your-project-ref>.supabase.co/functions/v1/exact-auth-callback`

## Deploy

Voorbeeld:

```bash
supabase functions deploy exact-auth-start
supabase functions deploy exact-auth-callback
supabase functions deploy exact-connection-status
```

## Opmerking

Tokens worden in `exact_connections` opgeslagen. De frontend leest alleen de status via de `exact-connection-status` function, niet direct uit de tabel.
