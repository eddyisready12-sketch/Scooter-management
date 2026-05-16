import { createClient } from '@supabase/supabase-js';
import type { AppData, Battery, BatteryModel, Container, ContainerCostBatch, ContainerCostLine, Dealer, DocumentRecord, Importer, MaintenanceRecord, Product, Scooter, Supplier, SupplierContact, WarrantyPart } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
const scooterDocumentsBucket = 'scooter-documents';

function normalizeDocumentFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\d+-/, '')
    .replace(/[^a-z0-9.]+/g, '');
}

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
  containerCostBatches: 'container_cost_batches',
  containerCostLines: 'container_cost_lines',
  dealers: 'dealers',
  products: 'products',
  suppliers: 'suppliers',
  importers: 'importers',
  supplierContacts: 'supplier_contacts',
  batteries: 'batteries',
  batteryModels: 'battery_models',
  warranties: 'warranty_parts',
  maintenance: 'maintenance_records',
  documents: 'documents',
};

async function loadAllRows(table: string) {
  if (!supabase) return [];
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id')
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < pageSize) break;
  }

  return rows;
}

function normalizeSupplierContact(row: Record<string, unknown>): SupplierContact {
  return {
    id: String(row.id ?? ''),
    supplierId: String(row.supplierId ?? row.supplier_id ?? ''),
    name: String(row.name ?? ''),
    role: row.role ? String(row.role) : undefined,
    email: row.email ? String(row.email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    mobile: row.mobile ? String(row.mobile) : undefined,
    wechat: row.wechat ? String(row.wechat) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    isPrimary: Boolean(row.isPrimary ?? row.is_primary ?? false),
    active: row.active === false ? false : true,
  };
}

function normalizeSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    isImportCompany: Boolean(row.isImportCompany ?? row.is_import_company ?? false),
    importerId: row.importerId ? String(row.importerId) : row.importer_id ? String(row.importer_id) : undefined,
    contactName: row.contactName ? String(row.contactName) : row.contact_name ? String(row.contact_name) : undefined,
    email: row.email ? String(row.email) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    mobile: row.mobile ? String(row.mobile) : undefined,
    website: row.website ? String(row.website) : undefined,
    address: row.address ? String(row.address) : undefined,
    postalCode: row.postalCode ? String(row.postalCode) : row.postal_code ? String(row.postal_code) : undefined,
    city: row.city ? String(row.city) : undefined,
    country: row.country ? String(row.country) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    active: row.active === false ? false : true,
  };
}

function normalizeImporter(row: Record<string, unknown>): Importer {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    email: row.email ? String(row.email) : undefined,
    website: row.website ? String(row.website) : undefined,
    address: row.address ? String(row.address) : undefined,
    postalCode: row.postalCode ? String(row.postalCode) : row.postal_code ? String(row.postal_code) : undefined,
    city: row.city ? String(row.city) : undefined,
    country: row.country ? String(row.country) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    active: row.active === false ? false : true,
  };
}

function supplierToDatabase(supplier: Supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    is_import_company: supplier.isImportCompany ?? false,
    importer_id: supplier.importerId,
    contact_name: supplier.contactName,
    email: supplier.email,
    phone: supplier.phone,
    mobile: supplier.mobile,
    website: supplier.website,
    address: supplier.address,
    postal_code: supplier.postalCode,
    city: supplier.city,
    country: supplier.country,
    notes: supplier.notes,
    active: supplier.active ?? true,
  };
}

function supplierToLegacyDatabase(supplier: Supplier) {
  return {
    id: supplier.id,
    name: supplier.name,
    isImportCompany: supplier.isImportCompany ?? false,
    importerId: supplier.importerId,
    contactName: supplier.contactName,
    email: supplier.email,
    phone: supplier.phone,
    mobile: supplier.mobile,
    website: supplier.website,
    address: supplier.address,
    postalCode: supplier.postalCode,
    city: supplier.city,
    country: supplier.country,
    notes: supplier.notes,
    active: supplier.active ?? true,
  };
}

function importerToDatabase(importer: Importer) {
  return {
    id: importer.id,
    name: importer.name,
    email: importer.email,
    website: importer.website,
    address: importer.address,
    postal_code: importer.postalCode,
    city: importer.city,
    country: importer.country,
    notes: importer.notes,
    active: importer.active ?? true,
  };
}

function importerToLegacyDatabase(importer: Importer) {
  return {
    id: importer.id,
    name: importer.name,
    email: importer.email,
    website: importer.website,
    address: importer.address,
    postalCode: importer.postalCode,
    city: importer.city,
    country: importer.country,
    notes: importer.notes,
    active: importer.active ?? true,
  };
}

function supplierContactToDatabase(contact: SupplierContact) {
  return {
    id: contact.id,
    supplier_id: contact.supplierId,
    name: contact.name,
    role: contact.role,
    email: contact.email,
    phone: contact.phone,
    mobile: contact.mobile,
    wechat: contact.wechat,
    notes: contact.notes,
    is_primary: contact.isPrimary ?? false,
    active: contact.active ?? true,
  };
}

function supplierContactToLegacyDatabase(contact: SupplierContact) {
  return {
    id: contact.id,
    supplierId: contact.supplierId,
    name: contact.name,
    role: contact.role,
    email: contact.email,
    phone: contact.phone,
    mobile: contact.mobile,
    wechat: contact.wechat,
    notes: contact.notes,
    isPrimary: contact.isPrimary ?? false,
    active: contact.active ?? true,
  };
}

export async function loadSupabaseData(): Promise<Partial<AppData>> {
  if (!supabase) return {};

  const entries = await Promise.all(
    Object.entries(tableMap).map(async ([key, table]) => {
      try {
        const data = await loadAllRows(table);
        if (key === 'suppliers') {
          return [key, data.map(normalizeSupplier)] as const;
        }
        if (key === 'importers') {
          return [key, data.map(normalizeImporter)] as const;
        }
        if (key === 'supplierContacts') {
          return [key, data.map(normalizeSupplierContact)] as const;
        }
        return [key, data] as const;
      } catch {
        return null;
      }
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

export async function upsertContainerCostBatches(batches: ContainerCostBatch[]) {
  if (!supabase || batches.length === 0) return;

  let payload = batches.map((batch) => ({ ...batch }) as Record<string, unknown>);
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase
      .from('container_cost_batches')
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

  throw new Error('Importbatch opslaan mislukt: Supabase schema mist meerdere batchkolommen.');
}

export async function upsertContainerCostLines(lines: ContainerCostLine[]) {
  if (!supabase || lines.length === 0) return;

  const { error } = await supabase
    .from('container_cost_lines')
    .upsert(lines);

  if (error) throw error;
}

export async function replaceContainerCostLines(batchId: string, lines: ContainerCostLine[], existingLineIds: string[] = []) {
  if (!supabase || !batchId) return;

  let currentLineIds: string[] = [];
  const { data: currentLines } = await supabase
    .from('container_cost_lines')
    .select('id')
    .eq('batchId', batchId);

  if (currentLines) {
    currentLineIds = currentLines
      .map((line) => String(line.id ?? ''))
      .filter(Boolean);
  }

  const lineIdsToDelete = Array.from(new Set([...existingLineIds, ...currentLineIds]));

  if (lineIdsToDelete.length > 0) {
    const { error: idDeleteError } = await supabase
      .from('container_cost_lines')
      .delete()
      .in('id', lineIdsToDelete);

    if (idDeleteError) throw idDeleteError;
  }

  const { error: deleteError } = await supabase
    .from('container_cost_lines')
    .delete()
    .eq('batchId', batchId);

  const { error: legacyDeleteError } = await supabase
    .from('container_cost_lines')
    .delete()
    .eq('batch_id', batchId);

  if (deleteError && legacyDeleteError) throw deleteError;

  if (lines.length === 0) return;
  await upsertContainerCostLines(lines);
}

export async function upsertDealers(dealers: Dealer[]) {
  if (!supabase || dealers.length === 0) return;

  const { error } = await supabase
    .from('dealers')
    .upsert(dealers);

  if (error) throw error;
}

export async function upsertProducts(products: Product[]) {
  if (!supabase || products.length === 0) return;

  let payload = products.map((product) => ({ ...product }) as Record<string, unknown>);
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await supabase
      .from('products')
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

  throw new Error('Product opslaan mislukt: Supabase schema mist meerdere productkolommen.');
}

export async function upsertSuppliers(suppliers: Supplier[]) {
  if (!supabase || suppliers.length === 0) return;

  const payloadVariants = [
    suppliers.map(supplierToDatabase) as Record<string, unknown>[],
    suppliers.map(supplierToLegacyDatabase) as Record<string, unknown>[],
  ];

  let lastError: Error | null = null;

  for (const payload of payloadVariants) {
    const { error } = await supabase
      .from('suppliers')
      .upsert(payload);

    if (!error) return;
    lastError = error;
  }

  for (const basePayload of payloadVariants) {
    let payload = basePayload;
    const removedColumns = new Set<string>();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { error } = await supabase
        .from('suppliers')
        .upsert(payload);

      if (!error) return;

      lastError = error;
      const missingColumn = error.message.match(/'([^']+)' column/)?.[1];
      if (!missingColumn || removedColumns.has(missingColumn)) break;

      removedColumns.add(missingColumn);
      payload = payload.map((record) => {
        const { [missingColumn]: _removed, ...rest } = record;
        return rest;
      });
    }
  }

  throw lastError ?? new Error('Leverancier opslaan mislukt: Supabase schema mist meerdere leverancierkolommen.');
}

export async function upsertImporters(importers: Importer[]) {
  if (!supabase || importers.length === 0) return;

  const payloadVariants = [
    importers.map(importerToDatabase) as Record<string, unknown>[],
    importers.map(importerToLegacyDatabase) as Record<string, unknown>[],
  ];

  let lastError: Error | null = null;

  for (const payload of payloadVariants) {
    const { error } = await supabase
      .from('importers')
      .upsert(payload);

    if (!error) return;
    lastError = error;
  }

  for (const basePayload of payloadVariants) {
    let payload = basePayload;
    const removedColumns = new Set<string>();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { error } = await supabase
        .from('importers')
        .upsert(payload);

      if (!error) return;

      lastError = error;
      const missingColumn = error.message.match(/'([^']+)' column/)?.[1];
      if (!missingColumn || removedColumns.has(missingColumn)) break;

      removedColumns.add(missingColumn);
      payload = payload.map((record) => {
        const { [missingColumn]: _removed, ...rest } = record;
        return rest;
      });
    }
  }

  throw lastError ?? new Error('Importeur opslaan mislukt.');
}

export async function upsertSupplierContacts(contacts: SupplierContact[]) {
  if (!supabase || contacts.length === 0) return;

  const { error } = await supabase
    .from('supplier_contacts')
    .upsert(contacts.map(supplierContactToDatabase));

  if (!error) return;

  const legacyResult = await supabase
    .from('supplier_contacts')
    .upsert(contacts.map(supplierContactToLegacyDatabase));

  if (legacyResult.error) throw error;
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

  let payload = documents.map((document) => ({ ...document }) as Record<string, unknown>);
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase
      .from('documents')
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

  throw new Error('Document opslaan mislukt: Supabase schema mist meerdere document kolommen.');
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

export async function resolveScooterDocumentPath(document: DocumentRecord) {
  if (!supabase) throw new Error('Supabase Storage is niet geconfigureerd.');
  if (document.storagePath) return document.storagePath;

  const targetName = document.fileName.trim();
  if (!targetName) throw new Error('Dit document mist een bestandsnaam.');
  const normalizedTarget = normalizeDocumentFileName(targetName);

  const { data: frameFiles, error: frameError } = await supabase
    .storage
    .from(scooterDocumentsBucket)
    .list(document.scooterFrame, { limit: 100 });

  if (frameError) throw frameError;

  const frameMatch = frameFiles?.find((file) => {
    const normalizedStored = normalizeDocumentFileName(file.name);
    return (
      file.name === targetName ||
      normalizedStored === normalizedTarget ||
      normalizedStored.endsWith(normalizedTarget) ||
      normalizedTarget.endsWith(normalizedStored)
    );
  });
  if (frameMatch) return `${document.scooterFrame}/${frameMatch.name}`;

  throw new Error('Bestand niet gevonden in Supabase Storage.');
}
