with battery_rows("lotNumber") as (
  values
    ('AASFC18 221026N001'),
    ('ADRC14 221023N002'),
    ('ADRC14 230328N006'),
    ('ADRC14 230328N009'),
    ('ASFC18 202328N004'),
    ('ASFC18 221026N001'),
    ('ASFC18 221026N004'),
    ('ASFC18 221201N008'),
    ('ASFC18 221201N012'),
    ('ASFC18 221201N013'),
    ('ASFC18 221201N015'),
    ('ASFC18 230328N001'),
    ('ASFC18 230328N005'),
    ('ASFC18 230328N008'),
    ('ASFC18 230328N009'),
    ('ASFC18 230328N010'),
    ('ASFC22 211012N001'),
    ('ASFC22 211012N004'),
    ('ASFC22 211012N006'),
    ('ASFC22 211012N007')
)
insert into batteries (
  id,
  "lotNumber",
  model,
  spec,
  status
)
select
  'battery-' || lower(regexp_replace("lotNumber", '[^a-zA-Z0-9]', '', 'g')) as id,
  "lotNumber",
  'JD60V30AH' as model,
  coalesce((select spec from battery_models where name = 'JD60V30AH' limit 1), '60V 30Ah 1800Wh') as spec,
  'Beschikbaar' as status
from battery_rows
on conflict (id) do nothing;
