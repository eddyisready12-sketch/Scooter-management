import { createClient } from '@supabase/supabase-js';
import type { AppData, Dealer, MaintenanceRecord, Scooter } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const tableMap: Record<keyof AppData, string> = {
  scooters: 'scooters',
  containers: 'containers',
  dealers: 'dealers',
  batteries: 'batteries',
  warranties: 'warranty_parts',
  maintenance: 'maintenance_records',
  documents: 'documents',
};

export async function loadSupabaseData(): Promise<Partial<AppData>> {
  if (!supabase) return {};

  const entries = await Promise.all(
    Object.entries(tableMap).map(async ([key, table]) => {
      const { data, error } = await supabase.from(table).select('*').order('id');
      if (error) return null;
      return [key, data ?? []] as const;
    }),
  );

  return Object.fromEntries(entries.filter((entry) => entry !== null)) as Partial<AppData>;
}

export function subscribeToSupabase(onChange: () => void) {
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel('rso-management-live')
    .on('postgres_changes', { event: '*', schema: 'public' }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function upsertScooters(scooters: Scooter[]) {
  if (!supabase || scooters.length === 0) return;

  const { error } = await supabase
    .from('scooters')
    .upsert(scooters);

  if (error) throw error;
}

export async function upsertDealers(dealers: Dealer[]) {
  if (!supabase || dealers.length === 0) return;

  const { error } = await supabase
    .from('dealers')
    .upsert(dealers);

  if (error) throw error;
}

export async function upsertMaintenanceRecords(records: MaintenanceRecord[]) {
  if (!supabase || records.length === 0) return;

  const { error } = await supabase
    .from('maintenance_records')
    .upsert(records);

  if (error) throw error;
}
