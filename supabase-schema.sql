create table if not exists dealers (
  id text primary key,
  name text not null,
  company text not null,
  email text,
  phone text,
  city text,
  address text
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
  status text not null
);

create table if not exists warranty_parts (
  id text primary key,
  "scooterFrame" text references scooters("frameNumber"),
  "partName" text not null,
  "partNumber" text,
  "claimDate" date not null,
  "warrantyUntil" date not null,
  status text not null,
  "dealerId" text references dealers(id),
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
alter publication supabase_realtime add table warranty_parts;
alter publication supabase_realtime add table documents;
