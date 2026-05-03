create table if not exists dealers (
  id text primary key,
  name text not null,
  company text not null,
  email text,
  phone text,
  city text,
  address text,
  "Postalcode" text,
  active boolean default true
);

create table if not exists containers (
  id text primary key,
  number text not null,
  "invoiceNumber" text,
  "sealNumber" text,
  status text not null,
  eta date,
  "arrivedAt" timestamptz
);

create table if not exists scooters (
  id text primary key,
  "frameNumber" text unique not null,
  "engineNumber" text,
  brand text not null default 'RSO',
  model text not null,
  color text,
  speed text,
  status text not null,
  "dealerId" text references dealers(id),
  "containerId" text references containers(id),
  "licensePlate" text,
  "firstAdmissionDate" date,
  "firstRegistrationDate" date,
  "lastRegistrationDate" date,
  "emissionClass" text,
  "rdwType" text,
  "rdwTypeApprovalNumber" text,
  "rdwVariant" text,
  "rdwExecution" text,
  "batteryNumber" text,
  "invoiceNumber" text,
  "arrivedAt" timestamptz,
  "deliveredAt" timestamptz,
  "soldAt" timestamptz
);

create table if not exists batteries (
  id text primary key,
  "lotNumber" text not null,
  model text not null,
  spec text,
  "scooterFrame" text references scooters("frameNumber"),
  "dealerId" text references dealers(id),
  "orderNumber" text,
  "chargeDate" date,
  "soldAt" date,
  status text not null
);

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

create table if not exists warranty_parts (
  id text primary key,
  "scooterFrame" text references scooters("frameNumber"),
  "licensePlate" text,
  "partName" text not null,
  "partNumber" text,
  mileage text,
  age text,
  "claimDate" date not null,
  "warrantyUntil" date not null,
  status text not null,
  "dealerId" text references dealers(id),
  notes text
);

alter table warranty_parts add column if not exists age text;

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

create table if not exists documents (
  id text primary key,
  "scooterFrame" text references scooters("frameNumber"),
  type text not null,
  "fileName" text not null,
  note text
);

alter publication supabase_realtime add table scooters;
alter publication supabase_realtime add table containers;
alter publication supabase_realtime add table dealers;
alter publication supabase_realtime add table batteries;
alter publication supabase_realtime add table battery_models;
alter publication supabase_realtime add table warranty_parts;
alter publication supabase_realtime add table maintenance_records;
alter publication supabase_realtime add table documents;

alter table dealers enable row level security;
alter table scooters enable row level security;
alter table batteries enable row level security;
alter table battery_models enable row level security;
alter table warranty_parts enable row level security;
alter table maintenance_records enable row level security;

create policy "Allow public read dealers"
on dealers
for select
to anon
using (true);

create policy "Allow public insert dealers"
on dealers
for insert
to anon
with check (true);

create policy "Allow public update dealers"
on dealers
for update
to anon
using (true)
with check (true);

create policy "Allow public read scooters"
on scooters
for select
to anon
using (true);

create policy "Allow public insert scooters"
on scooters
for insert
to anon
with check (true);

create policy "Allow public update scooters"
on scooters
for update
to anon
using (true)
with check (true);

create policy "Allow public read batteries"
on batteries
for select
to anon
using (true);

create policy "Allow public insert batteries"
on batteries
for insert
to anon
with check (true);

create policy "Allow public update batteries"
on batteries
for update
to anon
using (true)
with check (true);

create policy "Allow public read battery models"
on battery_models
for select
to anon
using (true);

create policy "Allow public insert battery models"
on battery_models
for insert
to anon
with check (true);

create policy "Allow public update battery models"
on battery_models
for update
to anon
using (true)
with check (true);

create policy "Allow public read warranty parts"
on warranty_parts
for select
to anon
using (true);

create policy "Allow public insert warranty parts"
on warranty_parts
for insert
to anon
with check (true);

create policy "Allow public update warranty parts"
on warranty_parts
for update
to anon
using (true)
with check (true);

create policy "Allow public read maintenance"
on maintenance_records
for select
to anon
using (true);

create policy "Allow public insert maintenance"
on maintenance_records
for insert
to anon
with check (true);

create policy "Allow public update maintenance"
on maintenance_records
for update
to anon
using (true)
with check (true);
