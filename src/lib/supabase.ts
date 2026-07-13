import { createClient } from '@supabase/supabase-js';
import type { AppData, Battery, BatteryModel, ComplianceFamilyDocument, ComplianceFamilyRequirement, ComplianceFamilyRevision, ComplianceFamilyRisk, ComplianceFamilyTestPlan, ComplianceFamilyWarning, ComplianceProductFamily, ComplianceProductLink, ComplianceProductTest, Container, ContainerCostBatch, ContainerCostLine, Dealer, DocumentRecord, ExactBatchProbeResult, ExactConnectionStatus, ExactProductImportResponse, ExactSalesPackagingOverride, ExactSalesPreviewResponse, Importer, MaintenanceRecord, Product, ProductPackagingRegistration, Scooter, ScooterPackagingSpec, Supplier, SupplierContact, WarrantyPart } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
const scooterDocumentsBucket = 'scooter-documents';

export function buildExactAuthStartUrl() {
  return supabaseUrl ? `${supabaseUrl}/functions/v1/exact-auth-start` : '';
}

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

export async function fetchExactConnectionStatus(): Promise<ExactConnectionStatus | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('exact-connection-status');
  if (error) throw error;
  return (data as ExactConnectionStatus | null) ?? null;
}

export async function fetchExactSalesPreview(period: { dateFrom: string; dateTo: string }): Promise<ExactSalesPreviewResponse> {
  if (!supabase) return { lines: [] };
  const { data, error } = await supabase.functions.invoke('exact-test-sales', {
    body: period,
  });
  if (error) throw error;
  return (data as ExactSalesPreviewResponse | null) ?? { lines: [] };
}

export async function fetchExactProductsImport(itemCode?: string): Promise<ExactProductImportResponse> {
  if (!supabase) return { products: [], count: 0 };
  const payload = itemCode?.trim() ? { itemCode: itemCode.trim() } : undefined;
  const { data, error } = await supabase.functions.invoke('exact-sync-products', payload ? { body: payload } : undefined);
  if (error) throw error;
  return (data as ExactProductImportResponse | null) ?? { products: [], count: 0 };
}

export async function probeExactBatchLookup(payload: {
  goodsDeliveryLineId?: string;
  salesOrderNumber?: string;
  lineNumber?: string;
  salesOrderLineId?: string;
  itemCode?: string;
  itemId?: string;
  batchNumber?: string;
}) {
  if (!supabase) return [] as ExactBatchProbeResult[];
  const { data, error } = await supabase.functions.invoke('exact-probe-batch', {
    body: payload,
  });
  if (error) throw error;
  return ((data as { probes?: ExactBatchProbeResult[] } | null)?.probes ?? []);
}

const tableMap: Record<keyof AppData, string> = {
  scooters: 'scooters',
  containers: 'containers',
  containerCostBatches: 'container_cost_batches',
  containerCostLines: 'container_cost_lines',
  scooterPackagingSpecs: 'scooter_packaging_specs',
  productPackagingRegistrations: 'product_packaging_registrations',
  exactSalesPackagingOverrides: 'exact_sales_packaging_overrides',
  complianceFamilies: 'compliance_product_families',
  complianceFamilyRisks: 'compliance_family_risks',
  complianceFamilyWarnings: 'compliance_family_warnings',
  complianceFamilyDocuments: 'compliance_family_documents',
  complianceFamilyRequirements: 'compliance_family_requirements',
  complianceFamilyTestPlans: 'compliance_family_test_plans',
  complianceProductTests: 'compliance_product_tests',
  complianceFamilyRevisions: 'compliance_family_revisions',
  complianceProductLinks: 'compliance_product_links',
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

async function upsertWithSchemaFallback(
  table: string,
  records: Record<string, unknown>[],
  fallbackMessage: string,
  attempts = 8,
) {
  if (!supabase || records.length === 0) return;

  let payload = records.map((record) => ({ ...record }));
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { error } = await supabase.from(table).upsert(payload);
    if (!error) return;

    const missingColumn = error.message.match(/'([^']+)' column/)?.[1];
    if (!missingColumn || removedColumns.has(missingColumn)) throw error;

    removedColumns.add(missingColumn);
    payload = payload.map((record) => {
      const { [missingColumn]: _removed, ...rest } = record;
      return rest;
    });
  }

  throw new Error(fallbackMessage);
}

async function replaceFamilyScopedRecords(
  table: string,
  familyId: string,
  records: Record<string, unknown>[],
  fallbackMessage: string,
  attempts = 8,
) {
  if (!supabase || !familyId) return;

  const primaryDelete = await supabase
    .from(table)
    .delete()
    .eq('familyId', familyId);

  if (primaryDelete.error) {
    const legacyDelete = await supabase
      .from(table)
      .delete()
      .eq('family_id', familyId);

    if (legacyDelete.error) throw primaryDelete.error;
  }

  if (records.length === 0) return;

  await upsertWithSchemaFallback(table, records, fallbackMessage, attempts);
}

function normalizeComplianceFamily(row: Record<string, unknown>): ComplianceProductFamily {
  return {
    id: String(row.id ?? ''),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    category: row.category ? String(row.category) : undefined,
    description: row.description ? String(row.description) : undefined,
    intendedUse: row.intendedUse ? String(row.intendedUse) : row.intended_use ? String(row.intended_use) : undefined,
    foreseeableMisuse: row.foreseeableMisuse ? String(row.foreseeableMisuse) : row.foreseeable_misuse ? String(row.foreseeable_misuse) : undefined,
    riskLevel: (row.riskLevel ?? row.risk_level ?? undefined) as ComplianceProductFamily['riskLevel'],
    gpsrRequired: row.gpsrRequired === false || row.gpsr_required === false ? false : true,
    noWarningsNeeded: Boolean(row.noWarningsNeeded ?? row.no_warnings_needed ?? false),
    manualText: row.manualText ? String(row.manualText) : row.manual_text ? String(row.manual_text) : undefined,
    manufacturerName: row.manufacturerName ? String(row.manufacturerName) : row.manufacturer_name ? String(row.manufacturer_name) : undefined,
    manufacturerContact: row.manufacturerContact ? String(row.manufacturerContact) : row.manufacturer_contact ? String(row.manufacturer_contact) : undefined,
    status: (row.status ?? undefined) as ComplianceProductFamily['status'],
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: row.createdAt ? String(row.createdAt) : row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updatedAt ? String(row.updatedAt) : row.updated_at ? String(row.updated_at) : undefined,
  };
}

function normalizeComplianceLink(row: Record<string, unknown>): ComplianceProductLink {
  return {
    id: String(row.id ?? ''),
    productId: String(row.productId ?? row.product_id ?? ''),
    familyId: String(row.familyId ?? row.family_id ?? ''),
    variantDescription: row.variantDescription ? String(row.variantDescription) : row.variant_description ? String(row.variant_description) : undefined,
    technicalDifferences: row.technicalDifferences ? String(row.technicalDifferences) : row.technical_differences ? String(row.technical_differences) : undefined,
    overrideWarnings: row.overrideWarnings ? String(row.overrideWarnings) : row.override_warnings ? String(row.override_warnings) : undefined,
    overrideManual: row.overrideManual ? String(row.overrideManual) : row.override_manual ? String(row.override_manual) : undefined,
    status: (row.status ?? 'active') as ComplianceProductLink['status'],
    linkedBy: row.linkedBy ? String(row.linkedBy) : row.linked_by ? String(row.linked_by) : undefined,
    createdAt: row.createdAt ? String(row.createdAt) : row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updatedAt ? String(row.updatedAt) : row.updated_at ? String(row.updated_at) : undefined,
  };
}

function normalizeFamilyScopedRecord<T extends { id: string; familyId: string }>(row: Record<string, unknown>) {
  return {
    ...row,
    id: String(row.id ?? ''),
    familyId: String(row.familyId ?? row.family_id ?? ''),
    createdAt: row.createdAt ? String(row.createdAt) : row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updatedAt ? String(row.updatedAt) : row.updated_at ? String(row.updated_at) : undefined,
  } as unknown as T;
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
    isPackagingSupplier: Boolean(row.isPackagingSupplier ?? row.is_packaging_supplier ?? false),
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
    packagingMaterials: row.packagingMaterials ? String(row.packagingMaterials) : row.packaging_materials ? String(row.packaging_materials) : undefined,
    ppwrSupplierRole: row.ppwrSupplierRole ? String(row.ppwrSupplierRole) as Supplier['ppwrSupplierRole'] : row.ppwr_supplier_role ? String(row.ppwr_supplier_role) as Supplier['ppwrSupplierRole'] : undefined,
    ppwrResponsibility: row.ppwrResponsibility ? String(row.ppwrResponsibility) as Supplier['ppwrResponsibility'] : row.ppwr_responsibility ? String(row.ppwr_responsibility) as Supplier['ppwrResponsibility'] : undefined,
    ppwrContractStatus: row.ppwrContractStatus ? String(row.ppwrContractStatus) as Supplier['ppwrContractStatus'] : row.ppwr_contract_status ? String(row.ppwr_contract_status) as Supplier['ppwrContractStatus'] : undefined,
    ppwrDeclarationStatus: row.ppwrDeclarationStatus ? String(row.ppwrDeclarationStatus) as Supplier['ppwrDeclarationStatus'] : row.ppwr_declaration_status ? String(row.ppwr_declaration_status) as Supplier['ppwrDeclarationStatus'] : undefined,
    ppwrEprNumber: row.ppwrEprNumber ? String(row.ppwrEprNumber) : row.ppwr_epr_number ? String(row.ppwr_epr_number) : undefined,
    ppwrLastDeclarationAt: row.ppwrLastDeclarationAt ? String(row.ppwrLastDeclarationAt) : row.ppwr_last_declaration_at ? String(row.ppwr_last_declaration_at) : undefined,
    ppwrNotes: row.ppwrNotes ? String(row.ppwrNotes) : row.ppwr_notes ? String(row.ppwr_notes) : undefined,
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
    is_packaging_supplier: supplier.isPackagingSupplier ?? false,
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
    packaging_materials: supplier.packagingMaterials,
    ppwr_supplier_role: supplier.ppwrSupplierRole,
    ppwr_responsibility: supplier.ppwrResponsibility,
    ppwr_contract_status: supplier.ppwrContractStatus,
    ppwr_declaration_status: supplier.ppwrDeclarationStatus,
    ppwr_epr_number: supplier.ppwrEprNumber,
    ppwr_last_declaration_at: supplier.ppwrLastDeclarationAt,
    ppwr_notes: supplier.ppwrNotes,
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
        if (key === 'complianceFamilies') {
          return [key, data.map(normalizeComplianceFamily)] as const;
        }
        if (key === 'complianceProductLinks') {
          return [key, data.map(normalizeComplianceLink)] as const;
        }
        if (key === 'complianceFamilyRisks') {
          return [key, data.map((row) => normalizeFamilyScopedRecord<ComplianceFamilyRisk>(row as Record<string, unknown>))] as const;
        }
        if (key === 'complianceFamilyWarnings') {
          return [key, data.map((row) => normalizeFamilyScopedRecord<ComplianceFamilyWarning>(row as Record<string, unknown>))] as const;
        }
        if (key === 'complianceFamilyDocuments') {
          return [key, data.map((row) => normalizeFamilyScopedRecord<ComplianceFamilyDocument>(row as Record<string, unknown>))] as const;
        }
        if (key === 'complianceFamilyRequirements') {
          return [key, data.map((row) => normalizeFamilyScopedRecord<ComplianceFamilyRequirement>(row as Record<string, unknown>))] as const;
        }
        if (key === 'complianceFamilyTestPlans') {
          return [key, data.map((row) => normalizeFamilyScopedRecord<ComplianceFamilyTestPlan>(row as Record<string, unknown>))] as const;
        }
        if (key === 'complianceProductTests') {
          return [key, data.map((row) => normalizeFamilyScopedRecord<ComplianceProductTest>(row as Record<string, unknown>))] as const;
        }
        if (key === 'complianceFamilyRevisions') {
          return [key, data.map((row) => normalizeFamilyScopedRecord<ComplianceFamilyRevision>(row as Record<string, unknown>))] as const;
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

  let payload = lines.map((line) => ({ ...line }) as Record<string, unknown>);
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabase
      .from('container_cost_lines')
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

  throw new Error('Importregel opslaan mislukt: Supabase schema mist meerdere kolommen.');
}

export async function upsertScooterPackagingSpecs(specs: ScooterPackagingSpec[]) {
  if (!supabase || specs.length === 0) return;

  const { error } = await supabase
    .from('scooter_packaging_specs')
    .upsert(specs);

  if (error) throw error;
}

export async function upsertProductPackagingRegistrations(registrations: ProductPackagingRegistration[]) {
  if (!supabase || registrations.length === 0) return;

  let payload = registrations.map((registration) => ({ ...registration }) as Record<string, unknown>);
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase
      .from('product_packaging_registrations')
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

  throw new Error('Verpakkingsregistratie opslaan mislukt: Supabase schema mist meerdere kolommen.');
}

export async function replaceProductPackagingRegistrations(batchId: string, registrations: ProductPackagingRegistration[]) {
  if (!supabase || !batchId) return;

  const { error: deleteError } = await supabase
    .from('product_packaging_registrations')
    .delete()
    .eq('batchId', batchId);

  if (deleteError) throw deleteError;

  await upsertProductPackagingRegistrations(registrations);
}

export async function upsertExactSalesPackagingOverrides(overrides: ExactSalesPackagingOverride[]) {
  if (!supabase || overrides.length === 0) return;

  let payload = overrides.map((override) => ({ ...override }) as Record<string, unknown>);
  const removedColumns = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase
      .from('exact_sales_packaging_overrides')
      .upsert(payload);

    if (!error) return;

    const missingColumn = error.message.match(/'([^']+)' column/)?.[1];
    if (!missingColumn || removedColumns.has(missingColumn)) throw error;

    removedColumns.add(missingColumn);
    payload = payload.map((row) => {
      const nextRow = { ...row };
      delete nextRow[missingColumn];
      return nextRow;
    });
  }
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

export async function upsertComplianceFamilies(families: ComplianceProductFamily[]) {
  await upsertWithSchemaFallback(
    'compliance_product_families',
    families.map((family) => ({ ...family }) as Record<string, unknown>),
    'Compliance families opslaan mislukt: Supabase schema mist meerdere compliance kolommen.',
  );
}

export async function upsertComplianceFamilyRisks(risks: ComplianceFamilyRisk[]) {
  await upsertWithSchemaFallback(
    'compliance_family_risks',
    risks.map((risk) => ({ ...risk }) as Record<string, unknown>),
    'Compliance risicoanalyse opslaan mislukt: Supabase schema mist meerdere risico kolommen.',
  );
}

export async function upsertComplianceFamilyWarnings(warnings: ComplianceFamilyWarning[]) {
  await upsertWithSchemaFallback(
    'compliance_family_warnings',
    warnings.map((warning) => ({ ...warning }) as Record<string, unknown>),
    'Compliance waarschuwingen opslaan mislukt: Supabase schema mist meerdere waarschuwing kolommen.',
  );
}

export async function upsertComplianceFamilyDocuments(documents: ComplianceFamilyDocument[]) {
  await upsertWithSchemaFallback(
    'compliance_family_documents',
    documents.map((document) => ({ ...document }) as Record<string, unknown>),
    'Compliance documenten opslaan mislukt: Supabase schema mist meerdere document kolommen.',
  );
}

export async function upsertComplianceFamilyRequirements(requirements: ComplianceFamilyRequirement[]) {
  await upsertWithSchemaFallback(
    'compliance_family_requirements',
    requirements.map((requirement) => ({ ...requirement }) as Record<string, unknown>),
    'Compliance keuringseisen opslaan mislukt: Supabase schema mist meerdere requirement kolommen.',
  );
}

export async function upsertComplianceFamilyTestPlans(testPlans: ComplianceFamilyTestPlan[]) {
  await upsertWithSchemaFallback(
    'compliance_family_test_plans',
    testPlans.map((plan) => ({ ...plan }) as Record<string, unknown>),
    'Compliance testplannen opslaan mislukt: Supabase schema mist meerdere testplan kolommen.',
  );
}

export async function upsertComplianceProductTests(tests: ComplianceProductTest[]) {
  await upsertWithSchemaFallback(
    'compliance_product_tests',
    tests.map((test) => ({ ...test }) as Record<string, unknown>),
    'Compliance testregistraties opslaan mislukt: Supabase schema mist meerdere test kolommen.',
  );
}

export async function upsertComplianceFamilyRevisions(revisions: ComplianceFamilyRevision[]) {
  await upsertWithSchemaFallback(
    'compliance_family_revisions',
    revisions.map((revision) => ({ ...revision }) as Record<string, unknown>),
    'Compliance revisies opslaan mislukt: Supabase schema mist meerdere revisie kolommen.',
  );
}

export async function upsertComplianceProductLinks(links: ComplianceProductLink[]) {
  await upsertWithSchemaFallback(
    'compliance_product_links',
    links.map((link) => ({ ...link }) as Record<string, unknown>),
    'Compliance productkoppelingen opslaan mislukt: Supabase schema mist meerdere link kolommen.',
  );
}

export async function replaceComplianceFamilyRisks(familyId: string, risks: ComplianceFamilyRisk[]) {
  await replaceFamilyScopedRecords(
    'compliance_family_risks',
    familyId,
    risks.map((risk) => ({ ...risk }) as Record<string, unknown>),
    'Compliance risicoanalyse opslaan mislukt: Supabase schema mist meerdere risico kolommen.',
  );
}

export async function replaceComplianceFamilyWarnings(familyId: string, warnings: ComplianceFamilyWarning[]) {
  await replaceFamilyScopedRecords(
    'compliance_family_warnings',
    familyId,
    warnings.map((warning) => ({ ...warning }) as Record<string, unknown>),
    'Compliance waarschuwingen opslaan mislukt: Supabase schema mist meerdere waarschuwing kolommen.',
  );
}

export async function replaceComplianceFamilyDocuments(familyId: string, documents: ComplianceFamilyDocument[]) {
  await replaceFamilyScopedRecords(
    'compliance_family_documents',
    familyId,
    documents.map((document) => ({ ...document }) as Record<string, unknown>),
    'Compliance documenten opslaan mislukt: Supabase schema mist meerdere document kolommen.',
  );
}

export async function replaceComplianceFamilyRequirements(familyId: string, requirements: ComplianceFamilyRequirement[]) {
  await replaceFamilyScopedRecords(
    'compliance_family_requirements',
    familyId,
    requirements.map((requirement) => ({ ...requirement }) as Record<string, unknown>),
    'Compliance keuringseisen opslaan mislukt: Supabase schema mist meerdere requirement kolommen.',
  );
}

export async function replaceComplianceFamilyTestPlans(familyId: string, testPlans: ComplianceFamilyTestPlan[]) {
  await replaceFamilyScopedRecords(
    'compliance_family_test_plans',
    familyId,
    testPlans.map((plan) => ({ ...plan }) as Record<string, unknown>),
    'Compliance testplannen opslaan mislukt: Supabase schema mist meerdere testplan kolommen.',
  );
}

export async function replaceComplianceProductTests(familyId: string, tests: ComplianceProductTest[]) {
  await replaceFamilyScopedRecords(
    'compliance_product_tests',
    familyId,
    tests.map((test) => ({ ...test }) as Record<string, unknown>),
    'Compliance testregistraties opslaan mislukt: Supabase schema mist meerdere test kolommen.',
  );
}

export async function replaceComplianceFamilyRevisions(familyId: string, revisions: ComplianceFamilyRevision[]) {
  await replaceFamilyScopedRecords(
    'compliance_family_revisions',
    familyId,
    revisions.map((revision) => ({ ...revision }) as Record<string, unknown>),
    'Compliance revisies opslaan mislukt: Supabase schema mist meerdere revisie kolommen.',
  );
}

export async function replaceComplianceProductLinks(familyId: string, links: ComplianceProductLink[]) {
  await replaceFamilyScopedRecords(
    'compliance_product_links',
    familyId,
    links.map((link) => ({ ...link }) as Record<string, unknown>),
    'Compliance productkoppelingen opslaan mislukt: Supabase schema mist meerdere link kolommen.',
  );
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
