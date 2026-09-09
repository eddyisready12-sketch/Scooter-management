import { findPackagingMaterialOption, packagingMaterialOptions } from './packaging-materials';
import { ppwrSupplierStatus } from './ppwr-suppliers';
import type { BatchPackagingComplianceConfig, ContainerCostBatch, ContainerCostLine, ExactSalesPackagingOverride, Importer, Product, ProductPackagingLayer, ProductPackagingRegistration, Supplier } from '../types';

const packagingLayerNames = Array.from({ length: 10 }, (_, index) => `Verpakkingscomponent ${index + 1}`);
type ProductModalTab = 'basic' | 'gpsr' | 'packaging' | 'certification' | 'batches';

const certificationArticleGroupRules: Array<{ match: string[]; updates: Partial<Product> }> = [
  { match: ['verlichting'], updates: { eMarkRelevant: 'ja', complianceCategory: 'E_MARK_RELEVANT' } },
  { match: ['spiegels'], updates: { eMarkRelevant: 'ja', complianceCategory: 'E_MARK_RELEVANT' } },
  { match: ['banden'], updates: { eMarkRelevant: 'ja', complianceCategory: 'TYPE_APPROVAL_RELATED' } },
  { match: ['standaard onderdelen'], updates: { eMarkRelevant: 'nee', complianceCategory: 'STANDARD_PART', eMarkPresent: 'niet_van_toepassing' } },
];

function normalizedSupplierKey(value?: string) { return (value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase(); }
function supplierImportedKey(supplier: Supplier) { return supplier.id.startsWith('supplier-') ? supplier.id.slice('supplier-'.length) : ''; }
function findSupplierByName(suppliers: Supplier[], value?: string) {
  const candidate = normalizedSupplierKey(value);
  return suppliers.find((supplier) => candidate && (candidate === normalizedSupplierKey(supplier.name) || candidate === supplierImportedKey(supplier)));
}
function hasPpwrSupplierProfile(supplier?: Supplier) {
  return Boolean(supplier && supplier.active !== false && supplier.isPackagingSupplier === true && ppwrSupplierStatus(supplier) === 'compleet');
}
function parseDecimal(value?: string | number | null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const raw = String(value).trim();
  let normalized = raw;
  if (raw.includes(',') && raw.includes('.')) normalized = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? raw.replace(/,/g, '') : raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) normalized = raw.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
function formatDecimal(value: number, digits = 4) { return value.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function formatCompactDecimal(value: number, digits = 3) { return value.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: digits }); }
function formatQuantity(value?: string | number | null) {
  const numericValue = parseDecimal(value);
  return Math.abs(numericValue - Math.round(numericValue)) < 0.00000001 ? formatDecimal(Math.round(numericValue), 0) : formatCompactDecimal(numericValue, 2);
}

export type ProductComplianceLevel = 'green' | 'yellow' | 'red' | 'outsourced';
export type ProductComplianceDomain = 'gpsr' | 'packaging' | 'ppwr';
export type ProductComplianceSection = 'identification' | 'planning' | 'traceability' | 'manufacturer' | 'importer' | 'safety' | 'certification' | 'packagingGeneral' | 'packagingLayers' | 'batches';
export type ProductComplianceIssueLevel = 'error' | 'warning' | 'info';
export type ProductComplianceIssue = {
  id: string;
  domain: ProductComplianceDomain;
  level: ProductComplianceIssueLevel;
  label: string;
  tab: ProductModalTab;
  section: ProductComplianceSection;
  field?: string;
};
export type ProductComplianceSummary = {
  gpsr: { level: ProductComplianceLevel; issues: ProductComplianceIssue[]; progress: number };
  packaging: { level: ProductComplianceLevel; issues: ProductComplianceIssue[]; progress: number };
  ppwr: { level: ProductComplianceLevel; issues: ProductComplianceIssue[]; progress: number };
  checklist: ProductComplianceIssue[];
  overallLevel: ProductComplianceLevel;
  overallLabel: 'Compleet' | 'Controleren' | 'Onvolledig' | 'Uitbesteed aan leverancier';
  overallProgress: number;
  severityCounts: { critical: number; recommended: number; informational: number };
};
export type ProductBatchOverviewRow = {
  batchId: string;
  batchNumber: string;
  quantity: number;
  packaging: string;
  purchasePerUnitEur: number;
  costPerUnitEur: number;
};
export function isStickerPackagingLayer(layer: ProductPackagingLayer) {
  const name = (layer.name ?? '').toLowerCase();
  return layer.componentType === 'product_sticker' || name.includes('sticker') || name.includes('label') || name.includes('etiket');
}

export function asOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

export function createEmptyPackagingLayer(index: number): ProductPackagingLayer {
  return { name: packagingLayerNames[index], componentType: 'packaging' };
}

export function toPackagingLayerRecords(value: unknown): Record<string, unknown>[] {
  const collect = (input: unknown): Record<string, unknown>[] => {
    if (Array.isArray(input)) {
      return input.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object');
    }

    if (typeof input === 'string') {
      try {
        return collect(JSON.parse(input));
      } catch {
        return [];
      }
    }

    if (input && typeof input === 'object') {
      const record = input as Record<string, unknown>;
      if (Array.isArray(record.layers)) {
        return collect(record.layers);
      }
      return Object.values(record).filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object');
    }

    return [];
  };

  return collect(value);
}

export function readPackagingLayerField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asOptionalTrimmedString(record[key]);
    if (value) return value;
  }
  return undefined;
}

export function normalizePackagingLayers(product: Product): ProductPackagingLayer[] {
  const storedLayers = toPackagingLayerRecords(product.packagingLayers)
    .slice(0, packagingLayerNames.length)
    .map((layer, index) => {
      const record = layer && typeof layer === 'object' ? (layer as Record<string, unknown>) : {};
      return {
        name: readPackagingLayerField(record, ['name', 'layerName', 'title']) || packagingLayerNames[index],
        componentType: readPackagingLayerField(record, ['componentType', 'component_type']) as ProductPackagingLayer['componentType'],
        material: readPackagingLayerField(record, ['material', 'packagingMaterial', 'packaging_material']),
        recycleCode: readPackagingLayerField(record, ['recycleCode', 'recycle_code', 'code']),
        packagingSupplier: readPackagingLayerField(record, ['packagingSupplier', 'packaging_supplier', 'supplier', 'supplierName', 'supplier_name']),
        packagingCatalogItemId: readPackagingLayerField(record, ['packagingCatalogItemId', 'packaging_catalog_item_id']),
        weightBasis: readPackagingLayerField(record, ['weightBasis', 'weight_basis']) as ProductPackagingLayer['weightBasis'],
        weightGrams: readPackagingLayerField(record, ['weightGrams', 'weight', 'grams']),
        recycledContentPercent: readPackagingLayerField(record, ['recycledContentPercent', 'pcrPercent', 'pcr_percentage']),
        recyclabilityClass: readPackagingLayerField(record, ['recyclabilityClass', 'recyclability_class']) as ProductPackagingLayer['recyclabilityClass'],
        packagingRole: readPackagingLayerField(record, ['packagingRole', 'role', 'packaging_role']) as ProductPackagingLayer['packagingRole'],
        productStickerMaterial: readPackagingLayerField(record, ['productStickerMaterial', 'product_sticker_material', 'adhesiveType', 'adhesive_type', 'glueType']) as ProductPackagingLayer['productStickerMaterial'],
      };
    })
    .filter((layer) => (
      layer.material
      || layer.recycleCode
      || layer.packagingSupplier
      || layer.packagingCatalogItemId
      || layer.weightGrams
      || layer.recycledContentPercent
      || layer.recyclabilityClass
      || layer.packagingRole
      || layer.productStickerMaterial
    ));

  const fallbackLayers: ProductPackagingLayer[] = [];

  if (product.packagingMaterialPrimary || product.packagingRecycleCodePrimary || product.packagingWeightPrimaryGrams) {
    fallbackLayers.push({
      name: packagingLayerNames[0],
      material: asOptionalTrimmedString(product.packagingMaterialPrimary),
      recycleCode: asOptionalTrimmedString(product.packagingRecycleCodePrimary),
      weightGrams: asOptionalTrimmedString(product.packagingWeightPrimaryGrams),
    });
  }

  if (product.packagingMaterialSecondary || product.packagingRecycleCodeSecondary || product.packagingWeightSecondaryGrams) {
    fallbackLayers.push({
      name: packagingLayerNames[1],
      material: asOptionalTrimmedString(product.packagingMaterialSecondary),
      recycleCode: asOptionalTrimmedString(product.packagingRecycleCodeSecondary),
      weightGrams: asOptionalTrimmedString(product.packagingWeightSecondaryGrams),
    });
  }

  const layers = (storedLayers.length > 0 ? storedLayers : fallbackLayers).slice(0, packagingLayerNames.length);

  const hasSeparateStickerLayer = layers.some(isStickerPackagingLayer);
  const legacyStickerMaterial = layers.find((layer) => (
    !isStickerPackagingLayer(layer)
    && layer.productStickerMaterial
    && layer.productStickerMaterial !== 'Geen'
  ))?.productStickerMaterial;

  if (!hasSeparateStickerLayer && legacyStickerMaterial && layers.length < packagingLayerNames.length) {
    layers.forEach((layer) => {
      if (!isStickerPackagingLayer(layer)) layer.productStickerMaterial = undefined;
    });
    const stickerIsPlastic = legacyStickerMaterial === 'Plastic PP';
    layers.push({
      name: 'Productsticker',
      componentType: 'product_sticker',
      material: stickerIsPlastic ? 'PP' : 'PAP 22',
      recycleCode: stickerIsPlastic ? 'PP 5' : 'PAP 22',
      packagingRole: 'Primair',
      productStickerMaterial: legacyStickerMaterial,
    });
  }

  if (!layers.some(isStickerPackagingLayer)) {
    layers.unshift({
      name: 'Productsticker',
      componentType: 'product_sticker',
      packagingRole: 'Primair',
    });
  }

  layers.sort((left, right) => Number(isStickerPackagingLayer(right)) - Number(isStickerPackagingLayer(left)));

  while (layers.length < 1) {
    layers.push(createEmptyPackagingLayer(layers.length));
  }

  return layers.map((layer, index) => ({
    name: asOptionalTrimmedString(layer.name) || packagingLayerNames[index],
    componentType: layer.componentType || (isStickerPackagingLayer(layer) ? 'product_sticker' : 'packaging'),
    material: asOptionalTrimmedString(layer.material),
    recycleCode: asOptionalTrimmedString(layer.recycleCode),
    packagingSupplier: asOptionalTrimmedString(layer.packagingSupplier),
    packagingCatalogItemId: asOptionalTrimmedString(layer.packagingCatalogItemId),
    weightBasis: layer.weightBasis,
    weightGrams: asOptionalTrimmedString(layer.weightGrams),
    recycledContentPercent: asOptionalTrimmedString(layer.recycledContentPercent),
    recyclabilityClass: layer.recyclabilityClass,
    packagingRole: layer.packagingRole,
    productStickerMaterial: layer.productStickerMaterial,
  }));
}

export function summarizePackagingWasteStream(materials: string[]): string | undefined {
  const streams = Array.from(
    new Set(
      materials
        .map((material) => findPackagingMaterialOption(material)?.wasteStream)
        .filter(Boolean) as string[],
    ),
  );

  if (streams.length === 0) return undefined;
  if (streams.length === 1) return streams[0];
  return streams.join(' + ');
}

export function sumPackagingLayerWeights(layers: ProductPackagingLayer[]): string | undefined {
  const total = layers.reduce((sum, layer) => {
    const rawValue = asOptionalTrimmedString(layer.weightGrams);
    if (!rawValue) return sum;
    const numericValue = Number.parseFloat(rawValue.replace(',', '.'));
    return Number.isFinite(numericValue) ? sum + numericValue : sum;
  }, 0);

  if (total <= 0) return undefined;
  return formatDecimal(total, 8);
}

export function unitsPerPackageFromProduct(product: Product) {
  const parsed = parseDecimal(product.packagingUnit);
  return parsed > 0 ? parsed : 1;
}

export function createProductDraft(product: Product): Product {
  const packagingLayers = normalizePackagingLayers(product);
  const derivedWasteStream = summarizePackagingWasteStream(
    packagingLayers.map((layer) => layer.material).filter(Boolean) as string[],
  );
  const derivedTotalWeight = sumPackagingLayerWeights(packagingLayers);

  return {
    ...product,
    packagingLayers,
    packagingWasteStream: derivedWasteStream ?? product.packagingWasteStream,
    packagingUnit: asOptionalTrimmedString(product.packagingUnit) || '1',
    packagingWeightTotalGrams: derivedTotalWeight ?? asOptionalTrimmedString(product.packagingWeightTotalGrams),
  };
}

export function certificationRuleForArticleGroup(articleGroup?: string) {
  const normalized = (articleGroup || '').trim().toLowerCase();
  if (!normalized) return null;
  return certificationArticleGroupRules.find((rule) => rule.match.some((candidate) => normalized.includes(candidate)));
}

export function formatCertificationPresence(value?: Product['eMarkPresent']) {
  if (!value) return 'Onbekend';
  if (value === 'niet_van_toepassing') return 'Niet van toepassing';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function isEMarkRelevant(product: Product) {
  return product.eMarkRelevant === 'ja'
    || product.complianceCategory === 'E_MARK_RELEVANT'
    || product.complianceCategory === 'TYPE_APPROVAL_RELATED';
}

export function isEMarkMissing(product: Product) {
  return isEMarkRelevant(product) && product.eMarkPresent !== 'ja';
}

export function isCeRelevant(product: Product) {
  return product.ceRelevant === 'ja';
}

export function isCeMissing(product: Product) {
  return isCeRelevant(product) && product.cePresent !== 'ja';
}

export function productComplianceIssueLevelLabel(level: ProductComplianceIssueLevel) {
  if (level === 'error') return 'Kritiek';
  if (level === 'warning') return 'Aanbevolen';
  return 'Informatief';
}

export function getResolvedProductComplianceSource(
  product: Product,
  supplierRecords: Supplier[] = [],
  importers: Importer[] = [],
) {
  const selectedSupplier = findSupplierByName(supplierRecords, product.supplier);
  const linkedImporter = importers.find((importer) => importer.id === selectedSupplier?.importerId);
  const linkedEuResponsiblePerson = importers.find((party) => party.id === selectedSupplier?.euResponsiblePersonId);

  return {
    ...product,
    importerName: product.importerName || linkedImporter?.name,
    importerEmail: product.importerEmail || linkedImporter?.email,
    importerAddress: product.importerAddress || linkedImporter?.address,
    importerWebsite: product.importerWebsite || linkedImporter?.website,
    importerPostalCode: product.importerPostalCode || linkedImporter?.postalCode,
    importerCity: product.importerCity || linkedImporter?.city,
    importerCountry: product.importerCountry || linkedImporter?.country,
    euResponsiblePersonName: product.euResponsiblePersonName || linkedEuResponsiblePerson?.name,
    euResponsiblePersonEmail: product.euResponsiblePersonEmail || linkedEuResponsiblePerson?.email,
    euResponsiblePersonAddress: product.euResponsiblePersonAddress || linkedEuResponsiblePerson?.address,
    euResponsiblePersonWebsite: product.euResponsiblePersonWebsite || linkedEuResponsiblePerson?.website,
    euResponsiblePersonPostalCode: product.euResponsiblePersonPostalCode || linkedEuResponsiblePerson?.postalCode,
    euResponsiblePersonCity: product.euResponsiblePersonCity || linkedEuResponsiblePerson?.city,
    euResponsiblePersonCountry: product.euResponsiblePersonCountry || linkedEuResponsiblePerson?.country,
  };
}

export function getProductComplianceResponsibility(product: Product, supplierRecords: Supplier[] = []) {
  const supplier = findSupplierByName(supplierRecords, product.supplier);
  const responsibility = product.complianceResponsibilityOverride
    ?? supplier?.complianceResponsibility
    ?? 'own';
  return {
    responsibility,
    reference: product.complianceResponsibilityOverride === 'outsourced'
      ? product.complianceResponsibilityReference
      : supplier?.complianceResponsibilityReference,
    establishedAt: product.complianceResponsibilityOverride
      ? product.complianceResponsibilitySetAt
      : supplier?.complianceResponsibilityEstablishedAt,
    setBy: product.complianceResponsibilityOverride
      ? product.complianceResponsibilitySetBy
      : supplier?.complianceResponsibilitySetBy,
    source: product.complianceResponsibilityOverride ? 'product' as const : 'supplier' as const,
  };
}

export function getRelevantProductPackagingRegistrations(
  product: Product,
  registrations: ProductPackagingRegistration[],
) {
  const normalizedProductCode = product.code.trim().toLowerCase();
  const productId = product.id?.trim();
  if (!normalizedProductCode && !productId) return [];

  return registrations.filter((registration) => {
    const registrationCode = registration.productCode?.trim().toLowerCase();
    return (productId && registration.productId === productId)
      || (normalizedProductCode && registrationCode === normalizedProductCode);
  });
}

export function getBatchDerivedPackagingLayers(registrations: ProductPackagingRegistration[]): ProductPackagingLayer[] {
  if (registrations.length === 0) return [];

  const grouped = new Map<string, ProductPackagingRegistration[]>();
  registrations.forEach((registration) => {
    const key = [
      registration.batchNumber?.trim() || registration.batchOrderNumber?.trim() || registration.batchId,
      registration.containerCostLineId || registration.productCode,
    ].join('|');
    const items = grouped.get(key) ?? [];
    items.push(registration);
    grouped.set(key, items);
  });

  const latestGroup = Array.from(grouped.values()).sort((left, right) => {
    const leftTimestamp = left.reduce((latest, registration) => Math.max(
      latest,
      Date.parse(registration.labelPrintedAt || registration.registeredAt || '') || 0,
    ), 0);
    const rightTimestamp = right.reduce((latest, registration) => Math.max(
      latest,
      Date.parse(registration.labelPrintedAt || registration.registeredAt || '') || 0,
    ), 0);
    return rightTimestamp - leftTimestamp;
  })[0] ?? [];

  return latestGroup
    .sort((left, right) => left.layerName.localeCompare(right.layerName, 'nl', { numeric: true, sensitivity: 'base' }))
    .map((registration, index) => ({
      name: registration.layerName || packagingLayerNames[index] || `Laag ${index + 1}`,
      material: asOptionalTrimmedString(registration.material),
      recycleCode: asOptionalTrimmedString(registration.recycleCode),
      packagingSupplier: asOptionalTrimmedString(registration.packagingSupplier),
      weightGrams: asOptionalTrimmedString(registration.weightGramsPerUnit),
      recycledContentPercent: asOptionalTrimmedString(registration.recycledContentPercent),
      recyclabilityClass: asOptionalTrimmedString(registration.recyclabilityClass) as ProductPackagingLayer['recyclabilityClass'],
      packagingRole: asOptionalTrimmedString(registration.packagingRole) as ProductPackagingLayer['packagingRole'],
      productStickerMaterial: asOptionalTrimmedString(registration.productStickerMaterial) as ProductPackagingLayer['productStickerMaterial'],
    }))
    .filter((layer) => (
      layer.material
      || layer.recycleCode
      || layer.packagingSupplier
      || layer.weightGrams
      || layer.recycledContentPercent
      || layer.recyclabilityClass
      || layer.packagingRole
      || layer.productStickerMaterial
    ));
}

export function getProductBatchOverviewRows(
  product: Product,
  batches: ContainerCostBatch[],
  costLines: ContainerCostLine[],
  registrations: ProductPackagingRegistration[],
): ProductBatchOverviewRow[] {
  const normalizedProductCode = product.code.trim().toLowerCase();
  const productId = product.id?.trim();
  if (!normalizedProductCode && !productId) return [];

  const relevantRegistrations = getRelevantProductPackagingRegistrations(product, registrations);

  const registrationGroups = new Map<string, ProductPackagingRegistration[]>();
  relevantRegistrations.forEach((registration) => {
    const key = registration.containerCostLineId || `${registration.batchId}:${registration.productCode}`;
    const items = registrationGroups.get(key) ?? [];
    items.push(registration);
    registrationGroups.set(key, items);
  });

  const grouped = new Map<string, {
    batchId: string;
    batchNumber: string;
    quantity: number;
    purchaseTotalEur: number;
    costTotalEur: number;
    packagingUnit: number;
    packagesCount: number;
  }>();

  costLines.forEach((line) => {
    const lineCode = line.referenceCode?.trim().toLowerCase();
    const matchesProduct = (productId && line.referenceId === productId) ||
      (normalizedProductCode && lineCode === normalizedProductCode);
    if (!matchesProduct) return;

    const batch = batches.find((item) => item.id === line.batchId);
    const quantity = parseDecimal(line.quantity);
    const goodsValueEur = parseDecimal(line.goodsValueEur);
    const costTotalEur = parseDecimal(line.calculatedUnitCostEur) * quantity;
    const lineRegistrations = registrationGroups.get(line.id)
      ?? relevantRegistrations.filter((registration) => registration.batchId === line.batchId);
    const unitsPerPackage = lineRegistrations.reduce((highest, registration) => {
      const candidate = parseDecimal(registration.unitsPerPackage || registration.packagingUnit);
      return candidate > 0 ? Math.max(highest, candidate) : highest;
    }, 0);
    const packagesCount = lineRegistrations.reduce((highest, registration) => {
      const candidate = parseDecimal(registration.packagesCount);
      return candidate > 0 ? Math.max(highest, candidate) : highest;
    }, 0);

    const key = batch?.id || line.batchId;
    const current = grouped.get(key) ?? {
      batchId: line.batchId,
      batchNumber: batch?.orderNumber || line.batchId,
      quantity: 0,
      purchaseTotalEur: 0,
      costTotalEur: 0,
      packagingUnit: 0,
      packagesCount: 0,
    };

    current.quantity += quantity;
    current.purchaseTotalEur += goodsValueEur;
    current.costTotalEur += costTotalEur;
    current.packagingUnit = Math.max(current.packagingUnit, unitsPerPackage, parseDecimal(product.packagingUnit));
    current.packagesCount = Math.max(current.packagesCount, packagesCount);
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((entry) => {
      const purchasePerUnitEur = entry.quantity > 0 ? entry.purchaseTotalEur / entry.quantity : 0;
      const costPerUnitEur = entry.quantity > 0 ? entry.costTotalEur / entry.quantity : 0;
      const packaging = entry.packagingUnit > 0
        ? `${formatQuantity(entry.packagingUnit)} st./verpakking${entry.packagesCount > 0 ? ` | ${formatQuantity(entry.packagesCount)} verp.` : ''}`
        : '-';

      return {
        batchId: entry.batchId,
        batchNumber: entry.batchNumber,
        quantity: entry.quantity,
        packaging,
        purchasePerUnitEur,
        costPerUnitEur,
      };
    })
    .sort((a, b) => b.batchNumber.localeCompare(a.batchNumber, 'nl', { numeric: true, sensitivity: 'base' }));
}

export function getProductComplianceSummary(
  product: Product,
  batches: ContainerCostBatch[],
  costLines: ContainerCostLine[],
  registrations: ProductPackagingRegistration[],
  supplierRecords: Supplier[] = [],
  importers: Importer[] = [],
): ProductComplianceSummary {
  const responsibility = getProductComplianceResponsibility(product, supplierRecords);
  if (responsibility.responsibility === 'outsourced') {
    const outsourced = { level: 'outsourced' as const, issues: [], progress: 100 };
    return {
      gpsr: outsourced,
      packaging: outsourced,
      ppwr: outsourced,
      checklist: [],
      overallLevel: 'outsourced',
      overallLabel: 'Uitbesteed aan leverancier',
      overallProgress: 100,
      severityCounts: { critical: 0, recommended: 0, informational: 0 },
    };
  }
  const resolvedProduct = getResolvedProductComplianceSource(product, supplierRecords, importers);
  const complianceSupplier = findSupplierByName(supplierRecords, product.supplier);
  const euResponsibleRequired = complianceSupplier?.herkomst === 'niet_eu';
  const relevantRegistrations = getRelevantProductPackagingRegistrations(resolvedProduct, registrations);
  const productPackagingLayers = normalizePackagingLayers(resolvedProduct);
  const batchDerivedPackagingLayers = getBatchDerivedPackagingLayers(relevantRegistrations);
  const packagingLayers = productPackagingLayers.length > 0 ? productPackagingLayers : batchDerivedPackagingLayers;
  const batchOverviewRows = getProductBatchOverviewRows(resolvedProduct, batches, costLines, registrations);
  const hasText = (value?: string) => Boolean(value?.trim());
  const percentage = (completed: number, total: number) => Math.max(0, Math.min(100, Math.round((completed / Math.max(1, total)) * 100)));
  const importerHasContact = hasText(resolvedProduct.importerEmail) || hasText(resolvedProduct.importerWebsite);
  const importerHasAddress = hasText(resolvedProduct.importerAddress)
    && hasText(resolvedProduct.importerPostalCode)
    && hasText(resolvedProduct.importerCity)
    && hasText(resolvedProduct.importerCountry);
  const euResponsibleHasContact = hasText(resolvedProduct.euResponsiblePersonEmail) || hasText(resolvedProduct.euResponsiblePersonWebsite);
  const euResponsibleHasAddress = hasText(resolvedProduct.euResponsiblePersonAddress)
    && hasText(resolvedProduct.euResponsiblePersonPostalCode)
    && hasText(resolvedProduct.euResponsiblePersonCity)
    && hasText(resolvedProduct.euResponsiblePersonCountry);
  const hasBatchRegistrationTraceability = relevantRegistrations.some((registration) =>
    hasText(registration.batchNumber)
    || hasText(registration.batchOrderNumber)
    || Boolean(registration.labelPrintedAt)
    || Boolean(registration.registeredAt),
  );
  const hasTraceability = hasText(resolvedProduct.batchNumber)
    || hasText(resolvedProduct.traceabilityCode)
    || hasBatchRegistrationTraceability;
  const hasResponsibleEntity = hasText(resolvedProduct.manufacturerName) || hasText(resolvedProduct.euResponsiblePersonName);

  const gpsrIssues: ProductComplianceIssue[] = [];
  if (!hasText(resolvedProduct.code)) {
    gpsrIssues.push({ id: 'gpsr-code', domain: 'gpsr', level: 'error', label: 'Artikelnummer ontbreekt', tab: 'basic', section: 'identification' });
  }
  if (!hasTraceability) {
    gpsrIssues.push({ id: 'gpsr-traceability', domain: 'gpsr', level: 'error', label: 'Batchnummer of traceercode ontbreekt', tab: 'gpsr', section: 'traceability', field: 'batchNumber' });
  }
  if (!hasResponsibleEntity) {
    gpsrIssues.push({ id: 'gpsr-entity', domain: 'gpsr', level: 'error', label: 'Fabrikantnaam of EU-verantwoordelijke ontbreekt', tab: 'gpsr', section: 'manufacturer' });
  }
  if (!hasText(resolvedProduct.importerName)) {
    gpsrIssues.push({ id: 'gpsr-importer-name', domain: 'gpsr', level: 'error', label: 'Importeur naam ontbreekt', tab: 'gpsr', section: 'importer' });
  }
  if (!importerHasContact) {
    gpsrIssues.push({ id: 'gpsr-importer-contact', domain: 'gpsr', level: 'error', label: 'Importeur e-mail of website ontbreekt', tab: 'gpsr', section: 'importer' });
  }
  if (!importerHasAddress) {
    gpsrIssues.push({ id: 'gpsr-importer-address', domain: 'gpsr', level: 'error', label: 'Importeur adresgegevens zijn niet compleet', tab: 'gpsr', section: 'importer' });
  }
  if (euResponsibleRequired && !hasText(resolvedProduct.euResponsiblePersonName)) {
    gpsrIssues.push({ id: 'gpsr-eu-responsible-name', domain: 'gpsr', level: 'error', label: 'EU-verantwoordelijke persoon ontbreekt', tab: 'gpsr', section: 'importer' });
  }
  if (euResponsibleRequired && !euResponsibleHasContact) {
    gpsrIssues.push({ id: 'gpsr-eu-responsible-contact', domain: 'gpsr', level: 'error', label: 'EU-verantwoordelijke e-mail of website ontbreekt', tab: 'gpsr', section: 'importer' });
  }
  if (euResponsibleRequired && !euResponsibleHasAddress) {
    gpsrIssues.push({ id: 'gpsr-eu-responsible-address', domain: 'gpsr', level: 'error', label: 'EU-verantwoordelijke adresgegevens zijn niet compleet', tab: 'gpsr', section: 'importer' });
  }
  if (!hasText(resolvedProduct.countryOfOrigin)) {
    gpsrIssues.push({ id: 'gpsr-origin', domain: 'gpsr', level: 'error', label: 'Land van herkomst ontbreekt', tab: 'basic', section: 'planning' });
  }
  if (!hasText(resolvedProduct.warning)) {
    gpsrIssues.push({ id: 'gpsr-warning', domain: 'gpsr', level: 'warning', label: 'Waarschuwing ontbreekt', tab: 'gpsr', section: 'safety' });
  }
  if (!hasText(resolvedProduct.safetyInfo)) {
    gpsrIssues.push({ id: 'gpsr-safety', domain: 'gpsr', level: 'warning', label: 'Veiligheidsinformatie ontbreekt', tab: 'gpsr', section: 'safety' });
  }
  if (resolvedProduct.eMarkRelevant === 'onbekend' || !resolvedProduct.eMarkRelevant) {
    gpsrIssues.push({ id: 'gpsr-emark-assessment', domain: 'gpsr', level: 'info', label: 'E-mark relevantie is nog niet beoordeeld', tab: 'certification', section: 'certification' });
  }
  if (resolvedProduct.ceRelevant === 'onbekend' || !resolvedProduct.ceRelevant) {
    gpsrIssues.push({ id: 'gpsr-ce-assessment', domain: 'gpsr', level: 'info', label: 'CE relevantie is nog niet beoordeeld', tab: 'certification', section: 'certification' });
  }
  if (resolvedProduct.eMarkRelevant === 'ja' && resolvedProduct.eMarkPresent !== 'ja') {
    gpsrIssues.push({ id: 'gpsr-emark', domain: 'gpsr', level: 'warning', label: 'E-markering relevant, maar niet als aanwezig vastgelegd', tab: 'certification', section: 'certification' });
  }
  if (resolvedProduct.ceRelevant === 'ja' && resolvedProduct.cePresent !== 'ja') {
    gpsrIssues.push({ id: 'gpsr-ce', domain: 'gpsr', level: 'warning', label: 'CE-markering relevant, maar niet als aanwezig vastgelegd', tab: 'certification', section: 'certification' });
  }
  if ((resolvedProduct.complianceCategory === 'E_MARK_RELEVANT' || resolvedProduct.complianceCategory === 'TYPE_APPROVAL_RELATED') && !hasText(resolvedProduct.eMarkNumber)) {
    gpsrIssues.push({ id: 'gpsr-emark-number', domain: 'gpsr', level: 'warning', label: 'E-mark nummer ontbreekt bij typegoedkeuringsrelevant product', tab: 'certification', section: 'certification' });
  }

  const activePackagingLayers = packagingLayers.filter((layer) => (
    hasText(layer.material)
    || hasText(layer.recycleCode)
    || hasText(layer.packagingSupplier)
    || parseDecimal(layer.weightGrams) > 0
    || hasText(layer.recycledContentPercent)
    || hasText(layer.recyclabilityClass)
    || hasText(layer.packagingRole)
    || hasText(layer.productStickerMaterial)
  ));
  const packagingSupplierStates = activePackagingLayers.map((layer) => {
    const supplier = findSupplierByName(supplierRecords, layer.packagingSupplier);
    const linkedPackagingItem = supplier?.packagingItems?.find((item) => item.id === layer.packagingCatalogItemId);
    const linkedItemHasDocument = Boolean(
      linkedPackagingItem
      && supplier?.ppwrDocuments?.some((document) => document.packagingItemIds?.includes(linkedPackagingItem.id)),
    );
    const linkedItemIsComplete = Boolean(
      linkedPackagingItem
      && linkedPackagingItem.actief !== false
      && linkedPackagingItem.materiaalcode.trim()
      && linkedPackagingItem.gewichtGram > 0
      && linkedPackagingItem.gewichtBasis
      && linkedPackagingItem.zorgwekkendeStoffen
      && linkedPackagingItem.bron
      && linkedItemHasDocument,
    );
    const layerIsComplete = Boolean(
      hasText(layer.material)
      && parseDecimal(layer.weightGrams) > 0
      && hasText(layer.recycledContentPercent)
      && hasText(layer.recyclabilityClass)
      && hasText(layer.packagingRole)
      && (!isStickerPackagingLayer(layer) || hasText(layer.productStickerMaterial))
      && hasText(layer.packagingSupplier)
      && findPackagingMaterialOption(layer.material)?.wasteStream,
    );
    return {
      layer,
      supplier,
      hasProfile: linkedPackagingItem
        ? linkedItemIsComplete
        : layerIsComplete || hasPpwrSupplierProfile(supplier),
    };
  });
  const packagingIssues: ProductComplianceIssue[] = [];
  if (activePackagingLayers.length === 0) {
    packagingIssues.push({ id: 'packaging-layer', domain: 'packaging', level: 'error', label: 'Er is nog geen verpakkingslaag vastgelegd', tab: 'packaging', section: 'packagingLayers' });
  }
  packagingSupplierStates.forEach(({ layer, supplier, hasProfile }, index) => {
    const layerNumber = index + 1;
    const option = findPackagingMaterialOption(layer.material);
    const hasWasteStream = Boolean(option?.wasteStream);
    if (!hasText(layer.material)) {
      packagingIssues.push({ id: `packaging-material-${index}`, domain: 'packaging', level: 'error', label: `Materiaalcode ontbreekt bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    }
    if (parseDecimal(layer.weightGrams) <= 0) {
      packagingIssues.push({ id: `packaging-weight-${index}`, domain: 'packaging', level: 'error', label: `Gewicht ontbreekt bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    }
    if (!hasWasteStream) {
      packagingIssues.push({ id: `packaging-waste-${index}`, domain: 'packaging', level: 'error', label: `Afvalstroom ontbreekt bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    }
    if (!hasText(layer.recyclabilityClass)) {
      packagingIssues.push({ id: `packaging-recyclability-${index}`, domain: 'packaging', level: 'warning', label: `Recyclebaarheid ontbreekt bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    }
    if (!hasText(layer.recycledContentPercent)) {
      packagingIssues.push({ id: `packaging-pcr-${index}`, domain: 'packaging', level: 'warning', label: `PCR% ontbreekt bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    }
    if (!hasText(layer.packagingSupplier)) {
      packagingIssues.push({ id: `packaging-supplier-${index}`, domain: 'packaging', level: 'warning', label: `Leverancier ontbreekt bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    } else if (!supplier) {
      packagingIssues.push({ id: `packaging-supplier-card-${index}`, domain: 'packaging', level: 'warning', label: `Leverancierskaart ontbreekt bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    } else if (supplier.isPackagingSupplier !== true) {
      packagingIssues.push({ id: `packaging-supplier-flag-${index}`, domain: 'packaging', level: 'warning', label: `Leverancier is nog niet gemarkeerd als verpakkingsleverancier bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    } else if (!hasProfile) {
      packagingIssues.push({ id: `packaging-supplier-ppwr-${index}`, domain: 'packaging', level: 'warning', label: `PPWR-profiel van leverancier is onvolledig bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    }
    if (isStickerPackagingLayer(layer) && !hasText(layer.productStickerMaterial)) {
      packagingIssues.push({ id: `packaging-label-${index}`, domain: 'packaging', level: 'warning', label: `Labelinformatie ontbreekt bij laag ${layerNumber}`, tab: 'packaging', section: 'packagingLayers' });
    }
  });

  const batchLinkAvailable = batchOverviewRows.length > 0
    || hasText(resolvedProduct.batch)
    || hasText(resolvedProduct.batchNumber)
    || relevantRegistrations.length > 0;
  const ppwrIssues: ProductComplianceIssue[] = [];
  const packagingErrorCount = packagingIssues.filter((issue) => issue.level === 'error').length;
  const packagingWarningCount = packagingIssues.filter((issue) => issue.level === 'warning').length;
  if (!batchLinkAvailable) {
    ppwrIssues.push({ id: 'ppwr-batch', domain: 'ppwr', level: 'error', label: 'Batchkoppeling ontbreekt voor PPWR-export', tab: 'batches', section: 'batches' });
  }
  if (activePackagingLayers.length === 0) {
    ppwrIssues.push({ id: 'ppwr-packaging', domain: 'ppwr', level: 'error', label: 'Geen verpakking beschikbaar voor PPWR', tab: 'packaging', section: 'packagingLayers' });
  }
  if (activePackagingLayers.some((layer) => parseDecimal(layer.weightGrams) <= 0)) {
    ppwrIssues.push({ id: 'ppwr-weight', domain: 'ppwr', level: 'error', label: 'Gewicht ontbreekt nog voor PPWR-export', tab: 'packaging', section: 'packagingLayers' });
  }
  if (activePackagingLayers.some((layer) => !hasText(layer.packagingSupplier))) {
    ppwrIssues.push({ id: 'ppwr-supplier', domain: 'ppwr', level: 'warning', label: 'Verpakkingsleverancier ontbreekt nog voor PPWR-export', tab: 'packaging', section: 'packagingLayers' });
  }
  if (packagingSupplierStates.some(({ layer, supplier }) => hasText(layer.packagingSupplier) && !supplier)) {
    ppwrIssues.push({ id: 'ppwr-supplier-card', domain: 'ppwr', level: 'warning', label: 'Minstens een verpakkingsleverancier is nog niet als leverancierskaart aangemaakt', tab: 'packaging', section: 'packagingLayers' });
  }
  if (packagingSupplierStates.some(({ supplier }) => supplier && supplier.isPackagingSupplier !== true)) {
    ppwrIssues.push({ id: 'ppwr-supplier-flag', domain: 'ppwr', level: 'warning', label: 'Minstens een gekoppelde leverancier staat nog niet als verpakkingsleverancier ingesteld', tab: 'packaging', section: 'packagingLayers' });
  }
  if (packagingSupplierStates.some(({ layer, supplier, hasProfile }) => hasText(layer.packagingSupplier) && supplier?.isPackagingSupplier === true && !hasProfile)) {
    ppwrIssues.push({ id: 'ppwr-supplier-profile', domain: 'ppwr', level: 'warning', label: 'PPWR-leveranciersprofiel is nog niet compleet voor alle verpakkingslagen', tab: 'packaging', section: 'packagingLayers' });
  }
  if (activePackagingLayers.some((layer) => {
    const option = findPackagingMaterialOption(layer.material);
    return !hasText(layer.material) || !option?.wasteStream;
  })) {
    ppwrIssues.push({ id: 'ppwr-material', domain: 'ppwr', level: 'warning', label: 'PPWR-export heeft nog onvolledige materiaal- of afvalstroomdata', tab: 'packaging', section: 'packagingLayers' });
  }
  if (batchOverviewRows.length === 0 && batchLinkAvailable) {
    ppwrIssues.push({ id: 'ppwr-history', domain: 'ppwr', level: 'warning', label: 'Nog geen batchhistorie gevonden voor deze PPWR-koppeling', tab: 'batches', section: 'batches' });
  }

  const resolveLevel = (issues: ProductComplianceIssue[]): ProductComplianceLevel => {
    if (issues.some((issue) => issue.level === 'error')) return 'red';
    if (issues.some((issue) => issue.level === 'warning')) return 'yellow';
    return 'green';
  };

  const gpsrTotalChecks = 11 + (euResponsibleRequired ? 3 : 0)
    + ((resolvedProduct.complianceCategory === 'E_MARK_RELEVANT' || resolvedProduct.complianceCategory === 'TYPE_APPROVAL_RELATED') ? 1 : 0)
    + (resolvedProduct.eMarkRelevant === 'ja' ? 1 : 0)
    + (resolvedProduct.ceRelevant === 'ja' ? 1 : 0);
  const gpsrProgress = percentage(gpsrTotalChecks - gpsrIssues.length, gpsrTotalChecks);

  const packagingTotalChecks = Math.max(1, activePackagingLayers.length) * 6;
  const packagingProgress = percentage(packagingTotalChecks - packagingIssues.length, packagingTotalChecks);

  const ppwrTotalChecks = 4;
  const ppwrProgress = percentage(ppwrTotalChecks - ppwrIssues.length, ppwrTotalChecks);

  const gpsrLevel = resolveLevel(gpsrIssues);
  const packagingLevel = resolveLevel(packagingIssues);
  let ppwrLevel: ProductComplianceLevel = 'green';
  if (!batchLinkAvailable || packagingErrorCount > 0) {
    ppwrLevel = 'red';
  } else if (ppwrIssues.some((issue) => issue.level === 'warning') || packagingWarningCount > 0 || packagingLevel === 'yellow') {
    ppwrLevel = 'yellow';
  }

  const overallLevel: ProductComplianceLevel = [gpsrLevel, packagingLevel, ppwrLevel].includes('red')
    ? 'red'
    : [gpsrLevel, packagingLevel, ppwrLevel].includes('yellow')
      ? 'yellow'
      : 'green';
  const checklist = [...gpsrIssues, ...packagingIssues, ...ppwrIssues].sort((left, right) => {
    const levelWeight: Record<ProductComplianceIssueLevel, number> = { error: 0, warning: 1, info: 2 };
    return levelWeight[left.level] - levelWeight[right.level];
  });
  const severityCounts = checklist.reduce((summary, issue) => {
    if (issue.level === 'error') summary.critical += 1;
    else if (issue.level === 'warning') summary.recommended += 1;
    else summary.informational += 1;
    return summary;
  }, {
    critical: 0,
    recommended: 0,
    informational: 0,
  });
  const overallProgress = Math.round((gpsrProgress + packagingProgress + ppwrProgress) / 3);

  return {
    gpsr: { level: gpsrLevel, issues: gpsrIssues, progress: gpsrProgress },
    packaging: { level: packagingLevel, issues: packagingIssues, progress: packagingProgress },
    ppwr: { level: ppwrLevel, issues: ppwrIssues, progress: ppwrProgress },
    checklist,
    overallLevel,
    overallLabel: overallLevel === 'green' ? 'Compleet' : overallLevel === 'yellow' ? 'Controleren' : 'Onvolledig',
    overallProgress,
    severityCounts,
  };
}

