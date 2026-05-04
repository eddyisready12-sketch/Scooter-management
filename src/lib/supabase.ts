import { createClient } from '@supabase/supabase-js';
import type { AppData, Battery, BatteryModel, Container, Dealer, DocumentRecord, MaintenanceRecord, Scooter, WarrantyPart } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
const scooterDocumentsBucket = 'scooter-documents';

export async function getAuthSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthSessionChange(onChange: () => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(() => onChange());
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Supabase Auth is niet geconfigureerd.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUpWithPassword(email: string, password: string) {
  if (!supabase) throw new Error('Supabase Auth is niet geconfigureerd.');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

const tableMap: Record<keyof AppData, string> = {
  scooters: 'scooters',
  containers: 'containers',
  dealers: 'dealers',
  batteries: 'batteries',
  batteryModels: 'battery_models',
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

export async function upsertContainers(containers: Container[]) {
  if (!supabase || containers.length === 0) return;

  const { error } = await supabase
    .from('containers')
    .upsert(containers);

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

export async function upsertBatteryModels(models: BatteryModel[]) {
  if (!supabase || models.length === 0) return;

  const { error } = await supabase
    .from('battery_models')
    .upsert(models);

  if (error) throw error;
}

export async function upsertBatteries(batteries: Battery[]) {
  if (!supabase || batteries.length === 0) return;

  const { error } = await supabase
    .from('batteries')
    .upsert(batteries);

  if (error) throw error;
}

export async function upsertWarrantyParts(warranties: WarrantyPart[]) {
  if (!supabase || warranties.length === 0) return;

  let payload = warranties.map((warranty) => ({ ...warranty }) as Record<string, unknown>);
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase
      .from('warranty_parts')
      .upsert(payload);

    if (!error) return;

    const missingColumn = error.message.match(/'([^']+)' column/)?.[1];
    if (!missingColumn || removedColumns.has(missingColumn)) throw error;

    removedColumns.add(missingColumn);
    payload = payload.map((record) => {
      const { [missingColumn]: _removed, ...rest } = record;
      return rest;
    });
  }

  throw new Error('Warranty opslaan mislukt: Supabase schema mist meerdere warranty kolommen.');
}

export async function upsertDocuments(documents: DocumentRecord[]) {
  if (!supabase || documents.length === 0) return;

  const { error } = await supabase
    .from('documents')
    .upsert(documents);

  if (error) throw error;
}

export async function uploadScooterDocument(file: File, scooterFrame: string) {
  if (!supabase) throw new Error('Supabase Storage is niet geconfigureerd.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const storagePath = `${scooterFrame}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(scooterDocumentsBucket).upload(storagePath, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return storagePath;
}

export async function createScooterDocumentUrl(storagePath: string) {
  if (!supabase) throw new Error('Supabase Storage is niet geconfigureerd.');
  const { data, error } = await supabase.storage.from(scooterDocumentsBucket).createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}
