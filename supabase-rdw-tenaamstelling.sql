alter table scooters
  add column if not exists "firstAdmissionDate" date,
  add column if not exists "firstRegistrationDate" date,
  add column if not exists "lastRegistrationDate" date,
  add column if not exists "emissionClass" text;

update scooters
set status = 'Verkocht klant'
where coalesce("licensePlate", '') <> ''
  and "firstAdmissionDate" is not null
  and "firstRegistrationDate" is not null
  and "lastRegistrationDate" is not null;
