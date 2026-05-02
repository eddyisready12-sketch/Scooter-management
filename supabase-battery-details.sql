alter table batteries
  add column if not exists "dealerId" text references dealers(id),
  add column if not exists "orderNumber" text,
  add column if not exists "chargeDate" date,
  add column if not exists "soldAt" date;

alter table batteries enable row level security;

do $$
begin
  create policy "Allow public read batteries"
  on batteries
  for select
  to anon
  using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Allow public insert batteries"
  on batteries
  for insert
  to anon
  with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Allow public update batteries"
  on batteries
  for update
  to anon
  using (true)
  with check (true);
exception
  when duplicate_object then null;
end $$;
