create table if not exists maintenance_records (
  id text primary key,
  "scooterFrame" text references scooters("frameNumber"),
  "licensePlate" text,
  "servicePackage" text,
  "serviceDate" date not null,
  "serviceType" text not null,
  mileage text,
  "nextServiceDate" date,
  status text not null,
  checklist jsonb default '[]'::jsonb,
  notes text
);

alter table maintenance_records
  add column if not exists "servicePackage" text,
  add column if not exists checklist jsonb default '[]'::jsonb;

do $$
begin
  alter publication supabase_realtime add table maintenance_records;
exception
  when duplicate_object then null;
end $$;

alter table maintenance_records enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_records'
      and policyname = 'Allow public read maintenance'
  ) then
    create policy "Allow public read maintenance"
    on maintenance_records
    for select
    to anon
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_records'
      and policyname = 'Allow public insert maintenance'
  ) then
    create policy "Allow public insert maintenance"
    on maintenance_records
    for insert
    to anon
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'maintenance_records'
      and policyname = 'Allow public update maintenance'
  ) then
    create policy "Allow public update maintenance"
    on maintenance_records
    for update
    to anon
    using (true)
    with check (true);
  end if;
end $$;
