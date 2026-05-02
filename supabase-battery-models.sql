create table if not exists battery_models (
  id text primary key,
  name text not null,
  spec text not null,
  "nominalVoltage" text,
  "nominalCapacity" text,
  "ratedEnergy" text,
  "maxChargeVoltage" text,
  "minDischargeVoltage" text
);

alter table battery_models enable row level security;

do $$
begin
  create policy "Allow public read battery models"
  on battery_models
  for select
  to anon
  using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Allow public insert battery models"
  on battery_models
  for insert
  to anon
  with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Allow public update battery models"
  on battery_models
  for update
  to anon
  using (true)
  with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table battery_models;
exception
  when duplicate_object then null;
end $$;
