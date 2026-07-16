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

alter table if exists products
add column if not exists "purchasePrice" text;

alter table if exists products
add column if not exists "importCompany" text;

alter table if exists products
add column if not exists "packagingLayers" jsonb;

alter table if exists products
add column if not exists "packagingMaterialPrimary" text;

alter table if exists products
add column if not exists "packagingMaterialSecondary" text;

alter table if exists products
add column if not exists "packagingRecycleCodePrimary" text;

alter table if exists products
add column if not exists "packagingRecycleCodeSecondary" text;

alter table if exists products
add column if not exists "packagingWasteStream" text;

alter table if exists products
add column if not exists "packagingNotes" text;

alter table if exists products
add column if not exists "packagingWeightPrimaryGrams" text;

alter table if exists products
add column if not exists "packagingWeightSecondaryGrams" text;

alter table if exists products
add column if not exists "packagingWeightTotalGrams" text;

alter table if exists products
add column if not exists "packagingUnit" text;

alter table if exists products
add column if not exists "complianceCategory" text;

alter table if exists products
add column if not exists "eMarkRelevant" text;

alter table if exists products
add column if not exists "eMarkPresent" text;

alter table if exists products
add column if not exists "eMarkNumber" text;

alter table if exists products
add column if not exists "ceRelevant" text;

alter table if exists products
add column if not exists "cePresent" text;

alter table if exists products
add column if not exists "certificationNotes" text;

alter table if exists products
add column if not exists "certificateDocumentId" text;

create index if not exists products_compliance_category_idx
on products("complianceCategory");

create index if not exists products_emark_relevant_idx
on products("eMarkRelevant");

create index if not exists products_ce_relevant_idx
on products("ceRelevant");

create table if not exists importers (
  id text primary key,
  name text not null,
  email text,
  website text,
  address text,
  postal_code text,
  city text,
  country text,
  notes text,
  active boolean default true
);

create table if not exists suppliers (
  id text primary key,
  name text not null,
  importer_id text references importers(id),
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
alter table suppliers add column if not exists "isImportCompany" boolean default false;
alter table suppliers add column if not exists "isPackagingSupplier" boolean default false;
alter table suppliers add column if not exists importer_id text references importers(id);
alter table suppliers add column if not exists "packagingMaterials" text;
alter table suppliers add column if not exists "ppwrSupplierRole" text;
alter table suppliers add column if not exists "ppwrResponsibility" text;
alter table suppliers add column if not exists "ppwrContractStatus" text;
alter table suppliers add column if not exists "ppwrDeclarationStatus" text;
alter table suppliers add column if not exists "ppwrEprNumber" text;
alter table suppliers add column if not exists "ppwrLastDeclarationAt" text;
alter table suppliers add column if not exists "ppwrNotes" text;
alter table suppliers add column if not exists "supplierSchemaVersion" integer default 1;
alter table suppliers add column if not exists herkomst text;
alter table suppliers add column if not exists "docStatus" jsonb;
alter table suppliers add column if not exists "packagingProfile" jsonb default '[]'::jsonb;
alter table suppliers add column if not exists "packagingItems" jsonb default '[]'::jsonb;

update suppliers
set
  "supplierSchemaVersion" = 2,
  "ppwrSupplierRole" = case
    when lower(coalesce(country, '')) in (
      'belgië', 'belgie', 'bulgarije', 'cyprus', 'denemarken', 'duitsland', 'estland', 'finland',
      'frankrijk', 'griekenland', 'hongarije', 'ierland', 'italië', 'italie', 'kroatië', 'kroatie',
      'letland', 'litouwen', 'luxemburg', 'malta', 'nederland', 'oostenrijk', 'polen', 'portugal',
      'roemenië', 'roemenie', 'slovenië', 'slovenie', 'slowakije', 'spanje', 'tsjechië', 'tsjechie', 'zweden'
    ) then 'fabrikant_eu'
    else 'productleverancier_niet_eu'
  end,
  herkomst = case
    when lower(coalesce(country, '')) in (
      'belgië', 'belgie', 'bulgarije', 'cyprus', 'denemarken', 'duitsland', 'estland', 'finland',
      'frankrijk', 'griekenland', 'hongarije', 'ierland', 'italië', 'italie', 'kroatië', 'kroatie',
      'letland', 'litouwen', 'luxemburg', 'malta', 'nederland', 'oostenrijk', 'polen', 'portugal',
      'roemenië', 'roemenie', 'slovenië', 'slovenie', 'slowakije', 'spanje', 'tsjechië', 'tsjechie', 'zweden'
    ) then 'eu'
    else 'niet_eu'
  end,
  "docStatus" = case
    when lower(coalesce(country, '')) in (
      'belgië', 'belgie', 'bulgarije', 'cyprus', 'denemarken', 'duitsland', 'estland', 'finland',
      'frankrijk', 'griekenland', 'hongarije', 'ierland', 'italië', 'italie', 'kroatië', 'kroatie',
      'letland', 'litouwen', 'luxemburg', 'malta', 'nederland', 'oostenrijk', 'polen', 'portugal',
      'roemenië', 'roemenie', 'slovenië', 'slovenie', 'slowakije', 'spanje', 'tsjechië', 'tsjechie', 'zweden'
    ) then jsonb_build_object(
      'status', case
        when "ppwrDeclarationStatus" in ('Ontvangen', 'Goedgekeurd') then 'ontvangen'
        when "ppwrDeclarationStatus" = 'Aangevraagd' then 'gevraagd'
        else 'niet_gevraagd'
      end,
      'statusDatum', coalesce("ppwrLastDeclarationAt", '')
    )
    else null
  end,
  "packagingProfile" = coalesce("packagingProfile", '[]'::jsonb)
where coalesce("supplierSchemaVersion", 1) < 2;

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
  status text default 'Concept',
  "containerId" text references containers(id) on delete cascade,
  "containerNumber" text not null,
  "containerProfile" text,
  "containerVolumeCbm" text,
  "orderNumber" text not null,
  "supplierName" text,
  "importerId" text references importers(id),
  "importerName" text,
  "importerAddress" text,
  "importerPostalCode" text,
  "importerCity" text,
  "importerCountry" text,
  "importerEmail" text,
  "importerWebsite" text,
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
  "packagingComplianceJson" text,
  notes text,
  "createdAt" timestamptz default now()
);

alter table if exists container_cost_batches
add column if not exists "packagingComplianceJson" text;

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
  "componentsNote" text,
  "purchaseOrderAdded" boolean default false
);

alter table if exists container_cost_lines
add column if not exists "purchaseOrderAdded" boolean default false;

create index if not exists container_cost_batches_container_idx
on container_cost_batches("containerId");

create index if not exists container_cost_lines_batch_idx
on container_cost_lines("batchId");

create table if not exists scooter_packaging_specs (
  id text primary key,
  model text not null,
  component text not null,
  "lengthCm" text not null,
  "widthCm" text not null,
  "heightCm" text not null,
  "hasLining" boolean default false,
  "boxWeightKg" text,
  notes text,
  "updatedAt" timestamptz default now()
);

create unique index if not exists scooter_packaging_specs_model_component_idx
on scooter_packaging_specs(lower(model), component);

create table if not exists exact_connections (
  id text primary key,
  provider text not null default 'exact',
  "administrationName" text,
  "divisionCode" text,
  "exactUserName" text,
  "redirectUri" text,
  "connectedAt" timestamptz,
  "tokenExpiresAt" timestamptz,
  "accessToken" text,
  "refreshToken" text,
  scope text,
  "lastSyncAt" timestamptz,
  "lastError" text,
  "updatedAt" timestamptz default now()
);

create table if not exists product_packaging_registrations (
  id text primary key,
  "batchId" text not null references container_cost_batches(id) on delete cascade,
  "batchOrderNumber" text,
  "batchNumber" text,
  "containerNumber" text,
  "containerCostLineId" text references container_cost_lines(id) on delete set null,
  "productId" text,
  "productCode" text not null,
  "productDescription" text not null,
  "productBarcode" text,
  quantity text not null,
  "packagingUnit" text,
  "packagesCount" text,
  "unitsPerPackage" text,
  "layerName" text not null,
  material text not null,
  "recycleCode" text,
  "packagingSupplier" text,
  "wasteStream" text,
  "recycledContentPercent" text,
  "recyclabilityClass" text,
  "packagingRole" text,
  "productStickerMaterial" text,
  "weightGramsPerUnit" text not null,
  "totalWeightGrams" text not null,
  source text default 'product_snapshot',
  "registeredAt" timestamptz default now(),
  "labelPrintedAt" timestamptz,
  "labelPrintCount" text,
  notes text
);

create table if not exists exact_sales_packaging_overrides (
  id text primary key,
  "productCode" text not null,
  "batchNumber" text not null,
  "productDescription" text,
  "packagingUnit" text,
  "layerName" text not null,
  material text not null,
  "recycleCode" text,
  "packagingSupplier" text,
  "wasteStream" text,
  "recycledContentPercent" text,
  "recyclabilityClass" text,
  "packagingRole" text,
  "productStickerMaterial" text,
  "weightGramsPerUnit" text not null,
  notes text,
  "updatedAt" timestamptz default now()
);

create index if not exists exact_sales_packaging_overrides_product_batch_idx
on exact_sales_packaging_overrides("productCode", "batchNumber");

alter table if exists product_packaging_registrations
add column if not exists "packagesCount" text;

alter table if exists product_packaging_registrations
add column if not exists "batchNumber" text;

alter table if exists product_packaging_registrations
add column if not exists "unitsPerPackage" text;

alter table if exists product_packaging_registrations
add column if not exists "recycledContentPercent" text;

alter table if exists product_packaging_registrations
add column if not exists "recyclabilityClass" text;

alter table if exists product_packaging_registrations
add column if not exists "packagingRole" text;

alter table if exists product_packaging_registrations
add column if not exists "productStickerMaterial" text;

alter table if exists product_packaging_registrations
add column if not exists "packagingSupplier" text;

alter table if exists exact_sales_packaging_overrides
add column if not exists "packagingSupplier" text;

create index if not exists product_packaging_registrations_batch_idx
on product_packaging_registrations("batchId");

create index if not exists product_packaging_registrations_product_idx
on product_packaging_registrations("productCode");

create table if not exists compliance_product_families (
  id text primary key,
  code text not null unique,
  name text not null,
  category text,
  description text,
  "intendedUse" text,
  "foreseeableMisuse" text,
  "riskLevel" text default 'medium',
  "gpsrRequired" boolean default true,
  status text default 'concept',
  notes text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists compliance_family_risks (
  id text primary key,
  "familyId" text not null references compliance_product_families(id) on delete cascade,
  hazard text not null,
  "riskDescription" text,
  severity text,
  probability text,
  mitigation text,
  "residualRisk" text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists compliance_family_warnings (
  id text primary key,
  "familyId" text not null references compliance_product_families(id) on delete cascade,
  "warningType" text,
  "warningTextNl" text not null,
  "warningTextEn" text,
  "requiredOnLabel" boolean default false,
  "requiredInManual" boolean default true,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists compliance_family_documents (
  id text primary key,
  "familyId" text not null references compliance_product_families(id) on delete cascade,
  "documentType" text,
  "documentName" text not null,
  "filePath" text,
  "fileUrl" text,
  "validFrom" date,
  "validUntil" date,
  status text default 'active',
  notes text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists compliance_product_links (
  id text primary key,
  "productId" text not null references products(id) on delete cascade,
  "familyId" text not null references compliance_product_families(id) on delete cascade,
  "variantDescription" text,
  "technicalDifferences" text,
  "overrideWarnings" text,
  "overrideManual" text,
  status text default 'active',
  "linkedBy" text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create unique index if not exists compliance_product_links_product_family_idx
on compliance_product_links("productId", "familyId");

create index if not exists compliance_family_risks_family_idx
on compliance_family_risks("familyId");

create index if not exists compliance_family_warnings_family_idx
on compliance_family_warnings("familyId");

create index if not exists compliance_family_documents_family_idx
on compliance_family_documents("familyId");

create index if not exists compliance_product_links_family_idx
on compliance_product_links("familyId");

create table if not exists scooters (
  id text primary key,
  "frameNumber" text unique not null,
  "engineNumber" text,
  brand text not null default 'RSO',
  model text not null,
  color text,
  "colorNumber" text,
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
  "isUnpacked" boolean default false,
  "arrivedAt" timestamptz,
  "deliveredAt" timestamptz,
  "soldAt" timestamptz
);

alter table scooters
add column if not exists "isUnpacked" boolean default false;

alter table scooters
add column if not exists "colorNumber" text;

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
alter publication supabase_realtime add table product_packaging_registrations;
alter publication supabase_realtime add table compliance_product_families;
alter publication supabase_realtime add table compliance_family_risks;
alter publication supabase_realtime add table compliance_family_warnings;
alter publication supabase_realtime add table compliance_family_documents;
alter publication supabase_realtime add table compliance_product_links;
alter publication supabase_realtime add table exact_connections;
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
alter table product_packaging_registrations enable row level security;
alter table exact_sales_packaging_overrides enable row level security;
alter table scooter_packaging_specs enable row level security;
alter table compliance_product_families enable row level security;
alter table compliance_family_risks enable row level security;
alter table compliance_family_warnings enable row level security;
alter table compliance_family_documents enable row level security;
alter table compliance_product_links enable row level security;
alter table exact_connections enable row level security;
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
drop policy if exists "Allow authenticated delete container cost lines" on container_cost_lines;
drop policy if exists "Allow authenticated read product packaging registrations" on product_packaging_registrations;
drop policy if exists "Allow authenticated insert product packaging registrations" on product_packaging_registrations;
drop policy if exists "Allow authenticated update product packaging registrations" on product_packaging_registrations;
drop policy if exists "Allow authenticated delete product packaging registrations" on product_packaging_registrations;
drop policy if exists "Allow authenticated read exact sales packaging overrides" on exact_sales_packaging_overrides;
drop policy if exists "Allow authenticated insert exact sales packaging overrides" on exact_sales_packaging_overrides;
drop policy if exists "Allow authenticated update exact sales packaging overrides" on exact_sales_packaging_overrides;
drop policy if exists "Allow authenticated delete exact sales packaging overrides" on exact_sales_packaging_overrides;
drop policy if exists "Allow authenticated read compliance families" on compliance_product_families;
drop policy if exists "Allow authenticated insert compliance families" on compliance_product_families;
drop policy if exists "Allow authenticated update compliance families" on compliance_product_families;
drop policy if exists "Allow authenticated read compliance risks" on compliance_family_risks;
drop policy if exists "Allow authenticated insert compliance risks" on compliance_family_risks;
drop policy if exists "Allow authenticated update compliance risks" on compliance_family_risks;
drop policy if exists "Allow authenticated read compliance warnings" on compliance_family_warnings;
drop policy if exists "Allow authenticated insert compliance warnings" on compliance_family_warnings;
drop policy if exists "Allow authenticated update compliance warnings" on compliance_family_warnings;
drop policy if exists "Allow authenticated read compliance documents" on compliance_family_documents;
drop policy if exists "Allow authenticated insert compliance documents" on compliance_family_documents;
drop policy if exists "Allow authenticated update compliance documents" on compliance_family_documents;
drop policy if exists "Allow authenticated read compliance links" on compliance_product_links;
drop policy if exists "Allow authenticated insert compliance links" on compliance_product_links;
drop policy if exists "Allow authenticated update compliance links" on compliance_product_links;

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

create policy "Allow authenticated delete container cost lines"
on container_cost_lines
for delete
to authenticated
using (true);

create policy "Allow authenticated read product packaging registrations"
on product_packaging_registrations
for select
to authenticated
using (true);

create policy "Allow authenticated insert product packaging registrations"
on product_packaging_registrations
for insert
to authenticated
with check (true);

create policy "Allow authenticated update product packaging registrations"
on product_packaging_registrations
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete product packaging registrations"
on product_packaging_registrations
for delete
to authenticated
using (true);

create policy "Allow authenticated read exact sales packaging overrides"
on exact_sales_packaging_overrides
for select
to authenticated
using (true);

create policy "Allow authenticated insert exact sales packaging overrides"
on exact_sales_packaging_overrides
for insert
to authenticated
with check (true);

create policy "Allow authenticated update exact sales packaging overrides"
on exact_sales_packaging_overrides
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete exact sales packaging overrides"
on exact_sales_packaging_overrides
for delete
to authenticated
using (true);

create policy "Allow authenticated read compliance families"
on compliance_product_families
for select
to authenticated
using (true);

create policy "Allow authenticated insert compliance families"
on compliance_product_families
for insert
to authenticated
with check (true);

create policy "Allow authenticated update compliance families"
on compliance_product_families
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated read compliance risks"
on compliance_family_risks
for select
to authenticated
using (true);

create policy "Allow authenticated insert compliance risks"
on compliance_family_risks
for insert
to authenticated
with check (true);

create policy "Allow authenticated update compliance risks"
on compliance_family_risks
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated read compliance warnings"
on compliance_family_warnings
for select
to authenticated
using (true);

create policy "Allow authenticated insert compliance warnings"
on compliance_family_warnings
for insert
to authenticated
with check (true);

create policy "Allow authenticated update compliance warnings"
on compliance_family_warnings
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated read compliance documents"
on compliance_family_documents
for select
to authenticated
using (true);

create policy "Allow authenticated insert compliance documents"
on compliance_family_documents
for insert
to authenticated
with check (true);

create policy "Allow authenticated update compliance documents"
on compliance_family_documents
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated read compliance links"
on compliance_product_links
for select
to authenticated
using (true);

create policy "Allow authenticated insert compliance links"
on compliance_product_links
for insert
to authenticated
with check (true);

create policy "Allow authenticated update compliance links"
on compliance_product_links
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated read scooter packaging specs" on scooter_packaging_specs;
drop policy if exists "Allow authenticated insert scooter packaging specs" on scooter_packaging_specs;
drop policy if exists "Allow authenticated update scooter packaging specs" on scooter_packaging_specs;
drop policy if exists "Allow authenticated delete scooter packaging specs" on scooter_packaging_specs;

create policy "Allow authenticated read scooter packaging specs"
on scooter_packaging_specs
for select
to authenticated
using (true);

create policy "Allow authenticated insert scooter packaging specs"
on scooter_packaging_specs
for insert
to authenticated
with check (true);

create policy "Allow authenticated update scooter packaging specs"
on scooter_packaging_specs
for update
to authenticated
using (true)
with check (true);

create policy "Allow authenticated delete scooter packaging specs"
on scooter_packaging_specs
for delete
to authenticated
using (true);

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
