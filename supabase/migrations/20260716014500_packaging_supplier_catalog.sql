alter table suppliers
add column if not exists "packagingItems" jsonb default '[]'::jsonb;

update suppliers
set "packagingItems" = '[]'::jsonb
where "packagingItems" is null;

comment on column suppliers."packagingItems" is 'Purchased packaging catalog and receipts grouped by supplier and order number.';
