create table if not exists public.products (
  id text primary key,
  code text not null,
  description text not null,
  barcode text,
  batch text,
  "salePrice" text,
  "costPrice" text,
  webshop boolean default false,
  "articleGroup" text,
  stock text,
  "startDate" timestamptz,
  "endDate" timestamptz,
  supplier text,
  "countryOfOrigin" text,
  "imageUrl" text
);

alter table public.products enable row level security;

drop policy if exists "auth read products" on public.products;
drop policy if exists "auth insert products" on public.products;
drop policy if exists "auth update products" on public.products;
drop policy if exists "auth delete products" on public.products;

create policy "auth read products"
on public.products
for select
to authenticated
using (true);

create policy "auth insert products"
on public.products
for insert
to authenticated
with check (true);

create policy "auth update products"
on public.products
for update
to authenticated
using (true)
with check (true);

create policy "auth delete products"
on public.products
for delete
to authenticated
using (true);

alter publication supabase_realtime add table public.products;
