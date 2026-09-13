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

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loan_records' and policyname = 'Allow public read loans') then
    create policy "Allow public read loans" on public.loan_records for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loan_records' and policyname = 'Allow public insert loans') then
    create policy "Allow public insert loans" on public.loan_records for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loan_records' and policyname = 'Allow public update loans') then
    create policy "Allow public update loans" on public.loan_records for update to anon, authenticated using (true) with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'loan_records'
  ) then
    alter publication supabase_realtime add table public.loan_records;
  end if;
end
$$;
