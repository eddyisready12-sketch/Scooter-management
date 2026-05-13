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

alter table if exists products
add column if not exists "supplierItemNo" text;

alter table if exists products
add column if not exists "isNewProduct" boolean default false;

alter table if exists products
add column if not exists "createdAt" timestamptz default now();

create table if not exists suppliers (
  id text primary key,
  name text not null,
  "contactName" text,
  email text,
  phone text,
  mobile text,
  website text,
  address text,
  "postalCode" text,
  city text,
  country text,
  notes text,
  active boolean default true
);

alter table suppliers add column if not exists mobile text;

create table if not exists supplier_contacts (
  id text primary key,
  supplier_id text not null references suppliers(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  mobile text,
  wechat text,
  notes text,
  is_primary boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists supplier_contacts_supplier_id_idx
on supplier_contacts(supplier_id);

create table if not exists containers (
  id text primary key,
  number text not null,
  "invoiceNumber" text,
  "sealNumber" text,
  status text not null,
  eta date,
  "arrivedAt" timestamptz
);

create table if not exists container_cost_batches (
  id text primary key,
  "containerId" text references containers(id) on delete cascade,
  "containerNumber" text not null,
  "containerProfile" text,
  "containerVolumeCbm" text,
  "orderNumber" text not null,
  "supplierName" text,
  currency text not null default 'USD',
  "exchangeRate" text not null,
  "chinaTransportUsd" text,
  "transportCostEur" text not null,
  "importCostEur" text not null,
  "otherCostEur" text,
  "transportAllocationMode" text not null default 'volume',
  "importAllocationMode" text not null default 'value',
  "costItemsJson" text,
  "goodsNetEur" text,
  "logisticsNetEur" text,
  "paymentNetEur" text,
  "paymentNetOverrideEur" text,
  "exactReference" text,
  notes text,
  "createdAt" timestamptz default now()
);

create table if not exists container_cost_lines (
  id text primary key,
  "batchId" text not null references container_cost_batches(id) on delete cascade,
  type text not null,
  "referenceId" text,
  "referenceCode" text not null,
  description text not null,
  quantity text not null,
  "volumeCbm" text not null,
  "unitPriceUsd" text not null,
  "goodsValueEur" text not null,
  "allocatedTransportEur" text not null,
  "allocatedImportEur" text not null,
  "allocatedOtherEur" text not null,
  "calculatedUnitCostEur" text not null,
  "componentsNote" text
);

create index if not exists container_cost_batches_container_idx
on container_cost_batches("containerId");

create index if not exists container_cost_lines_batch_idx
on container_cost_lines("batchId");

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
  "claimNumber" text,
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
alter table warranty_parts add column if not exists "claimNumber" text;
alter table warranty_parts add column if not exists "licensePlate" text;
alter table warranty_parts add column if not exists mileage text;
alter table warranty_parts add column if not exists "partNumber" text;
alter table warranty_parts add column if not exists notes text;

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
alter publication supabase_realtime add table container_cost_batches;
alter publication supabase_realtime add table container_cost_lines;
alter publication supabase_realtime add table dealers;
alter publication supabase_realtime add table suppliers;
alter publication supabase_realtime add table supplier_contacts;
alter publication supabase_realtime add table batteries;
alter publication supabase_realtime add table battery_models;
alter publication supabase_realtime add table warranty_parts;
alter publication supabase_realtime add table maintenance_records;
alter publication supabase_realtime add table documents;

alter table dealers enable row level security;
alter table suppliers enable row level security;
alter table supplier_contacts enable row level security;
alter table scooters enable row level security;
alter table container_cost_batches enable row level security;
alter table container_cost_lines enable row level security;
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

drop policy if exists "Allow public read suppliers" on suppliers;
drop policy if exists "Allow public insert suppliers" on suppliers;
drop policy if exists "Allow public update suppliers" on suppliers;
drop policy if exists "Allow authenticated read suppliers" on suppliers;
drop policy if exists "Allow authenticated insert suppliers" on suppliers;
drop policy if exists "Allow authenticated update suppliers" on suppliers;

create policy "Allow authenticated read suppliers"
on suppliers
for select
to authenticated
using (true);

create policy "Allow authenticated insert suppliers"
on suppliers
for insert
to authenticated
with check (true);

create policy "Allow authenticated update suppliers"
on suppliers
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated read supplier contacts" on supplier_contacts;
drop policy if exists "Allow authenticated insert supplier contacts" on supplier_contacts;
drop policy if exists "Allow authenticated update supplier contacts" on supplier_contacts;
drop policy if exists "Allow authenticated delete supplier contacts" on supplier_contacts;

create policy "Allow authenticated read supplier contacts"
on supplier_contacts
for select
to authenticated
using (true);

create policy "Allow authenticated insert supplier contacts"
on supplier_contacts
for insert
to authenticated
with check (true);

create policy "Allow authenticated update supplier contacts"
on supplier_contacts
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete supplier contacts"
on supplier_contacts
for delete
to authenticated
using (true);

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

drop policy if exists "Allow authenticated read container cost batches" on container_cost_batches;
drop policy if exists "Allow authenticated insert container cost batches" on container_cost_batches;
drop policy if exists "Allow authenticated update container cost batches" on container_cost_batches;
drop policy if exists "Allow authenticated read container cost lines" on container_cost_lines;
drop policy if exists "Allow authenticated insert container cost lines" on container_cost_lines;
drop policy if exists "Allow authenticated update container cost lines" on container_cost_lines;

create policy "Allow authenticated read container cost batches"
on container_cost_batches
for select
to authenticated
using (true);

create policy "Allow authenticated insert container cost batches"
on container_cost_batches
for insert
to authenticated
with check (true);

create policy "Allow authenticated update container cost batches"
on container_cost_batches
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated read container cost lines"
on container_cost_lines
for select
to authenticated
using (true);

create policy "Allow authenticated insert container cost lines"
on container_cost_lines
for insert
to authenticated
with check (true);

create policy "Allow authenticated update container cost lines"
on container_cost_lines
for update
to authenticated
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
