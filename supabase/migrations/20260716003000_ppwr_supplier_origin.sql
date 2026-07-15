alter table suppliers add column if not exists "supplierSchemaVersion" integer default 1;
alter table suppliers add column if not exists herkomst text;
alter table suppliers add column if not exists "docStatus" jsonb;
alter table suppliers add column if not exists "packagingProfile" jsonb default '[]'::jsonb;

update suppliers
set
  "supplierSchemaVersion" = 2,
  "ppwrSupplierRole" = case when lower(coalesce(country, '')) in (
    'belgië', 'belgie', 'bulgarije', 'cyprus', 'denemarken', 'duitsland', 'estland', 'finland',
    'frankrijk', 'griekenland', 'hongarije', 'ierland', 'italië', 'italie', 'kroatië', 'kroatie',
    'letland', 'litouwen', 'luxemburg', 'malta', 'nederland', 'oostenrijk', 'polen', 'portugal',
    'roemenië', 'roemenie', 'slovenië', 'slovenie', 'slowakije', 'spanje', 'tsjechië', 'tsjechie', 'zweden'
  ) then 'fabrikant_eu' else 'productleverancier_niet_eu' end,
  herkomst = case when lower(coalesce(country, '')) in (
    'belgië', 'belgie', 'bulgarije', 'cyprus', 'denemarken', 'duitsland', 'estland', 'finland',
    'frankrijk', 'griekenland', 'hongarije', 'ierland', 'italië', 'italie', 'kroatië', 'kroatie',
    'letland', 'litouwen', 'luxemburg', 'malta', 'nederland', 'oostenrijk', 'polen', 'portugal',
    'roemenië', 'roemenie', 'slovenië', 'slovenie', 'slowakije', 'spanje', 'tsjechië', 'tsjechie', 'zweden'
  ) then 'eu' else 'niet_eu' end,
  "docStatus" = case when lower(coalesce(country, '')) in (
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
  ) else null end,
  "packagingProfile" = coalesce("packagingProfile", '[]'::jsonb)
where coalesce("supplierSchemaVersion", 1) < 2;

comment on column suppliers."supplierSchemaVersion" is 'Schema version for the PPWR supplier card migration.';
comment on column suppliers.herkomst is 'Derived from ppwrSupplierRole: eu or niet_eu.';
comment on column suppliers."docStatus" is 'Supplier DoC workflow for EU suppliers.';
comment on column suppliers."packagingProfile" is 'Reusable packaging profile for non-EU suppliers.';
