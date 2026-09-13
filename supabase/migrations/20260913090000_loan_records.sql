create table if not exists public.loan_records (
  id text primary key,
  "itemName" text not null,
  "itemCode" text,
  quantity text not null default '1',
  borrower text not null,
  "borrowerCompany" text,
  "borrowerPhone" text,
  "loanDate" date not null,
  "expectedReturnDate" date,
  "returnedAt" date,
  status text not null default 'Uitgeleend',
  notes text not null default ''
);

alter table public.loan_records enable row level security;

create policy "Allow public read loans"
on public.loan_records for select
to anon, authenticated
using (true);

create policy "Allow public insert loans"
on public.loan_records for insert
to anon, authenticated
with check (true);

create policy "Allow public update loans"
on public.loan_records for update
to anon, authenticated
using (true)
with check (true);

alter publication supabase_realtime add table public.loan_records;
