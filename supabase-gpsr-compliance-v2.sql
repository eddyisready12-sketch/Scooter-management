-- GPSR compliance v2 for Supabase/Postgres
-- Safe migration: creates missing tables/columns only, without dropping existing data.

begin;

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

alter table compliance_product_families
  add column if not exists "noWarningsNeeded" boolean default false,
  add column if not exists "manualText" text,
  add column if not exists "manufacturerName" text,
  add column if not exists "manufacturerContact" text;

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

create table if not exists compliance_family_requirements (
  id text primary key,
  "familyId" text not null references compliance_product_families(id) on delete cascade,
  name text not null,
  regulation text,
  mandatory boolean default true,
  notes text,
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

alter table compliance_family_documents
  add column if not exists "requirementId" text references compliance_family_requirements(id) on delete set null;

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

create table if not exists compliance_family_test_plans (
  id text primary key,
  "familyId" text not null references compliance_product_families(id) on delete cascade,
  name text not null,
  method text,
  frequency text,
  mandatory boolean default true,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists compliance_product_tests (
  id text primary key,
  "familyId" text not null references compliance_product_families(id) on delete cascade,
  "planId" text references compliance_family_test_plans(id) on delete set null,
  "productId" text references products(id) on delete set null,
  "testName" text,
  "batchRef" text,
  "testDate" date not null,
  result text not null default 'pass',
  findings text,
  "correctiveAction" text,
  "testedBy" text,
  "createdAt" timestamptz default now()
);

create table if not exists compliance_family_revisions (
  id text primary key,
  "familyId" text not null references compliance_product_families(id) on delete cascade,
  "changeNote" text not null,
  "changedBy" text,
  "createdAt" timestamptz default now()
);

create unique index if not exists compliance_product_links_product_family_idx
on compliance_product_links("productId", "familyId");

create index if not exists compliance_family_risks_family_idx
on compliance_family_risks("familyId");

create index if not exists compliance_family_warnings_family_idx
on compliance_family_warnings("familyId");

create index if not exists compliance_family_requirements_family_idx
on compliance_family_requirements("familyId");

create index if not exists compliance_family_documents_family_idx
on compliance_family_documents("familyId");

create index if not exists compliance_family_documents_requirement_idx
on compliance_family_documents("requirementId");

create index if not exists compliance_product_links_family_idx
on compliance_product_links("familyId");

create index if not exists compliance_family_test_plans_family_idx
on compliance_family_test_plans("familyId");

create index if not exists compliance_product_tests_family_idx
on compliance_product_tests("familyId");

create index if not exists compliance_product_tests_plan_idx
on compliance_product_tests("planId");

create index if not exists compliance_product_tests_product_idx
on compliance_product_tests("productId");

create index if not exists compliance_product_tests_test_date_idx
on compliance_product_tests("testDate");

create index if not exists compliance_family_revisions_family_idx
on compliance_family_revisions("familyId");

alter table compliance_product_families enable row level security;
alter table compliance_family_risks enable row level security;
alter table compliance_family_warnings enable row level security;
alter table compliance_family_requirements enable row level security;
alter table compliance_family_documents enable row level security;
alter table compliance_product_links enable row level security;
alter table compliance_family_test_plans enable row level security;
alter table compliance_product_tests enable row level security;
alter table compliance_family_revisions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_product_families' and policyname = 'Allow authenticated read compliance families'
  ) then
    create policy "Allow authenticated read compliance families" on compliance_product_families for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_product_families' and policyname = 'Allow authenticated insert compliance families'
  ) then
    create policy "Allow authenticated insert compliance families" on compliance_product_families for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_product_families' and policyname = 'Allow authenticated update compliance families'
  ) then
    create policy "Allow authenticated update compliance families" on compliance_product_families for update to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_risks' and policyname = 'Allow authenticated read compliance risks'
  ) then
    create policy "Allow authenticated read compliance risks" on compliance_family_risks for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_risks' and policyname = 'Allow authenticated insert compliance risks'
  ) then
    create policy "Allow authenticated insert compliance risks" on compliance_family_risks for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_risks' and policyname = 'Allow authenticated update compliance risks'
  ) then
    create policy "Allow authenticated update compliance risks" on compliance_family_risks for update to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_warnings' and policyname = 'Allow authenticated read compliance warnings'
  ) then
    create policy "Allow authenticated read compliance warnings" on compliance_family_warnings for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_warnings' and policyname = 'Allow authenticated insert compliance warnings'
  ) then
    create policy "Allow authenticated insert compliance warnings" on compliance_family_warnings for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_warnings' and policyname = 'Allow authenticated update compliance warnings'
  ) then
    create policy "Allow authenticated update compliance warnings" on compliance_family_warnings for update to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_requirements' and policyname = 'Allow authenticated read compliance requirements'
  ) then
    create policy "Allow authenticated read compliance requirements" on compliance_family_requirements for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_requirements' and policyname = 'Allow authenticated insert compliance requirements'
  ) then
    create policy "Allow authenticated insert compliance requirements" on compliance_family_requirements for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_requirements' and policyname = 'Allow authenticated update compliance requirements'
  ) then
    create policy "Allow authenticated update compliance requirements" on compliance_family_requirements for update to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_documents' and policyname = 'Allow authenticated read compliance documents'
  ) then
    create policy "Allow authenticated read compliance documents" on compliance_family_documents for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_documents' and policyname = 'Allow authenticated insert compliance documents'
  ) then
    create policy "Allow authenticated insert compliance documents" on compliance_family_documents for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_documents' and policyname = 'Allow authenticated update compliance documents'
  ) then
    create policy "Allow authenticated update compliance documents" on compliance_family_documents for update to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_product_links' and policyname = 'Allow authenticated read compliance links'
  ) then
    create policy "Allow authenticated read compliance links" on compliance_product_links for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_product_links' and policyname = 'Allow authenticated insert compliance links'
  ) then
    create policy "Allow authenticated insert compliance links" on compliance_product_links for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_product_links' and policyname = 'Allow authenticated update compliance links'
  ) then
    create policy "Allow authenticated update compliance links" on compliance_product_links for update to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_test_plans' and policyname = 'Allow authenticated read compliance test plans'
  ) then
    create policy "Allow authenticated read compliance test plans" on compliance_family_test_plans for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_test_plans' and policyname = 'Allow authenticated insert compliance test plans'
  ) then
    create policy "Allow authenticated insert compliance test plans" on compliance_family_test_plans for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_test_plans' and policyname = 'Allow authenticated update compliance test plans'
  ) then
    create policy "Allow authenticated update compliance test plans" on compliance_family_test_plans for update to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_product_tests' and policyname = 'Allow authenticated read compliance tests'
  ) then
    create policy "Allow authenticated read compliance tests" on compliance_product_tests for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_product_tests' and policyname = 'Allow authenticated insert compliance tests'
  ) then
    create policy "Allow authenticated insert compliance tests" on compliance_product_tests for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_product_tests' and policyname = 'Allow authenticated update compliance tests'
  ) then
    create policy "Allow authenticated update compliance tests" on compliance_product_tests for update to authenticated using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_revisions' and policyname = 'Allow authenticated read compliance revisions'
  ) then
    create policy "Allow authenticated read compliance revisions" on compliance_family_revisions for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_revisions' and policyname = 'Allow authenticated insert compliance revisions'
  ) then
    create policy "Allow authenticated insert compliance revisions" on compliance_family_revisions for insert to authenticated with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'compliance_family_revisions' and policyname = 'Allow authenticated update compliance revisions'
  ) then
    create policy "Allow authenticated update compliance revisions" on compliance_family_revisions for update to authenticated using (true) with check (true);
  end if;
end $$;

create or replace view v_compliance_family_status as
select
  f.id,
  f.code,
  f.name,
  f.category,
  f."riskLevel" as "riskLevel",
  f.status,
  f."gpsrRequired" as "gpsrRequired",
  count(distinct r.id) as "riskCount",
  count(distinct w.id) as "warningCount",
  count(distinct d.id) as "documentCount",
  count(distinct l.id) as "productCount",
  case
    when coalesce(f."gpsrRequired", true) = false then 'not_applicable'
    when f.status = 'archived' then 'archived'
    when coalesce(f.description, '') = '' then 'concept'
    when coalesce(f."intendedUse", '') = '' then 'concept'
    when coalesce(f."foreseeableMisuse", '') = '' then 'partial'
    when count(distinct r.id) = 0 then 'partial'
    when count(distinct w.id) = 0 and coalesce(f."noWarningsNeeded", false) = false then 'partial'
    when count(distinct l.id) = 0 then 'partial'
    when coalesce(f."manufacturerName", '') = '' and count(distinct d.id) = 0 then 'partial'
    when exists (
      select 1
      from compliance_family_requirements q
      where q."familyId" = f.id
        and coalesce(q.mandatory, true) = true
        and not exists (
          select 1
          from compliance_family_documents dd
          where dd."requirementId" = q.id
            and coalesce(dd.status, 'active') = 'active'
        )
    ) then 'partial'
    when exists (
      select 1
      from compliance_family_test_plans tp
      where tp."familyId" = f.id
        and coalesce(tp.mandatory, true) = true
        and not exists (
          select 1
          from compliance_product_tests t
          where t."planId" = tp.id
            and coalesce(t.result, 'pass') = 'pass'
        )
    ) then 'partial'
    else 'complete'
  end as "calculatedStatus",
  f."updatedAt" as "updatedAt"
from compliance_product_families f
left join compliance_family_risks r on r."familyId" = f.id
left join compliance_family_warnings w on w."familyId" = f.id
left join compliance_family_documents d on d."familyId" = f.id and coalesce(d.status, 'active') = 'active'
left join compliance_product_links l on l."familyId" = f.id and coalesce(l.status, 'active') = 'active'
group by f.id;

commit;
