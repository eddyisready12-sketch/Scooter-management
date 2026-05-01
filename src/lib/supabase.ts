import { createClient } from '@supabase/supabase-js';
import type { AppData, Scooter } from '../types';

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
  documents: 'documents',
};

export async function loadSupabaseData(): Promise<Partial<AppData>> {
  if (!supabase) return {};

  const entries = await Promise.all(
    Object.entries(tableMap).map(async ([key, table]) => {
      const { data, error } = await supabase.from(table).select('*').order('id');
      if (error) throw error;
      return [key, data ?? []] as const;
    }),
  );

  return Object.fromEntries(entries) as Partial<AppData>;
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
    .upsert(scooters, { onConflict: 'frameNumber' });

  if (error) throw error;
}
