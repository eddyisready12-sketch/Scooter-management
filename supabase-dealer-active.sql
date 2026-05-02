alter table dealers
  add column if not exists active boolean default true;

update dealers
set active = true
where active is null;
