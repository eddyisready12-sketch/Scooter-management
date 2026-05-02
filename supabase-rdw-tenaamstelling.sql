alter table scooters
  add column if not exists "firstRegistrationDate" date,
  add column if not exists "lastRegistrationDate" date,
  add column if not exists "ownerCount" integer;

update scooters
set status = 'Verkocht klant'
where coalesce("licensePlate", '') <> ''
  and "firstRegistrationDate" is not null
  and "lastRegistrationDate" is not null
  and "ownerCount" is not null;
