import { ChangeEvent, FormEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  BatteryCharging,
  Bike,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CircleHelp,
  CircleDollarSign,
  ClipboardList,
  DatabaseZap,
  FileText,
  Factory,
  Gauge,
  Home,
  Lock,
  LogOut,
  Menu,
  PackagePlus,
  PackageX,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
  Upload,
  UserRound,
  UsersRound,
  XCircle,
  Wrench,
} from 'lucide-react';
import * as bwipjs from 'bwip-js';
import Dymo from 'dymo-connect';
import rsoLogoUrl from './assets/rso-logo.png';
import { demoData } from './data/demo-data';
import { csvRowsToScooters, dealerRowsFromScooterRows, parseDealerImport, parseExactBatchTransactionsImport, parseProductImport, parseScooterImport, updateScootersFromRows } from './lib/csv';
import { buildExactAuthStartUrl, createScooterDocumentUrl, fetchExactConnectionStatus, fetchExactSalesPreview, getAuthSession, loadSupabaseData, onAuthSessionChange, probeExactBatchLookup, replaceContainerCostLines, resolveScooterDocumentPath, signInWithPassword, signOut, signUpWithPassword, subscribeToSupabase, supabase, uploadScooterDocument, upsertBatteries, upsertBatteryModels, upsertContainerCostBatches, upsertContainerCostLines, upsertContainers, upsertDealers, upsertDocuments, upsertExactSalesPackagingOverrides, upsertImporters, upsertMaintenanceRecords, upsertProductPackagingRegistrations, upsertProducts, upsertScooterPackagingSpecs, upsertScooters, upsertSupplierContacts, upsertSuppliers, upsertWarrantyParts } from './lib/supabase';
import type { AppData, BatchPackagingComplianceConfig, BatchPackagingExactSource, BatchPackagingReportingMode, BatchPackagingScope, Battery, BatteryModel, Container, ContainerCostAllocationMode, ContainerCostBatch, ContainerCostLine, ContainerCostLineType, CsvScooterRow, Dealer, DocumentRecord, ExactBatchProbeResult, ExactConnectionStatus, ExactEndpointProbeResult, ExactSalesPackagingOverride, ExactSalesPreviewLine, Importer, MaintenanceRecord, Product, ProductPackagingLayer, ProductPackagingRegistration, Scooter, ScooterPackagingSpec, ScooterStatus, Supplier, SupplierContact, WarrantyPart } from './types';

type View = 'dashboard' | 'containers' | 'costBatches' | 'packaging' | 'scooters' | 'sales' | 'batteries' | 'products' | 'suppliers' | 'dealers' | 'warranty' | 'maintenance' | 'search';
type ImportTarget = 'scooters' | 'scooterUpdates' | 'dealers';
type ImportScooterStatus = ScooterStatus | 'file';
type ProductModalTab = 'basic' | 'gpsr' | 'packaging' | 'batches';
type PendingBatchLabelPrint = {
  batch: ContainerCostBatch;
  line: ContainerCostLine;
  product?: Product;
};
type SearchField = 'frameNumber' | 'engineNumber' | 'licensePlate';
type ScooterPanelFilters = {
  speed: string;
  model: string;
  color: string;
  status: string;
};
type LoginSession = {
  email: string;
  name: string;
  loggedInAt: number;
  expiresAt?: number;
};

type ContainerCostDraftItem = {
  id: string;
  label: string;
  category: 'transport' | 'import' | 'other';
  mode: ContainerCostAllocationMode;
  kind: 'fixed' | 'duty';
  amountEur: string;
  dutyRate: string;
  appliesTo: 'all' | 'scooter' | 'onderdeel' | 'samengesteld' | 'non-scooter';
};

type ResolvedContainerCostItem = ContainerCostDraftItem & {
  resolvedAmountEur: number;
};

type ScooterVolumeDraftRow = {
  id: string;
  model: string;
  component: 'CBU' | 'SKD';
  quantity: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  unitPriceUsd: string;
  purchaseOrderAdded?: boolean;
};

type AirMailCostDraftRow = {
  id: string;
  label: string;
  amountUsd: string;
};

const containerVolumePresets = [
  { value: '20ft', label: '20ft', volumeCbm: 33.2 },
  { value: '40ft', label: '40ft', volumeCbm: 67.7 },
  { value: '40hc', label: '40ft High Cube', volumeCbm: 76.3 },
  { value: '45hc', label: '45ft High Cube', volumeCbm: 86 },
  { value: 'custom', label: 'Aangepast', volumeCbm: 0 },
] as const;

const loginStorageKey = 'rso-admin-session';
const packagingMaterialOptions = [
  { value: 'PAP 20', label: 'PAP 20 - Golfkarton', recycleCode: 'PAP 20', recycleFamily: 'PAP', recycleNumber: '20', wasteStream: 'Papier en karton' },
  { value: 'PAP 21', label: 'PAP 21 - Massief karton', recycleCode: 'PAP 21', recycleFamily: 'PAP', recycleNumber: '21', wasteStream: 'Papier en karton' },
  { value: 'PAP 22', label: 'PAP 22 - Papier', recycleCode: 'PAP 22', recycleFamily: 'PAP', recycleNumber: '22', wasteStream: 'Papier en karton' },
  { value: 'PE-LD 04', label: 'PE-LD 04 - LDPE plastic', recycleCode: 'PE-LD 04', recycleFamily: 'LDPE', recycleNumber: '4', wasteStream: 'Plastic / PMD' },
  { value: 'HDPE', label: 'HDPE', recycleCode: 'HDPE 2', recycleFamily: 'HDPE', recycleNumber: '2', wasteStream: 'Plastic / PMD' },
  { value: 'PP', label: 'PP', recycleCode: 'PP 5', recycleFamily: 'PP', recycleNumber: '5', wasteStream: 'Plastic / PMD' },
  { value: 'PET', label: 'PET', recycleCode: 'PET 1', recycleFamily: 'PET', recycleNumber: '1', wasteStream: 'Plastic / PMD' },
] as const;

const packagingLayerNames = ['01. Omverpakking', '02. Binnenzak', '03. Label / sticker', '04. Transportverpakking', '05. Extra component'] as const;
const packagingRoleOptions = ['Primair', 'Secundair', 'Tertiair'] as const;
const recyclabilityClassOptions = ['Klasse A', 'Klasse B', 'Klasse C', 'Klasse D', 'Klasse E'] as const;
const productStickerMaterialOptions = ['Geen', 'Papier', 'Plastic PP'] as const;
const batchPackagingScopeOptions: BatchPackagingScope[] = ['Eigen import', 'EU-import', 'Binnenlandse inkoop'];
const batchPackagingReportingModeOptions: BatchPackagingReportingMode[] = ['Alles registreren', 'Alleen SUP', 'Vrijgesteld'];
const batchPackagingExactSourceOptions: BatchPackagingExactSource[] = ['Ordernummer', 'Batchnummer', 'Handmatig'];
const euMemberStates = [
  { code: 'AT', name: 'Oostenrijk' },
  { code: 'BE', name: 'Belgie' },
  { code: 'BG', name: 'Bulgarije' },
  { code: 'HR', name: 'Kroatie' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Tsjechie' },
  { code: 'DK', name: 'Denemarken' },
  { code: 'EE', name: 'Estland' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'Frankrijk' },
  { code: 'DE', name: 'Duitsland' },
  { code: 'GR', name: 'Griekenland' },
  { code: 'HU', name: 'Hongarije' },
  { code: 'IE', name: 'Ierland' },
  { code: 'IT', name: 'Italie' },
  { code: 'LV', name: 'Letland' },
  { code: 'LT', name: 'Litouwen' },
  { code: 'LU', name: 'Luxemburg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Nederland' },
  { code: 'PL', name: 'Polen' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Roemenie' },
  { code: 'SK', name: 'Slowakije' },
  { code: 'SI', name: 'Slovenie' },
  { code: 'ES', name: 'Spanje' },
  { code: 'SE', name: 'Zweden' },
] as const;
const euMemberStateMap = new Map<string, string>(euMemberStates.map((country) => [country.code, country.name]));

const views: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'batteries', label: 'Accu', icon: BatteryCharging },
  { id: 'containers', label: 'Containers', icon: Boxes },
  { id: 'dealers', label: 'Dealers', icon: UsersRound },
  { id: 'warranty', label: 'Garantie claims', icon: ShieldCheck },
  { id: 'costBatches', label: 'Import China', icon: FileText },
  { id: 'suppliers', label: 'Leveranciers', icon: Factory },
  { id: 'maintenance', label: 'Onderhoud', icon: ClipboardList },
  { id: 'products', label: 'Producten', icon: BriefcaseBusiness },
  { id: 'scooters', label: 'Scooters', icon: Bike },
  { id: 'sales', label: 'Verkoop', icon: CircleDollarSign },
  { id: 'packaging', label: 'Verpakking', icon: PackagePlus },
  { id: 'search', label: 'Zoeken', icon: Search },
];

const statusColor: Record<ScooterStatus, string> = {
  Beschikbaar: 'pink',
  'Verkocht dealer': 'teal',
  'Verkocht klant': 'cyan',
  'Af te leveren': 'blue',
  'Nog onderweg': 'slate',
  'In consignatie': 'violet',
  'In optie': 'orange',
  Overig: 'slate',
};

const maintenancePackages = {
  small: {
    label: 'Kleine onderhoudsbeurt',
    items: ['Olie verversen', 'Bougie vervangen', 'Bandenspanningscheck', 'Luchtfiltercheck', 'Profielcheck', 'Remblokkencheck', 'Verlichtingscheck'],
  },
  large: {
    label: 'Grote onderhoudsbeurt',
    items: ['Olie verversen', 'Bougie vervangen', 'Bandenspanningscheck', 'Luchtfiltercheck', 'Profielcheck', 'Remblokkencheck', 'Verlichtingscheck', 'Kleppen stellen', 'Smering bewegende onderdelen', 'V-snaarcheck', 'Variorollencheck'],
  },
} as const;

const warrantyStatuses: WarrantyPart['status'][] = ['Open', 'In behandeling', 'Goedgekeurd', 'Afgewezen', 'Vervangen', 'Afgehandeld'];

function countByStatus(scooters: Scooter[], status: ScooterStatus) {
  return scooters.filter((scooter) => scooter.status === status).length;
}

function scooterStatusLabel(status: ScooterStatus) {
  return status === 'Af te leveren' ? 'Verkocht zonder kenteken' : status;
}

function normalizeDateValue(value?: string) {
  if (!value) return null;
  const exactMatch = value.match(/^\/Date\((\d+)\)\/$/);
  if (exactMatch) {
    const timestamp = Number.parseInt(exactMatch[1], 10);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = normalizeDateValue(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: value.includes('T') ? '2-digit' : undefined,
    minute: value.includes('T') ? '2-digit' : undefined,
  }).format(date);
}

function formatDateOnly(value?: string) {
  if (!value) return '-';
  const date = normalizeDateValue(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function toInputDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toInputDateTimeValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseProbeEndpoint(endpoint: string) {
  const [path, requestUrl] = endpoint.split('\n');
  return {
    path: path || endpoint,
    requestUrl: requestUrl || '',
  };
}

function compactProbeLabel(endpoint: string) {
  const { path } = parseProbeEndpoint(endpoint);
  const parts = path.split('/');
  if (parts.length <= 2) return path;
  return `${parts.slice(0, 2).join('/')}/${parts[parts.length - 1]}`;
}

function summarizeProbeRequest(endpoint: string) {
  const { path, requestUrl } = parseProbeEndpoint(endpoint);

  if (!requestUrl) {
    return {
      title: compactProbeLabel(endpoint),
      details: [] as string[],
    };
  }

  try {
    const url = new URL(requestUrl);
    const filter = url.searchParams.get('$filter');
    const select = url.searchParams.get('$select');
    const expand = url.searchParams.get('$expand');
    const top = url.searchParams.get('$top');
    const details: string[] = [];

    if (filter) details.push(`Filter: ${decodeURIComponent(filter)}`);
    if (select) details.push(`Velden: ${decodeURIComponent(select)}`);
    if (expand) details.push(`Uitklappen: ${decodeURIComponent(expand)}`);
    if (top) details.push(`Top: ${top}`);

    return {
      title: compactProbeLabel(path),
      details,
    };
  } catch {
    return {
      title: compactProbeLabel(endpoint),
      details: requestUrl ? [requestUrl] : [],
    };
  }
}

function preferredProbeFields(row: Record<string, string>) {
  const fieldOrder = [
    'BatchNumber',
    'OrderNumber',
    'AvailableQuantity',
    'Quantity',
    'QuantityIn',
    'QuantityOut',
    'SalesOrderNumber',
    'LineNumber',
    'StockTransactionType',
    'MutationNumber',
    'MutationDate',
    'Created',
    'EntryID',
    'EntryNumber',
    'ItemCode',
    'Description',
    'ID',
    'Item',
  ];

  const picked = fieldOrder
    .filter((key) => row[key])
    .map((key) => [key, row[key]] as const);

  return picked.length > 0 ? picked : Object.entries(row).slice(0, 6);
}

function humanizeProbeFieldLabel(key: string) {
  const labels: Record<string, string> = {
    BatchNumber: 'Batch',
    OrderNumber: 'Order',
    AvailableQuantity: 'Beschikbaar',
    Quantity: 'Aantal',
    QuantityIn: 'Aantal in',
    QuantityOut: 'Aantal uit',
    SalesOrderNumber: 'Order',
    LineNumber: 'Regel',
    StockTransactionType: 'Stock type',
    MutationNumber: 'Mutatienummer',
    MutationDate: 'Mutatiedatum',
    Created: 'Aangemaakt',
    EntryID: 'Entry ID',
    EntryNumber: 'Entry',
    ItemCode: 'Artikel',
    Description: 'Omschrijving',
    ID: 'ID',
    Item: 'Item GUID',
  };

  return labels[key] || key;
}

function renderProbeCell(probe: ExactEndpointProbeResult | ExactBatchProbeResult) {
  if (!probe.ok) {
    return <span className="probe-error-message">{probe.message || 'Onbekende fout'}</span>;
  }

  if (!probe.sample?.length) {
    return <span className="probe-empty-message">Geen resultaten</span>;
  }

  return (
    <div className="probe-sample-list">
      {probe.sample.map((row, index) => (
        <div key={`${probe.endpoint}-${index}`} className="probe-sample-card">
          {preferredProbeFields(row).map(([key, value]) => (
            <div key={key} className="probe-sample-row">
              <strong>{humanizeProbeFieldLabel(key)}</strong>
              <span>{value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function renderProbeList(probes: Array<ExactEndpointProbeResult | ExactBatchProbeResult>) {
  return (
    <div className="probe-list">
      {probes.map((probe) => {
        const summary = summarizeProbeRequest(probe.endpoint);

        return (
          <article key={probe.endpoint} className="probe-card">
            <div className="probe-card-header">
              <div className="probe-card-title-group">
                <strong className="probe-card-title">{summary.title}</strong>
                {summary.details.length > 0 ? (
                  <div className="probe-card-details">
                    {summary.details.map((detail) => (
                      <span key={detail}>{detail}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="probe-card-meta">
                <span className={`probe-status ${probe.ok ? 'ok' : 'error'}`}>{probe.ok ? 'OK' : 'Fout'}</span>
                <span className="probe-count">{probe.count ?? '-'}</span>
              </div>
            </div>
            <div className="probe-card-body">{renderProbeCell(probe)}</div>
          </article>
        );
      })}
    </div>
  );
}

function findProbeByPath(probes: ExactBatchProbeResult[], path: string) {
  return probes.find((probe) => parseProbeEndpoint(probe.endpoint).path === path);
}

function parseDecimalString(value?: string) {
  if (!value) return 0;
  const normalized = value.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeExactCountryCode(value?: string) {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return '';
  if (normalized === 'EL') return 'GR';
  return normalized.length === 2 ? normalized : '';
}

function formatExactCountry(value?: string, fallback?: string) {
  const countryCode = normalizeExactCountryCode(value);
  if (!countryCode) return fallback?.trim() || 'Land ontbreekt';
  return `${euMemberStateMap.get(countryCode) || fallback?.trim() || countryCode} (${countryCode})`;
}

function buildBatchProbeSummary(
  probes: ExactBatchProbeResult[],
  line: ExactSalesPreviewLine | null,
  knownBatchNumber: string,
) {
  const goodsDeliveryLineProbe = findProbeByPath(probes, 'salesorder/GoodsDeliveryLines');
  const goodsDeliveriesProbe = findProbeByPath(probes, 'salesorder/GoodsDeliveries');
  const batchNumbersProbe = findProbeByPath(probes, 'inventory/BatchNumbers');
  const stockBatchNumbersProbe = findProbeByPath(probes, 'inventory/StockBatchNumbers');

  const goodsDeliveryLineRow = goodsDeliveryLineProbe?.sample?.[0];
  const goodsDeliveriesRow = goodsDeliveriesProbe?.sample?.[0];
  const batchNumberRows = (batchNumbersProbe?.sample ?? []).filter((row) =>
    !knownBatchNumber || row.BatchNumber === knownBatchNumber,
  );
  const stockBatchNumberRows = (stockBatchNumbersProbe?.sample ?? []).filter((row) =>
    !knownBatchNumber || row.BatchNumber === knownBatchNumber,
  );

  const availableQuantity = batchNumberRows.reduce((sum, row) => sum + parseDecimalString(row.AvailableQuantity), 0);
  const stockQuantity = stockBatchNumberRows.reduce((sum, row) => sum + parseDecimalString(row.Quantity), 0);

  const deliveryLineMatches = Boolean(
    goodsDeliveryLineRow
    && line
    && goodsDeliveryLineRow.SalesOrderNumber === (line.salesOrderNumber || '')
    && goodsDeliveryLineRow.LineNumber === (line.lineNumber || ''),
  );

  return {
    deliveryLineMatches,
    goodsDeliveryLineRow,
    goodsDeliveriesRow,
    batchNumberRows,
    stockBatchNumberRows,
    availableQuantity,
    stockQuantity,
  };
}

function rdwDateToInputDate(value?: string) {
  if (!value) return '';
  if (value.includes('T')) return value.slice(0, 10);
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value;
}

function dealerName(dealers: Dealer[], dealerId?: string) {
  return dealers.find((dealer) => dealer.id === dealerId)?.company ?? '';
}

function findPackagingMaterialOption(value?: string) {
  return packagingMaterialOptions.find((option) => option.value === value || option.recycleCode === value);
}

function isStickerPackagingLayer(layer: ProductPackagingLayer) {
  const name = (layer.name ?? '').toLowerCase();
  return name.includes('sticker') || name.includes('label');
}

function asOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function createEmptyPackagingLayer(index: number): ProductPackagingLayer {
  return { name: packagingLayerNames[index] };
}

function toPackagingLayerRecords(value: unknown): Record<string, unknown>[] {
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

function readPackagingLayerField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asOptionalTrimmedString(record[key]);
    if (value) return value;
  }
  return undefined;
}

function normalizePackagingLayers(product: Product): ProductPackagingLayer[] {
  const storedLayers = toPackagingLayerRecords(product.packagingLayers)
    .slice(0, packagingLayerNames.length)
    .map((layer, index) => {
      const record = layer && typeof layer === 'object' ? (layer as Record<string, unknown>) : {};
      return {
        name: readPackagingLayerField(record, ['name', 'layerName', 'title']) || packagingLayerNames[index],
        material: readPackagingLayerField(record, ['material', 'packagingMaterial', 'packaging_material']),
        recycleCode: readPackagingLayerField(record, ['recycleCode', 'recycle_code', 'code']),
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

  while (layers.length < 2) {
    layers.push(createEmptyPackagingLayer(layers.length));
  }

  return layers.map((layer, index) => ({
    name: asOptionalTrimmedString(layer.name) || packagingLayerNames[index],
    material: asOptionalTrimmedString(layer.material),
    recycleCode: asOptionalTrimmedString(layer.recycleCode),
    weightGrams: asOptionalTrimmedString(layer.weightGrams),
    recycledContentPercent: asOptionalTrimmedString(layer.recycledContentPercent),
    recyclabilityClass: layer.recyclabilityClass,
    packagingRole: layer.packagingRole,
    productStickerMaterial: layer.productStickerMaterial,
  }));
}

function summarizePackagingWasteStream(materials: string[]): string | undefined {
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

function sumPackagingLayerWeights(layers: ProductPackagingLayer[]): string | undefined {
  const total = layers.reduce((sum, layer) => {
    const rawValue = asOptionalTrimmedString(layer.weightGrams);
    if (!rawValue) return sum;
    const numericValue = Number.parseFloat(rawValue.replace(',', '.'));
    return Number.isFinite(numericValue) ? sum + numericValue : sum;
  }, 0);

  if (total <= 0) return undefined;
  return formatDecimal(total, 8);
}

function unitsPerPackageFromProduct(product: Product) {
  const parsed = parseDecimal(product.packagingUnit);
  return parsed > 0 ? parsed : 1;
}

function createProductDraft(product: Product): Product {
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

function findProductForCostLine(products: Product[], line: ContainerCostLine) {
  return products.find((item) => (
    item.id === line.referenceId
    || item.code === line.referenceCode
    || item.supplierItemNo === line.referenceCode
  ));
}

function productFromCostLine(line: ContainerCostLine, product?: Product): Product {
  return {
    id: product?.id || line.referenceId || stableId('product', line.referenceCode || line.id),
    code: product?.code || line.referenceCode,
    supplierItemNo: product?.supplierItemNo,
    isNewProduct: product?.isNewProduct,
    createdAt: product?.createdAt,
    description: product?.description || line.description,
    barcode: product?.barcode,
    batch: product?.batch,
    salePrice: product?.salePrice,
    purchasePrice: product?.purchasePrice,
    costPrice: product?.costPrice || line.calculatedUnitCostEur,
    webshop: product?.webshop,
    articleGroup: product?.articleGroup,
    stock: product?.stock,
    startDate: product?.startDate,
    endDate: product?.endDate,
    supplier: product?.supplier,
    importCompany: product?.importCompany,
    countryOfOrigin: product?.countryOfOrigin,
    imageUrl: product?.imageUrl,
    brand: product?.brand,
    labelTitle: product?.labelTitle,
    shortDescription: product?.shortDescription,
    batchNumber: product?.batchNumber,
    serialNumber: product?.serialNumber,
    traceabilityCode: product?.traceabilityCode,
    qrUrl: product?.qrUrl,
    warning: product?.warning,
    safetyInfo: product?.safetyInfo,
    manufacturerName: product?.manufacturerName,
    manufacturerAddress: product?.manufacturerAddress,
    manufacturerPostalCode: product?.manufacturerPostalCode,
    manufacturerCity: product?.manufacturerCity,
    manufacturerCountry: product?.manufacturerCountry,
    manufacturerEmail: product?.manufacturerEmail,
    manufacturerWebsite: product?.manufacturerWebsite,
    importerName: product?.importerName,
    importerAddress: product?.importerAddress,
    importerPostalCode: product?.importerPostalCode,
    importerCity: product?.importerCity,
    importerCountry: product?.importerCountry,
    importerEmail: product?.importerEmail,
    importerWebsite: product?.importerWebsite,
    packagingUnit: product?.packagingUnit,
    packagingLayers: product?.packagingLayers,
    packagingMaterialPrimary: product?.packagingMaterialPrimary,
    packagingMaterialSecondary: product?.packagingMaterialSecondary,
    packagingRecycleCodePrimary: product?.packagingRecycleCodePrimary,
    packagingRecycleCodeSecondary: product?.packagingRecycleCodeSecondary,
    packagingWasteStream: product?.packagingWasteStream,
    packagingNotes: product?.packagingNotes,
    packagingWeightPrimaryGrams: product?.packagingWeightPrimaryGrams,
    packagingWeightSecondaryGrams: product?.packagingWeightSecondaryGrams,
    packagingWeightTotalGrams: product?.packagingWeightTotalGrams,
  };
}

function buildPackagingRegistrationsForBatch(
  batch: ContainerCostBatch,
  lines: ContainerCostLine[],
  products: Product[],
): ProductPackagingRegistration[] {
  return lines.flatMap((line) => {
    const product = productFromCostLine(line, findProductForCostLine(products, line));

    const quantity = parseDecimal(line.quantity);
    const unitsPerPackage = unitsPerPackageFromProduct(product);
    const packagesCount = unitsPerPackage > 0 ? Math.ceil(quantity / unitsPerPackage) : quantity;
    const layersWithValues = normalizePackagingLayers(product)
      .filter((layer) => layer.material || layer.recycleCode || layer.weightGrams);
    const layers = layersWithValues.length > 0
      ? layersWithValues
      : [{ name: 'Onbekend', material: 'Onbekend', weightGrams: '0' }];

    return layers.map((layer, index) => {
      const material = layer.material || 'Onbekend';
      const weightGramsPerUnit = layer.weightGrams || '0';
      const totalWeightGrams = parseDecimal(weightGramsPerUnit) * packagesCount;
      const wasteStream = findPackagingMaterialOption(material)?.wasteStream;

      return {
        id: stableId('product-packaging-registration', `${batch.id}-${line.id}-${index + 1}`),
        batchId: batch.id,
        batchOrderNumber: batch.orderNumber,
        batchNumber: product.batchNumber,
        containerNumber: batch.containerNumber,
        containerCostLineId: line.id,
        productId: product.id,
        productCode: product.code || line.referenceCode,
        productDescription: product.description || line.description,
        productBarcode: product.barcode,
        quantity: line.quantity,
        packagingUnit: product.packagingUnit || '1',
        packagesCount: formatDecimal(packagesCount, 8),
        unitsPerPackage: formatDecimal(unitsPerPackage, 8),
        layerName: layer.name || packagingLayerNames[index] || `Laag ${index + 1}`,
        material,
        recycleCode: layer.recycleCode,
        wasteStream,
        recycledContentPercent: layer.recycledContentPercent,
        recyclabilityClass: layer.recyclabilityClass,
        packagingRole: layer.packagingRole,
        productStickerMaterial: layer.productStickerMaterial,
        weightGramsPerUnit,
        totalWeightGrams: formatDecimal(totalWeightGrams, 8),
        source: 'product_snapshot',
        registeredAt: new Date().toISOString(),
      };
    });
  });
}

function buildPackagingRegistrationsForExistingProduct(
  product: Product,
  existingRegistrations: ProductPackagingRegistration[],
): ProductPackagingRegistration[] {
  const unitsPerPackage = unitsPerPackageFromProduct(product);
  const layersWithValues = normalizePackagingLayers(product)
    .filter((layer) => layer.material || layer.recycleCode || layer.weightGrams);
  const layers = layersWithValues.length > 0
    ? layersWithValues
    : [{ name: 'Onbekend', material: 'Onbekend', weightGrams: '0' }];

  const grouped = new Map<string, ProductPackagingRegistration>();
  existingRegistrations.forEach((registration) => {
    const key = [
      registration.batchId,
      registration.containerCostLineId || '',
      registration.productCode,
      registration.batchNumber || '',
      registration.quantity,
    ].join('|');
    if (!grouped.has(key)) {
      grouped.set(key, registration);
    }
  });

  return Array.from(grouped.values()).flatMap((registration, groupIndex) => {
    const quantity = parseDecimal(registration.quantity);
    const packagesCount = unitsPerPackage > 0 ? Math.ceil(quantity / unitsPerPackage) : quantity;

    return layers.map((layer, index) => {
      const material = layer.material || 'Onbekend';
      const weightGramsPerUnit = layer.weightGrams || '0';
      const totalWeightGrams = parseDecimal(weightGramsPerUnit) * packagesCount;
      const wasteStream = findPackagingMaterialOption(material)?.wasteStream;

      return {
        ...registration,
        id: stableId(
          'product-packaging-registration',
          `${registration.batchId}-${registration.containerCostLineId || registration.productCode}-${registration.batchNumber || 'batch'}-${groupIndex + 1}-${index + 1}`,
        ),
        productId: product.id || registration.productId,
        productCode: product.code || registration.productCode,
        productDescription: product.description || registration.productDescription,
        productBarcode: product.barcode || registration.productBarcode,
        packagingUnit: product.packagingUnit || '1',
        packagesCount: formatDecimal(packagesCount, 8),
        unitsPerPackage: formatDecimal(unitsPerPackage, 8),
        layerName: layer.name || packagingLayerNames[index] || `Laag ${index + 1}`,
        material,
        recycleCode: layer.recycleCode,
        wasteStream,
        recycledContentPercent: layer.recycledContentPercent,
        recyclabilityClass: layer.recyclabilityClass,
        packagingRole: layer.packagingRole,
        productStickerMaterial: layer.productStickerMaterial,
        weightGramsPerUnit,
        totalWeightGrams: formatDecimal(totalWeightGrams, 8),
        source: 'product_snapshot',
        registeredAt: new Date().toISOString(),
      } satisfies ProductPackagingRegistration;
    });
  });
}

function buildExactSalesPackagingOverridesForBatch(
  product: Product,
  batchNumber: string,
): ExactSalesPackagingOverride[] {
  const normalizedBatch = batchNumber.trim();
  if (!normalizedBatch) return [];

  const layersWithValues = normalizePackagingLayers(product)
    .filter((layer) => layer.material || layer.recycleCode || layer.weightGrams);
  const layers = layersWithValues.length > 0
    ? layersWithValues
    : [{ name: 'Onbekend', material: 'Onbekend', weightGrams: '0' }];

  return layers.map((layer, index) => {
    const material = layer.material || 'Onbekend';
    return {
      id: stableId('exact-sales-packaging-override', `${product.code}-${normalizedBatch}-${index + 1}`),
      productCode: product.code,
      batchNumber: normalizedBatch,
      productDescription: product.description,
      packagingUnit: product.packagingUnit || '1',
      layerName: layer.name || packagingLayerNames[index] || `Laag ${index + 1}`,
      material,
      recycleCode: layer.recycleCode,
      wasteStream: findPackagingMaterialOption(material)?.wasteStream,
      recycledContentPercent: layer.recycledContentPercent,
      recyclabilityClass: layer.recyclabilityClass,
      packagingRole: layer.packagingRole,
      productStickerMaterial: layer.productStickerMaterial,
      weightGramsPerUnit: layer.weightGrams || '0',
      notes: product.packagingNotes,
      updatedAt: new Date().toISOString(),
    } satisfies ExactSalesPackagingOverride;
  });
}

function articleNumberPrefix(date = new Date()) {
  return `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function productIdFromArticleNumber(value: string) {
  return `product-${value.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
}

function normalizeImportedProducts(products: Product[], existingProducts: Product[]) {
  const prefix = articleNumberPrefix();
  let nextSequence = [...existingProducts, ...products].reduce((max, product) => {
    const match = (product.code || '').trim().match(new RegExp(`^${prefix}(\\d+)$`));
    if (!match) return max;
    const sequence = Number.parseInt(match[1], 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0) + 1;

  const usedArticleNumbers = new Set(
    existingProducts
      .map((product) => product.code?.trim().toLowerCase())
      .filter(Boolean) as string[],
  );

  return products.map((product) => {
    const articleNumber = product.code.trim();
    const supplierItemNo = product.supplierItemNo?.trim() || '';
    let resolvedArticleNumber = articleNumber || supplierItemNo;

    if (!resolvedArticleNumber) {
      do {
        resolvedArticleNumber = `${prefix}${String(nextSequence).padStart(3, '0')}`;
        nextSequence += 1;
      } while (usedArticleNumbers.has(resolvedArticleNumber.toLowerCase()));
    }

    usedArticleNumbers.add(resolvedArticleNumber.toLowerCase());

    return {
      ...product,
      id: productIdFromArticleNumber(resolvedArticleNumber),
      code: resolvedArticleNumber,
      ...(supplierItemNo ? { supplierItemNo } : {}),
    };
  });
}

function PackagingMaterialIcon({
  option,
  compact = false,
}: {
  option?: { label: string; recycleFamily: string; recycleNumber: string; recycleCode: string };
  compact?: boolean;
}) {
  if (!option) {
    return (
      <div className={`packaging-material-preview${compact ? ' compact' : ''} empty`}>
        <span>Geen materiaal geselecteerd</span>
      </div>
    );
  }

  return (
    <div className={`packaging-material-preview${compact ? ' compact' : ''}`}>
      <svg viewBox="0 0 100 112" className="packaging-material-symbol" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" strokeLinecap="butt">
          <path d="M31.63 31.5 44.78 9.57s5.29-5.12 9.92-.49l12.25 20.78" />
          <path d="M45.95 70 20.38 69.57S13.31 67.55 15 61.23l11.87-21" />
          <path d="M72.13 38.35 84.54 60.7s1.79 7.14-4.53 8.83l-24.12.23" />
        </g>
        <g fill="currentColor">
          <path d="m46.05 69.82 14.67-8.64v17.01z" />
          <path d="m17.25 40.27 14.67-8.64v17.01z" />
          <path d="m57.28 29.99 14.67-8.64v17.01z" />
        </g>
        <text x="50" y="54" textAnchor="middle" className="packaging-material-number">{option.recycleNumber}</text>
        <text x="50" y="98" textAnchor="middle" className="packaging-material-code">{option.recycleFamily}</text>
      </svg>
      <div className="packaging-material-copy">
        <strong>{option.label}</strong>
        <small>{option.recycleCode}</small>
      </div>
    </div>
  );
}

function isRegistrationComplete(scooter: Scooter) {
  return Boolean(
    scooter.licensePlate?.trim() &&
    scooter.firstAdmissionDate &&
    scooter.firstRegistrationDate &&
    scooter.lastRegistrationDate,
  );
}

function hasInvoiceNumber(scooter: Scooter) {
  return Boolean(scooter.invoiceNumber?.trim());
}

function normalizeRegistrationStatus(scooter: Scooter): Scooter {
  return isRegistrationComplete(scooter) && hasInvoiceNumber(scooter)
    ? { ...scooter, status: 'Verkocht klant' }
    : scooter;
}

function formatVehicleAge(firstAdmissionDate?: string) {
  if (!firstAdmissionDate) return '-';
  const start = new Date(firstAdmissionDate);
  const end = new Date();
  if (Number.isNaN(start.getTime()) || start > end) return '-';

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const previousMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += previousMonth.getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return `${years} jaar, ${months} maanden, ${days} dagen`;
}

function addMonthsToInputDate(value?: string, months = 24) {
  if (!value) return '';
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return '';
  const result = new Date(start);
  result.setMonth(result.getMonth() + months);
  return result.toISOString().slice(0, 10);
}

function isPastInputDate(value?: string) {
  if (!value) return false;
  const end = new Date(`${value}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end < new Date();
}

function nextWarrantyClaimNumber(warranties: WarrantyPart[]) {
  const currentYear = new Date().getFullYear();
  const prefix = `W-${currentYear}-`;
  const next = warranties.reduce((highest, warranty) => {
    const number = warranty.claimNumber?.startsWith(prefix)
      ? Number(warranty.claimNumber.slice(prefix.length))
      : 0;
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

function parseCurrencyInput(value?: string) {
  if (!value) return '';
  const normalized = value
    .trim()
    .replace(/\s+/g, '')
    .replace(/€/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return '';
  return amount.toFixed(2);
}

function formatCurrency(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function warrantyItemsForClaim(claim: WarrantyPart) {
  if (claim.claimItems?.length) {
    return claim.claimItems.filter((item) => item.partName?.trim());
  }
  if (!claim.partName?.trim()) return [];
  return [{
    partName: claim.partName,
    partNumber: claim.partNumber,
    partPrice: claim.partPrice,
  }];
}

function warrantyTotalPrice(claim: WarrantyPart) {
  const total = warrantyItemsForClaim(claim).reduce((sum, item) => {
    const amount = Number(item.partPrice);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
  return total > 0 ? total.toFixed(2) : '';
}

type DymoBrowserPrinter = {
  name: string;
  model: string;
  connected: boolean;
  local: boolean;
  twinTurbo: boolean;
};

const dymo99012Layout = {
  // DYMO 99012 / S0722400 compatible large address labels (89 mm x 36 mm).
  id: 'LargeAddress',
  paperName: '30321 Large Address',
  width: 5046,
  height: 2040,
  barcodeBounds: { x: 180, y: 80, width: 4686, height: 760 },
  frameBounds: { x: 180, y: 860, width: 4686, height: 260 },
  detailsBounds: { x: 180, y: 1160, width: 4686, height: 700 },
};

function escapeLabelValue(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function imageUrlToBase64(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('RSO logo kon niet worden geladen voor het productlabel.');
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('RSO logo kon niet worden verwerkt voor het productlabel.'));
    reader.readAsDataURL(blob);
  });
}

function recycleCodeParts(layer: ProductPackagingLayer, fallbackMaterial?: string) {
  const recycleCode = layer.recycleCode?.trim();
  const option = findPackagingMaterialOption(layer.material || fallbackMaterial);
  const fallbackParts = recycleCode?.match(/^([A-Za-z]+)\s*([0-9]+)?/);
  if (!option && !fallbackParts) return null;

  return {
    family: option?.recycleFamily || fallbackParts?.[1]?.toUpperCase() || '',
    number: option?.recycleNumber || fallbackParts?.[2] || '',
  };
}

function svgToPngBase64(svg: string, width: number, height: number) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Materiaal icoon kon niet worden gemaakt voor het productlabel.'));
          return;
        }
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Materiaal icoon kon niet worden geladen voor het productlabel.'));
    };
    image.src = url;
  });
}

async function buildMaterialIconsBase64(product: Product) {
  const iconParts = normalizePackagingLayers(product)
    .filter((item) => !isStickerPackagingLayer(item))
    .filter((item) => item.recycleCode?.trim() || item.material?.trim())
    .slice(0, 2)
    .map((layer) => recycleCodeParts(layer))
    .filter((part): part is { family: string; number: string } => !!part);
  if (!iconParts.length) return null;
  const iconWidth = 112;
  const iconHeight = 126;
  const gap = 14;
  const width = iconWidth;
  const height = iconParts.length * iconHeight + Math.max(0, iconParts.length - 1) * gap;
  const icons = iconParts.map((part, index) => {
    const y = index * (iconHeight + gap);
    return `<g transform="translate(0 ${y})">
      <svg x="0" y="0" width="${iconWidth}" height="${iconHeight}" viewBox="0 0 100 112">
        <g fill="none" stroke="#000" stroke-width="7" stroke-linejoin="round" stroke-linecap="butt">
          <path d="M31.63 31.5 44.78 9.57s5.29-5.12 9.92-.49l12.25 20.78" />
          <path d="M45.95 70 20.38 69.57S13.31 67.55 15 61.23l11.87-21" />
          <path d="M72.13 38.35 84.54 60.7s1.79 7.14-4.53 8.83l-24.12.23" />
        </g>
        <g fill="#000">
          <path d="m46.05 69.82 14.67-8.64v17.01z" />
          <path d="m17.25 40.27 14.67-8.64v17.01z" />
          <path d="m57.28 29.99 14.67-8.64v17.01z" />
        </g>
        <text x="50" y="54" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#000">${escapeLabelValue(part.number)}</text>
        <text x="50" y="98" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="800" fill="#000">${escapeLabelValue(part.family)}</text>
      </svg>
    </g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${icons}</svg>`;
  return svgToPngBase64(svg, width, height);
}

function buildProductBarcodeBase64(value: string) {
  const barcodeValue = value.replace(/\s/g, '');
  if (!barcodeValue) return null;
  const canvas = document.createElement('canvas');
  (bwipjs as unknown as { toCanvas: (canvas: HTMLCanvasElement, options: Record<string, unknown>) => HTMLCanvasElement }).toCanvas(canvas, {
    bcid: 'code128',
    text: barcodeValue,
    scaleX: 3,
    scaleY: 3,
    height: 15,
    includetext: true,
    textxalign: 'center',
    textsize: 12,
    textyalign: 'below',
    textyoffset: -4,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
    textcolor: '000000',
  });
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

function buildDymoScooterLabelXml(scooter: Scooter, dealer?: Dealer) {
  const barcodeValue = escapeLabelValue(scooter.frameNumber);
  const frameLabel = escapeLabelValue(scooter.frameNumber);
  const dealerLine = dealer?.company || scooter.color || '';
  const dealerAddressLine = [
    dealer?.address?.trim() || '',
    [dealer?.Postalcode?.trim() || '', dealer?.city?.trim() || ''].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  const detailLines = [
    scooter.licensePlate?.trim() || 'Geen kenteken',
    `${scooter.model} - ${scooter.color || '-'}`,
    dealerLine,
    dealerAddressLine,
  ]
    .filter(Boolean)
    .join('\n');
  const escapedDetails = escapeLabelValue(detailLines);

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>${dymo99012Layout.id}</Id>
  <PaperName>${dymo99012Layout.paperName}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${dymo99012Layout.width}" Height="${dymo99012Layout.height}" Rx="180" Ry="180" />
  </DrawCommands>
  <ObjectInfo>
    <BarcodeObject>
      <Name>FrameBarcode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Text>${barcodeValue}</Text>
      <Type>Code128Auto</Type>
      <Size>Small</Size>
      <TextPosition>None</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <QuietZonesPadding Left="0" Top="0" Right="0" Bottom="0" />
    </BarcodeObject>
    <Bounds X="${dymo99012Layout.barcodeBounds.x}" Y="${dymo99012Layout.barcodeBounds.y}" Width="${dymo99012Layout.barcodeBounds.width}" Height="${dymo99012Layout.barcodeBounds.height}" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>FrameNumber</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>False</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${frameLabel}</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="True" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${dymo99012Layout.frameBounds.x}" Y="${dymo99012Layout.frameBounds.y}" Width="${dymo99012Layout.frameBounds.width}" Height="${dymo99012Layout.frameBounds.height}" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Details</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>False</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapedDetails}</String>
          <Attributes>
            <Font Family="Arial" Size="9" Bold="True" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${dymo99012Layout.detailsBounds.x}" Y="${dymo99012Layout.detailsBounds.y}" Width="${dymo99012Layout.detailsBounds.width}" Height="${dymo99012Layout.detailsBounds.height}" />
  </ObjectInfo>
</DieCutLabel>`;
}

function productImporterLabelValue(product: Product) {
  const importerLines = [
    product.importerName,
    product.importerAddress,
    [product.importerPostalCode, product.importerCity].filter(Boolean).join(' '),
    product.importerCountry,
    product.importerEmail || product.importerWebsite,
  ]
    .map((line) => line?.trim())
    .filter(Boolean);

  if (importerLines.length) {
    return importerLines.join('\n');
  }

  return 'Yreb b.v.\nHoekerstraat 12A\n3133KR Vlaardingen\nInfo@rso-parts.nl';
}

function buildDymoProductLabelXml(product: Product, logoBase64: string, materialIconsBase64: string | null, barcodeBase64: string | null) {
  const barcodeSource = product.barcode?.trim() || product.code.trim();
  if (!barcodeSource) {
    throw new Error('Product heeft geen barcode of code om te printen.');
  }

  const batchCode = product.batchNumber?.trim() || product.batch?.trim() || product.traceabilityCode?.trim();
  if (!batchCode) {
    throw new Error('Product heeft geen batchcode om als QR-code te printen.');
  }

  const country = product.countryOfOrigin?.trim() || 'China';
  const madeInLine = country.toLowerCase().startsWith('made in') ? country : `Made in ${country}`;
  const escapedBarcode = escapeLabelValue(barcodeSource);
  const escapedCode = escapeLabelValue(product.code.trim() || barcodeSource);
  const escapedDescription = escapeLabelValue(product.labelTitle?.trim() || product.shortDescription?.trim() || product.description.trim());
  const escapedBatchCode = escapeLabelValue(batchCode);
  const escapedMadeInLine = escapeLabelValue(madeInLine);
  const escapedImporterInfo = escapeLabelValue(productImporterLabelValue(product));
  const escapedLogoBase64 = escapeLabelValue(logoBase64);
  const escapedMaterialIconsBase64 = materialIconsBase64 ? escapeLabelValue(materialIconsBase64) : '';
  const escapedBarcodeBase64 = barcodeBase64 ? escapeLabelValue(barcodeBase64) : '';
  const textObject = ({
    name,
    value,
    x,
    y,
    width,
    height,
    size,
    bold = false,
    alignment = 'Left',
  }: {
    name: string;
    value: string;
    x: number;
    y: number;
    width: number;
    height: number;
    size: number;
    bold?: boolean;
    alignment?: 'Left' | 'Center' | 'Right';
  }) => `<ObjectInfo>
    <TextObject>
      <Name>${name}</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>${alignment}</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>False</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${value}</String>
          <Attributes>
            <Font Family="Arial" Size="${size}" Bold="${bold ? 'True' : 'False'}" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${x}" Y="${y}" Width="${width}" Height="${height}" />
  </ObjectInfo>`;
  const barcodeObject = barcodeBase64 ? `<ObjectInfo>
    <ImageObject>
      <Name>ProductBarcode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${escapedBarcodeBase64}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="220" Y="965" Width="1900" Height="900" />
  </ObjectInfo>` : `<ObjectInfo>
    <BarcodeObject>
      <Name>ProductBarcode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Text>${escapedBarcode}</Text>
      <Type>Code128Auto</Type>
      <Size>Large</Size>
      <TextPosition>Bottom</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <QuietZonesPadding Left="160" Top="0" Right="160" Bottom="0" />
    </BarcodeObject>
    <Bounds X="220" Y="930" Width="1980" Height="760" />
  </ObjectInfo>`;
  const materialIconsObject = materialIconsBase64 ? `<ObjectInfo>
    <ImageObject>
      <Name>MaterialIcons</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${escapedMaterialIconsBase64}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="3440" Y="790" Width="775" Height="1075" />
  </ObjectInfo>` : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>${dymo99012Layout.id}</Id>
  <PaperName>${dymo99012Layout.paperName}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${dymo99012Layout.width}" Height="${dymo99012Layout.height}" Rx="180" Ry="180" />
  </DrawCommands>
  ${textObject({ name: 'ProductCode', value: escapedCode, x: 220, y: 210, width: 1800, height: 300, size: 14 })}
  ${textObject({ name: 'ProductDescription', value: escapedDescription, x: 220, y: 540, width: 2700, height: 290, size: 10 })}
  <ObjectInfo>
    <ImageObject>
      <Name>RsoLogo</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${escapedLogoBase64}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="3380" Y="150" Width="1420" Height="420" />
  </ObjectInfo>
  ${textObject({ name: 'ImporterInfo', value: escapedImporterInfo, x: 2360, y: 1190, width: 980, height: 520, size: 6 })}
  ${materialIconsObject}
  ${textObject({ name: 'BatchText', value: `Batch ${escapedBatchCode}`, x: 4070, y: 1600, width: 820, height: 180, size: 6, alignment: 'Center' })}
  ${textObject({ name: 'MadeInText', value: escapedMadeInLine, x: 4070, y: 1810, width: 820, height: 140, size: 6, alignment: 'Center' })}
  ${barcodeObject}
  <ObjectInfo>
    <BarcodeObject>
      <Name>BatchQrCode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Text>${escapedBatchCode}</Text>
      <Type>QRCode</Type>
      <Size>Medium</Size>
      <TextPosition>None</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <QuietZonesPadding Left="0" Top="0" Right="0" Bottom="0" />
    </BarcodeObject>
    <Bounds X="4200" Y="900" Width="620" Height="660" />
  </ObjectInfo>
</DieCutLabel>`;
}

async function getAvailableDymoPrinter() {
  const hosts = ['localhost', '127.0.0.1'];
  const ports = Array.from({ length: 10 }, (_, index) => 41951 + index);
  const failedEndpoints: string[] = [];

  for (const hostname of hosts) {
    for (const port of ports) {
      const dymo = new Dymo({ hostname, port });
      const result = await dymo.getPrinters();
      if (!result.success) {
        failedEndpoints.push(`${hostname}:${port}`);
        continue;
      }
      const printers = result.data as DymoBrowserPrinter[];
      const printer = printers.find((item) => item.connected && item.name.includes('LabelWriter 450'))
        ?? printers.find((item) => item.connected && item.name.includes('LabelWriter'))
        ?? printers.find((item) => item.connected)
        ?? printers.find((item) => item.name);
      if (printer?.name) {
        return { dymo, printerName: printer.name, port };
      }
      failedEndpoints.push(`${hostname}:${port} zonder printer`);
    }
  }

  throw new Error(`Geen actieve DYMO Connect webservice of LabelWriter printer gevonden. Getest: ${failedEndpoints.slice(0, 6).join(', ')}.`);
}

async function printScooterDymoLabel(scooter: Scooter, dealer?: Dealer) {
  const { dymo, printerName } = await getAvailableDymoPrinter();
  const labelXml = buildDymoScooterLabelXml(scooter, dealer);
  const printResult = await dymo.printLabel(printerName, labelXml, { jobTitle: `Scooter ${scooter.frameNumber}` });
  if (!printResult.success) {
    throw printResult.data instanceof Error ? printResult.data : new Error(String(printResult.data));
  }
  return printerName;
}

async function printProductDymoLabel(product: Product, quantity = 1) {
  const { dymo, printerName } = await getAvailableDymoPrinter();
  const logoBase64 = await imageUrlToBase64(rsoLogoUrl);
  const materialIconsBase64 = await buildMaterialIconsBase64(product);
  const barcodeBase64 = buildProductBarcodeBase64(product.barcode?.trim() || product.code.trim());
  const labelXml = buildDymoProductLabelXml(product, logoBase64, materialIconsBase64, barcodeBase64);
  for (let index = 0; index < quantity; index += 1) {
    const printResult = await dymo.printLabel(printerName, labelXml, { jobTitle: `Product ${product.code || product.description} (${index + 1}/${quantity})` });
    if (!printResult.success) {
      throw printResult.data instanceof Error ? printResult.data : new Error(String(printResult.data));
    }
  }
  return printerName;
}

function salesYearForScooter(scooter: Scooter) {
  if (!scooter.firstRegistrationDate) return 'Onbekend';
  const parsed = new Date(scooter.firstRegistrationDate);
  return Number.isNaN(parsed.getTime()) ? 'Onbekend' : String(parsed.getFullYear());
}

function normalizeSalesModel(model?: string) {
  const value = (model || 'Onbekend').trim();
  const normalized = value.toUpperCase().replace(/\s+/g, ' ');
  if (normalized === 'S9') return 'SPEEDY';
  if (normalized.includes('TY50QT-5E') || normalized.includes('TY50QT-5D') || normalized.includes('TY50QT-K') || normalized === 'SENSE') return 'SENSE';
  if (normalized.includes('TY2000DQT-28C') || normalized === 'E-S5') return 'E-S5';
  return value;
}

function normalizeSalesColor(color?: string) {
  const value = (color || 'Onbekend').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!value) return 'Onbekend';

  if ([
    'NARDO GREY',
    'NARDO GREY RY-087',
    'GREY',
    'GREY NARDO',
  ].includes(value)) return 'NARDO GREY';

  if ([
    'MAT ZWART',
    'MATTE BLACK RY054',
    'DARK MATTE BLACK RY053',
    'MATTE BLACK',
    'MAT BLACK',
    'DARK MATTE BLACK',
  ].includes(value)) return 'MATT BLACK';

  if ([
    'DARK MATTE BLUE',
    'DARK MATTE BLUE BOMA',
    'DARKMATTER BLUE BOMA',
    'MATTE DARK BLUE',
  ].includes(value)) return 'DARK MATTE BLUE BOMA';

  if ([
    'ZWART',
    'BLACK',
  ].includes(value)) return 'BLACK';

  if ([
    'OLIVE GREEN',
    'OLIVER GREEN',
  ].includes(value)) return 'OLIVE GREEN';

  if (value === 'CHAMPAGNE') return 'CHAMPAGNE RY-042';
  if (value === 'RED') return 'RED RY083';

  if ([
    'METAL PINK',
    'MAT PINK',
  ].includes(value)) return 'METAL PINK';

  if (value === 'MAT CAMELION') return 'MATT CAMELION';

  return value;
}

function warrantyStatusIcon(status: WarrantyPart['status']) {
  if (status === 'Afgehandeld' || status === 'Goedgekeurd') return <CheckCircle2 className="warranty-status-icon success" size={20} aria-label={status} />;
  if (status === 'In behandeling') return <Timer className="warranty-status-icon pending" size={20} aria-label={status} />;
  if (status === 'Afgewezen') return <XCircle className="warranty-status-icon danger" size={20} aria-label={status} />;
  return <ShieldCheck className="warranty-status-icon neutral" size={20} aria-label={status} />;
}

function importErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return JSON.stringify(error);
}

async function importEdgeFunctionErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
    if (context?.json) {
      try {
        const payload = await context.json() as { error?: string; message?: string };
        if (payload?.error) return payload.error;
        if (payload?.message) return payload.message;
      } catch {
        // Fall back to text parsing below.
      }
    }
    if (context?.text) {
      try {
        const bodyText = await context.text();
        if (bodyText) return bodyText;
      } catch {
        // Fall back to generic error parsing below.
      }
    }
  }
  return importErrorMessage(error);
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${value.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
}

function normalizedSupplierKey(value?: string) {
  return (value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function supplierImportedKey(supplier: Supplier) {
  return supplier.id.startsWith('supplier-') ? supplier.id.slice('supplier-'.length) : '';
}

function supplierNameMatches(supplier: Supplier, value?: string) {
  const candidate = normalizedSupplierKey(value);
  if (!candidate) return false;

  const supplierName = normalizedSupplierKey(supplier.name);
  const importedName = supplierImportedKey(supplier);
  return candidate === supplierName || candidate === importedName;
}

function displaySupplierName(suppliers: Supplier[], value?: string) {
  return suppliers.find((supplier) => supplierNameMatches(supplier, value))?.name ?? value ?? '';
}

function parseDecimal(value?: string | number | null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const raw = String(value).trim();
  let normalized = raw;

  if (raw.includes(',') && raw.includes('.')) {
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    normalized = lastDot > lastComma
      ? raw.replace(/,/g, '')
      : raw.replace(/\./g, '').replace(',', '.');
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimal(value: number, digits = 4) {
  return value.toLocaleString('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatQuantity(value?: string | number | null) {
  const numericValue = parseDecimal(value);
  if (Math.abs(numericValue - Math.round(numericValue)) < 0.00000001) {
    return formatDecimal(Math.round(numericValue), 0);
  }
  return formatCompactDecimal(numericValue, 2);
}

function formatCompactDecimal(value: number, digits = 3) {
  return value.toLocaleString('nl-NL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function roundValue(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function purchasePricePerUnit(goodsValueEurBase: number, quantity: number) {
  if (quantity <= 0) return 0;
  return roundValue(goodsValueEurBase / quantity, 4);
}

function dedupeContainerCostLines(lines: ContainerCostLine[]) {
  const byLineKey = new Map<string, ContainerCostLine>();

  lines.forEach((line) => {
    const lineKey = [
      line.batchId,
      line.type,
      line.referenceCode.trim().toLowerCase(),
      line.description.trim().toLowerCase(),
      line.quantity,
      line.unitPriceUsd,
      line.componentsNote?.trim().toLowerCase() || '',
    ].join('|');

    byLineKey.set(lineKey, line);
  });

  return Array.from(byLineKey.values());
}

type ContainerCostImportDraftLine = {
  id: string;
  type: ContainerCostLineType;
  referenceCode: string;
  articleNumber?: string;
  supplierItemNo?: string;
  supplierName?: string;
  model?: string;
  description: string;
  quantity: string;
  volumeCbm: string;
  unitPriceUsd: string;
  amountUsd?: string;
  componentsNote?: string;
  purchaseOrderAdded?: boolean;
};

function mergeContainerCostDraftLines(lines: ContainerCostImportDraftLine[]) {
  const groups = new Map<string, {
    first: ContainerCostImportDraftLine;
    quantity: number;
    amountUsd: number;
    totalVolumeCbm: number;
    notes: string[];
    count: number;
  }>();

  lines.forEach((line) => {
    const quantity = Math.max(0, parseDecimal(line.quantity));
    const unitPriceUsd = Math.max(0, parseDecimal(line.unitPriceUsd));
    const amountUsd = Math.max(0, parseDecimal(line.amountUsd));
    const volumeCbm = Math.max(0, parseDecimal(line.volumeCbm));
    const key = [
      line.type,
      line.referenceCode.trim().toLowerCase(),
      line.articleNumber?.trim().toLowerCase() || '',
      line.supplierItemNo?.trim().toLowerCase() || '',
      normalizedSupplierKey(line.supplierName),
      line.description.trim().toLowerCase(),
      formatDecimal(unitPriceUsd, 4),
    ].join('|');
    const existing = groups.get(key);
    const nextAmountUsd = amountUsd > 0 ? amountUsd : roundValue(quantity * unitPriceUsd, 4);
    const note = line.componentsNote?.trim();

    if (existing) {
      existing.quantity += quantity;
      existing.amountUsd += nextAmountUsd;
      existing.totalVolumeCbm += volumeCbm * quantity;
      existing.count += 1;
      if (note && !existing.notes.includes(note)) existing.notes.push(note);
      return;
    }

    groups.set(key, {
      first: line,
      quantity,
      amountUsd: nextAmountUsd,
      totalVolumeCbm: volumeCbm * quantity,
      notes: note ? [note] : [],
      count: 1,
    });
  });

  return Array.from(groups.values()).map(({ first, quantity, amountUsd, totalVolumeCbm, notes, count }) => ({
    ...first,
    quantity: formatCompactDecimal(quantity, 3),
    volumeCbm: quantity > 0 ? formatDecimal(totalVolumeCbm / quantity, 4) : first.volumeCbm,
    amountUsd: amountUsd > 0 ? formatDecimal(amountUsd, 4) : undefined,
    componentsNote: notes.length > 1 ? `${notes[0]} + ${count - 1} regels samengevoegd` : notes[0],
  }));
}

function sanitizeImportedNumber(value: string) {
  return value.replace(/[^\d,.-]/g, '').trim();
}

function isNumericImportToken(value: string) {
  const normalized = sanitizeImportedNumber(value);
  if (!normalized) return false;
  return /^-?\d+(?:[.,]\d+)?$/.test(normalized);
}

function looksLikeContainerNumber(value: string) {
  const normalized = value.trim();
  return /^\d+(?:-\d+)?$/i.test(normalized) || /^[a-z]{3,}\d+/i.test(normalized);
}

function looksLikeItemNumber(value: string) {
  return /[a-z]/i.test(value) && /\d/.test(value);
}

function parseContainerCostContent(content: string) {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const supplierHeaderIndex = rows.findIndex((line) => {
    const columns = line.split('\t').map((item) => item.trim().toLowerCase());
    return columns.some((column) => column.includes('ctn no'))
      && columns.some((column) => column.includes('artikelnummer'))
      && columns.some((column) => column.includes('item no'));
  });

  if (supplierHeaderIndex >= 0) {
    const parsed: ContainerCostImportDraftLine[] = [];
    let lastKnownCtnNo = '';
    let lastKnownModel = '';
    let lastKnownSupplier = '';

    rows.slice(supplierHeaderIndex + 1).forEach((line, index) => {
      const columns = line.split('\t').map((item) => item.trim());
      const padded = [...columns];
      while (padded.length < 9) padded.push('');

      const [ctnNoRaw, modelRaw, articleNumberRaw, itemNoRaw, partsRaw, qtyRaw, unitPriceRaw, amountRaw, supplierRaw] = padded;
      const ctnNo = ctnNoRaw || lastKnownCtnNo;
      const model = modelRaw || lastKnownModel;
      const articleNumber = articleNumberRaw;
      const itemNo = itemNoRaw;
      const parts = partsRaw;
      const supplier = supplierRaw || lastKnownSupplier;

      if (!parts && !articleNumber && !itemNo) return;

      lastKnownCtnNo = ctnNo || lastKnownCtnNo;
      lastKnownModel = model || lastKnownModel;
      lastKnownSupplier = supplier || lastKnownSupplier;

      const referenceCode = articleNumber || itemNo || `${model}-${parts}`.replace(/\s+/g, '-');
      const normalizedParts = parts.toLowerCase();
      const lineType: ContainerCostLineType = normalizedParts.includes('set') ? 'samengesteld' : 'onderdeel';

      parsed.push({
        id: `draft-supplier-${index + 1}-${referenceCode || parts}`.replace(/[^a-z0-9-]/gi, '').toLowerCase(),
        type: lineType,
        referenceCode,
        articleNumber: articleNumber || undefined,
        supplierItemNo: itemNo || undefined,
        supplierName: supplier || undefined,
        model: model || undefined,
        description: parts || referenceCode,
        quantity: sanitizeImportedNumber(qtyRaw) || '1',
        volumeCbm: '0',
        unitPriceUsd: sanitizeImportedNumber(unitPriceRaw) || '0',
        amountUsd: sanitizeImportedNumber(amountRaw) || undefined,
        componentsNote: [model, itemNo ? `Item No. ${itemNo}` : '', supplier, ctnNo ? `Ctn ${ctnNo}` : ''].filter(Boolean).join(' - '),
      });
    });

    return parsed;
  }

  const parsed: ContainerCostImportDraftLine[] = [];
  let lastKnownCtnNo = '';

  rows.forEach((line, index) => {
    const columns = line.split('\t').map((item) => item.trim());
    if (!columns.length) return;

    const headerKey = columns.map((column) => column.toLowerCase()).join('|');
    if (headerKey.includes('ctn no') || headerKey.includes('artikelnummer') || headerKey.includes('item no')) {
      return;
    }

    const numericIndices = columns
      .map((value, columnIndex) => (isNumericImportToken(value) ? columnIndex : -1))
      .filter((columnIndex) => columnIndex >= 0);

    if (numericIndices.length >= 3) {
      const amountIndex = numericIndices[numericIndices.length - 1];
      const unitPriceIndex = numericIndices[numericIndices.length - 2];
      const qtyIndex = numericIndices[numericIndices.length - 3];
      const leading = columns.slice(0, qtyIndex);
      const parts = leading[leading.length - 1] || '';
      const meta = leading.slice(0, -1).filter(Boolean);
      const supplier = columns.slice(amountIndex + 1).filter(Boolean).join(' ');
      let ctnNo = '';
      let model = '';
      let articleNumber = '';
      let itemNo = '';

      if (meta.length >= 4) {
        [ctnNo, model, articleNumber, itemNo] = meta.slice(0, 4);
      } else if (meta.length === 3) {
        if (looksLikeContainerNumber(meta[0])) {
          [ctnNo, model] = meta;
          itemNo = meta[2] || '';
        } else {
          [model, articleNumber, itemNo] = meta;
        }
      } else if (meta.length === 2) {
        [model] = meta;
        if (looksLikeItemNumber(meta[1])) {
          itemNo = meta[1];
        } else {
          articleNumber = meta[1];
        }
      } else if (meta.length === 1) {
        [model] = meta;
      }

      if (ctnNo) lastKnownCtnNo = ctnNo;
      const effectiveCtnNo = ctnNo || lastKnownCtnNo;
      const referenceCode = articleNumber || itemNo || `${model}-${parts}`.replace(/\s+/g, '-');
      if (referenceCode || parts) {
        const normalizedParts = (parts || '').toLowerCase();
        const lineType: ContainerCostLineType = normalizedParts.includes('set') ? 'samengesteld' : 'onderdeel';

        parsed.push({
          id: `draft-${index + 1}-${referenceCode || parts}`.replace(/[^a-z0-9-]/gi, '').toLowerCase(),
          type: lineType,
          referenceCode,
          articleNumber: articleNumber || undefined,
          supplierItemNo: itemNo || undefined,
          supplierName: supplier || undefined,
          model: model || undefined,
          description: parts || referenceCode,
          quantity: sanitizeImportedNumber(columns[qtyIndex]) || '1',
          volumeCbm: '0',
          unitPriceUsd: sanitizeImportedNumber(columns[unitPriceIndex]) || '0',
          amountUsd: sanitizeImportedNumber(columns[amountIndex]) || undefined,
          componentsNote: [model, itemNo ? `Item No. ${itemNo}` : '', supplier, effectiveCtnNo ? `Ctn ${effectiveCtnNo}` : ''].filter(Boolean).join(' - '),
        });
        return;
      }
    }

    if (columns.length < 5) return;
    const [type, referenceCode, description, quantity, volumeCbm, unitPriceUsd = '', componentsNote = ''] = columns;
    const normalizedType = (type || 'onderdeel').toLowerCase();
    const lineType: ContainerCostLineType = normalizedType.startsWith('scoot')
      ? 'scooter'
      : normalizedType.startsWith('sam')
        ? 'samengesteld'
        : 'onderdeel';

    parsed.push({
      id: `draft-${index + 1}-${referenceCode || description}`.replace(/[^a-z0-9-]/gi, '').toLowerCase(),
      type: lineType,
      referenceCode,
      description: description || referenceCode,
      quantity: quantity || '1',
      volumeCbm: volumeCbm || '0',
      unitPriceUsd: sanitizeImportedNumber(unitPriceUsd) || '0',
      amountUsd: undefined,
      componentsNote: componentsNote || undefined,
    });
  });

  return parsed;
}

async function readContainerCostImportFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'xlsx' || extension === 'xls') {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return '';
    const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[firstSheet], {
      header: 1,
      defval: '',
      raw: false,
    });

    return rawRows
      .map((row) => row.map((cell) => String(cell ?? '').trim()).join('\t'))
      .join('\n');
  }

  return file.text();
}

function defaultContainerCostItems() {
  return [
    { id: 'cost-item-freight', label: 'Freight', category: 'transport', mode: 'volume', kind: 'fixed', amountEur: '0', dutyRate: '0', appliesTo: 'all' },
    { id: 'cost-item-destination', label: 'Destination', category: 'transport', mode: 'volume', kind: 'fixed', amountEur: '0', dutyRate: '0', appliesTo: 'all' },
    { id: 'cost-item-road', label: 'Road', category: 'transport', mode: 'volume', kind: 'fixed', amountEur: '0', dutyRate: '0', appliesTo: 'all' },
    { id: 'cost-item-customs-scooters', label: 'Customs duties scooters', category: 'import', mode: 'value', kind: 'duty', amountEur: '0', dutyRate: '8', appliesTo: 'scooter' },
    { id: 'cost-item-customs-onderdelen', label: 'Customs duties onderdelen', category: 'import', mode: 'value', kind: 'duty', amountEur: '0', dutyRate: '3,7', appliesTo: 'non-scooter' },
    { id: 'cost-item-specification', label: 'As per specification', category: 'other', mode: 'value', kind: 'fixed', amountEur: '0', dutyRate: '0', appliesTo: 'all' },
  ] satisfies ContainerCostDraftItem[];
}

function nextCostItemId() {
  return `cost-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextScooterVolumeRowId() {
  return `scooter-volume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextAirMailCostRowId() {
  return `air-mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyAirMailRows(): AirMailCostDraftRow[] {
  return [{ id: nextAirMailCostRowId(), label: 'Luchtpost / FEDEX', amountUsd: '0' }];
}

function emptyScooterVolumeRows(): ScooterVolumeDraftRow[] {
  return [{ id: nextScooterVolumeRowId(), model: '', component: 'CBU', quantity: '0', lengthCm: '', widthCm: '', heightCm: '', unitPriceUsd: '' }];
}

function parseInitialScooterVolumeRows(lines?: ContainerCostLine[]): ScooterVolumeDraftRow[] {
  const scooterLines = (lines ?? []).filter((line) => line.type === 'scooter');
  if (scooterLines.length === 0) return emptyScooterVolumeRows();

  return scooterLines.map((line, index) => {
    const dimensionMatch = line.componentsNote?.match(/(CBU|SKD)\s*-\s*([\d.,]+)\s*x\s*([\d.,]+)\s*x\s*([\d.,]+)\s*cm/i);
    const component = (dimensionMatch?.[1]?.toUpperCase() === 'SKD' ? 'SKD' : 'CBU') as ScooterVolumeDraftRow['component'];

    return {
      id: `scooter-volume-existing-${index + 1}-${line.referenceCode}`.replace(/[^a-z0-9-]/gi, '').toLowerCase(),
      model: line.referenceCode.replace(/-(CBU|SKD)$/i, '') || line.description.replace(/\s+(CBU|SKD)$/i, ''),
      component,
      quantity: line.quantity || '0',
      lengthCm: dimensionMatch?.[2]?.replace('.', ',') || '',
      widthCm: dimensionMatch?.[3]?.replace('.', ',') || '',
      heightCm: dimensionMatch?.[4]?.replace('.', ',') || '',
      unitPriceUsd: line.unitPriceUsd || '',
      purchaseOrderAdded: line.purchaseOrderAdded,
    };
  });
}

function parseBatchCostItems(
  batch?: ContainerCostBatch,
): {
  costItems: ContainerCostDraftItem[];
  airMailRows: AirMailCostDraftRow[];
} {
  if (!batch?.costItemsJson) {
    return { costItems: defaultContainerCostItems(), airMailRows: emptyAirMailRows() };
  }

  try {
    const parsed = JSON.parse(batch.costItemsJson) as Array<Partial<ResolvedContainerCostItem>>;
    const exchangeRate = parseDecimal(batch.exchangeRate || '0');
    const costItems: ContainerCostDraftItem[] = [];
    const airMailRows: AirMailCostDraftRow[] = [];

    parsed.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      if (String(item.id ?? '') === 'china-transport') return;
      const resolvedAmount = parseDecimal(String(item.resolvedAmountEur ?? item.amountEur ?? '0'));
      const normalizedItem: ContainerCostDraftItem = {
        id: String(item.id ?? nextCostItemId()),
        label: String(item.label ?? 'Factuurregel'),
        category: (item.category as ContainerCostDraftItem['category']) || 'other',
        mode: (item.mode as ContainerCostAllocationMode) || 'value',
        kind: item.kind === 'duty' ? 'duty' : 'fixed',
        amountEur: item.kind === 'duty' ? '0' : formatDecimal(resolvedAmount, 2),
        dutyRate: String(item.dutyRate ?? '0'),
        appliesTo: (item.appliesTo as ContainerCostDraftItem['appliesTo']) || 'all',
      };

      if (String(item.id ?? '').startsWith('airmail-')) {
        airMailRows.push({
          id: nextAirMailCostRowId(),
          label: normalizedItem.label,
          amountUsd: exchangeRate > 0 ? formatDecimal(resolvedAmount / exchangeRate, 2) : '0',
        });
        return;
      }

      costItems.push(normalizedItem);
    });

    return {
      costItems: costItems.length > 0 ? costItems : defaultContainerCostItems(),
      airMailRows: airMailRows.length > 0 ? airMailRows : emptyAirMailRows(),
    };
  } catch {
    return { costItems: defaultContainerCostItems(), airMailRows: emptyAirMailRows() };
  }
}

function parseBatchPackagingCompliance(batch?: ContainerCostBatch): BatchPackagingComplianceConfig {
  if (!batch?.packagingComplianceJson) {
    return {
      scope: 'Eigen import',
      reportingMode: 'Alles registreren',
      exactSource: 'Ordernummer',
    };
  }

  try {
    const parsed = JSON.parse(batch.packagingComplianceJson) as Partial<BatchPackagingComplianceConfig>;
    return {
      scope: parsed.scope || 'Eigen import',
      reportingMode: parsed.reportingMode || 'Alles registreren',
      exactSource: parsed.exactSource || 'Ordernummer',
      profileName: asOptionalTrimmedString(parsed.profileName),
      notes: asOptionalTrimmedString(parsed.notes),
    };
  } catch {
    return {
      scope: 'Eigen import',
      reportingMode: 'Alles registreren',
      exactSource: 'Ordernummer',
    };
  }
}

function loginNameFromEmail(email: string) {
  const localPart = email.split('@')[0] || 'Gebruiker';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Gebruiker';
}

function createLoginSession(email: string, remember: boolean): LoginSession {
  return {
    email,
    name: loginNameFromEmail(email),
    loggedInAt: Date.now(),
    ...(remember ? { expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 } : {}),
  };
}

function readStoredLoginSession(): LoginSession | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(loginStorageKey) ?? window.sessionStorage.getItem(loginStorageKey);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as LoginSession;
    if (!session.email || (session.expiresAt && session.expiresAt < Date.now())) {
      window.localStorage.removeItem(loginStorageKey);
      window.sessionStorage.removeItem(loginStorageKey);
      return null;
    }
    return session;
  } catch {
    window.localStorage.removeItem(loginStorageKey);
    window.sessionStorage.removeItem(loginStorageKey);
    return null;
  }
}

function storeLoginSession(session: LoginSession, remember: boolean) {
  if (typeof window === 'undefined') return;
  const storage = remember ? window.localStorage : window.sessionStorage;
  window.localStorage.removeItem(loginStorageKey);
  window.sessionStorage.removeItem(loginStorageKey);
  storage.setItem(loginStorageKey, JSON.stringify(session));
}

function clearLoginSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(loginStorageKey);
  window.sessionStorage.removeItem(loginStorageKey);
}

function normalizeLookup(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function normalizeSpeedValue(value?: string) {
  if (!value) return '';
  const match = value.match(/\d{2,3}/);
  return match?.[0] ?? value.trim();
}

function normalizeRdwSpeedValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = normalizeSpeedValue(value);
    if (normalized) return normalized;
  }
  return '';
}

function formatPriceValue(value?: string) {
  if (!value) return '-';
  const normalized = value.replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

function parsePriceForSort(value?: string) {
  if (!value) return Number.NaN;
  const normalized = value.trim().replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function speedOptionsFromScooters(scooters: Scooter[]) {
  return Array.from(new Set(
    scooters
      .map((scooter) => normalizeSpeedValue(scooter.speed))
      .filter(Boolean),
  )).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b, 'nl', { sensitivity: 'base' }));
}

function filterScootersForPanel(scooters: Scooter[], query: string, searchField: SearchField, filters: ScooterPanelFilters) {
  const needle = query.toLowerCase().trim();
  return scooters.filter((scooter) => {
    const selectedFieldValue = searchField === 'frameNumber'
      ? scooter.frameNumber
      : searchField === 'engineNumber'
        ? scooter.engineNumber
        : scooter.licensePlate || '';

    return (
      (!needle || selectedFieldValue.toLowerCase().includes(needle)) &&
      (!filters.speed || normalizeSpeedValue(scooter.speed) === filters.speed) &&
      (!filters.model || scooter.model === filters.model) &&
      (!filters.color || scooter.color === filters.color) &&
      (!filters.status || scooter.status === filters.status)
    );
  });
}

function containerSortTime(container: Container) {
  const date = container.arrivedAt || container.eta;
  const time = date ? new Date(date).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function parseContainerScooterRows(content: string, containerId: string): Scooter[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^ctn\s*no/i.test(line) && !/^model\s+/i.test(line))
    .map((line): Scooter | null => {
      const columns = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/);
      const compactColumns = columns.map((column) => column.trim()).filter(Boolean);
      const numericFirstColumn = /^[\d/]+$/.test(compactColumns[0] ?? '');
      const indexedFirstColumn = /^[A-Z]?\d+-\d+$/i.test(compactColumns[0] ?? '');
      const hasLeadingIndexColumn = compactColumns.length >= 6 && (numericFirstColumn || indexedFirstColumn);
      const values = hasLeadingIndexColumn ? compactColumns.slice(1) : compactColumns;
      const fallback = line.split(/\s+/);
      const model = values[0] ?? fallback[1] ?? '';
      const frameNumber = values[1] ?? fallback.find((value) => /^L[A-Z0-9]{8,}/i.test(value)) ?? '';
      const engineNumber = values[2] ?? '';
      const color = values.length >= 5 ? values[values.length - 2] : '';
      const speed = values.length >= 5 ? values[values.length - 1] : '';
      if (!frameNumber) return null;
      return {
        id: stableId('scooter', frameNumber),
        frameNumber,
        engineNumber,
        brand: 'RSO' as const,
        model,
        color,
        speed,
        status: 'Nog onderweg' as const,
        containerId,
      };
    })
    .filter((scooter): scooter is Scooter => scooter !== null);
}

function containersFromScooterRows(rows: CsvScooterRow[], existingContainers: Container[]) {
  const byNumber = new Map(existingContainers.map((container) => [normalizeLookup(container.number), container]));
  const byId = new Map(existingContainers.map((container) => [container.id, container]));
  const imported = new Map<string, Container>();

  rows.forEach((row) => {
    const number = row.container?.trim();
    if (!number) return;
    const id = row.containerId || stableId('container', number);
    const existing = byId.get(id) ?? byNumber.get(normalizeLookup(number));
    const arrivedAt = row.arrivedAt || existing?.arrivedAt || '';
    imported.set(id, {
      id,
      number,
      invoiceNumber: existing?.invoiceNumber || '',
      sealNumber: existing?.sealNumber || '',
      status: arrivedAt ? 'Aangekomen' : existing?.status || 'In land van herkomst',
      eta: existing?.eta || (arrivedAt ? arrivedAt.slice(0, 10) : ''),
      ...(arrivedAt ? { arrivedAt } : {}),
    });
  });

  return Array.from(imported.values());
}

async function fetchRdwRegistration(licensePlate: string) {
  const normalizedPlate = licensePlate.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!normalizedPlate) throw new Error('Vul eerst een kenteken in.');

  const vehicleParams = new URLSearchParams({
    kenteken: normalizedPlate,
    $limit: '1',
  });
  const fuelParams = new URLSearchParams({
    kenteken: normalizedPlate,
    $limit: '1',
  });

  const [vehicleResponse, fuelResponse] = await Promise.all([
    fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?${vehicleParams.toString()}`),
    fetch(`https://opendata.rdw.nl/resource/8ys7-d773.json?${fuelParams.toString()}`),
  ]);
  if (!vehicleResponse.ok) throw new Error(`RDW voertuigdata gaf status ${vehicleResponse.status}.`);
  if (!fuelResponse.ok) throw new Error(`RDW emissiedata gaf status ${fuelResponse.status}.`);

  const vehicleRows = await vehicleResponse.json() as Array<{
    datum_tenaamstelling?: string;
    datum_tenaamstelling_dt?: string;
    datum_eerste_tenaamstelling_in_nederland?: string;
    datum_eerste_tenaamstelling_in_nederland_dt?: string;
    datum_eerste_toelating?: string;
    datum_eerste_toelating_dt?: string;
    maximale_constructiesnelheid?: string;
    afwijkende_maximum_snelheid?: string;
    maximum_snelheid?: string;
    type?: string;
    typegoedkeuringsnummer?: string;
    variant?: string;
    uitvoering?: string;
  }>;
  const fuelRows = await fuelResponse.json() as Array<{
    uitlaatemissieniveau?: string;
    milieuklasse_eg_goedkeuring_licht?: string;
    maximum_snelheid_voertuig?: string;
    maximumconstructiesnelheid?: string;
    maximum_constructiesnelheid?: string;
  }>;
  const record = vehicleRows[0];
  if (!record) throw new Error(`Geen RDW data gevonden voor kenteken ${normalizedPlate}.`);
  const fuelRecord = fuelRows[0];

  return {
    firstAdmissionDate: rdwDateToInputDate(record.datum_eerste_toelating_dt || record.datum_eerste_toelating),
    firstRegistrationDate: rdwDateToInputDate(record.datum_eerste_tenaamstelling_in_nederland_dt || record.datum_eerste_tenaamstelling_in_nederland),
    lastRegistrationDate: rdwDateToInputDate(record.datum_tenaamstelling_dt || record.datum_tenaamstelling),
    speed: normalizeRdwSpeedValue(
      record.maximale_constructiesnelheid,
      fuelRecord?.maximum_snelheid_voertuig,
      fuelRecord?.maximumconstructiesnelheid,
      fuelRecord?.maximum_constructiesnelheid,
      record.afwijkende_maximum_snelheid,
      record.maximum_snelheid,
    ),
    emissionClass: fuelRecord?.uitlaatemissieniveau || fuelRecord?.milieuklasse_eg_goedkeuring_licht || '',
    rdwType: record.type || '',
    rdwTypeApprovalNumber: record.typegoedkeuringsnummer || '',
    rdwVariant: record.variant || '',
    rdwExecution: record.uitvoering || '',
  };
}

export function App() {
  const [loginSession, setLoginSession] = useState<LoginSession | null>(() => (supabase ? null : readStoredLoginSession()));
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [view, setView] = useState<View>('dashboard');
  const [data, setData] = useState<AppData>(demoData);
  const [query, setQuery] = useState('');
  const [selectedScooter, setSelectedScooter] = useState<Scooter | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedProductTab, setSelectedProductTab] = useState<ProductModalTab>('basic');
  const [selectedProductApplyBatchNumber, setSelectedProductApplyBatchNumber] = useState('');
  const [pendingBatchLabelPrint, setPendingBatchLabelPrint] = useState<PendingBatchLabelPrint | null>(null);
  const [csvMessage, setCsvMessage] = useState('');
  const [csvMessageDetails, setCsvMessageDetails] = useState<string[]>([]);
  const [dealerImportMessage, setDealerImportMessage] = useState('');
  const [productMessage, setProductMessage] = useState('');
  const [supplierMessage, setSupplierMessage] = useState('');
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [batteryMessage, setBatteryMessage] = useState('');
  const [warrantyMessage, setWarrantyMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScooterStatus | 'all'>('all');

  function showCsvMessage(message: string, details: string[] = []) {
    setCsvMessage(message);
    setCsvMessageDetails(details);
  }

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      try {
        const remote = await loadSupabaseData();
        if (mounted && Object.keys(remote).length > 0) {
          setData((current) => ({ ...current, ...remote }));
        }
      } catch {
        showCsvMessage('Supabase kon niet laden, demo data blijft actief.');
      }
    }
    void hydrate();
    const unsubscribe = subscribeToSupabase(() => void hydrate());
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    let mounted = true;
    async function syncAuthSession() {
      try {
        const session = await getAuthSession();
        if (!mounted) return;
        setLoginSession(session?.user.email
          ? {
            email: session.user.email,
            name: loginNameFromEmail(session.user.email),
            loggedInAt: session.user.created_at ? new Date(session.user.created_at).getTime() : Date.now(),
            expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
          }
          : null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    void syncAuthSession();
    const unsubscribe = onAuthSessionChange(() => void syncAuthSession());
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const filteredScooters = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return data.scooters.filter((scooter) =>
      (statusFilter === 'all' || scooter.status === statusFilter) &&
      (!needle || [scooter.frameNumber, scooter.engineNumber, scooter.model, scooter.color, scooter.colorNumber, scooter.status, scooter.licensePlate, scooter.invoiceNumber, dealerName(data.dealers, scooter.dealerId)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))),
    );
  }, [data.dealers, data.scooters, query, statusFilter]);

  const productModalSuppliers = useMemo(() => {
    const productSupplierNames = data.products.map((product) => product.supplier).filter(Boolean) as string[];
    return Array.from(new Set([
      ...data.suppliers.map((supplier) => supplier.name).filter(Boolean),
      ...productSupplierNames.filter((supplierName) => !data.suppliers.some((supplier) => supplierNameMatches(supplier, supplierName))),
    ])).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  }, [data.products, data.suppliers]);

  async function importScooterFile(file: File, statusOverride?: ScooterStatus) {
    try {
      const rows = await parseScooterImport(file);
      if (rows.length === 0) {
        showCsvMessage(`Geen scooters gevonden in ${file.name}. Controleer of er een kolom Frame #, VIN of Chassis aanwezig is.`);
        return;
      }

      const autoDealers = dealerRowsFromScooterRows(rows, data.dealers);
      const dealersForImport = [...data.dealers, ...autoDealers];
      const importedContainers = containersFromScooterRows(rows, data.containers);
      const nextScooters = csvRowsToScooters(rows, data.scooters, statusOverride, dealersForImport);
      const importedFrames = new Set(rows.map((row) => row.frameNumber).filter(Boolean));
      const importedScooters = nextScooters.filter((scooter) => importedFrames.has(scooter.frameNumber));

      setData((current) => {
        const containers = new Map(current.containers.map((container) => [container.id, container]));
        importedContainers.forEach((container) => containers.set(container.id, container));
        return { ...current, containers: Array.from(containers.values()), dealers: dealersForImport, scooters: nextScooters };
      });
      await upsertDealers(autoDealers);
      await upsertContainers(importedContainers);
      await upsertScooters(importedScooters);
      const targetStatus = statusOverride ? ` met status ${statusOverride}` : '';
      const dealerMessage = autoDealers.length ? ` ${autoDealers.length} ontbrekende dealers automatisch toegevoegd.` : '';
      const containerMessage = importedContainers.length ? ` ${importedContainers.length} containers gekoppeld/bijgewerkt.` : '';
      showCsvMessage(`${rows.length} scooterregels geimporteerd naar het Scooters voorraadblok${targetStatus} uit ${file.name}.${dealerMessage}${containerMessage}`);
    } catch (error) {
      showCsvMessage(`Import mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function updateScooterFile(file: File) {
    try {
      const rows = await parseScooterImport(file);
      if (rows.length === 0) {
        showCsvMessage(`Geen scooters gevonden in ${file.name}. Controleer of er een kolom Frame #, VIN of Chassis aanwezig is.`);
        return;
      }

      const importedContainers = containersFromScooterRows(rows, data.containers);
      const { scooters: nextScooters, updatedFrames, missingFrameNumbers } = updateScootersFromRows(rows, data.scooters);
      const touchedFrameSet = new Set(updatedFrames);
      const updatedScooters = nextScooters.filter((scooter) => touchedFrameSet.has(scooter.frameNumber));

      setData((current) => {
        const containers = new Map(current.containers.map((container) => [container.id, container]));
        importedContainers.forEach((container) => containers.set(container.id, container));
        return { ...current, containers: Array.from(containers.values()), scooters: nextScooters };
      });

      await upsertContainers(importedContainers);
      await upsertScooters(updatedScooters);

      const containerMessage = importedContainers.length
        ? ` ${importedContainers.length} containers gekoppeld/aangemaakt.`
        : '';
      const missingMessage = missingFrameNumbers.length
        ? ` ${missingFrameNumbers.length} framenummers niet gevonden.`
        : '';

      showCsvMessage(
        `${updatedFrames.length} scooters bijgewerkt op framenummer uit ${file.name}.${containerMessage}${missingMessage}`,
        missingFrameNumbers,
      );
    } catch (error) {
      showCsvMessage(`Bijwerken mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function importDealerFile(file: File, showDashboardMessage = false) {
    try {
      const dealers = await parseDealerImport(file);
      if (dealers.length === 0) {
        const message = `Geen dealers gevonden in ${file.name}. Controleer kolommen zoals Bedrijfsnaam, Dealer, Email of Telefoon.`;
        if (showDashboardMessage) showCsvMessage(message);
        setDealerImportMessage(message);
        return;
      }

      setData((current) => {
        const byId = new Map(current.dealers.map((dealer) => [dealer.id, dealer]));
        dealers.forEach((dealer) => byId.set(dealer.id, dealer));
        return { ...current, dealers: Array.from(byId.values()) };
      });
      await upsertDealers(dealers);
      const message = `${dealers.length} dealers geimporteerd naar het Dealers blok uit ${file.name}.`;
      if (showDashboardMessage) showCsvMessage(message);
      setDealerImportMessage(message);
    } catch (error) {
      const message = `Dealer import mislukt: ${importErrorMessage(error)}`;
      if (showDashboardMessage) showCsvMessage(message);
      setDealerImportMessage(message);
    }
  }

  async function handleInventoryImport(target: ImportTarget, status: ImportScooterStatus, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (target === 'dealers') {
        await importDealerFile(file, true);
      } else if (target === 'scooterUpdates') {
        await updateScooterFile(file);
      } else {
        await importScooterFile(file, status === 'file' ? undefined : status);
      }
    } finally {
      event.target.value = '';
    }
  }

  async function handleDealerImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importDealerFile(file);
    } finally {
      event.target.value = '';
    }
  }

  async function handleProductImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const importedProducts = await parseProductImport(file);
      if (importedProducts.length === 0) {
        setProductMessage(`Geen producten gevonden in ${file.name}. Controleer kolommen zoals Artikelnummer, Item No., Parts of Leverancier.`);
        return;
      }
      const products = normalizeImportedProducts(importedProducts, data.products);
      setData((current) => {
        const byId = new Map(current.products.map((product) => [product.id, product]));
        products.forEach((product) => byId.set(product.id, product));
        return { ...current, products: Array.from(byId.values()) };
      });
      await upsertProducts(products);
      setProductMessage(`${products.length} producten geimporteerd uit ${file.name}.`);
    } catch (error) {
      setProductMessage(`Product import mislukt: ${importErrorMessage(error)}`);
    } finally {
      event.target.value = '';
    }
  }

  async function updateProduct(updatedProduct: Product) {
    try {
      setData((current) => ({
        ...current,
        products: current.products.some((product) => product.id === updatedProduct.id)
          ? current.products.map((product) => product.id === updatedProduct.id ? updatedProduct : product)
          : [...current.products, updatedProduct],
      }));
      await upsertProducts([updatedProduct]);
      setProductMessage(`Product ${updatedProduct.code} bijgewerkt.`);
    } catch (error) {
      setProductMessage(`Product opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function updateProductAndApplyPackagingToExistingBatches(updatedProduct: Product, batchNumber?: string) {
    const articleCode = updatedProduct.code.trim();
    const normalizedBatchNumber = batchNumber?.trim() || '';
    try {
      const existingRegistrations = data.productPackagingRegistrations.filter(
        (registration) =>
          registration.productCode?.trim() === articleCode
          && (!normalizedBatchNumber || (registration.batchNumber || '').trim() === normalizedBatchNumber),
      );

      const rebuiltRegistrations = buildPackagingRegistrationsForExistingProduct(
        updatedProduct,
        existingRegistrations,
      );

      setData((current) => ({
        ...current,
        products: current.products.some((product) => product.id === updatedProduct.id)
          ? current.products.map((product) => product.id === updatedProduct.id ? updatedProduct : product)
          : [...current.products, updatedProduct],
        productPackagingRegistrations: [
          ...current.productPackagingRegistrations.filter((registration) => {
            const sameArticle = registration.productCode?.trim() === articleCode;
            if (!sameArticle) return true;
            if (normalizedBatchNumber) {
              return (registration.batchNumber || '').trim() !== normalizedBatchNumber;
            }
            return false;
          }),
          ...rebuiltRegistrations,
        ],
      }));

      await upsertProducts([updatedProduct]);

      if (rebuiltRegistrations.length === 0) {
        const overrides = normalizedBatchNumber
          ? buildExactSalesPackagingOverridesForBatch(updatedProduct, normalizedBatchNumber)
          : [];

        if (overrides.length > 0) {
          setData((current) => ({
            ...current,
            exactSalesPackagingOverrides: [
              ...current.exactSalesPackagingOverrides.filter(
                (item) => !(item.productCode === articleCode && item.batchNumber === normalizedBatchNumber),
              ),
              ...overrides,
            ],
          }));

          await upsertExactSalesPackagingOverrides(overrides);
        }

        setProductMessage(
          overrides.length > 0
            ? `Product ${articleCode} bijgewerkt en opgeslagen als verkochte-batch override voor batch ${normalizedBatchNumber}.`
            : `Product ${articleCode} bijgewerkt, maar er zijn nog geen bestaande batchregistraties${normalizedBatchNumber ? ` voor batch ${normalizedBatchNumber}` : ''} om op toe te passen.`,
        );
        return;
      }

      if (supabase) {
        let deleteQuery = supabase
          .from('product_packaging_registrations')
          .delete()
          .eq('productCode', articleCode);

        if (normalizedBatchNumber) {
          deleteQuery = deleteQuery.eq('batchNumber', normalizedBatchNumber);
        }

        const { error: deleteError } = await deleteQuery;

        if (deleteError) throw deleteError;
      }

      await upsertProductPackagingRegistrations(rebuiltRegistrations);

      setProductMessage(
        `Product ${articleCode} bijgewerkt en toegepast op ${existingRegistrations.length} bestaande batchregel${existingRegistrations.length === 1 ? '' : 's'}${batchNumber ? ` voor batch ${batchNumber}` : ''}.`,
      );
    } catch (error) {
      setProductMessage(`Product/verpakking toepassen mislukt: ${importErrorMessage(error)}`);
    }
  }

  function openProduct(product: Product, tab: ProductModalTab = 'basic', applyBatchNumber = '') {
    setPendingBatchLabelPrint(null);
    setSelectedProductTab(tab);
    setSelectedProductApplyBatchNumber(applyBatchNumber);
    setSelectedProduct(product);
  }

  function openBatchLabelProduct(batch: ContainerCostBatch, line: ContainerCostLine, product?: Product) {
    const labelProduct = productFromCostLine(line, product);
    setPendingBatchLabelPrint({ batch, line, product });
    setSelectedProductTab('packaging');
    setSelectedProduct(labelProduct);
  }

  async function saveContainerCostBatch(batch: ContainerCostBatch, lines: ContainerCostLine[], productUpdates: Product[]) {
    try {
      const uniqueLines = dedupeContainerCostLines(lines);
      const existingLineIds = data.containerCostLines
        .filter((line) => line.batchId === batch.id)
        .map((line) => line.id);

      setData((current) => {
        const batchMap = new Map(current.containerCostBatches.map((item) => [item.id, item]));
        const lineMap = new Map(current.containerCostLines.map((item) => [item.id, item]));
        const productMap = new Map(current.products.map((item) => [item.id, item]));

        batchMap.set(batch.id, batch);
        current.containerCostLines
          .filter((line) => line.batchId === batch.id)
          .forEach((line) => lineMap.delete(line.id));
        uniqueLines.forEach((line) => lineMap.set(line.id, line));
        productUpdates.forEach((product) => productMap.set(product.id, product));

        return {
          ...current,
          containerCostBatches: Array.from(batchMap.values()),
          containerCostLines: Array.from(lineMap.values()),
          products: Array.from(productMap.values()),
        };
      });

      await upsertContainerCostBatches([batch]);
      await replaceContainerCostLines(batch.id, uniqueLines, existingLineIds);
      if (productUpdates.length > 0) {
        await upsertProducts(productUpdates);
      }
      showCsvMessage(`${uniqueLines.length} kostprijsregels opgeslagen voor order ${batch.orderNumber}.`);
    } catch (error) {
      showCsvMessage(`Container kostprijs opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function printBatchProductLabel(batch: ContainerCostBatch, line: ContainerCostLine, product: Product | undefined, quantity: number) {
    const batchCode = batch.orderNumber || batch.containerNumber || line.batchId;
    const sourceProduct = productFromCostLine(line, product);
    const labelProduct: Product = {
      ...sourceProduct,
      batch: sourceProduct.batch?.trim() || batchCode,
      batchNumber: sourceProduct.batchNumber?.trim() || batchCode,
      traceabilityCode: sourceProduct.traceabilityCode?.trim() || `${batchCode}-${sourceProduct.code || line.referenceCode}`,
    };

    const printerName = await printProductDymoLabel(labelProduct, quantity);
    const printedAt = new Date().toISOString();
    const registrations = buildPackagingRegistrationsForBatch(batch, [line], [labelProduct])
      .map((registration) => ({
        ...registration,
        labelPrintedAt: printedAt,
        labelPrintCount: String(quantity),
      }));

    setData((current) => {
      const registrationMap = new Map(current.productPackagingRegistrations.map((registration) => [registration.id, registration]));
      registrations.forEach((registration) => registrationMap.set(registration.id, registration));
      return { ...current, productPackagingRegistrations: Array.from(registrationMap.values()) };
    });
    await upsertProductPackagingRegistrations(registrations);

    return printerName;
  }

  async function togglePurchaseOrderLine(line: ContainerCostLine, purchaseOrderAdded: boolean) {
    const updatedLine = { ...line, purchaseOrderAdded };
    setData((current) => ({
      ...current,
      containerCostLines: current.containerCostLines.map((item) => item.id === line.id ? updatedLine : item),
    }));

    try {
      await upsertContainerCostLines([updatedLine]);
    } catch (error) {
      setData((current) => ({
        ...current,
        containerCostLines: current.containerCostLines.map((item) => item.id === line.id ? line : item),
      }));
      showCsvMessage(`Bestellijst status opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function saveScooterPackagingSpec(spec: ScooterPackagingSpec) {
    const normalizedSpec: ScooterPackagingSpec = {
      ...spec,
      model: spec.model.trim(),
      lengthCm: spec.lengthCm.trim(),
      widthCm: spec.widthCm.trim(),
      heightCm: spec.heightCm.trim(),
      boxWeightKg: spec.boxWeightKg?.trim() || undefined,
      notes: spec.notes?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    try {
      await upsertScooterPackagingSpecs([normalizedSpec]);
      setData((current) => {
        const specMap = new Map(current.scooterPackagingSpecs.map((item) => [item.id, item]));
        specMap.set(normalizedSpec.id, normalizedSpec);
        return { ...current, scooterPackagingSpecs: Array.from(specMap.values()) };
      });
      showCsvMessage(`Verpakking voor ${normalizedSpec.model} ${normalizedSpec.component} opgeslagen.`);
      return true;
    } catch (error) {
      showCsvMessage(`Scooter verpakking opslaan mislukt: ${importErrorMessage(error)}`);
      return false;
    }
  }

  async function upsertSupplierRecord(supplier: Supplier) {
    try {
      let productsToUpdate: Product[] = [];
      setData((current) => {
        const byId = new Map(current.suppliers.map((item) => [item.id, item]));
        const existingSupplier = byId.get(supplier.id);
        byId.set(supplier.id, supplier);
        const updatedProducts = current.products.map((product) => {
          if (!existingSupplier || !product.supplier || !supplierNameMatches(existingSupplier, product.supplier)) return product;
          if (product.supplier === supplier.name) return product;
          const updatedProduct = { ...product, supplier: supplier.name };
          productsToUpdate.push(updatedProduct);
          return updatedProduct;
        });

        return { ...current, suppliers: Array.from(byId.values()), products: updatedProducts };
      });
      await upsertSuppliers([supplier]);
      if (productsToUpdate.length > 0) {
        await upsertProducts(productsToUpdate);
      }
      setSupplierMessage(productsToUpdate.length > 0
        ? `${supplier.name} is opgeslagen. ${productsToUpdate.length} producten zijn mee gekoppeld aan deze naam.`
        : `${supplier.name} is opgeslagen.`);
    } catch (error) {
      setSupplierMessage(`Leverancier opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function upsertSupplierContactRecord(contact: SupplierContact) {
    try {
      setData((current) => {
        const byId = new Map(current.supplierContacts.map((item) => [item.id, item]));
        byId.set(contact.id, contact);
        return { ...current, supplierContacts: Array.from(byId.values()) };
      });
      await upsertSupplierContacts([contact]);
      setSupplierMessage(`${contact.name} is opgeslagen bij de leverancier.`);
    } catch (error) {
      setSupplierMessage(`Contactpersoon opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function upsertImporterRecord(importer: Importer) {
    try {
      setData((current) => {
        const byId = new Map(current.importers.map((item) => [item.id, item]));
        byId.set(importer.id, importer);
        return { ...current, importers: Array.from(byId.values()) };
      });
      await upsertImporters([importer]);
      setSupplierMessage(`${importer.name} is opgeslagen als importeur / EU-verantwoordelijke.`);
    } catch (error) {
      setSupplierMessage(`Importeur opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function importSuppliersFromProducts() {
    const productSupplierNames = Array.from(new Set(
      data.products
        .map((product) => product.supplier?.trim())
        .filter((supplier): supplier is string => Boolean(supplier)),
    ))
      .filter((supplierName) => !data.suppliers.some((supplier) => supplierNameMatches(supplier, supplierName)))
      .sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));

    if (productSupplierNames.length === 0) {
      setSupplierMessage('Geen nieuwe leveranciers gevonden in de producten.');
      return;
    }

    const importedSuppliers: Supplier[] = productSupplierNames.map((name) => ({
      id: stableId('supplier', name),
      name,
      active: true,
    }));

    try {
      setData((current) => {
        const byId = new Map(current.suppliers.map((supplier) => [supplier.id, supplier]));
        importedSuppliers.forEach((supplier) => byId.set(supplier.id, supplier));
        return { ...current, suppliers: Array.from(byId.values()) };
      });
      await upsertSuppliers(importedSuppliers);
      setSupplierMessage(`${importedSuppliers.length} leveranciers uit producten aangemaakt. Je kunt ze nu aanvullen.`);
    } catch (error) {
      setSupplierMessage(`Leveranciers overnemen mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function addDealer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const company = String(form.get('company') ?? '').trim();
    const firstName = String(form.get('firstName') ?? '').trim();
    const lastName = String(form.get('lastName') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const street = String(form.get('street') ?? '').trim();
    const houseNumber = String(form.get('houseNumber') ?? '').trim();
    const postalCode = String(form.get('postalCode') ?? '').trim();
    const city = String(form.get('city') ?? '').trim();
    const extraInfo = String(form.get('extraInfo') ?? '').trim();
    const name = [firstName, lastName].filter(Boolean).join(' ') || company;
    const address = [[street, houseNumber].filter(Boolean).join(' '), extraInfo].filter(Boolean).join(', ');
    const dealer: Dealer = {
      id: stableId('dealer', company || email || phone || name),
      name,
      company,
      email,
      phone,
      city,
      address,
      Postalcode: postalCode,
      active: true,
    };

    try {
      setData((current) => {
        const byId = new Map(current.dealers.map((item) => [item.id, item]));
        byId.set(dealer.id, dealer);
        return { ...current, dealers: Array.from(byId.values()) };
      });
      await upsertDealers([dealer]);
      setDealerImportMessage(`${dealer.company || dealer.name} is toegevoegd aan Supabase.`);
      formElement.reset();
    } catch (error) {
      setDealerImportMessage(`Dealer toevoegen mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function updateScooter(updated: Scooter) {
    const normalized = normalizeRegistrationStatus(updated);
    setData((current) => ({
      ...current,
      scooters: current.scooters.map((scooter) => (scooter.id === normalized.id ? normalized : scooter)),
    }));
    setSelectedScooter(normalized);
    try {
      await upsertScooters([normalized]);
      showCsvMessage(
        isRegistrationComplete(normalized) && hasInvoiceNumber(normalized)
          ? `${normalized.frameNumber} is tenaamgesteld en automatisch naar Verkocht klant gezet.`
          : isRegistrationComplete(normalized) && !hasInvoiceNumber(normalized)
            ? `${normalized.frameNumber} is tenaamgesteld, maar blijft op de huidige status omdat het factuurnummer ontbreekt.`
            : `${normalized.frameNumber} is bijgewerkt.`,
      );
    } catch (error) {
      showCsvMessage(`Scooter opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function markContainerAvailable(container: Container, arrivedAtInput: string) {
    if (!arrivedAtInput.trim()) {
      throw new Error('Vul eerst de juiste aankomstdatum en tijd in.');
    }

    const arrivedAtDate = new Date(arrivedAtInput);
    if (Number.isNaN(arrivedAtDate.getTime())) {
      throw new Error('De opgegeven aankomstdatum is ongeldig.');
    }

    const arrivedAt = arrivedAtDate.toISOString();
    const updatedContainer: Container = {
      ...container,
      status: 'Aangekomen',
      arrivedAt,
      eta: container.eta || arrivedAt.slice(0, 10),
    };

    const updatedScooters = data.scooters
      .filter((scooter) => scooter.containerId === container.id && scooter.status === 'Nog onderweg')
      .map((scooter) => ({
        ...scooter,
        status: 'Beschikbaar' as const,
        arrivedAt,
      }));

    try {
      await upsertContainers([updatedContainer]);
      if (updatedScooters.length > 0) {
        await upsertScooters(updatedScooters);
      }

      setData((current) => {
        const scootersById = new Map(updatedScooters.map((scooter) => [scooter.id, scooter]));
        return {
          ...current,
          containers: current.containers.map((item) => (item.id === updatedContainer.id ? updatedContainer : item)),
          scooters: current.scooters.map((scooter) => scootersById.get(scooter.id) ?? scooter),
        };
      });

      showCsvMessage(
        updatedScooters.length > 0
          ? `${updatedContainer.number} is binnen gemeld. ${updatedScooters.length} scooters zijn op Beschikbaar gezet.`
          : `${updatedContainer.number} is binnen gemeld.`,
      );
    } catch (error) {
      showCsvMessage(`Container binnenmelden mislukt: ${importErrorMessage(error)}`);
      throw error;
    }
  }

  async function updateDealer(updated: Dealer) {
    setData((current) => ({
      ...current,
      dealers: current.dealers.map((dealer) => (dealer.id === updated.id ? updated : dealer)),
    }));
    try {
      await upsertDealers([updated]);
      setDealerImportMessage(`${updated.company || updated.name} is bijgewerkt.`);
    } catch (error) {
      setDealerImportMessage(`Dealer opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function checkScootersWithRdw(scootersToCheck: Scooter[]) {
    const withLicensePlate = scootersToCheck.filter((scooter) => scooter.licensePlate?.trim());
    const skipped = scootersToCheck.length - withLicensePlate.length;
    const updatedScooters: Scooter[] = [];
    const failed: string[] = [];

    for (const scooter of withLicensePlate) {
      try {
        const rdwData = await fetchRdwRegistration(scooter.licensePlate ?? '');
        updatedScooters.push(normalizeRegistrationStatus({
          ...scooter,
          speed: rdwData.speed || scooter.speed,
          firstAdmissionDate: rdwData.firstAdmissionDate || scooter.firstAdmissionDate,
          firstRegistrationDate: rdwData.firstRegistrationDate || scooter.firstRegistrationDate,
          lastRegistrationDate: rdwData.lastRegistrationDate || scooter.lastRegistrationDate,
          emissionClass: rdwData.emissionClass || scooter.emissionClass,
          rdwType: rdwData.rdwType || scooter.rdwType,
          rdwTypeApprovalNumber: rdwData.rdwTypeApprovalNumber || scooter.rdwTypeApprovalNumber,
          rdwVariant: rdwData.rdwVariant || scooter.rdwVariant,
          rdwExecution: rdwData.rdwExecution || scooter.rdwExecution,
        }));
      } catch {
        failed.push(scooter.licensePlate ?? scooter.frameNumber);
      }
    }

    if (updatedScooters.length > 0) {
      const byId = new Map(updatedScooters.map((scooter) => [scooter.id, scooter]));
      setData((current) => ({
        ...current,
        scooters: current.scooters.map((scooter) => byId.get(scooter.id) ?? scooter),
      }));
      setSelectedScooter((current) => (current ? byId.get(current.id) ?? current : current));
      await upsertScooters(updatedScooters);
    }

    const parts = [`${updatedScooters.length} voertuigen bijgewerkt via RDW`];
    if (skipped) parts.push(`${skipped} zonder kenteken overgeslagen`);
    if (failed.length) parts.push(`${failed.length} mislukt`);
    const message = `${parts.join(', ')}.`;
    showCsvMessage(message);
    return message;
  }

  async function addContainerImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const importMode = String(form.get('importMode') ?? 'create');
    const invoiceNumber = String(form.get('invoiceNumber') ?? '').trim();
    const number = String(form.get('containerNumber') ?? '').trim();
    const sealNumber = String(form.get('sealNumber') ?? '').trim();
    const eta = String(form.get('eta') ?? '').trim();
    const arrivedAtInput = String(form.get('arrivedAt') ?? '').trim();
    const arrivedAt = arrivedAtInput ? new Date(arrivedAtInput).toISOString() : '';
    const content = String(form.get('content') ?? '').trim();
    if (!invoiceNumber || !number || !sealNumber || !content) {
      showCsvMessage('Container import mislukt: vul invoice, container, seal en container content in.');
      return;
    }
    const container: Container = {
      id: stableId('container', number),
      number,
      invoiceNumber,
      sealNumber,
      status: arrivedAt ? 'Aangekomen' : eta ? 'Onderweg' : 'In land van herkomst',
      eta,
      ...(arrivedAt ? { arrivedAt } : {}),
    };
    const scooters = parseContainerScooterRows(content, container.id);
    if (scooters.length === 0) {
      showCsvMessage('Container import mislukt: geen scooterregels gevonden in de geplakte content.');
      return;
    }

    try {
      await upsertContainers([container]);
      if (importMode === 'update-existing') {
        const existingByFrame = new Map(data.scooters.map((scooter) => [normalizeLookup(scooter.frameNumber), scooter]));
        const missingFrames: string[] = [];
        const updates: Scooter[] = scooters.flatMap((imported) => {
          const existing = existingByFrame.get(normalizeLookup(imported.frameNumber));
          if (!existing) {
            missingFrames.push(imported.frameNumber);
            return [];
          }
          const update: Scooter = {
            ...existing,
            engineNumber: existing.engineNumber?.trim() ? existing.engineNumber : imported.engineNumber,
            containerId: existing.containerId || container.id,
            arrivedAt: existing.arrivedAt || container.arrivedAt,
            model: existing.model || imported.model,
            color: existing.color || imported.color,
            speed: existing.speed || imported.speed,
          };
          return [update];
        });
        const missing = missingFrames.length;
        if (updates.length > 0) await upsertScooters(updates);
        setData((current) => {
          const containers = new Map(current.containers.map((item) => [item.id, item]));
          containers.set(container.id, container);
          const updatesById = new Map(updates.map((scooter) => [scooter.id, scooter]));
          return { ...current, containers: [...containers.values()], scooters: current.scooters.map((scooter) => updatesById.get(scooter.id) ?? scooter) };
        });
        showCsvMessage(
          `${updates.length} bestaande scooters bijgewerkt voor container ${container.number}.${missing ? ` ${missing} framenummers niet gevonden.` : ''}`,
          missingFrames,
        );
      } else {
        await upsertScooters(scooters);
        setData((current) => {
          const containers = new Map(current.containers.map((item) => [item.id, item]));
          containers.set(container.id, container);
          const scooterMap = new Map(current.scooters.map((item) => [item.id, item]));
          scooters.forEach((scooter) => scooterMap.set(scooter.id, scooter));
          return { ...current, containers: [...containers.values()], scooters: [...scooterMap.values()] };
        });
        showCsvMessage(`${scooters.length} scooters geimporteerd in container ${container.number}.`);
      }
      formElement.reset();
    } catch (error) {
      showCsvMessage(`Container import mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function addWarranty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submittedFrame = String(form.get('scooterFrame') ?? '');
    const submittedPlate = String(form.get('licensePlate') ?? '').trim();
    const scooter = data.scooters.find((item) => normalizeLookup(item.licensePlate ?? '') === normalizeLookup(submittedPlate)) ??
      data.scooters.find((item) => item.frameNumber === submittedFrame);
    const registrationDate = scooter?.firstRegistrationDate || scooter?.firstAdmissionDate;
    const warrantyUntil = String(form.get('warrantyUntil') ?? '') || addMonthsToInputDate(registrationDate);
    const submittedItems = (() => {
      try {
        return JSON.parse(String(form.get('claimItemsJson') ?? '[]')) as Array<{ productCode?: string; partName?: string; partNumber?: string; partPrice?: string }>;
      } catch {
        return [];
      }
    })();
    const claimItems = submittedItems
      .map((item) => ({
        ...(String(item.productCode ?? '').trim() ? { productCode: String(item.productCode ?? '').trim() } : {}),
        partName: String(item.partName ?? '').trim(),
        ...(String(item.partNumber ?? '').trim() ? { partNumber: String(item.partNumber ?? '').trim() } : {}),
        ...(parseCurrencyInput(String(item.partPrice ?? '')) ? { partPrice: parseCurrencyInput(String(item.partPrice ?? '')) } : {}),
      }))
      .filter((item) => item.partName);
    const primaryItem = claimItems[0];
    if (!primaryItem) {
      setWarrantyMessage('Voeg minimaal 1 onderdeel toe aan de garantieclaim.');
      return false;
    }
    const record: WarrantyPart = {
      id: `w-${Date.now()}`,
      claimNumber: nextWarrantyClaimNumber(data.warranties),
      scooterFrame: scooter?.frameNumber || submittedFrame,
      licensePlate: submittedPlate || scooter?.licensePlate || '',
      partName: primaryItem.partName,
      partNumber: primaryItem.partNumber ?? '',
      ...(primaryItem.partPrice ? { partPrice: primaryItem.partPrice } : {}),
      claimItems,
      mileage: String(form.get('mileage')),
      age: String(form.get('age')) || formatVehicleAge(registrationDate),
      claimDate: String(form.get('claimDate')),
      warrantyUntil,
      status: String(form.get('status') ?? 'Open') as WarrantyPart['status'],
      dealerId: String(form.get('dealerId')) || scooter?.dealerId,
      notes: String(form.get('notes')),
    };
    try {
      await upsertWarrantyParts([record]);
      setData((current) => ({ ...current, warranties: [record, ...current.warranties] }));
      setWarrantyMessage(`Garantieclaim opgeslagen voor ${record.licensePlate || record.scooterFrame}.`);
      formElement.reset();
      return true;
    } catch (error) {
      setWarrantyMessage(`Garantie opslaan mislukt: ${importErrorMessage(error)}`);
      return false;
    }
  }

  async function updateWarranty(warranty: WarrantyPart) {
    try {
      await upsertWarrantyParts([warranty]);
      setData((current) => ({
        ...current,
        warranties: current.warranties.map((item) => (item.id === warranty.id ? warranty : item)),
      }));
      setWarrantyMessage(`Garantieclaim ${warranty.claimNumber || warranty.id} is bijgewerkt.`);
    } catch (error) {
      setWarrantyMessage(`Garantieclaim bijwerken mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function addMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const scooterFrame = String(form.get('scooterFrame'));
    const scooter = data.scooters.find((item) => item.frameNumber === scooterFrame);
    const licensePlate = String(form.get('licensePlate') ?? '').trim();
    const mileage = String(form.get('mileage') ?? '').trim();
    const nextServiceDate = String(form.get('nextServiceDate') ?? '').trim();
    const notes = String(form.get('notes') ?? '').trim();
    const servicePackage = String(form.get('servicePackage') ?? '').trim();
    const checklist = form.getAll('checklist').map((item) => String(item));
    const record: MaintenanceRecord = {
      id: `maintenance-${Date.now()}`,
      scooterFrame,
      licensePlate: licensePlate || scooter?.licensePlate || '',
      servicePackage,
      serviceDate: String(form.get('serviceDate')),
      serviceType: servicePackage,
      ...(mileage ? { mileage } : {}),
      ...(nextServiceDate ? { nextServiceDate } : {}),
      status: String(form.get('status')) as MaintenanceRecord['status'],
      checklist,
      notes,
    };
    try {
      await upsertMaintenanceRecords([record]);
      setData((current) => ({ ...current, maintenance: [record, ...current.maintenance] }));
      setMaintenanceMessage(`Onderhoud opgeslagen voor ${record.licensePlate || record.scooterFrame}.`);
      formElement.reset();
    } catch (error) {
      setMaintenanceMessage(`Onderhoud opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function addDocument(scooterFrame: string, type: DocumentRecord['type'], note: string, file: File) {
    if (!file) throw new Error('Selecteer eerst een bestand.');
    const storagePath = await uploadScooterDocument(file, scooterFrame);
    const document: DocumentRecord = {
      id: `document-${Date.now()}`,
      scooterFrame,
      type,
      fileName: file.name,
      note,
      storagePath,
      mimeType: file.type || undefined,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
    };
    await upsertDocuments([document]);
    setData((current) => ({ ...current, documents: [document, ...current.documents] }));
    return document;
  }

  async function resolveDocumentRecord(document: DocumentRecord) {
    const storagePath = await resolveScooterDocumentPath(document);
    if (storagePath === document.storagePath) return document;

    const updatedDocument = { ...document, storagePath };
    await upsertDocuments([updatedDocument]);
    setData((current) => ({
      ...current,
      documents: current.documents.map((item) => item.id === document.id ? updatedDocument : item),
    }));
    return updatedDocument;
  }

  async function openDocument(document: DocumentRecord) {
    const resolvedDocument = await resolveDocumentRecord(document);
    const signedUrl = await createScooterDocumentUrl(resolvedDocument.storagePath!);
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function downloadDocument(document: DocumentRecord) {
    const resolvedDocument = await resolveDocumentRecord(document);
    const signedUrl = await createScooterDocumentUrl(resolvedDocument.storagePath!);
    const anchor = window.document.createElement('a');
    anchor.href = signedUrl;
    anchor.download = resolvedDocument.fileName;
    anchor.rel = 'noopener noreferrer';
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function addBatteryModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    const spec = String(form.get('spec') ?? '').trim();
    if (!name || !spec) {
      setBatteryMessage('Vul minimaal naam en spec in.');
      return;
    }
    const model: BatteryModel = {
      id: stableId('battery-model', `${name}-${spec}`),
      name,
      spec,
      nominalVoltage: String(form.get('nominalVoltage') ?? '').trim(),
      nominalCapacity: String(form.get('nominalCapacity') ?? '').trim(),
      ratedEnergy: String(form.get('ratedEnergy') ?? '').trim(),
      maxChargeVoltage: String(form.get('maxChargeVoltage') ?? '').trim(),
      minDischargeVoltage: String(form.get('minDischargeVoltage') ?? '').trim(),
    };

    try {
      await upsertBatteryModels([model]);
      setData((current) => {
        const models = new Map(current.batteryModels.map((item) => [item.id, item]));
        models.set(model.id, model);
        return { ...current, batteryModels: [...models.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' })) };
      });
      formElement.reset();
      setBatteryMessage(`${model.name} is toegevoegd aan de accu modellen.`);
    } catch (error) {
      setBatteryMessage(`Accu model opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function addBatteries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const lotNumbers = [...new Set(String(form.get('lotNumbers') ?? '')
      .split(/[\n,;]+/)
      .map((value) => value.trim())
      .filter(Boolean))];
    const modelName = String(form.get('model') ?? '').trim();
    const batteryModel = data.batteryModels.find((model) => model.name === modelName);
    const chargeDate = String(form.get('chargeDate') ?? '').trim();
    const status = String(form.get('status') ?? 'Beschikbaar') as Battery['status'];
    if (lotNumbers.length === 0 || !modelName) {
      setBatteryMessage('Vul minimaal een lotnummer en model in.');
      return;
    }

    const batteries: Battery[] = lotNumbers.map((lotNumber) => ({
      id: stableId('battery', lotNumber),
      lotNumber,
      model: modelName,
      spec: batteryModel?.spec ?? '',
      status,
      ...(chargeDate ? { chargeDate } : {}),
    }));

    try {
      await upsertBatteries(batteries);
      setData((current) => {
        const batteryMap = new Map(current.batteries.map((battery) => [battery.id, battery]));
        batteries.forEach((battery) => batteryMap.set(battery.id, battery));
        return { ...current, batteries: [...batteryMap.values()].sort((a, b) => a.lotNumber.localeCompare(b.lotNumber, 'nl', { sensitivity: 'base' })) };
      });
      formElement.reset();
      setBatteryMessage(`${batteries.length} accu${batteries.length === 1 ? '' : "'s"} toegevoegd.`);
    } catch (error) {
      setBatteryMessage(`Accu toevoegen mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function updateBattery(battery: Battery) {
    try {
      await upsertBatteries([battery]);
      setData((current) => ({ ...current, batteries: current.batteries.map((item) => item.id === battery.id ? battery : item) }));
      setBatteryMessage(`Accu ${battery.lotNumber} is bijgewerkt.`);
    } catch (error) {
      setBatteryMessage(`Accu opslaan mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function handleLogin(email: string, password: string, mode: 'login' | 'signup', remember: boolean) {
    if (supabase) {
      const authSession = mode === 'signup'
        ? await signUpWithPassword(email, password)
        : await signInWithPassword(email, password);
      if (!authSession?.user.email) {
        throw new Error('Account aangemaakt. Controleer eventueel je e-mail om het account te bevestigen.');
      }
      setLoginSession({
        email: authSession.user.email,
        name: loginNameFromEmail(authSession.user.email),
        loggedInAt: Date.now(),
        expiresAt: authSession.expires_at ? authSession.expires_at * 1000 : undefined,
      });
    } else {
      const session = createLoginSession(email, remember);
      storeLoginSession(session, remember);
      setLoginSession(session);
    }
  }

  async function handleLogout() {
    clearLoginSession();
    await signOut();
    setLoginSession(null);
  }

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">RSO</div>
          <h1>Scooter Management</h1>
          <p>Sessie controleren...</p>
        </div>
      </div>
    );
  }

  if (!loginSession) {
    return <LoginScreen onLogin={handleLogin} supabaseEnabled={Boolean(supabase)} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <span>RSOAdmin</span>
        </div>
        <nav>
          {views.map((item) => {
            const Icon = item.icon;
            return (
              <button className={view === item.id ? 'active' : ''} key={item.id} onClick={() => setView(item.id)}>
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button" aria-label="Menu">
            <Menu size={18} />
          </button>
          <div className="topbar-actions">
            <span className={supabase ? 'live-pill online' : 'live-pill'}><DatabaseZap size={14} /> {supabase ? 'Supabase live' : 'Local demo'}</span>
            <span>{loginSession.name}</span>
            <button className="icon-button" aria-label="Log out" onClick={handleLogout}>
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <section className="content">
          {view === 'dashboard' && <Dashboard data={data} onNavigate={setView} />}
          {view === 'containers' && <Containers data={data} message={csvMessage} messageDetails={csvMessageDetails} onImport={addContainerImport} onSelect={setSelectedScooter} onMarkContainerAvailable={markContainerAvailable} />}
          {view === 'costBatches' && <CostBatchesPage data={data} onSaveCostBatch={saveContainerCostBatch} onSelectProduct={openProduct} onOpenBatchLabelProduct={openBatchLabelProduct} onTogglePurchaseOrderLine={togglePurchaseOrderLine} onSaveScooterPackagingSpec={saveScooterPackagingSpec} />}
          {view === 'packaging' && (
            <PackagingOverviewPage
              registrations={data.productPackagingRegistrations}
              exactSalesPackagingOverrides={data.exactSalesPackagingOverrides}
              batches={data.containerCostBatches}
              products={data.products}
              supplierRecords={data.suppliers}
              onSelectProduct={openProduct}
            />
          )}
          {view === 'scooters' && <Scooters data={data} query={query} setQuery={setQuery} scooters={filteredScooters} onSelect={setSelectedScooter} onImport={handleInventoryImport} message={csvMessage} messageDetails={csvMessageDetails} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onBulkRdwCheck={checkScootersWithRdw} onMarkContainerAvailable={markContainerAvailable} />}
          {view === 'sales' && <SalesPage scooters={data.scooters} dealers={data.dealers} onSelect={setSelectedScooter} />}
          {view === 'batteries' && <Batteries data={data} addBatteries={addBatteries} addBatteryModel={addBatteryModel} updateBattery={updateBattery} onSelectScooter={setSelectedScooter} message={batteryMessage} />}
          {view === 'products' && (
            <ProductsPage
              products={data.products}
              supplierRecords={data.suppliers}
              onImport={handleProductImport}
              onSelectProduct={openProduct}
              message={productMessage}
            />
          )}
          {view === 'suppliers' && <SuppliersPage suppliers={data.suppliers} importers={data.importers} supplierContacts={data.supplierContacts} products={data.products} onSaveSupplier={upsertSupplierRecord} onSaveImporter={upsertImporterRecord} onSaveSupplierContact={upsertSupplierContactRecord} onImportFromProducts={importSuppliersFromProducts} message={supplierMessage} />}
          {view === 'dealers' && <Dealers dealers={data.dealers} scooters={data.scooters} onImport={handleDealerImport} onAddDealer={addDealer} onUpdateDealer={updateDealer} message={dealerImportMessage} />}
          {view === 'warranty' && <Warranty data={data} products={data.products} addWarranty={addWarranty} updateWarranty={updateWarranty} message={warrantyMessage} />}
          {view === 'maintenance' && <Maintenance data={data} addMaintenance={addMaintenance} message={maintenanceMessage} />}
          {view === 'search' && <GlobalSearch data={data} query={query} setQuery={setQuery} scooters={filteredScooters} onSelect={setSelectedScooter} />}
        </section>
      </main>

      {selectedScooter && (
        <ScooterDrawer
          scooter={selectedScooter}
          dealers={data.dealers}
          warranties={data.warranties.filter((warranty) => warranty.scooterFrame === selectedScooter.frameNumber)}
          maintenance={data.maintenance.filter((record) => record.scooterFrame === selectedScooter.frameNumber)}
          documents={data.documents.filter((document) => document.scooterFrame === selectedScooter.frameNumber)}
          onClose={() => setSelectedScooter(null)}
          onUpdate={updateScooter}
          onAddDocument={addDocument}
          onOpenDocument={openDocument}
          onDownloadDocument={downloadDocument}
        />
      )}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          suppliers={productModalSuppliers}
          supplierRecords={data.suppliers}
          importers={data.importers}
          batches={data.containerCostBatches}
          costLines={data.containerCostLines}
          registrations={data.productPackagingRegistrations}
          initialTab={selectedProductTab}
          message={productMessage}
          onClose={() => {
            setSelectedProduct(null);
            setPendingBatchLabelPrint(null);
            setSelectedProductTab('basic');
            setSelectedProductApplyBatchNumber('');
          }}
          onSave={async (nextProduct) => {
            await updateProduct(nextProduct);
            setSelectedProduct(nextProduct);
          }}
          onSaveAndApplyPackaging={async (nextProduct, batchNumber) => {
            await updateProductAndApplyPackagingToExistingBatches(nextProduct, batchNumber);
            setSelectedProduct(nextProduct);
          }}
          applyBatchNumber={selectedProductApplyBatchNumber}
          onPrintLabel={pendingBatchLabelPrint ? async (product, quantity) => {
            return printBatchProductLabel(
              pendingBatchLabelPrint.batch,
              pendingBatchLabelPrint.line,
              product,
              quantity,
            );
          } : undefined}
        />
      )}
    </div>
  );
}

function LoginScreen({ onLogin, supabaseEnabled }: { onLogin: (email: string, password: string, mode: 'login' | 'signup', remember: boolean) => Promise<void>; supabaseEnabled: boolean }) {
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '').trim();
    const remember = form.get('remember') === 'on';

    if (!email || !password) {
      setError('Vul je e-mailadres en wachtwoord in.');
      return;
    }

    if (supabaseEnabled && password.length < 6) {
      setError('Gebruik minimaal 6 tekens voor het wachtwoord.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onLogin(email, password, mode, remember);
    } catch (loginError) {
      setError(importErrorMessage(loginError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">RSO</div>
        <h1>{mode === 'login' ? 'Inloggen' : 'Account aanmaken'}</h1>
        <div className="login-mode-toggle">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Login</button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Nieuw account</button>
        </div>
        <label>Email</label>
        <input name="email" type="email" defaultValue="" autoComplete="email" />
        <label>Password</label>
        <input name="password" type="password" defaultValue={supabaseEnabled ? '' : 'demo'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        <label className="remember-login"><input name="remember" type="checkbox" defaultChecked /> Ingelogd blijven op dit apparaat</label>
        {error && <p className="login-error">{error}</p>}
        <button className="primary-button" type="submit" disabled={loading}>
          <Lock size={16} /> {loading ? 'Even wachten...' : mode === 'login' ? 'Login' : 'Account aanmaken'}
        </button>
        <p>{supabaseEnabled ? 'Gebruikersaccounts lopen via Supabase Auth. Na refresh blijft je sessie automatisch actief.' : 'Demo login actief. Configureer Supabase om echte gebruikersaccounts te gebruiken.'}</p>
      </form>
    </div>
  );
}

function ExpandableNotice({ message, details }: { message: string; details?: string[] }) {
  if (!message) return null;
  return (
    <div className="notice">
      <span>{message}</span>
      {details && details.length > 0 && (
        <details className="notice-details">
          <summary>Toon framenummers ({details.length})</summary>
          <div className="notice-detail-list">
            {details.map((detail) => <code key={detail}>{detail}</code>)}
          </div>
        </details>
      )}
    </div>
  );
}

function Dashboard({ data, onNavigate }: {
  data: AppData;
  onNavigate: (view: View) => void;
}) {
  const dashboardLinks = views.filter(({ id }) => id !== 'dashboard');
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Dashboard</h1>
          <span>Totaal voorraad: {data.scooters.length}</span>
        </div>
      </div>
      <section className="panel dashboard-links-panel">
        <div className="panel-title">
          <span className="panel-title-label"><DatabaseZap size={16} /> Snelkoppelingen</span>
        </div>
        <div className="dashboard-links-grid">
          {dashboardLinks.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className="dashboard-link-tile" onClick={() => onNavigate(id)}>
              <span className="dashboard-link-icon"><Icon size={20} /></span>
              <span className="dashboard-link-copy">
                <strong>{label}</strong>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function ExactConnectionPanel({
  registrations = [],
  exactSalesPackagingOverrides = [],
  batches = [],
  products = [],
  supplierRecords = [],
  onSelectProduct,
}: {
  registrations?: ProductPackagingRegistration[];
  exactSalesPackagingOverrides?: ExactSalesPackagingOverride[];
  batches?: ContainerCostBatch[];
  products?: Product[];
  supplierRecords?: Supplier[];
  onSelectProduct: (product: Product, tab?: ProductModalTab, applyBatchNumber?: string) => void;
}) {
  const [status, setStatus] = useState<ExactConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [salesDateFrom, setSalesDateFrom] = useState(() => toInputDateValue(new Date(new Date().getFullYear(), 0, 1)));
  const [salesDateTo, setSalesDateTo] = useState(() => toInputDateValue(new Date(new Date().getFullYear(), 11, 31)));
  const [salesOrderFilter, setSalesOrderFilter] = useState('');
  const [salesPreview, setSalesPreview] = useState<ExactSalesPreviewLine[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState('');
  const [salesDebugProbes, setSalesDebugProbes] = useState<ExactEndpointProbeResult[]>([]);
  const [salesDebugDivision, setSalesDebugDivision] = useState('');
  const [salesDebugRaw, setSalesDebugRaw] = useState<Array<Record<string, unknown>>>([]);
  const [salesSourceLabel, setSalesSourceLabel] = useState('Exact API');
  const [salesImportedFromFile, setSalesImportedFromFile] = useState(false);
  const [probeLoadingId, setProbeLoadingId] = useState('');
  const [batchProbeResults, setBatchProbeResults] = useState<ExactBatchProbeResult[]>([]);
  const [batchProbeLine, setBatchProbeLine] = useState<ExactSalesPreviewLine | null>(null);
  const [batchProbeError, setBatchProbeError] = useState('');
  const [knownBatchNumber, setKnownBatchNumber] = useState('');
  const [showBatchProbeDetails, setShowBatchProbeDetails] = useState(false);
  const [showSalesLines, setShowSalesLines] = useState(false);
  const [salesSummaryArticleFilter, setSalesSummaryArticleFilter] = useState('');
  const [salesSummaryStatusFilter, setSalesSummaryStatusFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const eigenImportBatchIds = useMemo(
    () => new Set(
      batches
        .filter((batch) => parseBatchPackagingCompliance(batch).scope === 'Eigen import')
        .map((batch) => batch.id),
    ),
    [batches],
  );
  const eigenImportProductCodes = useMemo(
    () => new Set(
      registrations
        .filter((registration) => eigenImportBatchIds.has(registration.batchId))
        .map((registration) => registration.productCode?.trim())
        .filter(Boolean) as string[],
    ),
    [eigenImportBatchIds, registrations],
  );
  const importCompanyProductCodes = useMemo(
    () => new Set(
      products
        .filter((product) =>
          supplierRecords.some((supplier) => supplier.isImportCompany && supplierNameMatches(supplier, product.supplier)),
        )
        .map((product) => product.code?.trim())
        .filter(Boolean) as string[],
    ),
    [products, supplierRecords],
  );
  const productsByCode = useMemo(
    () => new Map(products.map((product) => [product.code?.trim(), product] as const).filter(([code]) => Boolean(code))),
    [products],
  );
  const productsByNormalizedCode = useMemo(
    () => new Map(
      products
        .map((product) => [normalizeLookup(product.code?.trim() || ''), product] as const)
        .filter(([code]) => Boolean(code)),
    ),
    [products],
  );

  async function loadStatus() {
    setLoading(true);
    setError('');
    try {
      const nextStatus = await fetchExactConnectionStatus();
      setStatus(nextStatus);
    } catch (loadError) {
      setError(importErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const exactState = url.searchParams.get('exact');
    const exactError = url.searchParams.get('exact_error');
    if (exactState === 'connected') {
      setNotice('Exact is gekoppeld. Ververs de status om de administratiegegevens op te halen.');
    } else if (exactError) {
      setError(exactError);
    }
    if (exactState || exactError) {
      url.searchParams.delete('exact');
      url.searchParams.delete('exact_error');
      window.history.replaceState({}, document.title, url.toString());
    }
    void loadStatus();
  }, []);

  function startExactConnect() {
    const authUrl = buildExactAuthStartUrl();
    if (!authUrl) {
      setError('Supabase is niet geconfigureerd voor Exact koppelen.');
      return;
    }
    const url = new URL(authUrl);
    url.searchParams.set('returnTo', window.location.href.split('?')[0] || window.location.href);
    window.location.href = url.toString();
  }

  async function loadSalesPreview() {
    setSalesLoading(true);
    setSalesError('');
    setSalesDebugProbes([]);
    setSalesDebugDivision('');
    setSalesDebugRaw([]);
    try {
      if (!salesDateFrom || !salesDateTo) {
        throw new Error('Vul een geldige van- en tot-datum in voor de Exact test-sync.');
      }
      if (Date.parse(`${salesDateFrom}T00:00:00`) > Date.parse(`${salesDateTo}T23:59:59`)) {
        throw new Error('De van-datum moet voor of gelijk aan de tot-datum liggen.');
      }
      const preview = await fetchExactSalesPreview({ dateFrom: salesDateFrom, dateTo: salesDateTo });
      const lines = preview.lines ?? [];
      setSalesPreview(lines);
      setSalesDebugProbes(preview.probes ?? []);
      setSalesDebugDivision(preview.divisionCode || '');
      setSalesDebugRaw(preview.raw ?? []);
      setSalesSourceLabel('Exact API');
      setSalesImportedFromFile(false);
      if (preview.debug) {
        setSalesError('');
      } else if (lines.length === 0) {
        setSalesError('Geen leverregels gevonden voor deze periode of deze batchbron.');
      }
    } catch (loadPreviewError) {
      setSalesPreview([]);
      setSalesDebugProbes([]);
      setSalesDebugDivision('');
      setSalesDebugRaw([]);
      setSalesError(await importEdgeFunctionErrorMessage(loadPreviewError));
    } finally {
      setSalesLoading(false);
    }
  }

  async function importSalesPreviewFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setSalesLoading(true);
    setSalesError('');
    setSalesDebugProbes([]);
    setSalesDebugDivision('Bestandsimport');
    setSalesDebugRaw([]);
    try {
      const lines = await parseExactBatchTransactionsImport(file);
      setSalesPreview(lines);
      setSalesSourceLabel(`Bestandsimport: ${file.name}`);
      setSalesImportedFromFile(true);
      if (lines.length === 0) {
        setSalesError('Geen goederenlevering-mutaties gevonden in deze export.');
      }
    } catch (importError) {
      setSalesPreview([]);
      setSalesSourceLabel('Bestandsimport');
      setSalesError(importErrorMessage(importError));
    } finally {
      setSalesLoading(false);
    }
  }

  const visibleSalesPreview = useMemo(() => {
    const startDate = salesDateFrom ? Date.parse(`${salesDateFrom}T00:00:00`) : Number.NEGATIVE_INFINITY;
    const endDate = salesDateTo ? Date.parse(`${salesDateTo}T23:59:59`) : Number.POSITIVE_INFINITY;
    const needle = salesOrderFilter.trim();
    const filtered = salesPreview.filter((line) => {
      const lineDate = line.deliveryDate ? Date.parse(line.deliveryDate) : Number.NaN;
      const inRange = Number.isNaN(lineDate) ? true : lineDate >= startDate && lineDate <= endDate;
      if (!inRange) return false;
      const articleCode = line.itemCode?.trim() || '';
      const inEigenImport = salesImportedFromFile
        ? importCompanyProductCodes.has(articleCode)
        : eigenImportProductCodes.size === 0 || eigenImportProductCodes.has(articleCode);
      if (!inEigenImport) return false;
      if (!needle) return true;
      return (line.salesOrderNumber || '').includes(needle)
        || articleCode.toLowerCase().includes(needle.toLowerCase())
        || (line.itemDescription || line.description || '').toLowerCase().includes(needle.toLowerCase());
    });

    return [...filtered].sort((a, b) => {
      const dateCompare = (a.deliveryDate || '').localeCompare(b.deliveryDate || '');
      if (dateCompare !== 0) return dateCompare;

      const orderA = Number(a.salesOrderNumber || 0);
      const orderB = Number(b.salesOrderNumber || 0);
      if (orderA !== orderB) return orderA - orderB;

      const lineA = Number(a.lineNumber || 0);
      const lineB = Number(b.lineNumber || 0);
      if (lineA !== lineB) return lineA - lineB;

      return (a.itemCode || '').localeCompare(b.itemCode || '', 'nl', { sensitivity: 'base' });
    });
  }, [eigenImportProductCodes, importCompanyProductCodes, salesDateFrom, salesDateTo, salesImportedFromFile, salesOrderFilter, salesPreview]);

  const batchProbeSummary = useMemo(
    () => buildBatchProbeSummary(batchProbeResults, batchProbeLine, knownBatchNumber.trim()),
    [batchProbeResults, batchProbeLine, knownBatchNumber],
  );
  const salesSoldTotals = useMemo(() => {
    const batchTotals = new Map<string, number>();
    const articleTotals = new Map<string, number>();

    visibleSalesPreview.forEach((line) => {
      const article = line.itemCode?.trim();
      if (!article) return;

      const batches = (line.batchNumber || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (batches.length === 0) return;

      const soldRaw = parseDecimal(line.quantityDelivered || line.quantityOrdered || '0');
      if (soldRaw <= 0) return;

      const soldPerBatch = soldRaw / batches.length;
      const countryCode = normalizeExactCountryCode(line.deliveryCountryCode) || 'missing';

      batches.forEach((batch) => {
        const batchKey = `${article}|${batch}|${countryCode}`;
        batchTotals.set(batchKey, (batchTotals.get(batchKey) ?? 0) + soldPerBatch);
      });

      articleTotals.set(article, (articleTotals.get(article) ?? 0) + soldRaw);
    });

    return { batchTotals, articleTotals };
  }, [visibleSalesPreview]);
  const salesPackagingRows = useMemo(() => {
    type SalesPackagingOption = {
      packaging: string;
      material: string;
      recycleCode?: string;
      wasteStream?: string;
      weightPerPackageKg: number;
      missingReason?: 'no-product-packaging' | 'no-batch-application';
    };

    const registrationGroups = new Map<string, {
      packaging: string;
      material: string;
      recycleCode?: string;
      wasteStream?: string;
      weightPerPackageKg: number;
    }[]>();

    registrations.forEach((registration) => {
      const productCode = registration.productCode?.trim();
      const batchNumber = registration.batchNumber?.trim();
      if (!productCode || !batchNumber) return;

      const key = `${productCode}|${batchNumber}`;
      const existing = registrationGroups.get(key) ?? [];
      existing.push({
        packaging: registration.recycleCode || registration.material || registration.layerName || 'Onbekend',
        material: registration.material || 'Onbekend',
        recycleCode: registration.recycleCode,
        wasteStream: registration.wasteStream,
        weightPerPackageKg: parseDecimal(registration.weightGramsPerUnit) / 1000,
      });
      registrationGroups.set(key, existing);
    });

    const overrideGroups = new Map<string, SalesPackagingOption[]>();

    exactSalesPackagingOverrides.forEach((override) => {
      const productCode = override.productCode?.trim();
      const batchNumber = override.batchNumber?.trim();
      if (!productCode || !batchNumber) return;

      const key = `${productCode}|${batchNumber}`;
      const existing = overrideGroups.get(key) ?? [];
      existing.push({
        packaging: override.recycleCode || override.material || override.layerName || 'Onbekend',
        material: override.material || 'Onbekend',
        recycleCode: override.recycleCode,
        wasteStream: override.wasteStream,
        weightPerPackageKg: parseDecimal(override.weightGramsPerUnit) / 1000,
      });
      overrideGroups.set(key, existing);
    });

    const productHasPackagingMap = new Map<string, boolean>();
    products.forEach((product) => {
      const productCode = product.code?.trim();
      if (!productCode) return;
      const hasPackaging = normalizePackagingLayers(product)
        .some((layer) => layer.material || layer.recycleCode || parseDecimal(layer.weightGrams) > 0);
      productHasPackagingMap.set(productCode, hasPackaging);
    });

    const totals = new Map<string, {
      article: string;
      batch: string;
      packaging: string;
      material: string;
      recycleCode?: string;
      wasteStream?: string;
      countryCode: string;
      countryName?: string;
      sold: number;
      weightPerPackageKg: number;
      totalKg: number;
      missingReason?: 'no-product-packaging' | 'no-batch-application';
    }>();

    visibleSalesPreview.forEach((line) => {
      const article = line.itemCode?.trim();
      if (!article) return;

      const batches = (line.batchNumber || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (batches.length === 0) return;

      const soldRaw = parseDecimal(line.quantityDelivered || line.quantityOrdered || '0');
      if (soldRaw <= 0) return;

      const soldPerBatch = soldRaw / batches.length;
      const countryCode = normalizeExactCountryCode(line.deliveryCountryCode);

      batches.forEach((batch) => {
        const registrationOptions: SalesPackagingOption[] = registrationGroups.get(`${article}|${batch}`)
          ?? overrideGroups.get(`${article}|${batch}`)
          ?? [{
            packaging: productHasPackagingMap.get(article) ? 'Nog niet toegepast op batch' : 'Geen verpakking op product',
            material: 'Onbekend',
            recycleCode: undefined,
            wasteStream: undefined,
            weightPerPackageKg: 0,
            missingReason: productHasPackagingMap.get(article) ? 'no-batch-application' as const : 'no-product-packaging' as const,
          }];

        registrationOptions.forEach((registrationOption) => {
          const key = `${article}|${batch}|${registrationOption.packaging}|${registrationOption.weightPerPackageKg}|${countryCode || 'missing'}`;
          const current = totals.get(key) ?? {
            article,
            batch,
            packaging: registrationOption.packaging,
            material: registrationOption.material,
            recycleCode: registrationOption.recycleCode,
            wasteStream: registrationOption.wasteStream,
            countryCode,
            countryName: line.deliveryCountryName,
            sold: 0,
            weightPerPackageKg: registrationOption.weightPerPackageKg,
            totalKg: 0,
            missingReason: 'missingReason' in registrationOption ? registrationOption.missingReason : undefined,
          };

          current.sold += soldPerBatch;
          current.totalKg += soldPerBatch * registrationOption.weightPerPackageKg;
          totals.set(key, current);
        });
      });
    });

    return Array.from(totals.values()).sort((a, b) => {
      const byArticle = a.article.localeCompare(b.article, 'nl', { sensitivity: 'base' });
      if (byArticle !== 0) return byArticle;
      const byBatch = a.batch.localeCompare(b.batch, 'nl', { sensitivity: 'base' });
      if (byBatch !== 0) return byBatch;
      return a.packaging.localeCompare(b.packaging, 'nl', { sensitivity: 'base' });
    });
  }, [exactSalesPackagingOverrides, registrations, visibleSalesPreview]);
  const salesArticleRows = useMemo(() => {
    const totals = new Map<string, {
      article: string;
      description: string;
      sold: number;
      packagingTypes: Set<string>;
      batches: Set<string>;
      totalKg: number;
    }>();

    salesPackagingRows.forEach((row) => {
      const current = totals.get(row.article) ?? {
        article: row.article,
        description: visibleSalesPreview.find((line) => line.itemCode?.trim() === row.article)?.itemDescription
          || visibleSalesPreview.find((line) => line.itemCode?.trim() === row.article)?.description
          || '',
        sold: salesSoldTotals.articleTotals.get(row.article) ?? 0,
        packagingTypes: new Set<string>(),
        batches: new Set<string>(),
        totalKg: 0,
      };

      current.totalKg += row.totalKg;
      if (row.packaging) current.packagingTypes.add(row.packaging);
      if (row.batch) current.batches.add(row.batch);
      totals.set(row.article, current);
    });

    return Array.from(totals.values()).sort((a, b) =>
      a.article.localeCompare(b.article, 'nl', { sensitivity: 'base' }),
    );
  }, [salesPackagingRows, salesSoldTotals.articleTotals, visibleSalesPreview]);
  const salesArticleTotalsByArticle = useMemo(
    () => new Map(salesArticleRows.map((row) => [row.article, row])),
    [salesArticleRows],
  );
  const salesSummaryRows = useMemo(() => (
    salesPackagingRows.map((row) => ({
      ...row,
      description: salesArticleTotalsByArticle.get(row.article)?.description || '',
      product: productsByCode.get(row.article) || productsByNormalizedCode.get(normalizeLookup(row.article)),
      sold: salesSoldTotals.batchTotals.get(`${row.article}|${row.batch}|${row.countryCode || 'missing'}`) ?? row.sold,
      isLinked: row.missingReason == null,
      status: row.missingReason === 'no-product-packaging'
        ? 'Geen verpakking op product'
        : row.missingReason === 'no-batch-application'
          ? 'Nog toepassen op batch'
          : 'Gekoppeld aan verpakking',
    }))
  ), [productsByCode, productsByNormalizedCode, salesArticleTotalsByArticle, salesPackagingRows, salesSoldTotals.batchTotals]);
  const filteredSalesSummaryRows = (() => {
    const needle = salesSummaryArticleFilter.trim();
    const normalizedNeedle = needle ? normalizeLookup(needle) : '';

    return salesSummaryRows.filter((row) => {
      const matchesStatus = salesSummaryStatusFilter === 'all'
        ? true
        : salesSummaryStatusFilter === 'linked'
          ? row.status === 'Gekoppeld aan verpakking' && row.isLinked
          : row.status !== 'Gekoppeld aan verpakking' || !row.isLinked;
      if (!matchesStatus) return false;
      if (!needle) return true;

      const description = row.description || '';
      return row.article.toLowerCase().includes(needle.toLowerCase())
        || description.toLowerCase().includes(needle.toLowerCase())
        || normalizeLookup(row.article).includes(normalizedNeedle)
        || normalizeLookup(description).includes(normalizedNeedle);
    });
  })();
  const missingPackagingMatches = useMemo(() => {
    const groups = new Map<string, {
      article: string;
      batch: string;
      description: string;
      sold: number;
      salesOrders: Set<string>;
    }>();

    salesPackagingRows.forEach((row) => {
      if (!row.missingReason) return;

      const key = `${row.article}|${row.batch}`;
      const current = groups.get(key) ?? {
        article: row.article,
        batch: row.batch,
        description:
          visibleSalesPreview.find(
            (line) => line.itemCode?.trim() === row.article && (line.batchNumber || '').split(',').map((value) => value.trim()).includes(row.batch),
          )?.itemDescription
          || visibleSalesPreview.find((line) => line.itemCode?.trim() === row.article)?.itemDescription
          || visibleSalesPreview.find((line) => line.itemCode?.trim() === row.article)?.description
          || '',
        sold: 0,
        salesOrders: new Set<string>(),
      };

      current.sold += row.sold;

      visibleSalesPreview.forEach((line) => {
        const lineArticle = line.itemCode?.trim();
        const lineBatches = (line.batchNumber || '').split(',').map((value) => value.trim()).filter(Boolean);
        if (lineArticle === row.article && lineBatches.includes(row.batch) && line.salesOrderNumber) {
          current.salesOrders.add(line.salesOrderNumber);
        }
      });

      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const byArticle = a.article.localeCompare(b.article, 'nl', { sensitivity: 'base' });
      if (byArticle !== 0) return byArticle;
      return a.batch.localeCompare(b.batch, 'nl', { sensitivity: 'base' });
    });
  }, [salesPackagingRows, visibleSalesPreview]);
  const ppwrReportRows = useMemo(() => {
    const groups = new Map<string, {
      countryCode: string;
      countryName: string;
      material: string;
      recycleCode?: string;
      wasteStream?: string;
      sold: number;
      weightKg: number;
      articles: Set<string>;
      batches: Set<string>;
    }>();

    salesPackagingRows.forEach((row) => {
      if (!euMemberStateMap.has(row.countryCode) || row.missingReason) return;

      const key = `${row.countryCode}|${row.material}|${row.recycleCode || ''}|${row.wasteStream || ''}`;
      const current = groups.get(key) ?? {
        countryCode: row.countryCode,
        countryName: euMemberStateMap.get(row.countryCode) || row.countryName || row.countryCode,
        material: row.material,
        recycleCode: row.recycleCode,
        wasteStream: row.wasteStream,
        sold: 0,
        weightKg: 0,
        articles: new Set<string>(),
        batches: new Set<string>(),
      };

      current.sold += row.sold;
      current.weightKg += row.totalKg;
      current.articles.add(row.article);
      current.batches.add(row.batch);
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const byCountry = a.countryName.localeCompare(b.countryName, 'nl', { sensitivity: 'base' });
      if (byCountry !== 0) return byCountry;
      return b.weightKg - a.weightKg;
    });
  }, [salesPackagingRows]);
  const ppwrCountryRows = useMemo(() => {
    const groups = new Map<string, { countryCode: string; countryName: string; materials: Set<string>; weightKg: number }>();

    ppwrReportRows.forEach((row) => {
      const current = groups.get(row.countryCode) ?? {
        countryCode: row.countryCode,
        countryName: row.countryName,
        materials: new Set<string>(),
        weightKg: 0,
      };
      current.materials.add(row.material);
      current.weightKg += row.weightKg;
      groups.set(row.countryCode, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.weightKg - a.weightKg);
  }, [ppwrReportRows]);
  const ppwrChecks = useMemo(() => {
    const exactLines = visibleSalesPreview.filter((line) => line.itemCode?.trim());
    const linesWithoutBatch = exactLines.filter((line) => !(line.batchNumber || '').trim()).length;
    const linkedRows = salesPackagingRows.filter((row) => !row.missingReason);
    const rowsWithoutPackaging = salesPackagingRows.filter((row) => row.missingReason === 'no-product-packaging').length;
    const rowsPendingBatchApply = salesPackagingRows.filter((row) => row.missingReason === 'no-batch-application').length;
    const rowsWithoutCountry = linkedRows.filter((row) => !row.countryCode).length;
    const rowsOutsideEu = linkedRows.filter((row) => row.countryCode && !euMemberStateMap.has(row.countryCode)).length;

    return {
      exactLines: exactLines.length,
      linesWithoutBatch,
      linkedRows: linkedRows.length,
      rowsWithoutPackaging,
      rowsPendingBatchApply,
      rowsWithoutCountry,
      rowsOutsideEu,
    };
  }, [salesPackagingRows, visibleSalesPreview]);

  async function inspectBatchForLine(line: ExactSalesPreviewLine) {
    setProbeLoadingId(line.id);
    setBatchProbeError('');
    setBatchProbeLine(line);
    setShowBatchProbeDetails(false);
    setKnownBatchNumber((currentValue) => currentValue || line.batchNumber || '');
    try {
      const probes = await probeExactBatchLookup({
        goodsDeliveryLineId: line.exactGoodsDeliveryLineId || line.id,
        salesOrderNumber: line.salesOrderNumber,
        lineNumber: line.lineNumber,
        salesOrderLineId: line.salesOrderLineId,
        itemCode: line.itemCode,
        itemId: line.itemId,
        batchNumber: (knownBatchNumber || line.batchNumber || '').trim() || undefined,
      });
      setBatchProbeResults(probes);
    } catch (probeError) {
      setBatchProbeResults([]);
      setBatchProbeError(importErrorMessage(probeError));
    } finally {
      setProbeLoadingId('');
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <span className="panel-title-label"><Lock size={16} /> Exact koppeling</span>
        <button type="button" className="secondary-button panel-title-action" onClick={() => void loadStatus()}>
          <RefreshCw size={16} /> Status verversen
        </button>
      </div>
      {notice ? <div className="inline-notice success-notice">{notice}</div> : null}
      {error ? <div className="inline-notice">{error}</div> : null}
      <div className="exact-connection-panel-body">
        <div className="exact-connection-copy">
          <strong>{status?.isConnected ? 'Exact Handel is gekoppeld' : 'Exact is nog niet gekoppeld'}</strong>
          <span>Deze koppeling gebruikt later de verkoopregels en batchreferentie uit Exact. De verpakkingslogica blijft in Vite op batchniveau staan.</span>
        </div>
        <div className="exact-connection-meta">
          <div><span>Status</span><strong>{loading ? 'Laden...' : status?.isConnected ? 'Gekoppeld' : 'Niet gekoppeld'}</strong></div>
          <div><span>Administratie</span><strong>{status?.administrationName || '-'}</strong></div>
          <div><span>Division</span><strong>{status?.divisionCode || '-'}</strong></div>
          <div><span>Token geldig tot</span><strong>{status?.tokenExpiresAt ? formatDate(status.tokenExpiresAt) : '-'}</strong></div>
          <div><span>Laatste sync</span><strong>{status?.lastSyncAt ? formatDate(status.lastSyncAt) : '-'}</strong></div>
          <div><span>Laatste fout</span><strong>{status?.lastError || '-'}</strong></div>
        </div>
        <div className="exact-connection-actions">
          <button type="button" className="primary-button" onClick={startExactConnect}>
            <Lock size={16} /> {status?.isConnected ? 'Opnieuw koppelen' : 'Koppel Exact'}
          </button>
        </div>
      </div>
      {status?.isConnected ? (
        <div className="exact-sales-preview">
          <div className="panel-title">
            <span className="panel-title-label"><ClipboardList size={16} /> Exact goederen-transacties</span>
          </div>
          <div className="packaging-overview-toolbar">
            <label>Van
              <input
                type="date"
                value={salesDateFrom}
                onChange={(event) => setSalesDateFrom(event.target.value)}
              />
            </label>
            <label>Tot
              <input
                type="date"
                value={salesDateTo}
                onChange={(event) => setSalesDateTo(event.target.value)}
              />
            </label>
            <label>Zoek order / artikel
              <input
                type="text"
                placeholder="Bijv. 6549 of 2507001452"
                value={salesOrderFilter}
                onChange={(event) => setSalesOrderFilter(event.target.value)}
              />
            </label>
            <div className="exact-connection-actions">
              <label className="upload-button">
                <Upload size={16} /> Upload goederen-transacties
                <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void importSalesPreviewFile(event)} />
              </label>
            </div>
          </div>
          <div className="exact-connection-copy" style={{ paddingTop: 0 }}>
            <span>Upload hier de Excel/CSV-export uit Exact van <strong>Transacties | Batchnummers</strong>.</span>
          </div>
          {salesError ? <div className="inline-notice">{salesError}</div> : null}
          {salesDebugProbes.length > 0 || salesDebugRaw.length > 0 ? (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-title">
                <span className="panel-title-label"><DatabaseZap size={16} /> Exact debugprobe</span>
              </div>
              <div className="exact-connection-copy">
                <span>Bron: <strong>{salesSourceLabel}</strong></span>
                <span>Division uit response: <code>{salesDebugDivision || '-'}</code></span>
                <span>Ruwe regels in debugresponse: <strong>{salesDebugRaw.length}</strong></span>
              </div>
              {salesDebugRaw.length > 0 ? (
                <div className="table-wrap" style={{ marginBottom: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Pagina</th>
                        <th>Request</th>
                        <th>Regels</th>
                        <th>Volgende</th>
                        <th>Fout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesDebugRaw.map((row, index) => (
                        <tr key={`${String(row.requestUrl || 'debug')}-${index}`}>
                          <td>{String(row.page ?? index + 1)}</td>
                          <td><small>{String(row.requestUrl ?? '-')}</small></td>
                          <td>{String(row.rowCount ?? '-')}</td>
                          <td><small>{String(row.next ?? '-')}</small></td>
                          <td><small>{String(row.error ?? '-')}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="probe-list-wrap">{renderProbeList(salesDebugProbes)}</div>
            </div>
          ) : null}
          <div className="ppwr-exact-grid">
            <section className="ppwr-report-panel">
              <div className="ppwr-section-heading">
                <strong>PPWR-output</strong>
                <span>Kg verpakking per materiaalsoort en EU-lidstaat uit de gekozen Exact-rapportageperiode.</span>
              </div>
              <div className="ppwr-check-grid">
                <div><span>Exact regels</span><strong>{ppwrChecks.exactLines}</strong></div>
                <div><span>Gekoppeld</span><strong>{ppwrChecks.linkedRows}</strong></div>
                <div className={ppwrChecks.rowsWithoutCountry > 0 ? 'warning' : ''}><span>Land ontbreekt</span><strong>{ppwrChecks.rowsWithoutCountry}</strong></div>
                <div className={ppwrChecks.rowsWithoutPackaging > 0 ? 'warning' : ''}><span>Geen verpakking op product</span><strong>{ppwrChecks.rowsWithoutPackaging}</strong></div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EU-land</th>
                      <th>Materiaal</th>
                      <th>Recyclecode</th>
                      <th>Afvalstroom</th>
                      <th>Verkocht</th>
                      <th>Artikelen</th>
                      <th>Batches</th>
                      <th>Kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ppwrReportRows.length === 0 ? (
                      <tr><td colSpan={8}>Nog geen PPWR-regels. Haal Exact-verkoopregels op met batchnummer, afleverland en verpakkingskoppeling.</td></tr>
                    ) : ppwrReportRows.map((row) => (
                      <tr key={`${row.countryCode}-${row.material}-${row.recycleCode}-${row.wasteStream}`}>
                        <td><strong>{row.countryName}</strong><br /><small>{row.countryCode}</small></td>
                        <td>{row.material}</td>
                        <td>{row.recycleCode || '-'}</td>
                        <td>{row.wasteStream || '-'}</td>
                        <td>{formatQuantity(row.sold)}</td>
                        <td>{row.articles.size}</td>
                        <td>{row.batches.size}</td>
                        <td><strong>{formatDecimal(row.weightKg, 8)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <aside className="ppwr-country-panel">
              <div className="ppwr-section-heading">
                <strong>Rapportagecontrole</strong>
                <span>Regels buiten de export blijven zichtbaar als controlepunt.</span>
              </div>
              <div className="ppwr-control-grid">
                {[
                  { label: 'Geen batch uit Exact', value: ppwrChecks.linesWithoutBatch },
                  { label: 'Geen verpakking op product', value: ppwrChecks.rowsWithoutPackaging },
                  { label: 'Nog toepassen op batch', value: ppwrChecks.rowsPendingBatchApply },
                  { label: 'Geen afleverland', value: ppwrChecks.rowsWithoutCountry },
                  { label: 'Buiten EU', value: ppwrChecks.rowsOutsideEu },
                ].map((item) => (
                  <article
                    key={item.label}
                    className={`ppwr-control-card ${item.value > 0 ? 'warning' : 'ok'}`}
                  >
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>
              <div className="ppwr-country-summary">
                {ppwrCountryRows.length === 0 ? (
                  <span>De landtotalen verschijnen zodra Exact het afleverland meegeeft.</span>
                ) : ppwrCountryRows.map((row) => (
                  <div key={row.countryCode}>
                    <span>{row.countryName}</span>
                    <strong>{formatDecimal(row.weightKg, 8)} kg</strong>
                    <small>{row.materials.size} materiaalsoorten</small>
                  </div>
                ))}
              </div>
            </aside>
          </div>
          {salesSummaryRows.length > 0 ? (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="sales-summary-panel-head">
                <div className="panel-title sales-summary-panel-title">
                  <span className="panel-title-label"><BriefcaseBusiness size={16} /> Verkooptotalen per artikel, batch en land</span>
                </div>
                <label className="sales-summary-search" aria-label="Zoek artikel of omschrijving">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Zoek artikel of omschrijving"
                    value={salesSummaryArticleFilter}
                    onChange={(event) => setSalesSummaryArticleFilter(event.target.value)}
                  />
                </label>
              </div>
              <div className="sales-summary-helper">
                <span>Een detailregel per artikel, batch en land, met direct daarnaast het artikeltotaal uit dezelfde rapportageperiode.</span>
              </div>
              <div className="table-wrap">
                <table>
                  <colgroup>
                    <col className="sales-summary-col-article" />
                    <col className="sales-summary-col-batch" />
                    <col className="sales-summary-col-country" />
                    <col className="sales-summary-col-number" />
                    <col className="sales-summary-col-number" />
                    <col className="sales-summary-col-packaging" />
                    <col className="sales-summary-col-weight" />
                    <col className="sales-summary-col-weight" />
                    <col className="sales-summary-col-weight" />
                    <col className="sales-summary-col-status" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Artikel</th>
                      <th>Batchnr.</th>
                      <th>Land</th>
                      <th>Verkocht batch</th>
                      <th>Verkocht artikel</th>
                      <th>Verpakking</th>
                      <th>Gewicht verpakking</th>
                      <th>Totaal batch</th>
                      <th>Totaal artikel</th>
                      <th className="sales-summary-status-header">
                        <label className="sales-summary-filter sales-summary-filter-inline">
                          <span>Status</span>
                          <select
                            value={salesSummaryStatusFilter}
                            onChange={(event) => setSalesSummaryStatusFilter(event.target.value as 'all' | 'linked' | 'unlinked')}
                          >
                            <option value="all">Alles</option>
                            <option value="linked">Gekoppeld</option>
                            <option value="unlinked">Niet gekoppeld</option>
                          </select>
                        </label>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSalesSummaryRows.map((row) => (
                      <tr key={`summary-${row.article}-${row.batch}-${row.countryCode || 'missing'}-${row.packaging}-${row.status}`}>
                        <td
                          className={`sales-summary-article-cell ${row.product ? 'sales-summary-article-cell-clickable' : ''}`}
                          onClick={row.product ? () => onSelectProduct(row.product!, 'packaging', row.batch) : undefined}
                        >
                          {row.product ? (
                            <button
                              type="button"
                              className="link-button sales-summary-article-link"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectProduct(row.product!, 'packaging', row.batch);
                              }}
                            >
                              <strong>{row.article}</strong>
                              {row.description ? (
                                <small>{row.description}</small>
                              ) : null}
                            </button>
                          ) : (
                            <>
                              <strong>{row.article}</strong>
                              {row.description ? (
                                <>
                                  <br />
                                  <small>{row.description}</small>
                                </>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="sales-summary-batch-cell"><strong>{row.batch}</strong></td>
                        <td className="sales-summary-country-cell">{row.countryCode || '-'}</td>
                        <td className="sales-summary-number-cell">{formatQuantity(row.sold)}</td>
                        <td className="sales-summary-number-cell">{formatQuantity(salesArticleTotalsByArticle.get(row.article)?.sold ?? 0)}</td>
                        <td>{row.packaging}</td>
                        <td className="sales-summary-number-cell">{formatDecimal(row.weightPerPackageKg, 8)} kg</td>
                        <td className="sales-summary-number-cell">{formatDecimal(row.totalKg, 8)} kg</td>
                        <td className="sales-summary-number-cell">{formatDecimal(salesArticleTotalsByArticle.get(row.article)?.totalKg ?? 0, 8)} kg</td>
                        <td className="sales-summary-status-cell">
                          <span className={`sales-scope-pill ${row.status === 'Gekoppeld aan verpakking' ? 'ok' : 'warning'}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredSalesSummaryRows.length === 0 ? (
                      <tr>
                        <td colSpan={10}>Geen artikelen gevonden voor deze zoekopdracht.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {missingPackagingMatches.length > 0 ? (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-title">
                <span className="panel-title-label"><PackageX size={16} /> Ontbrekende verpakkingskoppelingen</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Artikel</th>
                      <th>Batch</th>
                      <th>Omschrijving</th>
                      <th>Verkocht</th>
                      <th>Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingPackagingMatches.map((row) => (
                      <tr key={`${row.article}-${row.batch}`}>
                        <td><strong>{row.article}</strong></td>
                        <td>{row.batch}</td>
                        <td>{row.description || '-'}</td>
                        <td>{formatQuantity(row.sold)}</td>
                        <td>{Array.from(row.salesOrders).join(', ') || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {visibleSalesPreview.length > 0 ? (
            <div className="exact-connection-actions" style={{ marginTop: 12, marginBottom: 12 }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowSalesLines((current) => !current)}
              >
                {showSalesLines ? 'Verberg ruwe orderregels' : 'Toon ruwe orderregels'}
              </button>
            </div>
          ) : null}
          {visibleSalesPreview.length > 0 && showSalesLines ? (
            <div className="table-wrap">
              <table className="exact-preview-table">
                <thead>
                  <tr>
                    <th>Leverdatum</th>
                    <th>Order</th>
                    <th>Inspectie</th>
                    <th>Regel</th>
                    <th>Batchnummer</th>
                    <th>Batchregels</th>
                    <th>Land</th>
                    <th>Product</th>
                    <th>Omschrijving</th>
                    <th>Geleverd</th>
                    <th>Besteld</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSalesPreview.map((line) => (
                    <tr key={line.id}>
                      <td>{line.deliveryDate ? formatDate(line.deliveryDate) : '-'}</td>
                      <td>{line.salesOrderNumber || '-'}</td>
                      <td>
                        {line.itemId || line.exactGoodsDeliveryLineId || line.lineNumber ? (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void inspectBatchForLine(line)}
                            disabled={probeLoadingId === line.id}
                          >
                            {probeLoadingId === line.id ? 'Zoeken...' : 'Inspecteer batch'}
                          </button>
                        ) : (
                          <span className="muted-text">Niet beschikbaar</span>
                        )}
                      </td>
                      <td>{line.lineNumber || '-'}</td>
                      <td>{line.batchNumber || '-'}</td>
                      <td>{line.batchCount || '0'}</td>
                      <td>{formatExactCountry(line.deliveryCountryCode, line.deliveryCountryName)}</td>
                      <td>{line.itemCode || '-'}</td>
                      <td>{line.itemDescription || line.description || '-'}</td>
                      <td>{line.quantityDelivered || '-'}</td>
                      <td>{line.quantityOrdered || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {batchProbeLine ? (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="panel-title">
                <span className="panel-title-label"><DatabaseZap size={16} /> Batch-inspectie voor order {batchProbeLine.salesOrderNumber || '-'}, regel {batchProbeLine.lineNumber || '-'}</span>
              </div>
              <div className="exact-connection-copy">
                <span>Product: <strong>{batchProbeLine.itemCode || '-'}</strong> - {batchProbeLine.itemDescription || batchProbeLine.description || '-'}</span>
                <span>Item GUID: <code>{batchProbeLine.itemId || '-'}</code></span>
                <span>SalesOrderLineID: <code>{batchProbeLine.salesOrderLineId || '-'}</code></span>
                <span>EntryID: <code>{batchProbeLine.entryId || '-'}</code></span>
              </div>
              <div className="packaging-overview-toolbar">
                <label>Bekend batchnummer uit Exact
                  <input
                    type="text"
                    placeholder="Bijv. 25841"
                    value={knownBatchNumber}
                    onChange={(event) => setKnownBatchNumber(event.target.value)}
                  />
                </label>
                <div className="exact-connection-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void inspectBatchForLine(batchProbeLine)}
                    disabled={probeLoadingId === batchProbeLine.id}
                  >
                    <RefreshCw size={16} /> {probeLoadingId === batchProbeLine.id ? 'Zoeken...' : 'Opnieuw inspecteren'}
                  </button>
                </div>
              </div>
              {batchProbeError ? <div className="inline-notice">{batchProbeError}</div> : null}
              {batchProbeResults.length > 0 ? (
                <div className="exact-connection-meta" style={{ marginBottom: 12 }}>
                  <div>
                    <span>Juiste regel</span>
                    <strong>{batchProbeSummary.deliveryLineMatches ? 'Gevonden' : 'Nog niet bevestigd'}</strong>
                  </div>
                  <div>
                    <span>Bekende batch</span>
                    <strong>{knownBatchNumber.trim() || '-'}</strong>
                  </div>
                  <div>
                    <span>Batch hits</span>
                    <strong>{batchProbeSummary.batchNumberRows.length}</strong>
                  </div>
                  <div>
                    <span>Beschikbaar totaal</span>
                    <strong>{batchProbeSummary.availableQuantity || 0}</strong>
                  </div>
                  <div>
                    <span>Stock hits</span>
                    <strong>{batchProbeSummary.stockBatchNumberRows.length}</strong>
                  </div>
                  <div>
                    <span>Stock totaal</span>
                    <strong>{batchProbeSummary.stockQuantity || 0}</strong>
                  </div>
                </div>
              ) : null}
              {batchProbeSummary.goodsDeliveryLineRow ? (
                <div className={`inline-notice ${batchProbeSummary.deliveryLineMatches ? 'success-notice' : ''}`}>
                  {batchProbeSummary.deliveryLineMatches
                    ? `Exact match: order ${batchProbeSummary.goodsDeliveryLineRow.SalesOrderNumber}, regel ${batchProbeSummary.goodsDeliveryLineRow.LineNumber}, artikel ${batchProbeSummary.goodsDeliveryLineRow.ItemCode}.`
                    : 'Er is wel een GoodsDeliveryLine gevonden, maar die matcht nog niet met de aangeklikte orderregel.'}
                  {batchProbeSummary.batchNumberRows.length > 0
                    ? ` Batch ${knownBatchNumber.trim() || '-'} is gevonden in BatchNumbers met totaal beschikbaar ${batchProbeSummary.availableQuantity || 0}.`
                    : ''}
                </div>
              ) : null}
              {batchProbeResults.length > 0 ? (
                <div className="exact-connection-meta" style={{ marginBottom: 12 }}>
                  <div>
                    <span>Orderregel in Exact</span>
                    <strong>
                      {batchProbeSummary.goodsDeliveryLineRow
                        ? `${batchProbeSummary.goodsDeliveryLineRow.SalesOrderNumber || '-'} / regel ${batchProbeSummary.goodsDeliveryLineRow.LineNumber || '-'}`
                        : 'Niet gevonden'}
                    </strong>
                  </div>
                  <div>
                    <span>Artikel</span>
                    <strong>{batchProbeSummary.goodsDeliveryLineRow?.ItemCode || batchProbeLine.itemCode || '-'}</strong>
                  </div>
                  <div>
                    <span>Batch in Exact</span>
                    <strong>{batchProbeSummary.batchNumberRows.length > 0 ? 'Ja' : 'Niet gevonden'}</strong>
                  </div>
                  <div>
                    <span>Totaal beschikbaar</span>
                    <strong>{batchProbeSummary.availableQuantity || 0}</strong>
                  </div>
                  <div>
                    <span>GoodsDelivery entry</span>
                    <strong>{batchProbeSummary.goodsDeliveriesRow?.EntryNumber || '-'}</strong>
                  </div>
                  <div>
                    <span>Stock transacties</span>
                    <strong>{batchProbeSummary.stockBatchNumberRows.length}</strong>
                  </div>
                </div>
              ) : null}
              <div className="exact-connection-actions" style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowBatchProbeDetails((current) => !current)}
                >
                  {showBatchProbeDetails ? 'Verberg technische details' : 'Toon technische details'}
                </button>
              </div>
              {showBatchProbeDetails ? <div className="probe-list-wrap">{renderProbeList(batchProbeResults)}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PackagingOverviewPage({
  registrations,
  exactSalesPackagingOverrides,
  batches,
  products,
  supplierRecords,
  onSelectProduct,
}: {
  registrations: ProductPackagingRegistration[];
  exactSalesPackagingOverrides: ExactSalesPackagingOverride[];
  batches: ContainerCostBatch[];
  products: Product[];
  supplierRecords: Supplier[];
  onSelectProduct: (product: Product, tab?: ProductModalTab, applyBatchNumber?: string) => void;
}) {
  const [batchFilter, setBatchFilter] = useState('all');
  const [materialFilter, setMaterialFilter] = useState('all');
  const [reportingFilter, setReportingFilter] = useState('all');
  const batchComplianceMap = useMemo(() => new Map(
    batches.map((batch) => [batch.id, parseBatchPackagingCompliance(batch)]),
  ), [batches]);
  const filteredRegistrations = useMemo(() => registrations.filter((registration) => {
    const compliance = batchComplianceMap.get(registration.batchId);
    return (batchFilter === 'all' || registration.batchOrderNumber === batchFilter) &&
      (materialFilter === 'all' || registration.material === materialFilter) &&
      (reportingFilter === 'all' || (compliance?.reportingMode || 'Alles registreren') === reportingFilter);
  }), [batchComplianceMap, batchFilter, materialFilter, registrations, reportingFilter]);
  const totalWeightKg = filteredRegistrations.reduce((total, registration) => total + parseDecimal(registration.totalWeightGrams) / 1000, 0);
  const uniqueProducts = new Set(filteredRegistrations.map((registration) => registration.productCode).filter(Boolean)).size;
  const batchOptions = Array.from(new Set(registrations.map((registration) => registration.batchOrderNumber).filter(Boolean) as string[])).sort();
  const materialOptions = Array.from(new Set(registrations.map((registration) => registration.material).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const materialRows = useMemo(() => {
    const groups = new Map<string, {
      material: string;
      recycleCode?: string;
      wasteStream?: string;
      weightKg: number;
      packages: number;
      products: Set<string>;
      rows: number;
    }>();
    filteredRegistrations.forEach((registration) => {
      const key = `${registration.material || 'Onbekend'}|${registration.recycleCode || ''}|${registration.wasteStream || ''}`;
      const group = groups.get(key) ?? {
        material: registration.material || 'Onbekend',
        recycleCode: registration.recycleCode,
        wasteStream: registration.wasteStream,
        weightKg: 0,
        packages: 0,
        products: new Set<string>(),
        rows: 0,
      };
      group.weightKg += parseDecimal(registration.totalWeightGrams) / 1000;
      group.packages += parseDecimal(registration.packagesCount);
      if (registration.productCode) group.products.add(registration.productCode);
      group.rows += 1;
      groups.set(key, group);
    });
    return Array.from(groups.values()).sort((a, b) => b.weightKg - a.weightKg);
  }, [filteredRegistrations]);
  const stickerRows = useMemo(() => {
    const groups = new Map<string, { material: string; rows: number; products: Set<string> }>();
    filteredRegistrations.forEach((registration) => {
      const material = registration.productStickerMaterial || 'Niet ingevuld';
      const group = groups.get(material) ?? { material, rows: 0, products: new Set<string>() };
      group.rows += 1;
      if (registration.productCode) group.products.add(registration.productCode);
      groups.set(material, group);
    });
    return Array.from(groups.values()).sort((a, b) => a.material.localeCompare(b.material, 'nl', { sensitivity: 'base' }));
  }, [filteredRegistrations]);
  const articleBatchRows = useMemo(() => {
    const groups = new Map<string, {
      productCode: string;
      productDescription: string;
      batch: string;
      packaging: string;
      delivered: number;
      registered: number;
      weightPerPackageKg: number;
      totalWeightKg: number;
    }>();

    filteredRegistrations.forEach((registration) => {
      const packaging = registration.recycleCode || registration.material || 'Onbekend';
      const batch = registration.batchNumber || registration.batchOrderNumber || registration.containerNumber || '-';
      const delivered = parseDecimal(registration.quantity);
      const registered = parseDecimal(registration.labelPrintCount || registration.packagesCount || registration.quantity);
      const weightPerPackageKg = parseDecimal(registration.weightGramsPerUnit) / 1000;
      const key = [
        registration.productCode,
        batch,
        packaging,
        registration.weightGramsPerUnit || '0',
      ].join('|');

      const group = groups.get(key) ?? {
        productCode: registration.productCode,
        productDescription: registration.productDescription,
        batch,
        packaging,
        delivered: 0,
        registered: 0,
        weightPerPackageKg,
        totalWeightKg: 0,
      };

      group.delivered += delivered;
      group.registered += registered;
      group.totalWeightKg += parseDecimal(registration.totalWeightGrams) / 1000;
      groups.set(key, group);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const byArticle = a.productCode.localeCompare(b.productCode, 'nl', { sensitivity: 'base' });
      if (byArticle !== 0) return byArticle;
      const byBatch = a.batch.localeCompare(b.batch, 'nl', { sensitivity: 'base' });
      if (byBatch !== 0) return byBatch;
      return a.packaging.localeCompare(b.packaging, 'nl', { sensitivity: 'base' });
    });
  }, [filteredRegistrations]);
  const articleTotalRows = useMemo(() => {
    const groups = new Map<string, {
      productCode: string;
      productDescription: string;
      delivered: number;
      registered: number;
      totalWeightKg: number;
      packagingTypes: Set<string>;
      batches: Set<string>;
    }>();

    articleBatchRows.forEach((row) => {
      const group = groups.get(row.productCode) ?? {
        productCode: row.productCode,
        productDescription: row.productDescription,
        delivered: 0,
        registered: 0,
        totalWeightKg: 0,
        packagingTypes: new Set<string>(),
        batches: new Set<string>(),
      };

      group.delivered += row.delivered;
      group.registered += row.registered;
      group.totalWeightKg += row.totalWeightKg;
      if (row.packaging) group.packagingTypes.add(row.packaging);
      if (row.batch && row.batch !== '-') group.batches.add(row.batch);
      groups.set(row.productCode, group);
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.productCode.localeCompare(b.productCode, 'nl', { sensitivity: 'base' }),
    );
  }, [articleBatchRows]);
  const complianceRows = useMemo(() => {
    const groups = new Map<string, { scope: string; reportingMode: string; rows: number; weightKg: number; batches: Set<string> }>();
    filteredRegistrations.forEach((registration) => {
      const compliance = batchComplianceMap.get(registration.batchId);
      const scope = compliance?.scope || 'Eigen import';
      const reportingMode = compliance?.reportingMode || 'Alles registreren';
      const key = `${scope}|${reportingMode}`;
      const group = groups.get(key) ?? { scope, reportingMode, rows: 0, weightKg: 0, batches: new Set<string>() };
      group.rows += 1;
      group.weightKg += parseDecimal(registration.totalWeightGrams) / 1000;
      if (registration.batchOrderNumber) group.batches.add(registration.batchOrderNumber);
      groups.set(key, group);
    });
    return Array.from(groups.values()).sort((a, b) => b.weightKg - a.weightKg);
  }, [batchComplianceMap, filteredRegistrations]);

  function csvEscape(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  function exportPackagingCsv() {
    const headers = [
      'Importbatch',
      'Productbatch',
      'Container',
      'Productnummer',
      'Omschrijving',
      'Aantal',
      'Verpakkingseenheid',
      'Aantal verpakkingen',
      'Component',
      'Materiaal',
      'Recyclecode',
      'Afvalstroom',
      'Productsticker',
      'Gewicht per verpakking (g)',
      'Totaal gewicht (kg)',
      '% PCR',
      'Recyclebaarheidsklasse',
      'Rol',
      'Geregistreerd op',
    ];
    const rows = filteredRegistrations.map((registration) => [
      registration.batchOrderNumber ?? '',
      registration.batchNumber ?? '',
      registration.containerNumber ?? '',
      registration.productCode,
      registration.productDescription,
      registration.quantity,
      registration.packagingUnit ?? '',
      registration.packagesCount ?? '',
      registration.layerName,
      registration.material,
      registration.recycleCode ?? '',
      registration.wasteStream ?? '',
      registration.productStickerMaterial ?? '',
      registration.weightGramsPerUnit,
      formatDecimal(parseDecimal(registration.totalWeightGrams) / 1000, 8),
      registration.recycledContentPercent ?? '',
      registration.recyclabilityClass ?? '',
      registration.packagingRole ?? '',
      registration.registeredAt ? formatDate(registration.registeredAt) : '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => csvEscape(String(value))).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `verpakkingsregistratie-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>PPWR verpakking</h1>
          <span>Van batchverpakking en Exact-verkoop naar kg per materiaal en EU-lidstaat</span>
        </div>
      </div>
      <section className="panel ppwr-flow-panel">
        <div className="panel-title"><span className="panel-title-label"><ShieldCheck size={16} /> PPWR werkstroom</span></div>
        <div className="ppwr-flow">
          <div>
            <strong>1. Inkoopbatch</strong>
            <span>Leg per artikel en batch de verpakkingslagen, materiaalsoort en gewicht vast.</span>
          </div>
          <div>
            <strong>2. Exact verkoop</strong>
            <span>Lees verkochte stuks, batchnummer en afleverland uit de REST-koppeling.</span>
          </div>
          <div>
            <strong>3. Rapportage</strong>
            <span>Vermenigvuldig stuks met kg per verpakkingslaag en groepeer per EU-land.</span>
          </div>
        </div>
      </section>
      <ExactConnectionPanel
        registrations={registrations}
        exactSalesPackagingOverrides={exactSalesPackagingOverrides}
        batches={batches}
        products={products}
        supplierRecords={supplierRecords}
        onSelectProduct={onSelectProduct}
      />
      <section className="stat-grid packaging-overview-stats">
        <div className="stat-card"><PackagePlus size={22} /><div><span>Registratieregels</span><strong>{filteredRegistrations.length}</strong></div></div>
        <div className="stat-card"><Boxes size={22} /><div><span>Brongewicht batch</span><strong>{formatDecimal(totalWeightKg, 8)} kg</strong></div></div>
        <div className="stat-card"><BriefcaseBusiness size={22} /><div><span>Producten</span><strong>{uniqueProducts}</strong></div></div>
        <div className="stat-card"><FileText size={22} /><div><span>Batches</span><strong>{batchOptions.length}</strong></div></div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <span className="panel-title-label"><PackagePlus size={16} /> Filters en export</span>
          <button type="button" className="secondary-button panel-title-action" disabled={filteredRegistrations.length === 0} onClick={exportPackagingCsv}>CSV export</button>
        </div>
        <div className="packaging-overview-toolbar">
          <label>Batch
            <select value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)}>
              <option value="all">Alle batches</option>
              {batchOptions.map((batch) => <option key={batch} value={batch}>{batch}</option>)}
            </select>
          </label>
          <label>Materiaal
            <select value={materialFilter} onChange={(event) => setMaterialFilter(event.target.value)}>
              <option value="all">Alle materialen</option>
              {materialOptions.map((material) => <option key={material} value={material}>{material}</option>)}
            </select>
          </label>
          <label>Rapportage
            <select value={reportingFilter} onChange={(event) => setReportingFilter(event.target.value)}>
              <option value="all">Alles</option>
              {batchPackagingReportingModeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><span className="panel-title-label"><BriefcaseBusiness size={16} /> Totaal per artikel</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Artikel</th>
                <th>Geleverd</th>
                <th>Geregistreerd</th>
                <th>Verpakkingstypes</th>
                <th>Batches</th>
                <th>Totaal kg</th>
              </tr>
            </thead>
            <tbody>
              {articleTotalRows.length === 0 ? (
                <tr><td colSpan={6}>Nog geen artikeltotalen beschikbaar.</td></tr>
              ) : articleTotalRows.map((row) => (
                <tr key={row.productCode}>
                  <td><strong>{row.productCode}</strong><br /><small>{row.productDescription}</small></td>
                  <td>{formatQuantity(row.delivered)}</td>
                  <td>{formatQuantity(row.registered)}</td>
                  <td>{Array.from(row.packagingTypes).join(', ') || '-'}</td>
                  <td>{row.batches.size}</td>
                  <td>{formatDecimal(row.totalWeightKg, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><span className="panel-title-label"><BriefcaseBusiness size={16} /> Totaal per artikel en batch</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Artikel</th>
                <th>Batch</th>
                <th>Geleverd</th>
                <th>Geregistreerd</th>
                <th>Verpakking</th>
                <th>Gewicht verpakking kg</th>
                <th>Totaal kg</th>
              </tr>
            </thead>
            <tbody>
              {articleBatchRows.length === 0 ? (
                <tr><td colSpan={7}>Nog geen totalen beschikbaar.</td></tr>
              ) : articleBatchRows.map((row) => (
                <tr key={`${row.productCode}-${row.batch}-${row.packaging}`}>
                  <td><strong>{row.productCode}</strong><br /><small>{row.productDescription}</small></td>
                  <td>{row.batch}</td>
                  <td>{formatQuantity(row.delivered)}</td>
                  <td>{formatQuantity(row.registered)}</td>
                  <td>{row.packaging}</td>
                  <td>{formatDecimal(row.weightPerPackageKg, 8)}</td>
                  <td>{formatDecimal(row.totalWeightKg, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><span className="panel-title-label"><DatabaseZap size={16} /> Compliance per batchtype</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Scope</th>
                <th>Rapportage</th>
                <th>Batches</th>
                <th>Registratieregels</th>
                <th>Gewicht kg</th>
              </tr>
            </thead>
            <tbody>
              {complianceRows.length === 0 ? (
                <tr><td colSpan={5}>Nog geen compliance-data gevonden.</td></tr>
              ) : complianceRows.map((row) => (
                <tr key={`${row.scope}-${row.reportingMode}`}>
                  <td>{row.scope}</td>
                  <td>{row.reportingMode}</td>
                  <td>{row.batches.size}</td>
                  <td>{row.rows}</td>
                  <td>{formatDecimal(row.weightKg, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><span className="panel-title-label"><PackagePlus size={16} /> Totalen per materiaal</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Materiaal</th>
                <th>Recyclecode</th>
                <th>Afvalstroom</th>
                <th>Gewicht kg</th>
                <th>Verpakkingen</th>
                <th>Producten</th>
              </tr>
            </thead>
            <tbody>
              {materialRows.length === 0 ? (
                <tr><td colSpan={6}>Nog geen verpakkingsregistraties.</td></tr>
              ) : materialRows.map((row) => (
                <tr key={`${row.material}-${row.recycleCode}-${row.wasteStream}`}>
                  <td>{row.material}</td>
                  <td>{row.recycleCode || '-'}</td>
                  <td>{row.wasteStream || '-'}</td>
                  <td>{formatDecimal(row.weightKg, 8)}</td>
                  <td>{formatDecimal(row.packages, 8)}</td>
                  <td>{row.products.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><span className="panel-title-label"><FileText size={16} /> Productstickers</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Productsticker</th>
                <th>Registratieregels</th>
                <th>Producten</th>
              </tr>
            </thead>
            <tbody>
              {stickerRows.length === 0 ? (
                <tr><td colSpan={3}>Nog geen productstickers geregistreerd.</td></tr>
              ) : stickerRows.map((row) => (
                <tr key={row.material}>
                  <td>{row.material}</td>
                  <td>{row.rows}</td>
                  <td>{row.products.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><span className="panel-title-label"><ClipboardList size={16} /> Detailregels</span></div>
        <div className="table-wrap packaging-overview-details">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Product</th>
                <th>Component</th>
                <th>Materiaal</th>
                <th>Sticker</th>
                <th>Scope</th>
                <th>Rapportage</th>
                <th>Verpakkingen</th>
                <th>Gewicht kg</th>
                <th>Datum</th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistrations.length === 0 ? (
                <tr><td colSpan={10}>Nog geen detailregels.</td></tr>
              ) : filteredRegistrations.map((registration) => {
                const compliance = batchComplianceMap.get(registration.batchId);
                return (
                <tr key={registration.id}>
                  <td>{registration.batchNumber || registration.batchOrderNumber || '-'}</td>
                  <td><strong>{registration.productCode}</strong><br /><small>{registration.productDescription}</small></td>
                  <td>{registration.layerName}</td>
                  <td>{registration.material}<br /><small>{registration.recycleCode || '-'}</small></td>
                  <td>{registration.productStickerMaterial || '-'}</td>
                  <td>{compliance?.scope || 'Eigen import'}</td>
                  <td>{compliance?.reportingMode || 'Alles registreren'}</td>
                  <td>{registration.packagesCount || '-'}</td>
                  <td>{formatDecimal(parseDecimal(registration.totalWeightGrams) / 1000, 8)}</td>
                  <td>{registration.registeredAt ? formatDate(registration.registeredAt) : '-'}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SalesPage({ scooters, dealers, onSelect }: { scooters: Scooter[]; dealers: Dealer[]; onSelect: (scooter: Scooter) => void }) {
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Verkoop</h1>
          <span>Analyse per jaar, model en dealer</span>
        </div>
      </div>
      <SalesDashboard scooters={scooters} dealers={dealers} onSelect={onSelect} />
    </>
  );
}

function SalesDashboard({ scooters, dealers, onSelect }: { scooters: Scooter[]; dealers: Dealer[]; onSelect: (scooter: Scooter) => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'colors'>('overview');
  const [dealerFilter, setDealerFilter] = useState('all');
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [showYearFilter, setShowYearFilter] = useState(false);
  const [colorModelFilter, setColorModelFilter] = useState('all');
  const [selectedBucket, setSelectedBucket] = useState<{ year: string; model: string } | null>(null);
  const yearFilterRef = useRef<HTMLDivElement | null>(null);

  function formatPercentage(count: number, total: number) {
    if (total === 0) return '0,0%';
    return ((count / total) * 100).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  const soldScootersForYear = scooters.filter((scooter) =>
    scooter.status === 'Verkocht klant' &&
    (selectedYears.length === 0 || selectedYears.includes(salesYearForScooter(scooter))),
  );
  const availableDealers = dealers
    .filter((dealer) => soldScootersForYear.some((scooter) => scooter.dealerId === dealer.id))
    .sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name, 'nl', { sensitivity: 'base' }));
  const soldScooters = scooters.filter((scooter) =>
    scooter.status === 'Verkocht klant' &&
    (dealerFilter === 'all' || scooter.dealerId === dealerFilter) &&
    (selectedYears.length === 0 || selectedYears.includes(salesYearForScooter(scooter))),
  );
  const yearOptions = Array.from(new Set(scooters
    .filter((scooter) => scooter.status === 'Verkocht klant')
    .map(salesYearForScooter)))
    .sort((a, b) => {
      if (a === 'Onbekend') return 1;
      if (b === 'Onbekend') return -1;
      return b.localeCompare(a);
    });
  const yearFilterLabel = selectedYears.length === 0
    ? 'Alle jaren'
    : selectedYears.length === 1
      ? selectedYears[0]
      : `${selectedYears.length} jaren`;
  const rows = Array.from(soldScooters.reduce((map, scooter) => {
    const model = normalizeSalesModel(scooter.model);
    const key = `${salesYearForScooter(scooter)}|${model}`;
    const current = map.get(key) ?? {
      year: salesYearForScooter(scooter),
      model,
      snorCount: 0,
      bromCount: 0,
      totalCount: 0,
    };
    const speed = normalizeSpeedValue(scooter.speed);
    map.set(key, {
      ...current,
      snorCount: current.snorCount + (speed === '25' ? 1 : 0),
      bromCount: current.bromCount + (speed === '45' ? 1 : 0),
      totalCount: current.totalCount + 1,
    });
    return map;
  }, new Map<string, { year: string; model: string; snorCount: number; bromCount: number; totalCount: number }>()).values()).sort((a, b) => {
    if (a.year === 'Onbekend') return 1;
    if (b.year === 'Onbekend') return -1;
    return b.year.localeCompare(a.year) || b.totalCount - a.totalCount || a.model.localeCompare(b.model);
  });
  const bucketScooters = selectedBucket
    ? soldScooters
      .filter((scooter) => salesYearForScooter(scooter) === selectedBucket.year && normalizeSalesModel(scooter.model) === selectedBucket.model)
      .sort((a, b) => (a.firstRegistrationDate || '').localeCompare(b.firstRegistrationDate || '') || a.frameNumber.localeCompare(b.frameNumber))
    : [];
  const colorModelOptions = Array.from(new Set(soldScooters.map((scooter) => normalizeSalesModel(scooter.model)))).sort((a, b) =>
    a.localeCompare(b, 'nl', { sensitivity: 'base' }),
  );
  const colorTabScooters = soldScooters.filter((scooter) =>
    colorModelFilter === 'all' || normalizeSalesModel(scooter.model) === colorModelFilter,
  );
  const colorRows = Array.from(colorTabScooters.reduce((map, scooter) => {
    const model = normalizeSalesModel(scooter.model);
    const color = normalizeSalesColor(scooter.color);
    const key = `${model}|${color}`;
    const current = map.get(key) ?? {
      model,
      color,
      snorCount: 0,
      bromCount: 0,
      totalCount: 0,
    };
    const speed = normalizeSpeedValue(scooter.speed);
    current.snorCount += speed === '25' ? 1 : 0;
    current.bromCount += speed === '45' ? 1 : 0;
    current.totalCount += 1;
    map.set(key, current);
    return map;
  }, new Map<string, { model: string; color: string; snorCount: number; bromCount: number; totalCount: number }>()).values())
    .sort((a, b) => b.totalCount - a.totalCount || a.model.localeCompare(b.model, 'nl', { sensitivity: 'base' }) || a.color.localeCompare(b.color, 'nl', { sensitivity: 'base' }));
  const totalSnorCount = soldScooters.reduce((sum, scooter) => sum + (normalizeSpeedValue(scooter.speed) === '25' ? 1 : 0), 0);
  const totalBromCount = soldScooters.reduce((sum, scooter) => sum + (normalizeSpeedValue(scooter.speed) === '45' ? 1 : 0), 0);

  useEffect(() => {
    if (dealerFilter !== 'all' && !availableDealers.some((dealer) => dealer.id === dealerFilter)) {
      setDealerFilter('all');
    }
  }, [availableDealers, dealerFilter]);

  useEffect(() => {
    setSelectedYears((current) => current.filter((year) => yearOptions.includes(year)));
  }, [yearOptions]);

  useEffect(() => {
    if (colorModelFilter !== 'all' && !colorModelOptions.includes(colorModelFilter)) {
      setColorModelFilter('all');
    }
  }, [colorModelFilter, colorModelOptions]);

  useEffect(() => {
    if (!showYearFilter) return;
    function handlePointerDown(event: MouseEvent) {
      if (yearFilterRef.current && !yearFilterRef.current.contains(event.target as Node)) {
        setShowYearFilter(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showYearFilter]);

  function toggleYearFilter(year: string) {
    setSelectedYears((current) =>
      current.includes(year)
        ? current.filter((value) => value !== year)
        : [...current, year].sort((a, b) => {
          if (a === 'Onbekend') return 1;
          if (b === 'Onbekend') return -1;
          return b.localeCompare(a);
        }),
    );
  }

  return (
    <section className="panel sales-dashboard">
      <div className="panel-title">
        <span className="panel-title-label"><CircleDollarSign size={16} /> Verkoop dashboard</span>
        <div className="panel-title-filter year-filter-dropdown" ref={yearFilterRef}>
          <span>Jaar</span>
          <button type="button" className="panel-title-filter-button" onClick={() => setShowYearFilter((current) => !current)}>
            <span>{yearFilterLabel}</span>
            <ChevronDown size={16} />
          </button>
          {showYearFilter ? (
            <div className="year-filter-menu">
              <label className="year-filter-option">
                <input type="checkbox" checked={selectedYears.length === 0} onChange={() => setSelectedYears([])} />
                <span>Alle jaren</span>
              </label>
              {yearOptions.map((year) => (
                <label key={year} className="year-filter-option">
                  <input type="checkbox" checked={selectedYears.includes(year)} onChange={() => toggleYearFilter(year)} />
                  <span>{year}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <label className="panel-title-filter">
          Dealer
          <select value={dealerFilter} onChange={(event) => setDealerFilter(event.target.value)}>
            <option value="all">Alle dealers</option>
            {availableDealers.map((dealer) => <option key={dealer.id} value={dealer.id}>{dealer.company || dealer.name}</option>)}
          </select>
        </label>
      </div>
      <div className="sales-tab-bar">
        <button type="button" className={`product-tab-button sales-tab-button${activeTab === 'overview' ? ' active' : ''}`} onClick={() => setActiveTab('overview')}>
          Overzicht
          <span className="product-section-meta">Jaar, model, snor en brom</span>
        </button>
        <button type="button" className={`product-tab-button sales-tab-button${activeTab === 'colors' ? ' active' : ''}`} onClick={() => setActiveTab('colors')}>
          Kleuren
          <span className="product-section-meta">Verkoopverdeling per kleur</span>
        </button>
      </div>
      {activeTab === 'colors' ? (
        <div className="sales-subfilters">
          <label className="sales-subfilter">
            Model
            <select value={colorModelFilter} onChange={(event) => setColorModelFilter(event.target.value)}>
              <option value="all">Alle modellen</option>
              {colorModelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
        </div>
      ) : null}
      <div className="sales-summary">
        <div><span>Verkocht totaal</span><strong>{soldScooters.length}</strong></div>
        <div><span>Modellen</span><strong>{new Set(soldScooters.map((scooter) => normalizeSalesModel(scooter.model))).size}</strong></div>
        <div><span>Kleuren</span><strong>{colorRows.length}</strong><small>{activeTab === 'colors' ? `${colorTabScooters.length} scooters in selectie` : 'Beschikbare kleurverdeling'}</small></div>
        <div><span>Snorscooter (25)</span><strong>{totalSnorCount}</strong><small>{formatPercentage(totalSnorCount, soldScooters.length)} van {soldScooters.length}</small></div>
        <div><span>Bromscooter (45)</span><strong>{totalBromCount}</strong><small>{formatPercentage(totalBromCount, soldScooters.length)} van {soldScooters.length}</small></div>
        <div><span>Filters</span><strong>{yearFilterLabel} / {dealerFilter === 'all' ? 'Alle dealers' : dealerName(dealers, dealerFilter)}</strong></div>
      </div>
      {activeTab === 'overview' ? (
        <>
          <div className="table-wrap sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr><th>Jaar</th><th>Model</th><th>Snorscooter (25)</th><th>Bromscooter (45)</th><th>Totaal</th></tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((row) => (
                  <tr
                    className={`clickable-sales-row ${selectedBucket?.year === row.year && selectedBucket?.model === row.model ? 'selected' : ''}`}
                    key={`${row.year}-${row.model}`}
                    onClick={() => setSelectedBucket({ year: row.year, model: row.model })}
                  >
                    <td>{row.year}</td>
                    <td><button className="link-button" type="button">{row.model}</button></td>
                    <td className="sales-metric-cell">
                      <div className="sales-metric-layout">
                        <span className="sales-metric-value">{row.snorCount}</span>
                        <small className="sales-metric-share">{formatPercentage(row.snorCount, row.totalCount)}</small>
                      </div>
                    </td>
                    <td className="sales-metric-cell">
                      <div className="sales-metric-layout">
                        <span className="sales-metric-value">{row.bromCount}</span>
                        <small className="sales-metric-share">{formatPercentage(row.bromCount, row.totalCount)}</small>
                      </div>
                    </td>
                    <td className="sales-total-cell"><strong>{row.totalCount}</strong></td>
                  </tr>
                )) : (
                  <tr><td colSpan={5}>Geen verkoopdata gevonden.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {selectedBucket && (
            <div className="sales-detail">
              <div className="sales-detail-header">
                <div>
                  <strong>{selectedBucket.model}</strong>
                  <span>{selectedBucket.year} - {bucketScooters.length} scooters</span>
                </div>
                <button className="secondary-button" type="button" onClick={() => setSelectedBucket(null)}>Sluiten</button>
              </div>
              <div className="table-wrap sales-detail-table-wrap">
                <table className="sales-detail-table">
                  <thead>
                    <tr>
                      <th>Frame #</th>
                      <th>Kenteken</th>
                      <th>Dealer</th>
                      <th>Eerste tenaamstelling</th>
                      <th>Factuur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucketScooters.map((scooter) => (
                      <tr className="clickable-sales-row" key={scooter.id} onClick={() => onSelect(scooter)}>
                        <td><button className="link-button" type="button">{scooter.frameNumber}</button></td>
                        <td>{scooter.licensePlate || '-'}</td>
                        <td>{dealerName(dealers, scooter.dealerId) || '-'}</td>
                        <td>{formatDate(scooter.firstRegistrationDate)}</td>
                        <td>{scooter.invoiceNumber || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="table-wrap sales-table-wrap">
          <table className="sales-table sales-color-table">
            <thead>
              <tr><th>Model</th><th>Kleur</th><th>Snorscooter (25)</th><th>Bromscooter (45)</th><th>Totaal</th><th>Aandeel</th></tr>
            </thead>
            <tbody>
              {colorRows.length ? colorRows.map((row) => (
                <tr key={`${row.model}-${row.color}`}>
                  <td className="sales-color-model-cell"><strong>{row.model}</strong></td>
                  <td className="sales-color-cell"><strong>{row.color}</strong></td>
                  <td className="sales-metric-cell">
                    <div className="sales-metric-layout">
                      <span className="sales-metric-value">{row.snorCount}</span>
                      <small className="sales-metric-share">{formatPercentage(row.snorCount, row.totalCount)}</small>
                    </div>
                  </td>
                  <td className="sales-metric-cell">
                    <div className="sales-metric-layout">
                      <span className="sales-metric-value">{row.bromCount}</span>
                      <small className="sales-metric-share">{formatPercentage(row.bromCount, row.totalCount)}</small>
                    </div>
                  </td>
                  <td className="sales-total-cell"><strong>{row.totalCount}</strong></td>
                  <td className="sales-share-cell">{formatPercentage(row.totalCount, colorTabScooters.length)}</td>
                </tr>
              )) : (
                <tr><td colSpan={6}>Geen kleurdata gevonden.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ScooterTable({ scooters, dealers, query, setQuery, onSelect, title = 'Beschikbare scooters', onBulkRdwCheck, defaultSortOrder = 'model-asc' }: {
  scooters: Scooter[];
  dealers: Dealer[];
  query: string;
  setQuery: (value: string) => void;
  onSelect: (scooter: Scooter) => void;
  title?: string;
  onBulkRdwCheck?: (scooters: Scooter[]) => Promise<string>;
  defaultSortOrder?: string;
}) {
  const [rdwChecking, setRdwChecking] = useState(false);
  const [rdwCheckMessage, setRdwCheckMessage] = useState('');
  const [sortOrder, setSortOrder] = useState(defaultSortOrder);
  const [columnFilters, setColumnFilters] = useState({
    model: '',
    frame: '',
    color: '',
    colorNumber: '',
    licensePlate: '',
    speed: '',
    status: '',
    dealer: '',
    invoice: '',
    registration: '',
  });
  const modelOptions = Array.from(new Set(
    scooters
      .map((scooter) => scooter.model?.trim())
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const colorOptions = Array.from(new Set(
    scooters
      .map((scooter) => scooter.color?.trim())
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const dealerOptions = Array.from(new Set(
    scooters
      .map((scooter) => dealerName(dealers, scooter.dealerId))
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  useEffect(() => {
    setSortOrder(defaultSortOrder);
  }, [defaultSortOrder]);
  const filteredRows = scooters.filter((scooter) => {
    const dealer = dealerName(dealers, scooter.dealerId);
    const registrationComplete = isRegistrationComplete(scooter);
    return (
      (!columnFilters.model || scooter.model === columnFilters.model) &&
      scooter.frameNumber.toLowerCase().includes(columnFilters.frame.toLowerCase()) &&
      (!columnFilters.color || scooter.color === columnFilters.color) &&
      (scooter.colorNumber || '').toLowerCase().includes(columnFilters.colorNumber.toLowerCase()) &&
      (scooter.licensePlate || '').toLowerCase().includes(columnFilters.licensePlate.toLowerCase()) &&
      (!columnFilters.speed || normalizeSpeedValue(scooter.speed) === columnFilters.speed) &&
      (!columnFilters.status || scooter.status === columnFilters.status) &&
      (!columnFilters.dealer || dealer === columnFilters.dealer) &&
      (scooter.invoiceNumber || '').toLowerCase().includes(columnFilters.invoice.toLowerCase()) &&
      (!columnFilters.registration || (columnFilters.registration === 'complete' ? registrationComplete : !registrationComplete))
    );
  });
  const sortedRows = [...filteredRows].sort((a, b) => {
    switch (sortOrder) {
      case 'model-desc':
        return b.model.localeCompare(a.model, 'nl', { sensitivity: 'base' }) || a.frameNumber.localeCompare(b.frameNumber, 'nl', { sensitivity: 'base' });
      case 'color-asc':
        return a.color.localeCompare(b.color, 'nl', { sensitivity: 'base' }) || a.model.localeCompare(b.model, 'nl', { sensitivity: 'base' });
      case 'color-desc':
        return b.color.localeCompare(a.color, 'nl', { sensitivity: 'base' }) || a.model.localeCompare(b.model, 'nl', { sensitivity: 'base' });
      case 'speed-high':
        return Number(normalizeSpeedValue(b.speed) || 0) - Number(normalizeSpeedValue(a.speed) || 0) || a.model.localeCompare(b.model, 'nl', { sensitivity: 'base' });
      case 'speed-low':
        return Number(normalizeSpeedValue(a.speed) || 0) - Number(normalizeSpeedValue(b.speed) || 0) || a.model.localeCompare(b.model, 'nl', { sensitivity: 'base' });
      case 'newest-added':
        return new Date(b.arrivedAt || 0).getTime() - new Date(a.arrivedAt || 0).getTime() || a.model.localeCompare(b.model, 'nl', { sensitivity: 'base' });
      case 'registration-newest':
        return new Date(b.firstRegistrationDate || 0).getTime() - new Date(a.firstRegistrationDate || 0).getTime() || a.frameNumber.localeCompare(b.frameNumber, 'nl', { sensitivity: 'base' });
      case 'registration-oldest':
        return new Date(a.firstRegistrationDate || 0).getTime() - new Date(b.firstRegistrationDate || 0).getTime() || a.frameNumber.localeCompare(b.frameNumber, 'nl', { sensitivity: 'base' });
      case 'model-asc':
      default:
        return a.model.localeCompare(b.model, 'nl', { sensitivity: 'base' }) || a.frameNumber.localeCompare(b.frameNumber, 'nl', { sensitivity: 'base' });
    }
  });
  const speedOptions = speedOptionsFromScooters(scooters);
  const visibleScooters = sortedRows;

  const exportRows = sortedRows.map((scooter) => ({
    Model: scooter.model,
    'Frame #': scooter.frameNumber,
    Kleur: scooter.color,
    'Kleur No': scooter.colorNumber || '-',
    Kenteken: scooter.licensePlate || '-',
    Snelheid: normalizeSpeedValue(scooter.speed) || '-',
    Status: scooter.status,
    Dealer: dealerName(dealers, scooter.dealerId) || '-',
    Factuur: scooter.invoiceNumber || '-',
    Uitgepakt: scooter.isUnpacked ? 'Ja' : 'Nee',
    Tenaam: isRegistrationComplete(scooter) ? 'Ja' : 'Nee',
  }));

  function setColumnFilter(key: keyof typeof columnFilters, value: string) {
    setColumnFilters((current) => ({ ...current, [key]: value }));
  }

  function csvEscape(value: string) {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  function downloadTextFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (exportRows.length === 0) return;
    const headers = Object.keys(exportRows[0]);
    const lines = [
      headers.join(','),
      ...exportRows.map((row) => headers.map((header) => csvEscape(String(row[header as keyof typeof row] ?? ''))).join(',')),
    ];
    downloadTextFile(`${title.replace(/[^\w-]+/g, '_').toLowerCase() || 'scooters'}.csv`, lines.join('\n'), 'text/csv;charset=utf-8;');
  }

  async function exportExcel() {
    if (exportRows.length === 0) return;
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Scooters');
    XLSX.writeFile(workbook, `${title.replace(/[^\w-]+/g, '_').toLowerCase() || 'scooters'}.xlsx`);
  }

  function openPrintView(mode: 'print' | 'pdf') {
    if (exportRows.length === 0) return;
    const headers = Object.keys(exportRows[0]);
    const rowsHtml = exportRows.map((row) => (
      `<tr>${headers.map((header) => `<td>${String(row[header as keyof typeof row] ?? '-')}</td>`).join('')}</tr>`
    )).join('');
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=800');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 16px; font-size: 24px; }
            p { margin: 0 0 20px; color: #475569; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p>${exportRows.length} scooters in export</p>
          <table>
            <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      if (mode === 'pdf') {
        printWindow.close();
      }
    }, 250);
  }

  async function handleBulkRdwCheck() {
    if (!onBulkRdwCheck) return;
    setRdwChecking(true);
    setRdwCheckMessage('');
    try {
      const message = await onBulkRdwCheck(filteredRows);
      setRdwCheckMessage(message);
    } catch (error) {
      setRdwCheckMessage(`RDW controle mislukt: ${importErrorMessage(error)}`);
    } finally {
      setRdwChecking(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <span className="panel-title-label"><Bike size={16} /> {title}</span>
        {onBulkRdwCheck && (
          <button className="secondary-button panel-title-action" disabled={rdwChecking || filteredRows.length === 0} onClick={handleBulkRdwCheck}>
            <RefreshCw size={15} /> {rdwChecking ? 'RDW check bezig...' : 'Check voertuigen bij RDW'}
          </button>
        )}
      </div>
      {rdwCheckMessage && <div className="inline-notice">{rdwCheckMessage}</div>}
      <div className="table-toolbar">
        <div className="button-group">
          <button type="button" disabled={exportRows.length === 0} onClick={exportCsv}>CSV</button>
          <button type="button" disabled={exportRows.length === 0} onClick={exportExcel}>Excel</button>
          <button type="button" disabled={exportRows.length === 0} onClick={() => openPrintView('pdf')}>PDF</button>
          <button type="button" disabled={exportRows.length === 0} onClick={() => openPrintView('print')}>Print</button>
        </div>
        <div className="table-controls">
          <label>Sorteer:
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
              <option value="model-asc">Model A-Z</option>
              <option value="model-desc">Model Z-A</option>
              <option value="registration-newest">1e tenaamstelling nieuw-oud</option>
              <option value="registration-oldest">1e tenaamstelling oud-nieuw</option>
              <option value="color-asc">Kleur A-Z</option>
              <option value="color-desc">Kleur Z-A</option>
              <option value="speed-high">Snelheid hoog-laag</option>
              <option value="speed-low">Snelheid laag-hoog</option>
              <option value="newest-added">Nieuwste eerst</option>
            </select>
          </label>
          <label>Search: <input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Model</th><th>Frame #</th><th>Kleur</th><th>Kleur No</th><th>Kenteken</th><th>Snelheid</th><th>Status</th><th>Dealer</th><th>Factuur</th><th>Uitgepakt</th><th>Tenaam</th></tr>
            <tr className="filter-row">
              <th>
                <select value={columnFilters.model} onChange={(event) => setColumnFilter('model', event.target.value)} aria-label="Filter model">
                  <option value="">Alle</option>
                  {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </th>
              <th><input value={columnFilters.frame} onChange={(event) => setColumnFilter('frame', event.target.value)} aria-label="Filter frame" /></th>
              <th>
                <select value={columnFilters.color} onChange={(event) => setColumnFilter('color', event.target.value)} aria-label="Filter kleur">
                  <option value="">Alle</option>
                  {colorOptions.map((color) => <option key={color} value={color}>{color}</option>)}
                </select>
              </th>
              <th><input value={columnFilters.colorNumber} onChange={(event) => setColumnFilter('colorNumber', event.target.value)} aria-label="Filter kleur nummer" /></th>
              <th><input value={columnFilters.licensePlate} onChange={(event) => setColumnFilter('licensePlate', event.target.value)} aria-label="Filter kenteken" /></th>
              <th><select value={columnFilters.speed} onChange={(event) => setColumnFilter('speed', event.target.value)} aria-label="Filter snelheid"><option value="">Alle</option>{speedOptions.map((speed) => <option value={speed} key={speed}>{speed}</option>)}</select></th>
              <th><select value={columnFilters.status} onChange={(event) => setColumnFilter('status', event.target.value)} aria-label="Filter status"><option value="">Alle</option>{(Object.keys(statusColor) as ScooterStatus[]).map((status) => <option value={status} key={status}>{scooterStatusLabel(status)}</option>)}</select></th>
              <th>
                <select value={columnFilters.dealer} onChange={(event) => setColumnFilter('dealer', event.target.value)} aria-label="Filter dealer">
                  <option value="">Alle</option>
                  {dealerOptions.map((dealer) => <option value={dealer} key={dealer}>{dealer}</option>)}
                </select>
              </th>
              <th><input value={columnFilters.invoice} onChange={(event) => setColumnFilter('invoice', event.target.value)} aria-label="Filter factuur" /></th>
              <th></th>
              <th><select value={columnFilters.registration} onChange={(event) => setColumnFilter('registration', event.target.value)} aria-label="Filter tenaamstelling"><option value="">Alle</option><option value="complete">Compleet</option><option value="missing">Mist data</option></select></th>
            </tr>
          </thead>
          <tbody>
            {visibleScooters.map((scooter) => (
              <tr key={scooter.id} onClick={() => onSelect(scooter)}>
                <td>{scooter.model}</td>
                <td><button className="link-button">{scooter.frameNumber}</button></td>
                <td>{scooter.color}</td>
                <td>{scooter.colorNumber || '-'}</td>
                <td>{scooter.licensePlate || '-'}</td>
                <td>{normalizeSpeedValue(scooter.speed) || '-'}</td>
                <td>{scooter.status}</td>
                <td>{dealerName(dealers, scooter.dealerId) || '-'}</td>
                <td>{scooter.invoiceNumber || '-'}</td>
                <td className="registration-cell">{scooter.isUnpacked ? <CheckCircle2 className="registration-check" size={18} aria-label="Uitgepakt" /> : '-'}</td>
                <td className="registration-cell">{isRegistrationComplete(scooter) ? <CheckCircle2 className="registration-check" size={18} aria-label="Tenaamgesteld" /> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>{sortedRows.length} scooters in deze lijst</span>
      </div>
    </section>
  );
}

function Containers({
  data,
  message,
  messageDetails,
  onImport,
  onSelect,
  onMarkContainerAvailable,
}: {
  data: AppData;
  message: string;
  messageDetails: string[];
  onImport: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSelect: (scooter: Scooter) => void;
  onMarkContainerAvailable: (container: Container, arrivedAtInput: string) => Promise<void>;
}) {
  const [showImport, setShowImport] = useState(false);
  const sortedContainers = [...data.containers].sort((a, b) => containerSortTime(b) - containerSortTime(a));
  const pending = sortedContainers.filter((container) => container.status !== 'Aangekomen');
  const arrived = sortedContainers.filter((container) => container.status === 'Aangekomen');
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Containers</h1>
          <span>{data.containers.length} containers geregistreerd</span>
        </div>
      </div>
      <ExpandableNotice message={message} details={messageDetails} />
      <section className="panel">
        <div className="panel-title">
          <span className="panel-title-label"><Boxes size={16} /> Container tools</span>
        </div>
        <div className="container-tool-grid">
          <button type="button" className="container-tool-tile" onClick={() => setShowImport(true)}>
            <span className="container-tool-icon"><Upload size={20} /></span>
            <span className="container-tool-copy">
              <strong>Container importeren</strong>
              <small>Nieuwe zending toevoegen en scooters aan een container koppelen.</small>
            </span>
          </button>
        </div>
      </section>
      {data.containers.length === 0 ? (
        <section className="panel container-empty-state">
          <div className="empty-icon"><Boxes size={26} /></div>
          <div>
            <strong>Nog geen containers</strong>
            <span>Importeer of voeg een container toe om scooters per zending te groeperen.</span>
          </div>
          <button className="secondary-button" onClick={() => setShowImport(true)}><Upload size={16} /> Container importeren</button>
        </section>
      ) : (
        <div className="container-stack">
          <ContainerListPanel
            title={`Containers onderweg (${pending.length})`}
            containers={pending}
            scooters={data.scooters}
            dealers={data.dealers}
            onSelect={onSelect}
            onMarkContainerAvailable={onMarkContainerAvailable}
            green
            emptyMessage="Geen containers onderweg."
          />
          <ContainerListPanel
            title={`Aangekomen containers (${arrived.length})`}
            containers={arrived}
            scooters={data.scooters}
            dealers={data.dealers}
            onSelect={onSelect}
            green
            emptyMessage="Geen aangekomen containers."
          />
        </div>
      )}
      {showImport && (
        <div className="modal-backdrop" onMouseDown={() => setShowImport(false)}>
          <form className="modal-card container-import-modal" onSubmit={async (event) => {
            await onImport(event);
            setShowImport(false);
          }} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span>Containers</span>
                <h2>Container importeren</h2>
              </div>
              <button type="button" onClick={() => setShowImport(false)}>Close</button>
            </div>
            <div className="container-import-form">
              <div className="form-grid">
                <label>Import modus
                  <select name="importMode" defaultValue="update-existing">
                    <option value="update-existing">Bestaande scooters bijwerken</option>
                    <option value="create">Nieuwe scooters importeren</option>
                  </select>
                </label>
                <label>Type<select name="type" defaultValue="Scooters"><option>Scooters</option></select></label>
                <label>Merk<select name="brand" defaultValue="RSO"><option>RSO</option></select></label>
                <label>Invoice number<input name="invoiceNumber" placeholder="2017WL7864" required /></label>
                <label>Container number<input name="containerNumber" placeholder="EISU8034307" required /></label>
                <label>Seal number<input name="sealNumber" placeholder="EMCLX55227" required /></label>
                <label>Verwachte leverdatum<input name="eta" type="date" /></label>
                <label>Aankomstdatum<input name="arrivedAt" type="datetime-local" /></label>
              </div>
              <label className="container-content-field">
                Container content
                <span>Plak de kolommen uit Excel inclusief headers en in dezelfde volgorde.</span>
                <code>CTN NO.  MODEL  FRAME NO.  ENGINE NO.  ENGINE NO.  COLOR  SPEED</code>
                <textarea name="content" placeholder={'CTN NO.\tMODEL\tFRAME NO.\tENGINE NO.\tENGINE NO.\tCOLOR\tSPEED\n2\tSense (TY50QT-5D)\tLM0CBV5C8M1106518\t1P39QMB\tM07C65288\tZwart\t25km/h'} required />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowImport(false)}>Annuleren</button>
              <button className="primary-button">Importeren</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function CostBatchesPage({
  data,
  onSaveCostBatch,
  onSelectProduct,
  onOpenBatchLabelProduct,
  onTogglePurchaseOrderLine,
  onSaveScooterPackagingSpec,
}: {
  data: AppData;
  onSaveCostBatch: (batch: ContainerCostBatch, lines: ContainerCostLine[], productUpdates: Product[]) => Promise<void>;
  onSelectProduct: (product: Product, tab?: ProductModalTab) => void;
  onOpenBatchLabelProduct: (batch: ContainerCostBatch, line: ContainerCostLine, product?: Product) => void;
  onTogglePurchaseOrderLine: (line: ContainerCostLine, purchaseOrderAdded: boolean) => Promise<void>;
  onSaveScooterPackagingSpec: (spec: ScooterPackagingSpec) => Promise<boolean>;
}) {
  const [showCostModal, setShowCostModal] = useState(false);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [printMessage, setPrintMessage] = useState('');
  const [packagingMessage, setPackagingMessage] = useState('');
  const [importToolTab, setImportToolTab] = useState<'batch' | 'scooterPackaging'>('batch');
  const [packagingDraft, setPackagingDraft] = useState<ScooterPackagingSpec>({
    id: '',
    model: '',
    component: 'SKD',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    hasLining: false,
    boxWeightKg: '',
  });
  const sortedContainers = [...data.containers].sort((a, b) => containerSortTime(b) - containerSortTime(a));
  const sortedBatches = [...data.containerCostBatches].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const sortedPackagingSpecs = [...data.scooterPackagingSpecs].sort((a, b) =>
    a.model.localeCompare(b.model, 'nl', { sensitivity: 'base' }) || a.component.localeCompare(b.component),
  );
  const scooterModelOptions = Array.from(new Set([
    ...data.scooters.map((scooter) => scooter.model.trim()).filter(Boolean),
    ...data.scooterPackagingSpecs.map((spec) => spec.model.trim()).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const editingBatch = editingBatchId ? data.containerCostBatches.find((batch) => batch.id === editingBatchId) : undefined;
  const visibleContainerCostLines = useMemo(
    () => dedupeContainerCostLines(data.containerCostLines),
    [data.containerCostLines],
  );
  const editingBatchLines = editingBatch ? visibleContainerCostLines.filter((line) => line.batchId === editingBatch.id) : [];

  async function savePackagingDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const model = packagingDraft.model.trim();
    if (!model) {
      setPackagingMessage('Vul eerst een model in.');
      return;
    }

    setPackagingMessage('Opslaan...');
    const saved = await onSaveScooterPackagingSpec({
      ...packagingDraft,
      id: packagingDraft.id || stableId('scooter-packaging-spec', `${model}-${packagingDraft.component}`),
      model,
    });
    if (!saved) {
      setPackagingMessage('Opslaan mislukt. Controleer of de Supabase tabel bestaat en RLS schrijven toestaat.');
      return;
    }
    setPackagingMessage(`Verpakking voor ${model} ${packagingDraft.component} opgeslagen.`);
    setPackagingDraft({
      id: '',
      model: '',
      component: packagingDraft.component,
      lengthCm: '',
      widthCm: '',
      heightCm: '',
      hasLining: false,
      boxWeightKg: '',
    });
  }

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Import China</h1>
          <span>{data.containerCostBatches.length} importbatches opgeslagen</span>
        </div>
      </div>
      <section className="panel">
        <div className="panel-title">
          <span className="panel-title-label"><FileText size={16} /> Import China tools</span>
        </div>
        <div className="import-tool-tabs">
          <button type="button" className={importToolTab === 'batch' ? 'active' : ''} onClick={() => setImportToolTab('batch')}>
            Nieuwe importbatch
          </button>
          <button type="button" className={importToolTab === 'scooterPackaging' ? 'active' : ''} onClick={() => setImportToolTab('scooterPackaging')}>
            Verpakking scooter
          </button>
        </div>
        {importToolTab === 'batch' ? (
          <div className="container-tool-grid single">
            <button type="button" className="container-tool-tile finance" onClick={() => { setEditingBatchId(null); setShowCostModal(true); }}>
              <span className="container-tool-icon"><CircleDollarSign size={20} /></span>
              <span className="container-tool-copy">
                <strong>Nieuwe importbatch</strong>
                <small>Transport, inklaring en douane over scooters en onderdelen verdelen en wegschrijven naar kostprijs.</small>
              </span>
            </button>
          </div>
        ) : (
          <div className="scooter-packaging-tool">
            {packagingMessage ? <div className="notice compact">{packagingMessage}</div> : null}
            <form className="scooter-packaging-form" onSubmit={savePackagingDraft}>
              <label>Model
                <input list="scooter-packaging-model-options" value={packagingDraft.model} onChange={(event) => setPackagingDraft((current) => ({ ...current, model: event.target.value }))} placeholder="Bijv. Sense" required />
              </label>
              <label>Type
                <select value={packagingDraft.component} onChange={(event) => setPackagingDraft((current) => ({ ...current, component: event.target.value as ScooterPackagingSpec['component'] }))}>
                  <option value="CBU">CBU</option>
                  <option value="SKD">SKD</option>
                </select>
              </label>
              <label>Lengte (cm)
                <input value={packagingDraft.lengthCm} onChange={(event) => setPackagingDraft((current) => ({ ...current, lengthCm: event.target.value }))} placeholder="0" required />
              </label>
              <label>Breedte (cm)
                <input value={packagingDraft.widthCm} onChange={(event) => setPackagingDraft((current) => ({ ...current, widthCm: event.target.value }))} placeholder="0" required />
              </label>
              <label>Hoogte (cm)
                <input value={packagingDraft.heightCm} onChange={(event) => setPackagingDraft((current) => ({ ...current, heightCm: event.target.value }))} placeholder="0" required />
              </label>
              <label>Gewicht doos (kg)
                <input value={packagingDraft.boxWeightKg ?? ''} onChange={(event) => setPackagingDraft((current) => ({ ...current, boxWeightKg: event.target.value }))} placeholder="0" />
              </label>
              <label className="checkbox-field packaging-lining-checkbox">
                <input type="checkbox" checked={Boolean(packagingDraft.hasLining)} onChange={(event) => setPackagingDraft((current) => ({ ...current, hasLining: event.target.checked }))} />
                Met voering
              </label>
              <button className="primary-button" type="submit">Opslaan</button>
              <datalist id="scooter-packaging-model-options">
                {scooterModelOptions.map((model) => <option key={model} value={model} />)}
              </datalist>
            </form>
            <div className="table-wrap scooter-packaging-table-wrap">
              <table className="scooter-packaging-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Type</th>
                    <th>Lengte</th>
                    <th>Breedte</th>
                    <th>Hoogte</th>
                    <th>Volume</th>
                    <th>Voering</th>
                    <th>Doosgewicht</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPackagingSpecs.map((spec) => {
                    const volumeCbm = roundValue((parseDecimal(spec.lengthCm) * parseDecimal(spec.widthCm) * parseDecimal(spec.heightCm)) / 1000000, 4);
                    return (
                      <tr key={spec.id}>
                        <td><strong>{spec.model}</strong></td>
                        <td>{spec.component}</td>
                        <td>{spec.lengthCm} cm</td>
                        <td>{spec.widthCm} cm</td>
                        <td>{spec.heightCm} cm</td>
                        <td>{formatDecimal(volumeCbm, 4)} cbm</td>
                        <td>{spec.hasLining ? 'Ja' : 'Nee'}</td>
                        <td>{spec.boxWeightKg ? `${spec.boxWeightKg} kg` : '-'}</td>
                        <td>
                          <button type="button" className="secondary-button compact-button" onClick={() => setPackagingDraft(spec)}>
                            Bewerken
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedPackagingSpecs.length === 0 ? (
                    <tr><td colSpan={9}>Nog geen scooterverpakkingen opgeslagen.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <section className="panel sales-summary">
        <div><span>Importbatches</span><strong>{data.containerCostBatches.length}</strong></div>
        <div><span>Importregels</span><strong>{visibleContainerCostLines.length}</strong></div>
        <div><span>Laatste order</span><strong>{sortedBatches[0]?.orderNumber || '-'}</strong></div>
      </section>
      <section className="panel table-panel">
        <div className="panel-title"><span className="panel-title-label"><CircleDollarSign size={16} /> Recente importbatches</span></div>
        {printMessage && <div className="notice compact">{printMessage}</div>}
        {sortedBatches.length === 0 ? (
          <div className="empty-state inline">
            <CircleDollarSign size={22} />
            <strong>Nog geen importbatches</strong>
            <span>Maak een batch aan om transport, inklaring en actuele kostprijzen vast te leggen.</span>
          </div>
        ) : (
          <div className="table-wrap import-batches-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordernummer</th>
                  <th>Container</th>
                  <th>Leverancier</th>
                  <th>Goederen netto</th>
                  <th>Logistiek netto</th>
                  <th>Betaling netto</th>
                  <th>Status</th>
                  <th>Datum</th>
                </tr>
              </thead>
              <tbody>
                {sortedBatches.slice(0, 25).map((batch) => {
                  const container = data.containers.find((item) => item.id === batch.containerId);
                  const lines = visibleContainerCostLines
                    .filter((line) => line.batchId === batch.id)
                    .sort((left, right) => {
                      const leftCode = (left.referenceCode || '').trim();
                      const rightCode = (right.referenceCode || '').trim();
                      if (leftCode && rightCode) {
                        return leftCode.localeCompare(rightCode, 'nl', { numeric: true, sensitivity: 'base' });
                      }
                      if (leftCode || rightCode) {
                        return leftCode ? -1 : 1;
                      }
                      return left.description.localeCompare(right.description, 'nl', { numeric: true, sensitivity: 'base' });
                    });
                  const purchaseOrderAddedCount = lines.filter((line) => line.purchaseOrderAdded).length;
                  const isExpanded = expandedBatchId === batch.id;
                  return (
                    <Fragment key={batch.id}>
                      <tr
                        className={`batch-summary-row${isExpanded ? ' is-expanded' : ''}`}
                        onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                      >
                        <td>
                          <button type="button" className="inline-expand-button">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            <span>{batch.orderNumber}</span>
                          </button>
                        </td>
                        <td>{batch.containerNumber || container?.number || '-'}</td>
                        <td>{batch.supplierName || '-'}</td>
                        <td>EUR {batch.goodsNetEur || '-'}</td>
                        <td>EUR {batch.logisticsNetEur || '-'}</td>
                        <td>EUR {batch.paymentNetEur || '-'}</td>
                        <td>{batch.status || 'Concept'}</td>
                        <td>{formatDate(batch.createdAt)}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="batch-detail-row">
                          <td colSpan={8}>
                            <div className="import-batch-details">
                              <div className="import-batch-meta compact">
                                <div className="record-row compact">
                                  <span>Importregels</span>
                                  <strong>{lines.length}</strong>
                                </div>
                                <div className="record-row compact">
                                  <span>Container</span>
                                  <strong>{batch.containerNumber || container?.number || '-'}</strong>
                                </div>
                                <div className="record-row compact">
                                  <span>Leverancier</span>
                                  <strong>{batch.supplierName || '-'}</strong>
                                </div>
                                <div className="record-row compact">
                                  <span>Importeur</span>
                                  <strong>{batch.importerName || '-'}</strong>
                                </div>
                                <div className="record-row compact">
                                  <span>Status</span>
                                  <strong>{batch.status || 'Concept'}</strong>
                                </div>
                                <div className="record-row compact">
                                  <span>Transport</span>
                                  <strong>EUR {batch.transportCostEur}</strong>
                                </div>
                                <div className="record-row compact">
                                  <span>Invoer</span>
                                  <strong>EUR {batch.importCostEur}</strong>
                                </div>
                              </div>
                              <div className="container-command-actions">
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingBatchId(batch.id);
                                    setShowCostModal(true);
                                  }}
                                >
                                  Bewerken
                                </button>
                              </div>
                              {lines.length === 0 ? (
                                <div className="empty-state inline compact">
                                  <CircleDollarSign size={18} />
                                  <strong>Geen regels gevonden</strong>
                                  <span>Deze importbatch heeft nog geen opgeslagen detailregels.</span>
                                </div>
                              ) : (
                                <div className="container-scooter-table-wrap import-batch-lines-wrap">
                                  <table className="container-scooter-table import-batch-lines-table">
                                    <thead>
                                      <tr>
                                        <th>#</th>
                                        <th>Type</th>
                                        <th>Omschrijving</th>
                                        <th>EAN</th>
                                        <th>Aantal</th>
                                        <th>Prijs / stuk (USD)</th>
                                        <th>Inkoopprijs / stuk (EUR)</th>
                                        <th>Kostprijs / stuk (EUR)</th>
                                        <th>
                                          <span className="import-batch-header-stack">
                                            <span>Bestellijst</span>
                                            <span>{purchaseOrderAddedCount}/{lines.length}</span>
                                          </span>
                                        </th>
                                        <th>Label</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lines.map((line, index) => {
                                        const product = findProductForCostLine(data.products, line);
                                        const dutchDescription = product?.shortDescription?.trim()
                                          || product?.labelTitle?.trim()
                                          || product?.description?.trim()
                                          || '';
                                        const englishDescription = line.description.trim();
                                        const hasDistinctDutchDescription = Boolean(
                                          dutchDescription
                                          && dutchDescription.toLowerCase() !== englishDescription.toLowerCase(),
                                        );
                                        const componentParts = line.componentsNote
                                          ?.split(' - ')
                                          .map((part) => part.trim())
                                          .filter(Boolean) ?? [];
                                        const modelInfo = componentParts.find((part) => !part.startsWith('Item No.') && !part.startsWith('Ctn') && !part.includes('Import') && !part.includes('Limited') && !part.includes('Co., Ltd.'));
                                        const oemInfo = componentParts.find((part) => part.startsWith('Item No.'))?.replace(/^Item No\.\s*/i, '');
                                        const ctnInfo = componentParts.find((part) => part.startsWith('Ctn'))?.replace(/^Ctn\s*/i, '');
                                        const supplierInfo = componentParts.find((part) => part.includes('Import') || part.includes('Limited') || part.includes('Co., Ltd.'));
                                        const isPrinted = data.productPackagingRegistrations.some((registration) =>
                                          registration.batchId === batch.id
                                          && registration.containerCostLineId === line.id
                                          && Boolean(registration.labelPrintedAt),
                                        );
                                        return (
                                          <tr key={line.id}>
                                            <td className="import-line-number">{index + 1}</td>
                                            <td>{line.type}</td>
                                            <td className="import-batch-description-cell">
                                              {product ? (
                                                <>
                                                  {hasDistinctDutchDescription ? (
                                                    <button
                                                      type="button"
                                                      className="import-product-title"
                                                      onClick={(event) => {
                                                        event.stopPropagation();
                                                        onSelectProduct(product);
                                                      }}
                                                    >
                                                      {dutchDescription}
                                                    </button>
                                                  ) : null}
                                                  <button
                                                    type="button"
                                                    className={`import-product-title${hasDistinctDutchDescription ? ' import-product-title-secondary' : ''}`}
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      onSelectProduct(product);
                                                    }}
                                                  >
                                                    {englishDescription}
                                                  </button>
                                                </>
                                              ) : (
                                                <strong>{englishDescription}</strong>
                                              )}
                                              <small className="import-batch-description-meta">
                                                <span className="import-batch-meta-line">
                                                  <span>
                                                    <b>Productnummer:</b>{' '}
                                                    {product ? (
                                                      <button
                                                        type="button"
                                                        className="import-product-number"
                                                        onClick={(event) => {
                                                          event.stopPropagation();
                                                          onSelectProduct(product);
                                                        }}
                                                      >
                                                        {line.referenceCode}
                                                      </button>
                                                    ) : line.referenceCode}
                                                  </span>
                                                  {oemInfo ? <span><b>OEM No.:</b> {oemInfo}</span> : null}
                                                </span>
                                                {modelInfo ? (
                                                  <span className="import-batch-meta-line">
                                                    <span><b>Model:</b> {modelInfo}</span>
                                                  </span>
                                                ) : null}
                                                {supplierInfo ? (
                                                  <span className="import-batch-meta-line">
                                                    <span><b>Supplier:</b> {supplierInfo}</span>
                                                  </span>
                                                ) : null}
                                                {ctnInfo ? (
                                                  <span className="import-batch-meta-line">
                                                    <span><b>Ctn:</b> {ctnInfo}</span>
                                                  </span>
                                                ) : null}
                                              </small>
                                            </td>
                                            <td>{product?.barcode || '-'}</td>
                                            <td>{line.quantity}</td>
                                            <td>{line.unitPriceUsd}</td>
                                            <td>{formatDecimal(purchasePricePerUnit(parseDecimal(line.goodsValueEur), parseDecimal(line.quantity)), 4)}</td>
                                            <td>{line.calculatedUnitCostEur}</td>
                                            <td className="import-batch-order-cell">
                                              <label className="import-order-checkbox" title="Toegevoegd aan bestellijst">
                                                <input
                                                  type="checkbox"
                                                  checked={Boolean(line.purchaseOrderAdded)}
                                                  onChange={(event) => {
                                                    void onTogglePurchaseOrderLine(line, event.target.checked);
                                                  }}
                                                />
                                                <span className="sr-only">Toegevoegd aan bestellijst</span>
                                              </label>
                                            </td>
                                            <td className="import-batch-label-cell">
                                              <button
                                                type="button"
                                                className="icon-button import-label-print-button"
                                                title={product ? 'Productlabel printen' : 'Productlabel printen vanaf batchregel'}
                                                aria-label={`Productlabel printen voor ${line.referenceCode}`}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  setPrintMessage('');
                                                  onOpenBatchLabelProduct(batch, line, product);
                                                }}
                                              >
                                                <Printer size={16} />
                                              </button>
                                              {isPrinted ? <CheckCircle2 className="import-label-printed-check" size={17} aria-label="Label geprint" /> : null}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {showCostModal && (
        <ContainerCostModal
          containers={sortedContainers}
          products={data.products}
          scooters={data.scooters}
          scooterPackagingSpecs={data.scooterPackagingSpecs}
          suppliers={data.suppliers}
          importers={data.importers}
          initialBatch={editingBatch}
          initialLines={editingBatchLines}
          onClose={() => { setShowCostModal(false); setEditingBatchId(null); }}
          onSave={async (batch, lines, productUpdates) => {
            await onSaveCostBatch(batch, lines, productUpdates);
            setShowCostModal(false);
            setEditingBatchId(null);
          }}
        />
      )}
    </>
  );
}

function ContainerCostModal({
  containers,
  products,
  scooters,
  scooterPackagingSpecs,
  suppliers,
  importers,
  initialBatch,
  initialLines,
  onClose,
  onSave,
}: {
  containers: Container[];
  products: Product[];
  scooters: Scooter[];
  scooterPackagingSpecs: ScooterPackagingSpec[];
  suppliers: Supplier[];
  importers: Importer[];
  initialBatch?: ContainerCostBatch;
  initialLines?: ContainerCostLine[];
  onClose: () => void;
  onSave: (batch: ContainerCostBatch, lines: ContainerCostLine[], productUpdates: Product[]) => Promise<void>;
}) {
  const initialCostItemState = parseBatchCostItems(initialBatch);
  const initialPackagingCompliance = parseBatchPackagingCompliance(initialBatch);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [batchStatus, setBatchStatus] = useState<'Concept' | 'Definitief'>(initialBatch?.status || 'Concept');
  const [containerNumber, setContainerNumber] = useState(initialBatch?.containerNumber ?? containers[0]?.number ?? '');
  const [containerProfile, setContainerProfile] = useState<(typeof containerVolumePresets)[number]['value']>((initialBatch?.containerProfile as (typeof containerVolumePresets)[number]['value']) || '40hc');
  const [containerVolumeCbm, setContainerVolumeCbm] = useState(initialBatch?.containerVolumeCbm ?? '76,3');
  const [orderNumber, setOrderNumber] = useState(initialBatch?.orderNumber ?? '');
  const [supplierName, setSupplierName] = useState(initialBatch?.supplierName ?? '');
  const [exchangeRate, setExchangeRate] = useState(initialBatch?.exchangeRate ? String(initialBatch.exchangeRate).replace('.', ',') : '0,92');
  const [chinaTransportUsd, setChinaTransportUsd] = useState(initialBatch?.chinaTransportUsd ?? '0');
  const [airMailRows, setAirMailRows] = useState<AirMailCostDraftRow[]>(initialCostItemState.airMailRows);
  const [costItems, setCostItems] = useState<ContainerCostDraftItem[]>(() => initialCostItemState.costItems);
  const [paymentNetOverrideEur, setPaymentNetOverrideEur] = useState(initialBatch?.paymentNetOverrideEur ? String(initialBatch.paymentNetOverrideEur).replace('.', ',') : '');
  const [exactReference, setExactReference] = useState(initialBatch?.exactReference ?? '');
  const [packagingComplianceScope, setPackagingComplianceScope] = useState<BatchPackagingScope>(initialPackagingCompliance.scope || 'Eigen import');
  const [packagingComplianceReportingMode, setPackagingComplianceReportingMode] = useState<BatchPackagingReportingMode>(initialPackagingCompliance.reportingMode || 'Alles registreren');
  const [packagingComplianceExactSource, setPackagingComplianceExactSource] = useState<BatchPackagingExactSource>(initialPackagingCompliance.exactSource || 'Ordernummer');
  const [packagingComplianceProfileName, setPackagingComplianceProfileName] = useState(initialPackagingCompliance.profileName ?? '');
  const [packagingComplianceNotes, setPackagingComplianceNotes] = useState(initialPackagingCompliance.notes ?? '');
  const [notes, setNotes] = useState(initialBatch?.notes ?? '');
  const [content, setContent] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [draftLines, setDraftLines] = useState<ContainerCostImportDraftLine[]>(
    () => (initialLines ?? []).filter((line) => line.type !== 'scooter').map((line, index) => ({
      id: `draft-existing-${index + 1}-${line.referenceCode}`.replace(/[^a-z0-9-]/gi, '').toLowerCase(),
      type: line.type,
      referenceCode: line.referenceCode,
      description: line.description,
      quantity: line.quantity,
      volumeCbm: line.volumeCbm,
      unitPriceUsd: line.unitPriceUsd,
      amountUsd: formatDecimal(parseDecimal(line.unitPriceUsd) * parseDecimal(line.quantity), 4),
      componentsNote: line.componentsNote,
      purchaseOrderAdded: line.purchaseOrderAdded,
    })),
  );
  const [scooterVolumeRows, setScooterVolumeRows] = useState<ScooterVolumeDraftRow[]>(() => parseInitialScooterVolumeRows(initialLines));
  const [saving, setSaving] = useState(false);
  const normalizedContainerNumber = containerNumber.trim().toLowerCase();
  const selectedContainer = containers.find((container) => container.number.trim().toLowerCase() === normalizedContainerNumber);
  const selectedContainerId = selectedContainer?.id;
  const selectedSupplierRecord = suppliers.find((supplier) => supplierNameMatches(supplier, supplierName));
  const linkedImporter = importers.find((importer) => importer.id === selectedSupplierRecord?.importerId);
  const supplierOptions = suppliers.map((supplier) => supplier.name).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const scooterModelOptions = Array.from(new Set(scooters.map((scooter) => scooter.model.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));

  function updateCostItem(id: string, patch: Partial<ContainerCostDraftItem>) {
    setCostItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addFixedCostItem() {
    setCostItems((current) => [
      ...current,
      {
        id: nextCostItemId(),
        label: 'Nieuwe factuurregel',
        category: 'other',
        mode: 'value',
        kind: 'fixed',
        amountEur: '0',
        dutyRate: '0',
        appliesTo: 'all',
      },
    ]);
  }

  function addDutyCostItem() {
    setCostItems((current) => [
      ...current,
      {
        id: nextCostItemId(),
        label: 'Nieuwe douane helper',
        category: 'import',
        mode: 'value',
        kind: 'duty',
        amountEur: '0',
        dutyRate: '0',
        appliesTo: 'all',
      },
    ]);
  }

  function resetCostItemsToInvoiceTemplate() {
    setCostItems(defaultContainerCostItems());
  }

  function addScooterVolumeRow() {
    setScooterVolumeRows((current) => [
      ...current,
      { ...emptyScooterVolumeRows()[0] },
    ]);
  }

  function updateScooterVolumeRow(id: string, patch: Partial<ScooterVolumeDraftRow>) {
    setScooterVolumeRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      const nextRow = { ...row, ...patch };
      const matchingSpec = scooterPackagingSpecs.find((spec) =>
        normalizedSupplierKey(spec.model) === normalizedSupplierKey(nextRow.model)
        && spec.component === nextRow.component,
      );

      if (!matchingSpec || (!('model' in patch) && !('component' in patch))) return nextRow;

      return {
        ...nextRow,
        lengthCm: matchingSpec.lengthCm,
        widthCm: matchingSpec.widthCm,
        heightCm: matchingSpec.heightCm,
      };
    }));
  }

  function removeScooterVolumeRow(id: string) {
    setScooterVolumeRows((current) => current.length === 1
      ? emptyScooterVolumeRows()
      : current.filter((row) => row.id !== id));
  }

  function addAirMailRow() {
    setAirMailRows((current) => [
      ...current,
      { id: nextAirMailCostRowId(), label: `Luchtpost ${current.length + 1}`, amountUsd: '0' },
    ]);
  }

  function updateAirMailRow(id: string, patch: Partial<AirMailCostDraftRow>) {
    setAirMailRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function removeAirMailRow(id: string) {
    setAirMailRows((current) => current.length === 1
      ? emptyAirMailRows()
      : current.filter((row) => row.id !== id));
  }

  async function handleCostImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedContent = await readContainerCostImportFile(file);
      setContent(importedContent);
      setDraftLines(parseContainerCostContent(importedContent));
      setImportFileName(file.name);
    } finally {
      event.target.value = '';
    }
  }

  function removeCostItem(id: string) {
    setCostItems((current) => current.filter((item) => item.id !== id));
  }

  const scooterDraftLines: ContainerCostImportDraftLine[] = scooterVolumeRows
    .map((row, index): ContainerCostImportDraftLine | null => {
      const quantity = Math.max(0, parseDecimal(row.quantity));
      const lengthCm = Math.max(0, parseDecimal(row.lengthCm));
      const widthCm = Math.max(0, parseDecimal(row.widthCm));
      const heightCm = Math.max(0, parseDecimal(row.heightCm));
      const unitVolumeCbm = roundValue((lengthCm * widthCm * heightCm) / 1000000, 4);

      if (!row.model.trim() || quantity <= 0 || unitVolumeCbm <= 0) return null;

      return {
        id: `scooter-draft-${index + 1}-${row.model}-${row.component}`.replace(/[^a-z0-9-]/gi, '').toLowerCase(),
        type: 'scooter',
        referenceCode: `${row.model.trim()}-${row.component}`,
        description: `${row.model.trim()} ${row.component}`,
        quantity: formatCompactDecimal(quantity, 3),
        volumeCbm: formatDecimal(unitVolumeCbm, 4),
        unitPriceUsd: row.unitPriceUsd.trim() || '0',
        componentsNote: `${row.component} - ${formatCompactDecimal(lengthCm, 1)} x ${formatCompactDecimal(widthCm, 1)} x ${formatCompactDecimal(heightCm, 1)} cm`,
        purchaseOrderAdded: row.purchaseOrderAdded,
      };
    })
    .filter((line): line is ContainerCostImportDraftLine => Boolean(line));

  const mergedDraftLines = initialBatch && !importFileName
    ? draftLines
    : mergeContainerCostDraftLines(draftLines);
  const importLines = [...scooterDraftLines, ...mergedDraftLines];

  const computedLines = importLines.map((line) => {
    const quantity = Math.max(1, parseDecimal(line.quantity));
    const volumeCbm = Math.max(0, parseDecimal(line.volumeCbm));
    const unitPriceUsd = Math.max(0, parseDecimal(line.unitPriceUsd));
    const amountUsd = Math.max(0, parseDecimal(line.amountUsd));
    const referenceCodeKey = line.referenceCode.trim().toLowerCase();
    const articleNumberKey = line.articleNumber?.trim().toLowerCase() || '';
    const supplierItemKey = line.supplierItemNo?.trim().toLowerCase() || '';
    const supplierNameKey = normalizedSupplierKey(line.supplierName || supplierName);
    const descriptionKey = line.description.trim().toLowerCase();
    const matchedProduct = products.find((product) => {
      const productCodeKey = product.code.trim().toLowerCase();
      const productSupplierItemKey = product.supplierItemNo?.trim().toLowerCase() || '';
      const productSupplierKey = normalizedSupplierKey(product.supplier);
      const productDescriptionKey = product.description.trim().toLowerCase();
      return productCodeKey === referenceCodeKey
        || (articleNumberKey && productCodeKey === articleNumberKey)
        || (supplierItemKey
          && productSupplierItemKey === supplierItemKey
          && (!supplierNameKey || productSupplierKey === supplierNameKey))
        || (!articleNumberKey
          && !supplierItemKey
          && productDescriptionKey === descriptionKey
          && (!supplierNameKey || productSupplierKey === supplierNameKey));
    });
    const matchedScooter = scooters.find((scooter) => scooter.frameNumber.trim().toLowerCase() === line.referenceCode.trim().toLowerCase());
    const goodsValueUsdBase = amountUsd > 0 ? amountUsd : roundValue(quantity * unitPriceUsd, 4);

    return {
      ...line,
      quantity,
      volumeCbm,
      unitPriceUsd,
      amountUsd,
      goodsValueUsdBase,
      goodsValueEurBase: roundValue(goodsValueUsdBase * parseDecimal(exchangeRate), 4),
      matchedProduct,
      matchedScooter,
      referenceId: matchedProduct?.id ?? matchedScooter?.id,
      normalizedDescription: line.description || matchedProduct?.description || matchedScooter?.model || line.referenceCode,
    };
  });

  const totalVolume = computedLines.reduce((sum, line) => sum + (line.volumeCbm * line.quantity), 0);
  const scooterVolumeTotal = computedLines
    .filter((line) => line.type === 'scooter')
    .reduce((sum, line) => sum + (line.volumeCbm * line.quantity), 0);
  const scooterCountTotal = computedLines
    .filter((line) => line.type === 'scooter')
    .reduce((sum, line) => sum + line.quantity, 0);
  const selectedContainerVolume = parseDecimal(containerVolumeCbm);
  const volumeUsagePercent = selectedContainerVolume > 0 ? Math.min(999, roundValue((totalVolume / selectedContainerVolume) * 100, 1)) : 0;
  const totalGoodsValue = computedLines.reduce((sum, line) => sum + line.goodsValueEurBase, 0);
  const totalGoodsValueUsd = computedLines.reduce((sum, line) => sum + line.goodsValueUsdBase, 0);
  const chinaTransportEur = roundValue(parseDecimal(chinaTransportUsd) * parseDecimal(exchangeRate), 4);
  const airMailTransportItems: ResolvedContainerCostItem[] = airMailRows.flatMap((row, index) => {
      const amountUsd = parseDecimal(row.amountUsd);
      if (amountUsd <= 0) return [];
      return [{
        id: `airmail-${row.id}`,
        label: row.label.trim() || `Luchtpost ${index + 1}`,
        category: 'transport' as const,
        mode: 'value' as const,
        kind: 'fixed' as const,
        amountEur: '0',
        dutyRate: '0',
        appliesTo: 'non-scooter' as const,
        resolvedAmountEur: roundValue(amountUsd * parseDecimal(exchangeRate), 4),
      }];
    });
  const totalAirMailUsd = airMailRows.reduce((sum, row) => sum + parseDecimal(row.amountUsd), 0);
  const totalAirMailEur = airMailTransportItems.reduce((sum, item) => sum + item.resolvedAmountEur, 0);
  const chinaTransportItem: ResolvedContainerCostItem | null = chinaTransportEur > 0
    ? {
      id: 'china-transport',
      label: 'Containertransport China',
      category: 'transport',
      mode: 'volume',
      kind: 'fixed',
      amountEur: formatDecimal(chinaTransportEur, 4),
      dutyRate: '0',
      appliesTo: 'all',
      resolvedAmountEur: chinaTransportEur,
    }
    : null;

  const resolvedCostItems: ResolvedContainerCostItem[] = costItems.map((item) => {
    const fixedAmount = parseDecimal(item.amountEur);
    if (item.kind === 'fixed') {
      return { ...item, resolvedAmountEur: fixedAmount };
    }

    const dutyRate = parseDecimal(item.dutyRate) / 100;
    const dutyBase = computedLines.reduce((sum, line) => {
      const applies = item.appliesTo === 'all'
        || (item.appliesTo === 'scooter' && line.type === 'scooter')
        || (item.appliesTo === 'onderdeel' && line.type === 'onderdeel')
        || (item.appliesTo === 'samengesteld' && line.type === 'samengesteld')
        || (item.appliesTo === 'non-scooter' && line.type !== 'scooter');
      return sum + (applies ? line.goodsValueEurBase : 0);
    }, 0);

    return { ...item, resolvedAmountEur: roundValue(dutyBase * dutyRate, 4) };
  });
  const allResolvedCostItems: ResolvedContainerCostItem[] = [
    ...(chinaTransportItem ? [chinaTransportItem] : []),
    ...resolvedCostItems,
    ...airMailTransportItems,
  ];

  const transportPool = allResolvedCostItems.filter((item) => item.category === 'transport').reduce((sum, item) => sum + item.resolvedAmountEur, 0);
  const importPool = allResolvedCostItems.filter((item) => item.category === 'import').reduce((sum, item) => sum + item.resolvedAmountEur, 0);
  const otherPool = allResolvedCostItems.filter((item) => item.category === 'other').reduce((sum, item) => sum + item.resolvedAmountEur, 0);
  const logisticsNetEur = roundValue(transportPool + importPool + otherPool, 4);
  const goodsNetEur = roundValue(totalGoodsValue, 4);
  const calculatedPaymentNetEur = roundValue(goodsNetEur + logisticsNetEur, 4);
  const finalPaymentNetEur = paymentNetOverrideEur.trim() ? parseDecimal(paymentNetOverrideEur) : calculatedPaymentNetEur;

  function handleContainerProfileChange(value: (typeof containerVolumePresets)[number]['value']) {
    setContainerProfile(value);
    const preset = containerVolumePresets.find((item) => item.value === value);
    if (!preset || value === 'custom') return;
    setContainerVolumeCbm(formatCompactDecimal(preset.volumeCbm, 1).replace('.', ','));
  }

  function costItemAppliesToLine(item: ResolvedContainerCostItem, line: (typeof computedLines)[number]) {
    return item.appliesTo === 'all'
      || (item.appliesTo === 'scooter' && line.type === 'scooter')
      || (item.appliesTo === 'onderdeel' && line.type === 'onderdeel')
      || (item.appliesTo === 'samengesteld' && line.type === 'samengesteld')
      || (item.appliesTo === 'non-scooter' && line.type !== 'scooter');
  }

  const calculatedLines = computedLines.map((line) => {
    const lineVolumeTotal = line.volumeCbm * line.quantity;
    const volumeShare = totalVolume > 0 ? lineVolumeTotal / totalVolume : 0;
    let allocatedTransportEur = 0;
    let allocatedImportEur = 0;
    let allocatedOtherEur = 0;

    allResolvedCostItems.forEach((item) => {
      const applies = costItemAppliesToLine(item, line);
      const applicableValueTotal = applies
        ? computedLines
          .filter((targetLine) => costItemAppliesToLine(item, targetLine))
          .reduce((sum, targetLine) => sum + targetLine.goodsValueEurBase, 0)
        : 0;
      const applicableValueShare = applicableValueTotal > 0 ? line.goodsValueEurBase / applicableValueTotal : 0;
      let itemShare = 0;

      if (applies && (item.category === 'transport' || item.category === 'other') && item.kind !== 'duty' && item.mode === 'volume') {
        const applicableScooterVolume = computedLines
          .filter((targetLine) => targetLine.type === 'scooter' && costItemAppliesToLine(item, targetLine))
          .reduce((sum, targetLine) => sum + (targetLine.volumeCbm * targetLine.quantity), 0);
        const scooterOccupiedShare = selectedContainerVolume > 0
          ? Math.min(1, applicableScooterVolume / selectedContainerVolume)
          : 0;
        const applicableNonScooterValue = computedLines
          .filter((targetLine) => targetLine.type !== 'scooter' && costItemAppliesToLine(item, targetLine))
          .reduce((sum, targetLine) => sum + targetLine.goodsValueEurBase, 0);
        const hasScooterTarget = applicableScooterVolume > 0;
        const hasNonScooterTarget = applicableNonScooterValue > 0;
        const splitByContainerOccupancy = selectedContainerVolume > 0 && hasScooterTarget && hasNonScooterTarget;

        if (line.type === 'scooter') {
          itemShare = splitByContainerOccupancy
            ? lineVolumeTotal / selectedContainerVolume
            : (applicableScooterVolume > 0 ? lineVolumeTotal / applicableScooterVolume : 0);
        } else {
          const nonScooterPoolShare = splitByContainerOccupancy ? Math.max(0, 1 - scooterOccupiedShare) : 1;
          const nonScooterValueShare = applicableNonScooterValue > 0 ? line.goodsValueEurBase / applicableNonScooterValue : 0;
          itemShare = nonScooterPoolShare * nonScooterValueShare;
        }
      } else if (applies && item.kind === 'duty') {
        itemShare = applicableValueShare;
      } else if (applies) {
        itemShare = item.mode === 'volume' ? volumeShare : applicableValueShare;
      }
      const allocation = roundValue(item.resolvedAmountEur * itemShare, 4);

      if (item.category === 'transport') allocatedTransportEur += allocation;
      if (item.category === 'import') allocatedImportEur += allocation;
      if (item.category === 'other') allocatedOtherEur += allocation;
    });

    allocatedTransportEur = roundValue(allocatedTransportEur, 4);
    allocatedImportEur = roundValue(allocatedImportEur, 4);
    allocatedOtherEur = roundValue(allocatedOtherEur, 4);
    const calculatedUnitCostEur = line.quantity > 0
      ? roundValue((line.goodsValueEurBase + allocatedTransportEur + allocatedImportEur + allocatedOtherEur) / line.quantity, 4)
      : 0;

    return {
      ...line,
      lineVolumeTotal,
      allocatedTransportEur,
      allocatedImportEur,
      allocatedOtherEur,
      calculatedUnitCostEur,
    };
  });

  function importDutyRateForLine(line: (typeof calculatedLines)[number]) {
    return allResolvedCostItems
      .filter((item) => {
        const applies = item.category === 'import' && item.kind === 'duty' && (
          item.appliesTo === 'all'
          || (item.appliesTo === 'scooter' && line.type === 'scooter')
          || (item.appliesTo === 'onderdeel' && line.type === 'onderdeel')
          || (item.appliesTo === 'samengesteld' && line.type === 'samengesteld')
          || (item.appliesTo === 'non-scooter' && line.type !== 'scooter')
        );
        return applies;
      })
      .reduce((sum, item) => sum + parseDecimal(item.dutyRate), 0);
  }

  async function handleSave() {
    if (!containerNumber.trim() || !orderNumber.trim() || calculatedLines.length === 0) return;
    setSaving(true);
    try {
      const batchId = initialBatch?.id ?? stableId('container-cost-batch', `${containerNumber}-${orderNumber}-${Date.now()}`);
      const packagingComplianceConfig: BatchPackagingComplianceConfig = {
        scope: packagingComplianceScope,
        reportingMode: packagingComplianceReportingMode,
        exactSource: packagingComplianceExactSource,
        profileName: packagingComplianceProfileName.trim() || undefined,
        notes: packagingComplianceNotes.trim() || undefined,
      };
      const batch: ContainerCostBatch = {
        id: batchId,
        status: batchStatus,
        containerId: selectedContainerId,
        containerNumber: containerNumber.trim(),
        containerProfile: containerProfile,
        containerVolumeCbm: containerVolumeCbm.trim() || undefined,
        orderNumber: orderNumber.trim(),
        supplierName: supplierName.trim() || undefined,
        importerId: linkedImporter?.id,
        importerName: linkedImporter?.name,
        importerAddress: linkedImporter?.address,
        importerPostalCode: linkedImporter?.postalCode,
        importerCity: linkedImporter?.city,
        importerCountry: linkedImporter?.country,
        importerEmail: linkedImporter?.email,
        importerWebsite: linkedImporter?.website,
        currency: 'USD',
        exchangeRate: formatDecimal(parseDecimal(exchangeRate), 4),
        chinaTransportUsd: parseDecimal(chinaTransportUsd) > 0 ? formatDecimal(parseDecimal(chinaTransportUsd), 2) : undefined,
        transportCostEur: formatDecimal(transportPool, 2),
        importCostEur: formatDecimal(importPool, 2),
        otherCostEur: otherPool > 0 ? formatDecimal(otherPool, 2) : undefined,
        transportAllocationMode: 'volume',
        importAllocationMode: 'value',
        costItemsJson: JSON.stringify([...resolvedCostItems, ...airMailTransportItems].map(({ resolvedAmountEur, ...item }) => ({ ...item, resolvedAmountEur: formatDecimal(resolvedAmountEur, 4) }))),
        goodsNetEur: formatDecimal(goodsNetEur, 2),
        logisticsNetEur: formatDecimal(logisticsNetEur, 2),
        paymentNetEur: formatDecimal(finalPaymentNetEur, 2),
        paymentNetOverrideEur: paymentNetOverrideEur.trim() ? formatDecimal(parseDecimal(paymentNetOverrideEur), 2) : undefined,
        exactReference: exactReference.trim() || undefined,
        packagingComplianceJson: JSON.stringify(packagingComplianceConfig),
        notes: notes.trim() || undefined,
        createdAt: initialBatch?.createdAt || new Date().toISOString(),
      };

      const autoProductDrafts = new Map<string, Product>();
      const autoLineKeys = new Map<string, string>();

      calculatedLines
        .filter((line) => line.type !== 'scooter' && !line.matchedProduct)
        .forEach((line) => {
          const resolvedArticleNumber = line.articleNumber?.trim() || line.referenceCode.trim();
          const autoKey = [
            resolvedArticleNumber.toLowerCase(),
            normalizedSupplierKey(line.supplierName || supplierName),
            line.supplierItemNo?.trim().toLowerCase() || '',
            line.normalizedDescription.trim().toLowerCase(),
          ].join('|');

          autoLineKeys.set(line.id, autoKey);
          if (autoProductDrafts.has(autoKey)) return;

          autoProductDrafts.set(autoKey, {
            id: stableId('product', `${orderNumber.trim()}-${line.referenceCode}-${line.id}`),
            code: resolvedArticleNumber,
            supplierItemNo: line.supplierItemNo?.trim() || undefined,
            description: line.normalizedDescription,
            supplier: line.supplierName?.trim() || supplierName.trim() || undefined,
            articleGroup: line.type === 'samengesteld' ? 'Samengesteld product' : 'Standaard - Scooter onderdelen',
            purchasePrice: formatDecimal(purchasePricePerUnit(line.goodsValueEurBase, line.quantity), 4),
            costPrice: formatDecimal(line.calculatedUnitCostEur, 4),
            batch: orderNumber.trim(),
            countryOfOrigin: 'China',
            webshop: false,
            isNewProduct: true,
            createdAt: new Date().toISOString(),
          });
        });

      const normalizedCreatedProducts = normalizeImportedProducts(
        Array.from(autoProductDrafts.values()),
        products,
      ).map((product) => ({
        ...product,
        isNewProduct: true,
        createdAt: product.createdAt || new Date().toISOString(),
      }));

      const createdProductsByKey = new Map(Array.from(autoProductDrafts.keys()).map((key, index) => [key, normalizedCreatedProducts[index]]));

      const resolvedProductUpdates = new Map<string, Product>();

      calculatedLines
        .filter((line) => line.type !== 'scooter')
        .forEach((line) => {
          const createdProduct = createdProductsByKey.get(autoLineKeys.get(line.id) || '');
          const resolvedProduct = line.matchedProduct || createdProduct;
          if (!resolvedProduct) return;

          resolvedProductUpdates.set(resolvedProduct.id, {
            ...resolvedProduct,
            purchasePrice: formatDecimal(purchasePricePerUnit(line.goodsValueEurBase, line.quantity), 4),
            costPrice: formatDecimal(line.calculatedUnitCostEur, 4),
            batch: orderNumber.trim(),
            supplier: resolvedProduct.supplier || line.supplierName?.trim() || supplierName.trim() || undefined,
            supplierItemNo: resolvedProduct.supplierItemNo || line.supplierItemNo?.trim() || undefined,
            isNewProduct: resolvedProduct.isNewProduct,
            createdAt: resolvedProduct.createdAt,
          });
        });

      const linesWithResolvedProducts: ContainerCostLine[] = calculatedLines.map((line, index) => {
        const createdProduct = createdProductsByKey.get(autoLineKeys.get(line.id) || '');
        const resolvedProduct = line.type === 'scooter' ? undefined : line.matchedProduct || createdProduct;
        const lineId = stableId('container-cost-line', `${batchId}-${(resolvedProduct?.code || line.referenceCode)}-${index + 1}`);
        const previousLine = initialLines?.find((item) => item.id === lineId);

        return {
          id: lineId,
          batchId,
          type: line.type,
          referenceId: resolvedProduct?.id ?? line.referenceId,
          referenceCode: resolvedProduct?.code || line.referenceCode,
          description: line.normalizedDescription,
          quantity: formatCompactDecimal(line.quantity, 3),
          volumeCbm: formatDecimal(line.volumeCbm, 4),
          unitPriceUsd: formatDecimal(line.unitPriceUsd, 4),
          goodsValueEur: formatDecimal(line.goodsValueEurBase, 4),
          allocatedTransportEur: formatDecimal(line.allocatedTransportEur, 4),
          allocatedImportEur: formatDecimal(line.allocatedImportEur, 4),
          allocatedOtherEur: formatDecimal(line.allocatedOtherEur, 4),
          calculatedUnitCostEur: formatDecimal(line.calculatedUnitCostEur, 4),
          componentsNote: line.componentsNote,
          purchaseOrderAdded: line.purchaseOrderAdded ?? previousLine?.purchaseOrderAdded ?? false,
        };
      });

      await onSave(batch, linesWithResolvedProducts, Array.from(resolvedProductUpdates.values()));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card container-cost-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span>Containers</span>
            <h2>{initialBatch ? 'Import China batch bewerken' : 'Import China batch'}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <div className="container-cost-layout">
          <section className="container-cost-hero">
            <div className="container-cost-hero-copy">
              <span>Kostprijs, containerinhoud en betaling in een scherm.</span>
            </div>
            <div className="container-cost-hero-stats">
              <div><span>Container</span><strong>{containerNumber || '-'}</strong></div>
              <div><span>Order</span><strong>{orderNumber || '-'}</strong></div>
              <div><span>Status</span><strong>{batchStatus}</strong></div>
              <div><span>China transport</span><strong>USD {formatDecimal(parseDecimal(chinaTransportUsd), 2)}</strong></div>
              <div><span>Container volume</span><strong>{containerVolumeCbm || '-'} cbm</strong></div>
              <div><span>Scooters</span><strong>{formatCompactDecimal(scooterCountTotal, 0)}</strong></div>
              <div><span>Gebruikt</span><strong>{formatCompactDecimal(totalVolume, 3)} cbm</strong></div>
              <div><span>Bezetting</span><strong>{selectedContainerVolume > 0 ? `${String(volumeUsagePercent).replace('.', ',')}%` : '-'}</strong></div>
            </div>
          </section>

          <div className="container-cost-top-grid">
          <section className="product-form-subsection container-cost-card">
            <h3>Container en order</h3>
            <div className="form-grid">
              <label>Status
                <select value={batchStatus} onChange={(event) => setBatchStatus(event.target.value as 'Concept' | 'Definitief')}>
                  <option value="Concept">Concept</option>
                  <option value="Definitief">Definitief</option>
                </select>
              </label>
              <label>Containernummer
                <input
                  list="container-number-options"
                  value={containerNumber}
                  onChange={(event) => setContainerNumber(event.target.value)}
                  placeholder="Bijv. FSCU8979996"
                />
                <datalist id="container-number-options">
                  {containers.map((container) => <option key={container.id} value={container.number}>{container.number} - {container.invoiceNumber}</option>)}
                </datalist>
              </label>
              <label>Ordernummer / batch onderdelen
                <input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="bijv. WL-2026-041" />
              </label>
              <label>Leverancier
                <input list="supplier-cost-options" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="bijv. Mortch Motor Limited" />
                <datalist id="supplier-cost-options">
                  {supplierOptions.map((option) => <option key={option} value={option} />)}
                </datalist>
              </label>
              <label>Importeur / EU-verantwoordelijke
                <input value={linkedImporter?.name ?? ''} placeholder="Automatisch via fabrikant" readOnly />
              </label>
              <label>Valuta
                <input value="USD" disabled />
              </label>
              <label>Wisselkoers USD - EUR
                <input value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} />
              </label>
              <label>Containertransport China (USD)
                <input value={chinaTransportUsd} onChange={(event) => setChinaTransportUsd(event.target.value)} placeholder="Bijv. 4200" />
              </label>
            </div>
            <div className="product-form-subsection container-cost-subsection">
              <div className="section-header-with-actions compact-header">
                <div>
                  <h4>Luchtpost</h4>
                  <p className="section-subtitle">Voeg USD verzendkosten toe die alleen over de onderdelen worden verdeeld.</p>
                </div>
                <button type="button" className="secondary-button" onClick={addAirMailRow}><Plus size={16} /> Regel toevoegen</button>
              </div>
              <div className="airmail-row-list">
                {airMailRows.map((row) => (
                  <div className="airmail-row" key={row.id}>
                    <input value={row.label} onChange={(event) => updateAirMailRow(row.id, { label: event.target.value })} placeholder="Bijv. FEDEX onderdelen" />
                    <input value={row.amountUsd} onChange={(event) => updateAirMailRow(row.id, { amountUsd: event.target.value })} placeholder="USD bedrag" />
                    <div className="airmail-row-total">EUR {formatDecimal(parseDecimal(row.amountUsd) * parseDecimal(exchangeRate), 2)}</div>
                    <button type="button" className="danger-icon-button" onClick={() => removeAirMailRow(row.id)} aria-label="Luchtpostregel verwijderen">
                      <XCircle size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="product-table-intro compact">
                <span>Totaal luchtpost: USD {formatDecimal(totalAirMailUsd, 2)} / EUR {formatDecimal(totalAirMailEur, 2)}</span>
              </div>
            </div>
            <div className="form-grid">
              <label className="span-2">Notities
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optioneel: opmerking over containerinhoud, samengestelde sets of correcties." />
              </label>
            </div>
            <div className="product-form-subsection container-cost-subsection container-compliance-section">
              <div className="section-header-with-actions compact-header">
                <div>
                  <h4>Verpakkingscompliance</h4>
                  <p className="section-subtitle">Leg per importbatch vast of deze order voor Verpact meetelt en hoe Exact deze batch later moet teruggeven.</p>
                </div>
              </div>
              <div className="form-grid">
                <label>Scope
                  <select value={packagingComplianceScope} onChange={(event) => setPackagingComplianceScope(event.target.value as BatchPackagingScope)}>
                    {batchPackagingScopeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>Rapportage
                  <select value={packagingComplianceReportingMode} onChange={(event) => setPackagingComplianceReportingMode(event.target.value as BatchPackagingReportingMode)}>
                    {batchPackagingReportingModeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>Exact batchbron
                  <select value={packagingComplianceExactSource} onChange={(event) => setPackagingComplianceExactSource(event.target.value as BatchPackagingExactSource)}>
                    {batchPackagingExactSourceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label>Profiel / scenario
                  <input value={packagingComplianceProfileName} onChange={(event) => setPackagingComplianceProfileName(event.target.value)} placeholder="Bijv. SUP zakje, karton doosje, mixbatch" />
                </label>
                <label className="span-2">Compliance notitie
                  <textarea value={packagingComplianceNotes} onChange={(event) => setPackagingComplianceNotes(event.target.value)} placeholder="Bijv. vanaf deze batch doosje in plaats van zakje, of alleen eigen import meetellen." />
                </label>
              </div>
            </div>
            <div className="container-volume-planner">
              <div className="section-header-with-actions compact-header">
                <div>
                  <h4>Scooters in container</h4>
                  <p className="section-subtitle">Voeg per model een regel toe. Kies `CBU` of `SKD`, vul aantal en afmetingen in.</p>
                </div>
                <button type="button" className="secondary-button" onClick={addScooterVolumeRow}><Plus size={16} /> Model toevoegen</button>
              </div>
              <div className="container-volume-toolbar">
                <label>Containertype
                  <select value={containerProfile} onChange={(event) => handleContainerProfileChange(event.target.value as (typeof containerVolumePresets)[number]['value'])}>
                    {containerVolumePresets.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}{preset.volumeCbm > 0 ? ` - ${String(preset.volumeCbm).replace('.', ',')} cbm` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {containerProfile === 'custom' && (
                  <label>Containervolume (cbm)
                    <input value={containerVolumeCbm} onChange={(event) => setContainerVolumeCbm(event.target.value)} />
                  </label>
                )}
                <div className="container-volume-summary">
                  <span>Totaal scooter volume</span>
                  <strong>{formatCompactDecimal(scooterVolumeTotal, 3)} cbm</strong>
                  <small>{scooterVolumeRows.length} modelregel{ scooterVolumeRows.length === 1 ? '' : 's' }</small>
                </div>
              </div>
              <div className="scooter-volume-list">
                <div className="scooter-volume-header" aria-hidden="true">
                  <span>Model</span>
                  <span>Type</span>
                  <span>Aantal</span>
                  <span>Lengte (cm)</span>
                  <span>Breedte (cm)</span>
                  <span>Hoogte (cm)</span>
                  <span>USD / stuk</span>
                  <span>Volume / stuk</span>
                  <span></span>
                </div>
                {scooterVolumeRows.map((row) => {
                  const unitVolumeCbm = roundValue((Math.max(0, parseDecimal(row.lengthCm)) * Math.max(0, parseDecimal(row.widthCm)) * Math.max(0, parseDecimal(row.heightCm))) / 1000000, 4);
                  return (
                    <div className="scooter-volume-row" key={row.id}>
                      <input list="scooter-model-options" value={row.model} onChange={(event) => updateScooterVolumeRow(row.id, { model: event.target.value })} placeholder="Bijv. RSO Sense" />
                      <select value={row.component} onChange={(event) => updateScooterVolumeRow(row.id, { component: event.target.value as ScooterVolumeDraftRow['component'] })}>
                        <option value="CBU">CBU</option>
                        <option value="SKD">SKD</option>
                      </select>
                      <input value={row.quantity} onChange={(event) => updateScooterVolumeRow(row.id, { quantity: event.target.value })} placeholder="0" />
                      <input value={row.lengthCm} onChange={(event) => updateScooterVolumeRow(row.id, { lengthCm: event.target.value })} placeholder="0" />
                      <input value={row.widthCm} onChange={(event) => updateScooterVolumeRow(row.id, { widthCm: event.target.value })} placeholder="0" />
                      <input value={row.heightCm} onChange={(event) => updateScooterVolumeRow(row.id, { heightCm: event.target.value })} placeholder="0" />
                      <input value={row.unitPriceUsd} onChange={(event) => updateScooterVolumeRow(row.id, { unitPriceUsd: event.target.value })} placeholder="0" />
                      <div className="scooter-volume-total">{formatDecimal(unitVolumeCbm, 4)} cbm</div>
                      <button type="button" className="danger-icon-button" onClick={() => removeScooterVolumeRow(row.id)} aria-label="Scooterregel verwijderen">
                        <XCircle size={18} />
                      </button>
                    </div>
                  );
                })}
                <datalist id="scooter-model-options">
                  {scooterModelOptions.map((model) => <option key={model} value={model} />)}
                </datalist>
              </div>
            </div>
          </section>
          </div>

          <section className="product-form-subsection container-cost-card">
            <div className="section-header-with-actions">
              <div>
                <h3>Factuurregels en verdeling</h3>
                <p className="section-subtitle">Standaardregels volgen je factuur. Voeg alleen afwijkingen toe.</p>
              </div>
              <div className="container-command-actions cost-item-actions compact-actions">
                <button type="button" className="secondary-button" onClick={resetCostItemsToInvoiceTemplate}>Standaard factuurregels</button>
                <button type="button" className="secondary-button" onClick={addFixedCostItem}><Plus size={16} /> Factuurregel</button>
                <button type="button" className="secondary-button" onClick={addDutyCostItem}><Plus size={16} /> Douane helper</button>
              </div>
            </div>
            <div className="cost-item-list">
              <div className="cost-item-header" aria-hidden="true">
                <span>Factuurregel</span>
                <span>Categorie</span>
                <span>Type</span>
                <span>Bedrag / tarief</span>
                <span>Verdeling / doelgroep</span>
                <span>Totaal</span>
                <span></span>
              </div>
              {costItems.map((item) => {
                const resolved = resolvedCostItems.find((entry) => entry.id === item.id);
                return (
                  <div className="cost-item-row" key={item.id}>
                    <input value={item.label} onChange={(event) => updateCostItem(item.id, { label: event.target.value })} placeholder="Naam kostenpost" />
                    <select value={item.category} onChange={(event) => updateCostItem(item.id, { category: event.target.value as ContainerCostDraftItem['category'] })}>
                      <option value="transport">Transport</option>
                      <option value="import">Import</option>
                      <option value="other">Overig</option>
                    </select>
                    <select value={item.kind} onChange={(event) => updateCostItem(item.id, { kind: event.target.value as ContainerCostDraftItem['kind'] })}>
                      <option value="fixed">Vast bedrag</option>
                      <option value="duty">Douanetarief</option>
                    </select>
                    {item.kind === 'fixed' ? (
                      <>
                        <input value={item.amountEur} onChange={(event) => updateCostItem(item.id, { amountEur: event.target.value })} placeholder="Bedrag EUR" />
                        <select value={item.mode} onChange={(event) => updateCostItem(item.id, { mode: event.target.value as ContainerCostAllocationMode })}>
                          <option value="volume">Verdelen op volume</option>
                          <option value="value">Verdelen op waarde</option>
                        </select>
                      </>
                    ) : (
                      <>
                        <input value={item.dutyRate} onChange={(event) => updateCostItem(item.id, { dutyRate: event.target.value })} placeholder="Tarief %" />
                        <select value={item.appliesTo} onChange={(event) => updateCostItem(item.id, { appliesTo: event.target.value as ContainerCostDraftItem['appliesTo'] })}>
                          <option value="all">Alles</option>
                          <option value="scooter">Alleen scooters</option>
                          <option value="onderdeel">Alleen onderdelen</option>
                          <option value="samengesteld">Alleen samengesteld</option>
                          <option value="non-scooter">Alles behalve scooters</option>
                        </select>
                      </>
                    )}
                    <div className="cost-item-total">EUR {formatDecimal(resolved?.resolvedAmountEur ?? 0, 2)}</div>
                    <button type="button" className="danger-icon-button" onClick={() => removeCostItem(item.id)} aria-label="Kostenpost verwijderen">
                      <XCircle size={18} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="product-form-subsection container-cost-card">
            <div className="section-header-with-actions compact-header">
              <div>
                <h3>Excel import onderdelen</h3>
                <p className="section-subtitle">Kies een `.xlsx`, `.xls` of `.csv` bestand. De preview hieronder wordt daarna automatisch gevuld.</p>
              </div>
              <div className="container-command-actions compact-actions">
                <button type="button" className="secondary-button" onClick={() => importFileInputRef.current?.click()}>
                  <Upload size={16} /> Excel kiezen
                </button>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv"
                  onChange={(event) => void handleCostImportFile(event)}
                  hidden
                />
              </div>
            </div>
            <div className="container-content-field container-cost-paste-field">
              <span>{importFileName ? `Bestand geladen: ${importFileName}` : 'Je kunt ook nog steeds handmatig plakken, maar Excel is nu de hoofdroute.'}</span>
              <code>Ctn No.  Model  Artikelnummer  Item No.  Parts  Qty  Unit Price  Amount  Leverancier</code>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={'1-5\tSense 50\tA2A81023001\t\tBody sets complete (Metal pink)\t5\t83,03\t386,98\tWenling Import And Export Co., Ltd.\n37-39\tSense (quare)\t\tTX250\tFRONT HEADCOVER SQUARE Pearl blue (TX250) col\t3\t4,14\t12,42\tWenling Import And Export Co., Ltd.'}
              />
              <div className="container-command-actions">
                <button type="button" className="secondary-button" onClick={() => setDraftLines(parseContainerCostContent(content))}>Preview regels</button>
                <button type="button" className="secondary-button" onClick={() => { setContent(''); setDraftLines([]); }}>Wissen</button>
              </div>
            </div>
          </section>

          <section className="product-form-subsection container-cost-card">
            <h3>Verdeling preview</h3>
            <div className="sales-summary">
              <div><span>Regels</span><strong>{calculatedLines.length}</strong></div>
              <div><span>Totaal volume</span><strong>{formatCompactDecimal(totalVolume, 3)} cbm</strong></div>
              <div><span>Goederenwaarde</span><strong>EUR {formatDecimal(totalGoodsValue, 2)}</strong><small>USD {formatDecimal(totalGoodsValueUsd, 2)}</small></div>
            </div>
            {calculatedLines.length === 0 ? (
              <div className="empty-state inline">
                <CircleDollarSign size={22} />
                <strong>Nog geen regels</strong>
                <span>Voeg scooters bovenin toe en plak onderdelen hieronder om de kostprijsverdeling te zien.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <div className="product-table-intro compact">
                  <span>Alle bedragen in deze tabel zijn per stuk. Alleen volume is het totale volume per regel.</span>
                </div>
                <table className="container-cost-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Referentie</th>
                      <th>Aantal</th>
                      <th>Volume</th>
                      <th>USD / stuk</th>
                      <th><span className="table-help-label">Inkoopprijs / stuk<span className="table-help-icon" title="Alleen de omgerekende productprijs per stuk van USD naar EUR, zonder extra kosten." aria-label="Uitleg inkoopprijs per stuk"><CircleHelp size={14} /></span></span></th>
                      <th><span className="table-help-label">Invoer / stuk<span className="table-help-icon" title="Het douanetarief-bedrag per stuk op basis van het invoerpercentage voor scooter, onderdeel of set." aria-label="Uitleg invoer per stuk"><CircleHelp size={14} /></span></span></th>
                      <th><span className="table-help-label">Transport / stuk<span className="table-help-icon" title="Het transportdeel per stuk, zoals containertransport en luchtpost." aria-label="Uitleg transport per stuk"><CircleHelp size={14} /></span></span></th>
                      <th><span className="table-help-label">Overig / stuk<span className="table-help-icon" title="Het aandeel per stuk van overige factuurregels, zoals specificatie- of kredietkosten." aria-label="Uitleg overige kosten per stuk"><CircleHelp size={14} /></span></span></th>
                      <th><span className="table-help-label">Kostprijs / stuk<span className="table-help-icon" title="De totale kostprijs per stuk: inkoopprijs plus invoer, transport en overige kosten." aria-label="Uitleg kostprijs per stuk"><CircleHelp size={14} /></span></span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedLines.map((line) => {
                      const importDutyRate = importDutyRateForLine(line);
                      return (
                        <tr key={line.id}>
                          <td>{line.type}</td>
                          <td>
                            <strong>{line.referenceCode}</strong>
                            <small>{line.normalizedDescription}</small>
                          </td>
                          <td>{formatCompactDecimal(line.quantity, 3)}</td>
                          <td>{formatCompactDecimal(line.lineVolumeTotal, 3)}</td>
                          <td>{formatDecimal(line.unitPriceUsd, 4)}</td>
                          <td>{formatDecimal(purchasePricePerUnit(line.goodsValueEurBase, line.quantity), 4)}</td>
                          <td className="duty-preview-cell">
                            {formatDecimal(line.quantity > 0 ? line.allocatedImportEur / line.quantity : 0, 4)} <span>({formatCompactDecimal(importDutyRate, 2)}%)</span>
                          </td>
                          <td>{formatDecimal(line.quantity > 0 ? line.allocatedTransportEur / line.quantity : 0, 4)}</td>
                          <td>{formatDecimal(line.quantity > 0 ? line.allocatedOtherEur / line.quantity : 0, 4)}</td>
                          <td>{formatDecimal(line.calculatedUnitCostEur, 4)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="inline-notice">
              <span>
            Onderdelen krijgen bij opslaan direct de actuele `kostprijs` en het `batch`-nummer van deze order. Scooters worden nu alleen historisch vastgelegd in de importregels.
              </span>
            </div>
          </section>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Annuleren</button>
          <button
            type="button"
            className="primary-button"
            disabled={saving || !containerNumber.trim() || !orderNumber.trim() || calculatedLines.length === 0}
            onClick={() => void handleSave()}
          >
            {saving ? 'Opslaan...' : initialBatch ? 'Importbatch bijwerken' : 'Importbatch opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContainerAvailabilityBoard({
  container,
  scooters,
  dealers,
  onSelect,
  onMarkContainerAvailable,
}: {
  container: Container;
  scooters: Scooter[];
  dealers: Dealer[];
  onSelect: (scooter: Scooter) => void;
  onMarkContainerAvailable?: (container: Container, arrivedAtInput: string) => Promise<void>;
}) {
  const groups: Array<{ status: ScooterStatus; label: string }> = [
    { status: 'Nog onderweg', label: 'Nog onderweg' },
    { status: 'Beschikbaar', label: 'Beschikbaar' },
    { status: 'In consignatie', label: 'In consignatie' },
    { status: 'Verkocht dealer', label: 'Verkocht dealer' },
    { status: 'Verkocht klant', label: 'Verkocht klant' },
  ];
  const [openStatus, setOpenStatus] = useState<ScooterStatus | null>(groups[0].status);
  const [arrivedAtValue, setArrivedAtValue] = useState(() => {
    const baseDate = normalizeDateValue(container.arrivedAt || container.eta) || new Date();
    return toInputDateTimeValue(baseDate);
  });
  const [markingAvailable, setMarkingAvailable] = useState(false);
  const [markMessage, setMarkMessage] = useState('');
  const [markMessageType, setMarkMessageType] = useState<'success' | 'warning'>('success');

  return (
    <div className="container-availability-board">
      <div className="container-card-metrics container-card-metrics-inline">
        <div className="container-card-metric">
          <span>Invoice</span>
          <strong>{container.invoiceNumber || '-'}</strong>
        </div>
        <div className="container-card-metric">
          <span>Seal</span>
          <strong>{container.sealNumber || '-'}</strong>
        </div>
        <div className="container-card-metric">
          <span>Status</span>
          <strong className="green-text">{container.status || '-'}</strong>
        </div>
        <div className="container-card-metric">
          <span>Aangekomen</span>
          <strong>{formatDate(container.arrivedAt || container.eta)}</strong>
        </div>
        <div className="container-card-metric">
          <span>Scooters</span>
          <strong>{scooters.length}</strong>
        </div>
      </div>
      {container.status !== 'Aangekomen' && onMarkContainerAvailable ? (
        <div className="container-card-actions">
          <label className="container-card-arrival-field">
            <span>Aankomstdatum</span>
            <input
              type="datetime-local"
              value={arrivedAtValue}
              onChange={(event) => setArrivedAtValue(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={markingAvailable}
            onClick={async () => {
              setMarkingAvailable(true);
              setMarkMessage('');
              setMarkMessageType('success');
              try {
                await onMarkContainerAvailable(container, arrivedAtValue);
                setMarkMessage('Container is binnen gemeld en scooters zijn bijgewerkt.');
              } catch (error) {
                setMarkMessageType('warning');
                setMarkMessage(`Binnenmelden mislukt: ${importErrorMessage(error)}`);
              } finally {
                setMarkingAvailable(false);
              }
            }}
          >
            {markingAvailable ? 'Bezig...' : 'Zet container op beschikbaar'}
          </button>
        </div>
      ) : null}
      {markMessage ? <div className={`inline-notice ${markMessageType === 'warning' ? 'warning-notice' : 'success-notice'}`}>{markMessage}</div> : null}
      <div className="container-card-status-grid container-card-status-grid-wide">
        {groups.map(({ status, label }) => {
          const statusScooters = scooters.filter((scooter) => scooter.status === status);
          const isOpen = openStatus === status;
          return (
            <section className="container-card-status-column" key={status}>
              <button
                type="button"
                className="container-card-status-header container-card-status-toggle"
                onClick={() => setOpenStatus(isOpen ? null : status)}
              >
                <span>{label}</span>
                <div className="container-card-status-meta">
                  <strong>{statusScooters.length}</strong>
                  <small>{isOpen ? '-' : '+'}</small>
                </div>
              </button>
              {isOpen && (
                <div className="container-card-scooter-list">
                  {statusScooters.length ? statusScooters.map((scooter) => (
                    <button
                      type="button"
                      className="container-card-scooter-row"
                      key={scooter.id}
                      onClick={() => onSelect(scooter)}
                    >
                      <strong>{scooter.frameNumber}</strong>
                      <span>{scooter.model || '-'} - {scooter.color || '-'} - {normalizeSpeedValue(scooter.speed) || '-'}</span>
                      <small>{dealerName(dealers, scooter.dealerId) || '-'}</small>
                    </button>
                  )) : <p className="container-card-empty">Geen scooters</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Scooters({ data, query, setQuery, scooters, onSelect, onImport, message, messageDetails, statusFilter, setStatusFilter, onBulkRdwCheck, onMarkContainerAvailable }: {
  data: AppData;
  query: string;
  setQuery: (value: string) => void;
  scooters: Scooter[];
  onSelect: (scooter: Scooter) => void;
  onImport: (target: ImportTarget, status: ImportScooterStatus, event: ChangeEvent<HTMLInputElement>) => void;
  message: string;
  messageDetails: string[];
  statusFilter: ScooterStatus | 'all';
  setStatusFilter: (status: ScooterStatus | 'all') => void;
  onBulkRdwCheck: (scooters: Scooter[]) => Promise<string>;
  onMarkContainerAvailable: (container: Container, arrivedAtInput: string) => Promise<void>;
}) {
  const groups = ['Beschikbaar', 'In optie', 'Af te leveren', 'Nog onderweg', 'In consignatie', 'Verkocht klant', 'Verkocht dealer', 'Overig'] as ScooterStatus[];
  const [searchField, setSearchField] = useState<SearchField>('frameNumber');
  const [panelFilters, setPanelFilters] = useState<ScooterPanelFilters>({
    speed: '',
    model: '',
    color: '',
    status: '',
  });
  const cards: Array<{ status: ScooterStatus; label: string; icon: typeof Bike }> = [
    { status: 'Beschikbaar', label: 'Beschikbaar', icon: Bike },
    { status: 'In consignatie', label: 'In consignatie', icon: BriefcaseBusiness },
    { status: 'Verkocht dealer', label: 'Verkocht dealer', icon: Wrench },
    { status: 'Verkocht klant', label: 'Verkocht klant', icon: Wrench },
    { status: 'Af te leveren', label: 'Verkocht zonder kenteken', icon: PackagePlus },
    { status: 'Nog onderweg', label: 'Nog onderweg', icon: Boxes },
    { status: 'In optie', label: 'In optie', icon: CalendarDays },
    { status: 'Overig', label: 'Overig', icon: CircleHelp },
  ];
  const visibleScooters = filterScootersForPanel(scooters, query, searchField, panelFilters);
  return (
    <>
      <h1>Scooters</h1>
      <ExpandableNotice message={message} details={messageDetails} />
      <div className="stat-grid scooter-status-grid">
        {cards.map(({ status, label, icon: Icon }) => (
          <button
            className={`stat-card stat-button scooter-status-card ${statusFilter === status ? 'selected' : ''}`}
            key={status}
            onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
          >
            <div className={`stat-icon ${statusColor[status]}`}><Icon size={24} /></div>
            <div><span>{label}</span><strong>{countByStatus(data.scooters, status)}</strong></div>
          </button>
        ))}
      </div>
      {statusFilter !== 'all' && (
        <div className="filter-notice">
          Gefilterd op <strong>{scooterStatusLabel(statusFilter)}</strong>
          <button onClick={() => setStatusFilter('all')}>Toon alles</button>
        </div>
      )}
      {statusFilter !== 'all' && (
        <ScooterTable
          scooters={scooters}
          dealers={data.dealers}
          query={query}
          setQuery={setQuery}
          onSelect={onSelect}
          title={`Scooters: ${scooterStatusLabel(statusFilter)} (${scooters.length})`}
          onBulkRdwCheck={statusFilter === 'Verkocht dealer' || statusFilter === 'Verkocht klant' ? onBulkRdwCheck : undefined}
          defaultSortOrder={statusFilter === 'Verkocht klant' ? 'registration-newest' : 'model-asc'}
        />
      )}
      <SearchPanel
        scooters={scooters}
        query={query}
        setQuery={setQuery}
        searchField={searchField}
        setSearchField={setSearchField}
        panelFilters={panelFilters}
        setPanelFilters={setPanelFilters}
      />
      <div className="card-grid">
        {groups.map((status) => (
          <section className="panel compact-list" key={status}>
            <div className="panel-title"><Bike size={16} /> Recent {scooterStatusLabel(status).toLowerCase()}</div>
            {visibleScooters.filter((s) => s.status === status).slice(0, 5).map((scooter) => (
              <button key={scooter.id} className="record-row" onClick={() => onSelect(scooter)}>
                <span>{scooter.frameNumber}</span>
                {scooter.model} {scooter.color} {normalizeSpeedValue(scooter.speed)}
                <strong>{dealerName(data.dealers, scooter.dealerId)}</strong>
              </button>
            ))}
            {visibleScooters.filter((s) => s.status === status).length === 0 ? <p className="empty">Geen scooters gevonden.</p> : null}
          </section>
        ))}
      </div>
    </>
  );
}

function Batteries({ data, addBatteries, addBatteryModel, updateBattery, onSelectScooter, message }: { data: AppData; addBatteries: (event: FormEvent<HTMLFormElement>) => Promise<void>; addBatteryModel: (event: FormEvent<HTMLFormElement>) => Promise<void>; updateBattery: (battery: Battery) => Promise<void>; onSelectScooter: (scooter: Scooter) => void; message: string }) {
  const { batteries, batteryModels, dealers, scooters } = data;
  const [selectedBattery, setSelectedBattery] = useState<Battery | null>(null);
  const [showAddBattery, setShowAddBattery] = useState(false);
  const [batteryQuery, setBatteryQuery] = useState('');
  const defaultBatteryModel = batteryModels[0]?.name ?? '';
  const filteredBatteries = batteries.filter((battery) => {
    const scooter = scooters.find((item) => item.frameNumber === battery.scooterFrame);
    const dealer = dealerName(dealers, battery.dealerId);
    const searchable = [
      battery.lotNumber,
      battery.model,
      battery.spec,
      battery.status,
      battery.scooterFrame,
      battery.orderNumber,
      dealer,
      scooter?.licensePlate,
      scooter?.model,
      scooter?.color,
    ].filter(Boolean).join(' ');
    return searchable.toLowerCase().includes(batteryQuery.toLowerCase().trim());
  });
  const batteryGroups = [
    {
      title: 'Beschikbaar',
      items: filteredBatteries.filter((battery) => !['Verkocht', 'In consignatie'].includes(battery.status)),
    },
    {
      title: 'In consignatie',
      items: filteredBatteries.filter((battery) => battery.status === 'In consignatie'),
    },
    {
      title: 'Verkocht',
      items: filteredBatteries.filter((battery) => battery.status === 'Verkocht'),
    },
  ];
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Accu's</h1>
          <span>{batteries.length} accu's geregistreerd</span>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => setShowAddBattery(true)}><Plus size={16} /> Accu</button>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <section className="panel compact-search">
        <div className="panel-title"><Search size={16} /> Accu zoeken</div>
        <div className="inline-search">
          <input value={batteryQuery} onChange={(event) => setBatteryQuery(event.target.value)} placeholder="Lotnummer, model, dealer, kenteken of gekoppelde scooter" />
          {batteryQuery && <button className="secondary-button" onClick={() => setBatteryQuery('')}>Reset</button>}
        </div>
      </section>
      <div className="battery-layout">
        <div className="battery-groups">
          {batteryGroups.map((group) => (
            <section className="panel list-panel" key={group.title}>
              <div className="panel-title"><BatteryCharging size={16} /> {group.title} ({group.items.length})</div>
              {group.items.length === 0 ? (
                <div className="empty-state inline"><BatteryCharging size={22} /><strong>Geen accu's</strong><span>Er staan geen accu's in dit blok.</span></div>
              ) : group.items.map((battery) => (
                <button className="battery-row battery-row-button" key={battery.id} onClick={() => setSelectedBattery(battery)}>
                  <strong>{battery.lotNumber}</strong>
                  <span>{battery.model} - {battery.spec}{battery.scooterFrame ? ` - ${battery.scooterFrame}` : ''}</span>
                  <small>{battery.status}{battery.dealerId ? ` - ${dealerName(dealers, battery.dealerId)}` : ''}</small>
                </button>
              ))}
            </section>
          ))}
        </div>
        <div className="battery-side">
          <section className="panel list-panel">
            <div className="panel-title"><BriefcaseBusiness size={16} /> Alle accu modellen</div>
            {batteryModels.length === 0 ? (
              <div className="empty-state inline"><BatteryCharging size={22} /><strong>Nog geen accu modellen</strong><span>Voeg een model toe met de technische specificaties.</span></div>
            ) : batteryModels.map((model) => (
              <div className="battery-row battery-model-row" key={model.id}>
                <strong>{model.name} - {model.spec}</strong>
                <span>{[model.nominalVoltage, model.nominalCapacity, model.ratedEnergy, model.maxChargeVoltage, model.minDischargeVoltage].filter(Boolean).join(' ')}</span>
              </div>
            ))}
          </section>
          <form className="panel form-panel" onSubmit={addBatteryModel}>
            <div className="panel-title"><BatteryCharging size={16} /> Voeg nieuw model toe</div>
            <div className="form-grid battery-model-form-grid">
              <label>Naam*<input name="name" required /></label>
              <label>Spec*<input name="spec" required /></label>
              <label>Nom voltage*<input name="nominalVoltage" required /></label>
              <label>Nom capacity*<input name="nominalCapacity" required /></label>
              <label>Rate energy*<input name="ratedEnergy" required /></label>
              <label>Max charge volt*<input name="maxChargeVoltage" required /></label>
              <label>Min discharge volt*<input name="minDischargeVoltage" required /></label>
            </div>
            <button className="primary-button">Toevoegen</button>
          </form>
        </div>
      </div>
      {selectedBattery && (
        <BatteryDetailModal
          battery={selectedBattery}
          batteryModels={batteryModels}
          dealers={dealers}
          scooters={scooters}
          onClose={() => setSelectedBattery(null)}
          onSelectScooter={(scooter) => {
            setSelectedBattery(null);
            onSelectScooter(scooter);
          }}
          onUpdate={async (battery) => {
            await updateBattery(battery);
            setSelectedBattery(battery);
          }}
        />
      )}
      {showAddBattery && (
        <div className="modal-backdrop" onMouseDown={() => setShowAddBattery(false)}>
          <form className="modal-card" onSubmit={async (event) => {
            await addBatteries(event);
            setShowAddBattery(false);
          }} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span>Accu voorraad</span>
                <h2>Accu's toevoegen</h2>
              </div>
              <button type="button" onClick={() => setShowAddBattery(false)}>Close</button>
            </div>
            <div className="form-grid single">
              <label>Lotnummers*
                <textarea name="lotNumbers" className="bulk-textarea" placeholder={'ASFC18 221026N001\nADRC14 221023N002\nASFC18 230328N005'} required />
              </label>
              <label>Model*
                <select name="model" defaultValue={defaultBatteryModel} required>
                  <option value="">Selecteer ...</option>
                  {batteryModels.map((model) => <option key={model.id} value={model.name}>{model.name} - {model.spec}</option>)}
                </select>
              </label>
              <label>Status
                <select name="status" defaultValue="Beschikbaar">
                  {['Beschikbaar', 'Voorraad', 'In consignatie', 'Gekoppeld', 'Verkocht'].map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label>Laad datum<input name="chargeDate" type="date" /></label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowAddBattery(false)}>Annuleren</button>
              <button className="primary-button">Toevoegen</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function BatteryDetailModal({ battery, batteryModels, dealers, scooters, onClose, onSelectScooter, onUpdate }: { battery: Battery; batteryModels: BatteryModel[]; dealers: Dealer[]; scooters: Scooter[]; onClose: () => void; onSelectScooter: (scooter: Scooter) => void; onUpdate: (battery: Battery) => Promise<void> }) {
  const [draft, setDraft] = useState<Battery>(battery);
  const [scooterLookup, setScooterLookup] = useState(battery.scooterFrame ?? '');
  const linkedScooter = scooters.find((scooter) => scooter.frameNumber === draft.scooterFrame);
  const typedScooter = scooterLookup.trim()
    ? scooters.find((scooter) =>
      normalizeLookup(scooter.frameNumber) === normalizeLookup(scooterLookup) ||
      normalizeLookup(scooter.licensePlate ?? '') === normalizeLookup(scooterLookup))
    : null;
  const sortedDealers = [...dealers].sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name, 'nl', { sensitivity: 'base' }));

  function updateDraft(next: Partial<Battery>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function markSold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onUpdate({
      ...draft,
      status: 'Verkocht',
      dealerId: String(form.get('dealerId') ?? '') || undefined,
      orderNumber: String(form.get('orderNumber') ?? '').trim(),
      soldAt: String(form.get('soldAt') ?? '') || undefined,
    });
  }

  async function markConsignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onUpdate({
      ...draft,
      status: 'In consignatie',
      dealerId: String(form.get('dealerId') ?? '') || undefined,
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card battery-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span>Accu detail</span>
            <h2>Accu {battery.lotNumber}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <div className="battery-detail-grid">
          <section className="panel detail-card">
            <dl className="detail-list">
              <dt>Status</dt><dd>{draft.status}</dd>
              <dt>Dealer</dt><dd>{dealerName(dealers, draft.dealerId) || '-'}</dd>
              <dt>Order nummer</dt><dd>{draft.orderNumber || '-'}</dd>
            </dl>
          </section>
          <section className="panel detail-card">
            <dl className="detail-list">
              <dt>Laad datum</dt><dd>{formatDate(draft.chargeDate)}</dd>
              <dt>Model</dt><dd>{draft.model}</dd>
              <dt>Scooter</dt><dd>{linkedScooter ? <button className="link-button" onClick={() => onSelectScooter(linkedScooter)}>{linkedScooter.frameNumber}</button> : (draft.scooterFrame || '-')}</dd>
            </dl>
          </section>
        </div>
        <div className="battery-detail-grid">
          <form className="panel form-panel" onSubmit={markSold}>
            <div className="panel-title"><Search size={16} /> Markeer als verkocht</div>
            <div className="form-grid single">
              <label>Dealer<select name="dealerId" defaultValue={draft.dealerId ?? ''}><option value="">Selecteer ...</option>{sortedDealers.map((dealer) => <option key={dealer.id} value={dealer.id}>{dealer.company || dealer.name}</option>)}</select></label>
              <label>Order nr*<input name="orderNumber" defaultValue={draft.orderNumber ?? ''} required /></label>
              <label>Datum verkocht<input name="soldAt" type="date" defaultValue={draft.soldAt ?? ''} /></label>
            </div>
            <button className="primary-button">Opslaan</button>
          </form>
          <form className="panel form-panel" onSubmit={markConsignment}>
            <div className="panel-title"><Search size={16} /> Markeer als in consignatie</div>
            <div className="form-grid single">
              <label>Dealer<select name="dealerId" defaultValue={draft.dealerId ?? ''}><option value="">Selecteer ...</option>{sortedDealers.map((dealer) => <option key={dealer.id} value={dealer.id}>{dealer.company || dealer.name}</option>)}</select></label>
            </div>
            <button className="primary-button">Opslaan</button>
          </form>
        </div>
        <section className="panel form-panel">
          <div className="panel-title"><Search size={16} /> Wijzig accu gegevens</div>
          <div className="form-grid battery-edit-grid">
            <label>Model*
              <select value={draft.model} onChange={(event) => {
                const model = batteryModels.find((item) => item.name === event.target.value);
                updateDraft({ model: event.target.value, spec: model?.spec ?? draft.spec });
              }}>
                {[draft.model, ...batteryModels.map((model) => model.name)].filter((value, index, array) => value && array.indexOf(value) === index).map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </label>
            <label>Lotnum*<input value={draft.lotNumber} onChange={(event) => updateDraft({ lotNumber: event.target.value })} /></label>
            <label>Laad datum<input type="date" value={draft.chargeDate ?? ''} onChange={(event) => updateDraft({ chargeDate: event.target.value })} /></label>
            <label>Scooter
              <input
                list="battery-scooters"
                placeholder="Plak framenummer of kenteken"
                value={scooterLookup}
                onChange={(event) => {
                  const value = event.target.value;
                  setScooterLookup(value);
                  const match = scooters.find((scooter) =>
                    normalizeLookup(scooter.frameNumber) === normalizeLookup(value) ||
                    normalizeLookup(scooter.licensePlate ?? '') === normalizeLookup(value));
                  updateDraft({ scooterFrame: match ? match.frameNumber : (value.trim() ? value.trim() : undefined) });
                }}
              />
              <datalist id="battery-scooters">
                {scooters.map((scooter) => <option key={scooter.id} value={scooter.frameNumber}>{scooter.licensePlate ? `${scooter.licensePlate} - ` : ''}{scooter.model}</option>)}
              </datalist>
              <small className={typedScooter ? 'lookup-hint success' : 'lookup-hint'}>{typedScooter ? `${typedScooter.frameNumber} - ${typedScooter.model} - ${dealerName(dealers, typedScooter.dealerId) || 'geen dealer'}` : 'Plak een exact framenummer of kenteken.'}</small>
            </label>
            <label>Status
              <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as Battery['status'] })}>
                {['Beschikbaar', 'Voorraad', 'In consignatie', 'Gekoppeld', 'Verkocht'].map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
          </div>
          <button className="primary-button" onClick={() => onUpdate(draft)}>Wijzigen</button>
        </section>
      </div>
    </div>
  );
}

function ProductsPage({
  products,
  supplierRecords,
  onImport,
  onSelectProduct,
  message,
}: {
  products: Product[];
  supplierRecords: Supplier[];
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onSelectProduct: (product: Product) => void;
  message: string;
}) {
  const [query, setQuery] = useState('');
  const [productsTab, setProductsTab] = useState<'catalog' | 'importCompanies'>('catalog');
  const [catalogView, setCatalogView] = useState<'all' | 'new'>('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [importCompanyFilter, setImportCompanyFilter] = useState<'__all__' | string>('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [availableFromFilter, setAvailableFromFilter] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [barcodeFilter, setBarcodeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(25);
  const [sortField, setSortField] = useState<'code' | 'description' | 'salePrice' | 'costPrice' | 'articleGroup' | 'stock' | 'startDate'>('code');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  function handleSort(field: 'code' | 'description' | 'salePrice' | 'costPrice' | 'articleGroup' | 'stock' | 'startDate') {
    if (sortField === field) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortField(field);
    setSortDirection('asc');
  }

  function renderSortIcon(field: 'code' | 'description' | 'salePrice' | 'costPrice' | 'articleGroup' | 'stock' | 'startDate') {
    if (sortField !== field) return <ArrowUpDown size={14} />;
    return sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  }

  const scopedProducts = catalogView === 'new'
    ? products.filter((product) => product.isNewProduct)
    : products;
  const importCompanies = Array.from(new Set(
    supplierRecords
      .filter((supplier) => supplier.isImportCompany)
      .map((supplier) => supplier.name.trim())
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const articleGroups = Array.from(new Set(products.map((product) => product.articleGroup).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const productSupplierNames = products.map((product) => product.supplier).filter(Boolean) as string[];
  const suppliers = Array.from(new Set([
    ...supplierRecords.map((supplier) => supplier.name).filter(Boolean),
    ...productSupplierNames.filter((supplierName) => !supplierRecords.some((supplier) => supplierNameMatches(supplier, supplierName))),
  ]))
    .sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const stockValues = Array.from(new Set(products.map((product) => product.stock).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const missingSupplierValue = '__missing_supplier__';

  const visibleProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const codeNeedle = codeFilter.trim().toLowerCase();
    const descriptionNeedle = descriptionFilter.trim().toLowerCase();
    const barcodeNeedle = barcodeFilter.trim().toLowerCase();
    return scopedProducts.filter((product) => {
      const supplier = product.supplier?.trim() || '';
      const normalizedImportCompanies = importCompanies.map((company) => company.trim().toLowerCase()).filter(Boolean);
      const isImportCompanyProduct = normalizedImportCompanies.some((company) =>
        company === 'blanco'
          ? !supplier
          : supplier.toLowerCase().includes(company),
      );
      const importCompanyNeedle = importCompanyFilter.trim().toLowerCase();
      const importCompanyMatch = importCompanyFilter === '__all__'
        ? isImportCompanyProduct
        : !importCompanyNeedle || (
        importCompanyNeedle === 'blanco'
          ? !supplier
          : supplier.toLowerCase().includes(importCompanyNeedle)
        );
      const productAvailableFrom = rdwDateToInputDate(product.startDate || product.createdAt);
      const availableFromMatch = !availableFromFilter
        || (productAvailableFrom && productAvailableFrom >= availableFromFilter);
      const hasEndDate = Boolean(product.endDate?.trim());
      const inQuery = !needle || [
        product.code,
        product.supplierItemNo,
        product.description,
        product.barcode,
        product.batch,
        product.articleGroup,
        supplier,
      ].some((value) => value?.toLowerCase().includes(needle));
      const lifecycleMatch = !lifecycleFilter
        || (lifecycleFilter === 'endOfLife' ? hasEndDate : !hasEndDate);

      return inQuery
        && (!codeNeedle || product.code?.toLowerCase().includes(codeNeedle))
        && (!descriptionNeedle || product.description?.toLowerCase().includes(descriptionNeedle))
        && (!barcodeNeedle || product.barcode?.toLowerCase().includes(barcodeNeedle))
        && (!groupFilter || product.articleGroup === groupFilter)
        && (!supplierFilter || (supplierFilter === missingSupplierValue
          ? !product.supplier?.trim()
          : product.supplier === supplierFilter || supplierRecords.some((record) => record.name === supplierFilter && supplierNameMatches(record, product.supplier))))
        && (!stockFilter || product.stock === stockFilter)
        && importCompanyMatch
        && availableFromMatch
        && lifecycleMatch
    }).sort((a, b) => {
      const codeA = (a.code || '').trim();
      const codeB = (b.code || '').trim();
      const descriptionA = (a.description || '').trim();
      const descriptionB = (b.description || '').trim();
      const saleA = parsePriceForSort(a.salePrice);
      const saleB = parsePriceForSort(b.salePrice);
      const costA = parsePriceForSort(a.costPrice);
      const costB = parsePriceForSort(b.costPrice);

      const direction = sortDirection === 'asc' ? 1 : -1;

      switch (sortField) {
        case 'description':
          return descriptionA.localeCompare(descriptionB, 'nl', { sensitivity: 'base', numeric: true }) * direction;
        case 'salePrice': {
          const left = Number.isFinite(saleA) ? saleA : (sortDirection === 'asc' ? Infinity : -Infinity);
          const right = Number.isFinite(saleB) ? saleB : (sortDirection === 'asc' ? Infinity : -Infinity);
          return (left - right) * direction;
        }
        case 'costPrice': {
          const left = Number.isFinite(costA) ? costA : (sortDirection === 'asc' ? Infinity : -Infinity);
          const right = Number.isFinite(costB) ? costB : (sortDirection === 'asc' ? Infinity : -Infinity);
          return (left - right) * direction;
        }
        case 'articleGroup':
          return (a.articleGroup || '').localeCompare(b.articleGroup || '', 'nl', { sensitivity: 'base', numeric: true }) * direction;
        case 'stock':
          return (a.stock || '').localeCompare(b.stock || '', 'nl', { sensitivity: 'base', numeric: true }) * direction;
        case 'startDate':
          return ((a.startDate ? new Date(a.startDate).getTime() : 0) - (b.startDate ? new Date(b.startDate).getTime() : 0)) * direction;
        case 'code':
        default:
          return codeA.localeCompare(codeB, 'nl', { sensitivity: 'base', numeric: true }) * direction;
      }
    });
  }, [scopedProducts, query, codeFilter, descriptionFilter, barcodeFilter, groupFilter, supplierFilter, stockFilter, importCompanyFilter, lifecycleFilter, availableFromFilter, sortField, sortDirection]);

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(visibleProducts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = pageSize === 'all'
    ? visibleProducts
    : visibleProducts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const firstEntry = visibleProducts.length === 0 ? 0 : pageSize === 'all' ? 1 : (safePage - 1) * pageSize + 1;
  const lastEntry = pageSize === 'all' ? visibleProducts.length : Math.min(safePage * pageSize, visibleProducts.length);

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Producten</h1>
          <span>{products.length} producten geregistreerd</span>
        </div>
        <label className="upload-button"><Upload size={16} /> Producten importeren<input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => void onImport(event)} /></label>
      </div>
      {message && <div className="notice">{message}</div>}
      <section className="panel maintenance-search">
        <div className="panel-title"><BriefcaseBusiness size={16} /> Productcatalogus</div>
        <div className="product-import-groups">
          <div className="product-import-tags">
            <button
              type="button"
              className={`product-import-tag ${productsTab === 'catalog' ? 'active' : ''}`}
              onClick={() => setProductsTab('catalog')}
            >
              Productcatalogus
            </button>
            <button
              type="button"
              className={`product-import-tag ${productsTab === 'importCompanies' ? 'active' : ''}`}
              onClick={() => setProductsTab('importCompanies')}
            >
              Fabrikanten
            </button>
          </div>
        </div>
        {productsTab === 'catalog' ? (
          <>
        <div className="product-intro">
          <div>
            <strong>Artikelen centraal beheren</strong>
            <span>Importeer jullie complete onderdelenlijst. Afbeeldingen kunnen we daarna per product toevoegen en later koppelen aan scooters, garantieclaims en onderhoud.</span>
          </div>
        </div>
        <div className="product-import-groups">
          <div className="product-import-groups-head">
            <strong>Weergave</strong>
            <span>Nieuwe producten zijn automatisch aangemaakte artikelen uit importstromen die je nog even wilt nalopen.</span>
          </div>
          <div className="product-import-tags">
            <button
              type="button"
              className={`product-import-tag ${catalogView === 'all' ? 'active' : ''}`}
              onClick={() => setCatalogView('all')}
            >
              Alle producten
            </button>
            <button
              type="button"
              className={`product-import-tag ${catalogView === 'new' ? 'active' : ''}`}
              onClick={() => setCatalogView('new')}
            >
              Nieuwe producten ({products.filter((product) => product.isNewProduct).length})
            </button>
          </div>
        </div>
        <div className="product-import-groups">
          <div className="product-import-groups-head">
            <strong>Fabrikant filter</strong>
            <span>Deze lijst komt uit leveranciers die je wilt gebruiken binnen Eigen import.</span>
          </div>
          <div className="product-import-tags">
            <button
              type="button"
              className={`product-import-tag ${importCompanyFilter === '__all__' ? 'active' : ''}`}
              onClick={() => setImportCompanyFilter((current) => current === '__all__' ? '' : '__all__')}
            >
              Alle fabrikanten
            </button>
            {importCompanies.map((company) => (
              <button
                key={company}
                type="button"
                className={`product-import-tag ${importCompanyFilter === company ? 'active' : ''}`}
                onClick={() => setImportCompanyFilter((current) => current === company ? '' : company)}
              >
                {company}
              </button>
            ))}
          </div>
          <div className="product-table-intro compact">
            <span>
              {importCompanyFilter === '__all__'
                ? `Filter actief: alle fabrikanten`
                : importCompanyFilter
                ? `Filter actief: ${importCompanyFilter}`
                : `Geen fabrikant-filter actief. ${importCompanies.length} fabrikanten beschikbaar.`}
            </span>
          </div>
        </div>
        <div className="product-toolbar">
          <div className="product-search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op artikelnummer, omschrijving, barcode of leverancier" />
          </div>
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
            <option value="">Alle artikelgroepen</option>
            {articleGroups.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            <option value="">Alle leveranciers</option>
            <option value={missingSupplierValue}>Geen leverancier bekend</option>
            {suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
          </select>
          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
            <option value="">Alle voorraadwaardes</option>
            {stockValues.map((stock) => <option key={stock} value={stock}>{stock}</option>)}
          </select>
          <select value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)}>
            <option value="">Alle levenscycli</option>
            <option value="active">Actief</option>
            <option value="endOfLife">End of life</option>
          </select>
          <label className="product-date-filter">
            <span>Toegevoegd / beschikbaar vanaf</span>
            <input type="date" value={availableFromFilter} onChange={(event) => setAvailableFromFilter(event.target.value)} />
          </label>
        </div>
          </>
        ) : (
          <div className="product-import-groups">
            <div className="product-import-groups-head">
              <strong>Importbedrijven beheren</strong>
              <span>Beheer dit voortaan via Leveranciers. Zet daar het vinkje `Gebruiken als importbedrijf` aan.</span>
            </div>
            <div className="product-import-tags">
              {importCompanies.length === 0 ? <span className="product-section-hint">Nog geen importbedrijven gemarkeerd bij Leveranciers.</span> : null}
              {importCompanies.map((company) => (
                <span key={company} className="product-import-tag product-import-tag-static">{company}</span>
              ))}
            </div>
          </div>
        )}
      </section>
      {productsTab === 'catalog' ? (
      <>
      <section className="stats-row product-stats">
        <article className="stat-card">
          <span>Totaal</span>
          <strong>{products.length}</strong>
          <small>Volledige productcatalogus</small>
        </article>
        <article className="stat-card">
          <span>Zichtbaar</span>
          <strong>{visibleProducts.length}</strong>
          <small>Na huidige filters</small>
        </article>
        <article className="stat-card">
          <span>Webshop</span>
          <strong>{products.filter((product) => product.webshop).length}</strong>
          <small>Gemarkeerd voor webwinkel</small>
        </article>
        <article className="stat-card">
          <span>Leveranciers</span>
          <strong>{suppliers.length}</strong>
          <small>Unieke hoofdleveranciers</small>
        </article>
        <article className="stat-card">
          <span>End of life</span>
          <strong>{products.filter((product) => product.endDate?.trim()).length}</strong>
          <small>Producten met einddatum</small>
        </article>
        <article className="stat-card">
          <span>Nieuw</span>
          <strong>{products.filter((product) => product.isNewProduct).length}</strong>
          <small>Automatisch aangemaakte producten</small>
        </article>
      </section>
      <section className="panel table-panel">
        <div className="panel-title"><FileText size={16} /> Artikelen</div>
        <div className="product-table-intro">
          <strong>Klik op een artikel om alle details te bekijken en te wijzigen.</strong>
          <span>De lijst hieronder laat alleen de belangrijkste cataloguskolommen zien.</span>
        </div>
        {visibleProducts.length === 0 ? (
          <div className="empty-state inline"><BriefcaseBusiness size={22} /><strong>Geen producten gevonden</strong><span>Importeer een Excel/CSV of pas je filters aan.</span></div>
        ) : (
          <>
            <div className="table-toolbar">
              <div className="table-controls">
                <label>Rows:
                  <select value={pageSize} onChange={(event) => { setPageSize(event.target.value === 'all' ? 'all' : Number(event.target.value)); setPage(1); }}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value="all">Alles</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="table-scroll">
            <table className="inventory-table product-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="column-sort-button" onClick={() => handleSort('code')}>
                      Artikelnummer {renderSortIcon('code')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="column-sort-button" onClick={() => handleSort('description')}>
                      Omschrijving {renderSortIcon('description')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="column-sort-button" onClick={() => handleSort('salePrice')}>
                      Verkoopprijs {renderSortIcon('salePrice')}
                    </button>
                  </th>
                  <th>Inkoopprijs</th>
                  <th>
                    <button type="button" className="column-sort-button" onClick={() => handleSort('costPrice')}>
                      Kostprijs {renderSortIcon('costPrice')}
                    </button>
                  </th>
                  <th>Webwinkel</th>
                  <th>Leverancier / fabrikant</th>
                  <th>
                    <button type="button" className="column-sort-button" onClick={() => handleSort('articleGroup')}>
                      Artikelgroep {renderSortIcon('articleGroup')}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="column-sort-button" onClick={() => handleSort('stock')}>
                      Voorraad {renderSortIcon('stock')}
                    </button>
                  </th>
                  <th>Einddatum</th>
                </tr>
              </thead>
              <tbody>
                {pagedProducts.map((product) => (
                  <tr key={product.id} className="product-row" onClick={() => onSelectProduct(product)}>
                    <td>{product.code || '-'}</td>
                    <td>{product.description || '-'}</td>
                    <td>{formatPriceValue(product.salePrice)}</td>
                    <td>{formatPriceValue(product.purchasePrice)}</td>
                    <td>{formatPriceValue(product.costPrice)}</td>
                    <td>{product.webshop ? 'Ja' : '-'}</td>
                    <td>{displaySupplierName(supplierRecords, product.supplier) || '-'}</td>
                    <td>{product.articleGroup || '-'}</td>
                    <td>{product.stock || '-'}</td>
                    <td>{formatDateOnly(product.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="table-footer">
              <span>Showing {firstEntry} to {lastEntry} of {visibleProducts.length} entries</span>
              {pageSize !== 'all' && (
                <div className="pagination">
                  <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
                  <span>{safePage} / {totalPages}</span>
                  <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
      </>
      ) : (
        <section className="stats-row product-stats">
          <article className="stat-card">
            <span>Importbedrijven</span>
            <strong>{importCompanies.length}</strong>
            <small>Beschikbaar als filter in Productcatalogus</small>
          </article>
          <article className="stat-card">
            <span>Nieuwe producten</span>
            <strong>{products.filter((product) => product.isNewProduct).length}</strong>
            <small>Nog na te lopen artikelen</small>
          </article>
        </section>
      )}
    </>
  );
}

function ProductDetailModal({
  product,
  suppliers,
  supplierRecords,
  importers,
  batches,
  costLines,
  registrations,
  initialTab = 'basic',
  message,
  onClose,
  onSave,
  onSaveAndApplyPackaging,
  applyBatchNumber,
  onPrintLabel,
}: {
  product: Product;
  suppliers: string[];
  supplierRecords: Supplier[];
  importers: Importer[];
  batches: ContainerCostBatch[];
  costLines: ContainerCostLine[];
  registrations: ProductPackagingRegistration[];
  initialTab?: ProductModalTab;
  message?: string;
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
  onSaveAndApplyPackaging: (product: Product, batchNumber?: string) => Promise<void>;
  applyBatchNumber?: string;
  onPrintLabel?: (product: Product, quantity: number) => Promise<string>;
}) {
  const [draft, setDraft] = useState<Product>(() => createProductDraft(product));
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<'product' | 'apply'>('product');
  const [activeTab, setActiveTab] = useState<ProductModalTab>(initialTab);
  const [dymoPrinting, setDymoPrinting] = useState(false);
  const [dymoMessage, setDymoMessage] = useState('');
  const [productImageFailed, setProductImageFailed] = useState(false);

  useEffect(() => {
    const nextDraft = createProductDraft(product);
    const selectedSupplier = nextDraft.supplier
      ? supplierRecords.find((supplier) => supplierNameMatches(supplier, nextDraft.supplier))
      : undefined;
    const linkedImporter = importers.find((importer) => importer.id === selectedSupplier?.importerId);

    setDraft({
      ...nextDraft,
      ...(linkedImporter ? {
        importerName: nextDraft.importerName || linkedImporter.name,
        importerEmail: nextDraft.importerEmail || linkedImporter.email,
        importerAddress: nextDraft.importerAddress || linkedImporter.address,
        importerWebsite: nextDraft.importerWebsite || linkedImporter.website,
        importerPostalCode: nextDraft.importerPostalCode || linkedImporter.postalCode,
        importerCity: nextDraft.importerCity || linkedImporter.city,
        importerCountry: nextDraft.importerCountry || linkedImporter.country,
      } : {}),
    });
    setActiveTab(initialTab);
  }, [product, supplierRecords, importers, initialTab]);

  useEffect(() => {
    setProductImageFailed(false);
  }, [draft.imageUrl]);

  const packagingLayers = draft.packagingLayers ?? normalizePackagingLayers(draft);
  const derivedPackagingWasteStream = summarizePackagingWasteStream(
    packagingLayers.map((layer) => layer.material).filter(Boolean) as string[],
  );
  const derivedPackagingWeightTotal = sumPackagingLayerWeights(packagingLayers);
  const selectedSupplierName = displaySupplierName(supplierRecords, draft.supplier);
  const supplierOptions = Array.from(new Set([
    selectedSupplierName,
    ...suppliers,
  ].filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const productImageUrl = draft.imageUrl?.trim() || '';
  const batchOverviewRows = useMemo(() => {
    const normalizedProductCode = draft.code.trim().toLowerCase();
    const productId = draft.id?.trim();
    if (!normalizedProductCode && !productId) return [];

    const relevantRegistrations = registrations.filter((registration) => {
      const registrationCode = registration.productCode?.trim().toLowerCase();
      return (productId && registration.productId === productId) ||
        (normalizedProductCode && registrationCode === normalizedProductCode);
    });

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
      current.packagingUnit = Math.max(current.packagingUnit, unitsPerPackage, parseDecimal(draft.packagingUnit));
      current.packagesCount = Math.max(current.packagesCount, packagesCount);
      grouped.set(key, current);
    });

    return Array.from(grouped.values())
      .map((entry) => {
        const purchasePerUnitEur = entry.quantity > 0 ? entry.purchaseTotalEur / entry.quantity : 0;
        const costPerUnitEur = entry.quantity > 0 ? entry.costTotalEur / entry.quantity : 0;
        const packaging = entry.packagingUnit > 0
          ? `${formatQuantity(entry.packagingUnit)} st./verpakking${entry.packagesCount > 0 ? ` • ${formatQuantity(entry.packagesCount)} verp.` : ''}`
          : '-';

        return {
          ...entry,
          packaging,
          purchasePerUnitEur,
          costPerUnitEur,
        };
      })
      .sort((a, b) => b.batchNumber.localeCompare(a.batchNumber, 'nl', { numeric: true, sensitivity: 'base' }));
  }, [batches, costLines, draft.code, draft.id, draft.packagingUnit, registrations]);
  const batchOverviewTotals = useMemo(() => {
    return batchOverviewRows.reduce((summary, row) => ({
      batches: summary.batches + 1,
      quantity: summary.quantity + row.quantity,
      purchaseTotalEur: summary.purchaseTotalEur + (row.purchasePerUnitEur * row.quantity),
      costTotalEur: summary.costTotalEur + (row.costPerUnitEur * row.quantity),
    }), {
      batches: 0,
      quantity: 0,
      purchaseTotalEur: 0,
      costTotalEur: 0,
    });
  }, [batchOverviewRows]);

  function applySupplierManufacturer(supplierName: string) {
    const supplier = supplierRecords.find((item) => item.name === supplierName);
    const linkedImporter = importers.find((importer) => importer.id === supplier?.importerId);
    setDraft((current) => ({
      ...current,
      supplier: supplierName || undefined,
      ...(supplier ? {
        manufacturerName: supplier.name || current.manufacturerName,
        manufacturerEmail: supplier.email || current.manufacturerEmail,
        manufacturerAddress: supplier.address || current.manufacturerAddress,
        manufacturerWebsite: supplier.website || current.manufacturerWebsite,
        manufacturerPostalCode: supplier.postalCode || current.manufacturerPostalCode,
        manufacturerCity: supplier.city || current.manufacturerCity,
        manufacturerCountry: supplier.country || current.manufacturerCountry,
      } : {}),
      ...(linkedImporter ? {
        importerName: linkedImporter.name || current.importerName,
        importerEmail: linkedImporter.email || current.importerEmail,
        importerAddress: linkedImporter.address || current.importerAddress,
        importerWebsite: linkedImporter.website || current.importerWebsite,
        importerPostalCode: linkedImporter.postalCode || current.importerPostalCode,
        importerCity: linkedImporter.city || current.importerCity,
        importerCountry: linkedImporter.country || current.importerCountry,
      } : {}),
    }));
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
      try {
        const normalizeNumericInput = (value?: string) => {
          const trimmed = asOptionalTrimmedString(value);
          if (!trimmed) return undefined;
          return parseDecimal(trimmed).toFixed(8);
        };

        const normalizedLayers = packagingLayers
          .slice(0, packagingLayerNames.length)
          .map((layer, index) => ({
            name: asOptionalTrimmedString(layer.name) || packagingLayerNames[index],
            material: asOptionalTrimmedString(layer.material),
            recycleCode: asOptionalTrimmedString(layer.recycleCode),
            weightGrams: normalizeNumericInput(layer.weightGrams),
            recycledContentPercent: normalizeNumericInput(layer.recycledContentPercent),
            recyclabilityClass: layer.recyclabilityClass,
            packagingRole: layer.packagingRole,
            productStickerMaterial: layer.productStickerMaterial,
          }))
          .filter((layer) => layer.material || layer.recycleCode || layer.weightGrams || layer.recycledContentPercent || layer.recyclabilityClass || layer.packagingRole || layer.productStickerMaterial);

      const primaryLayer = normalizedLayers[0];
      const secondaryLayer = normalizedLayers[1];

      const nextProduct = {
        ...draft,
        code: draft.code.trim(),
        supplierItemNo: draft.supplierItemNo?.trim() || undefined,
        isNewProduct: draft.isNewProduct,
        createdAt: draft.createdAt,
        description: draft.description.trim(),
        barcode: draft.barcode?.trim() || undefined,
        batch: draft.batch?.trim() || undefined,
        salePrice: draft.salePrice?.trim() || undefined,
        purchasePrice: draft.purchasePrice?.trim() || undefined,
        costPrice: draft.costPrice?.trim() || undefined,
        articleGroup: draft.articleGroup?.trim() || undefined,
        stock: draft.stock?.trim() || undefined,
        startDate: draft.startDate?.trim() || undefined,
        endDate: draft.endDate?.trim() || undefined,
        supplier: selectedSupplierName.trim() || undefined,
        countryOfOrigin: draft.countryOfOrigin?.trim() || undefined,
        imageUrl: draft.imageUrl?.trim() || undefined,
        brand: draft.brand?.trim() || undefined,
        labelTitle: draft.labelTitle?.trim() || undefined,
        shortDescription: draft.shortDescription?.trim() || undefined,
        batchNumber: draft.batchNumber?.trim() || undefined,
        serialNumber: draft.serialNumber?.trim() || undefined,
        traceabilityCode: draft.traceabilityCode?.trim() || undefined,
        qrUrl: draft.qrUrl?.trim() || undefined,
        warning: draft.warning?.trim() || undefined,
        safetyInfo: draft.safetyInfo?.trim() || undefined,
        manufacturerName: draft.manufacturerName?.trim() || undefined,
        manufacturerAddress: draft.manufacturerAddress?.trim() || undefined,
        manufacturerPostalCode: draft.manufacturerPostalCode?.trim() || undefined,
        manufacturerCity: draft.manufacturerCity?.trim() || undefined,
        manufacturerCountry: draft.manufacturerCountry?.trim() || undefined,
        manufacturerEmail: draft.manufacturerEmail?.trim() || undefined,
        manufacturerWebsite: draft.manufacturerWebsite?.trim() || undefined,
        importerName: draft.importerName?.trim() || undefined,
        importerAddress: draft.importerAddress?.trim() || undefined,
        importerPostalCode: draft.importerPostalCode?.trim() || undefined,
        importerCity: draft.importerCity?.trim() || undefined,
        importerCountry: draft.importerCountry?.trim() || undefined,
        importerEmail: draft.importerEmail?.trim() || undefined,
        importerWebsite: draft.importerWebsite?.trim() || undefined,
        packagingUnit: String(Math.max(1, parseDecimal(draft.packagingUnit) || 1)),
        packagingLayers: normalizedLayers,
        packagingMaterialPrimary: primaryLayer?.material,
          packagingMaterialSecondary: secondaryLayer?.material,
          packagingRecycleCodePrimary: primaryLayer?.recycleCode,
          packagingRecycleCodeSecondary: secondaryLayer?.recycleCode,
          packagingWasteStream: asOptionalTrimmedString(derivedPackagingWasteStream),
          packagingNotes: asOptionalTrimmedString(draft.packagingNotes),
          packagingWeightPrimaryGrams: normalizeNumericInput(primaryLayer?.weightGrams),
          packagingWeightSecondaryGrams: normalizeNumericInput(secondaryLayer?.weightGrams),
          packagingWeightTotalGrams: normalizeNumericInput(derivedPackagingWeightTotal ?? draft.packagingWeightTotalGrams),
        };

      if (saveMode === 'apply') {
        await onSaveAndApplyPackaging(nextProduct, applyBatchNumber);
      } else {
        await onSave(nextProduct);
      }
    } finally {
      setSaving(false);
      setSaveMode('product');
    }
  }

  function updatePackagingLayer(index: number, updates: Partial<ProductPackagingLayer>) {
    setDraft((current) => {
      const nextLayers = [...(current.packagingLayers ?? normalizePackagingLayers(current))];
      const currentLayer = nextLayers[index] ?? createEmptyPackagingLayer(index);
      nextLayers[index] = {
        ...currentLayer,
        ...updates,
        name: currentLayer.name ?? packagingLayerNames[index],
      };

      return {
        ...current,
        packagingLayers: nextLayers,
      };
    });
  }

  function applyPackagingMaterial(index: number, value: string) {
    const option = findPackagingMaterialOption(value);
    updatePackagingLayer(index, {
      material: value || undefined,
      recycleCode: value ? option?.recycleCode ?? undefined : undefined,
    });
  }

  function addPackagingLayer() {
    setDraft((current) => {
      const nextLayers = [...(current.packagingLayers ?? normalizePackagingLayers(current))];
      if (nextLayers.length >= packagingLayerNames.length) return current;
      nextLayers.push(createEmptyPackagingLayer(nextLayers.length));
      return { ...current, packagingLayers: nextLayers };
    });
  }

  function removePackagingLayer(index: number) {
    setDraft((current) => {
      const currentLayers = [...(current.packagingLayers ?? normalizePackagingLayers(current))];
      const nextLayers = currentLayers.filter((_, layerIndex) => layerIndex !== index);
      while (nextLayers.length < 2) {
        nextLayers.push(createEmptyPackagingLayer(nextLayers.length));
      }
      return {
        ...current,
        packagingLayers: nextLayers
          .slice(0, packagingLayerNames.length)
          .map((layer, layerIndex) => ({
            ...layer,
            name: packagingLayerNames[layerIndex],
          })),
      };
    });
  }

  async function handleDymoPrint() {
    const quantityAnswer = window.prompt('Hoeveel productlabels wil je printen?', '1');
    if (quantityAnswer === null) return;
    const quantity = Number(quantityAnswer.replace(',', '.'));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      setDymoMessage('Vul een heel aantal labels in tussen 1 en 100.');
      return;
    }

    setDymoPrinting(true);
    setDymoMessage('');
    try {
      const printerName = onPrintLabel
        ? await onPrintLabel(draft, quantity)
        : await printProductDymoLabel(draft, quantity);
      setDymoMessage(`${quantity} productlabel${quantity === 1 ? '' : 's'} verstuurd naar ${printerName}.`);
    } catch (error) {
      setDymoMessage(`DYMO print mislukt: ${importErrorMessage(error)}`);
    } finally {
      setDymoPrinting(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal-card product-detail-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveProduct}>
        <div className="modal-header">
          <div>
            <span>Productkaart</span>
            <h2>{draft.description || draft.code}</h2>
          </div>
          <div className="modal-header-actions">
            <button type="button" className="secondary-button" disabled={dymoPrinting} onClick={handleDymoPrint}>
              <Printer size={15} /> {dymoPrinting ? 'Label printen...' : 'Print productlabel'}
            </button>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        </div>
        <section className="panel form-panel product-form-shell">
          <div className="product-tab-bar top-attached">
            <button type="button" className={`product-tab-button${activeTab === 'basic' ? ' active' : ''}`} onClick={() => setActiveTab('basic')}>
              <span className="panel-title-label"><BriefcaseBusiness size={16} /> Product informatie</span>
              <small className="product-section-meta">Artikel, prijzen, leverancier en planning.</small>
            </button>
            <button type="button" className={`product-tab-button${activeTab === 'gpsr' ? ' active' : ''}`} onClick={() => setActiveTab('gpsr')}>
              <span className="panel-title-label"><ShieldCheck size={16} /> Label informatie</span>
              <small className="product-section-meta">Traceerbaarheid, fabrikant en veiligheid.</small>
            </button>
            <button type="button" className={`product-tab-button${activeTab === 'packaging' ? ' active' : ''}`} onClick={() => setActiveTab('packaging')}>
              <span className="panel-title-label"><PackagePlus size={16} /> Verpakkingen informatie</span>
              <small className="product-section-meta">Materiaal, recyclecodes en gewichten.</small>
            </button>
            <button type="button" className={`product-tab-button${activeTab === 'batches' ? ' active' : ''}`} onClick={() => setActiveTab('batches')}>
              <span className="panel-title-label"><ClipboardList size={16} /> Batchoverzicht</span>
              <small className="product-section-meta">Batch nr, qty, verpakking, inkoop en kostprijs.</small>
            </button>
          </div>
          {activeTab === 'basic' && (
            <div className="product-section-body">
              <div className="product-form-subsection">
                <h3>Identificatie</h3>
                <div className="product-identification-layout">
                  <div className="form-grid">
                    <label>Artikelnummer
                      <input value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))} />
                    </label>
                    <label>Leveranciersnummer
                      <input value={draft.supplierItemNo ?? ''} onChange={(event) => setDraft((current) => ({ ...current, supplierItemNo: event.target.value }))} />
                    </label>
                    <label>Barcode
                      <input value={draft.barcode ?? ''} onChange={(event) => setDraft((current) => ({ ...current, barcode: event.target.value }))} />
                    </label>
                    <label>Omschrijving
                      <input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.isNewProduct)}
                        onChange={(event) => setDraft((current) => ({ ...current, isNewProduct: event.target.checked }))}
                      />
                      Nieuw product
                    </label>
                    <label>Batch
                      <input value={draft.batch ?? ''} onChange={(event) => setDraft((current) => ({ ...current, batch: event.target.value }))} />
                    </label>
                    <label>Merk
                      <input value={draft.brand ?? ''} onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))} />
                    </label>
                    <label>Artikelgroep
                      <input value={draft.articleGroup ?? ''} onChange={(event) => setDraft((current) => ({ ...current, articleGroup: event.target.value }))} />
                    </label>
                  </div>
                  <div className="product-image-card">
                    {productImageUrl ? (
                      productImageFailed ? (
                        <span>Afbeelding kan niet geladen worden.</span>
                      ) : (
                        <img
                          src={productImageUrl}
                          alt={draft.description || draft.code}
                          referrerPolicy="no-referrer"
                          onError={() => setProductImageFailed(true)}
                        />
                      )
                    ) : (
                      <span>Geen afbeelding</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="product-form-subsection">
                <h3>Verkoop en voorraad</h3>
                <div className="form-grid">
                  <label>Leverancier / fabrikant
                    <select value={selectedSupplierName} onChange={(event) => applySupplierManufacturer(event.target.value)}>
                      <option value="">Geen leverancier</option>
                      {supplierOptions.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
                    </select>
                  </label>
                  <label>Webwinkel
                    <select value={draft.webshop ? 'ja' : 'nee'} onChange={(event) => setDraft((current) => ({ ...current, webshop: event.target.value === 'ja' }))}>
                      <option value="ja">Ja</option>
                      <option value="nee">Nee</option>
                    </select>
                  </label>
                  <label>Verkoopprijs
                    <input value={draft.salePrice ?? ''} onChange={(event) => setDraft((current) => ({ ...current, salePrice: event.target.value }))} />
                  </label>
                  <label>Inkoopprijs
                    <input value={draft.purchasePrice ?? ''} onChange={(event) => setDraft((current) => ({ ...current, purchasePrice: event.target.value }))} />
                  </label>
                  <label>Kostprijs
                    <input value={draft.costPrice ?? ''} onChange={(event) => setDraft((current) => ({ ...current, costPrice: event.target.value }))} />
                  </label>
                  <label>Voorraad
                    <input value={draft.stock ?? ''} onChange={(event) => setDraft((current) => ({ ...current, stock: event.target.value }))} />
                  </label>
                  <label>Land van herkomst
                    <input value={draft.countryOfOrigin ?? ''} onChange={(event) => setDraft((current) => ({ ...current, countryOfOrigin: event.target.value }))} />
                  </label>
                </div>
              </div>
              <div className="product-form-subsection">
                <h3>Planning en media</h3>
                <div className="form-grid">
                  <label>Begindatum
                    <input type="date" value={rdwDateToInputDate(draft.startDate)} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value || undefined }))} />
                  </label>
                  <label>Einddatum
                    <input type="date" value={rdwDateToInputDate(draft.endDate)} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value || undefined }))} />
                  </label>
                  <label className="span-2">Afbeelding URL
                    <input value={draft.imageUrl ?? ''} onChange={(event) => setDraft((current) => ({ ...current, imageUrl: event.target.value }))} />
                  </label>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'gpsr' && (
            <div className="product-section-body">
              <div className="product-form-subsection">
                <h3>Label en traceerbaarheid</h3>
                <div className="form-grid">
                  <label>Label titel
                    <input value={draft.labelTitle ?? ''} onChange={(event) => setDraft((current) => ({ ...current, labelTitle: event.target.value }))} />
                  </label>
                  <label>QR link
                    <input value={draft.qrUrl ?? ''} onChange={(event) => setDraft((current) => ({ ...current, qrUrl: event.target.value }))} />
                  </label>
                  <label>Korte omschrijving
                    <input value={draft.shortDescription ?? ''} onChange={(event) => setDraft((current) => ({ ...current, shortDescription: event.target.value }))} />
                  </label>
                  <label>Traceercode
                    <input value={draft.traceabilityCode ?? ''} onChange={(event) => setDraft((current) => ({ ...current, traceabilityCode: event.target.value }))} />
                  </label>
                  <label>Batchnummer
                    <input value={draft.batchNumber ?? ''} onChange={(event) => setDraft((current) => ({ ...current, batchNumber: event.target.value }))} />
                  </label>
                  <label>Serienummer
                    <input value={draft.serialNumber ?? ''} onChange={(event) => setDraft((current) => ({ ...current, serialNumber: event.target.value }))} />
                  </label>
                </div>
              </div>
              <div className="product-form-subsection">
                <h3>Fabrikant</h3>
                <div className="form-grid">
                  <label>Fabrikant naam
                    <input value={draft.manufacturerName ?? ''} onChange={(event) => setDraft((current) => ({ ...current, manufacturerName: event.target.value }))} />
                  </label>
                  <label>Fabrikant e-mail
                    <input value={draft.manufacturerEmail ?? ''} onChange={(event) => setDraft((current) => ({ ...current, manufacturerEmail: event.target.value }))} />
                  </label>
                  <label>Fabrikant straat + huisnummer
                    <input value={draft.manufacturerAddress ?? ''} onChange={(event) => setDraft((current) => ({ ...current, manufacturerAddress: event.target.value }))} />
                  </label>
                  <label>Fabrikant website
                    <input value={draft.manufacturerWebsite ?? ''} onChange={(event) => setDraft((current) => ({ ...current, manufacturerWebsite: event.target.value }))} />
                  </label>
                  <label>Fabrikant postcode
                    <input value={draft.manufacturerPostalCode ?? ''} onChange={(event) => setDraft((current) => ({ ...current, manufacturerPostalCode: event.target.value }))} />
                  </label>
                  <label>Fabrikant plaats
                    <input value={draft.manufacturerCity ?? ''} onChange={(event) => setDraft((current) => ({ ...current, manufacturerCity: event.target.value }))} />
                  </label>
                  <label>Fabrikant land
                    <input value={draft.manufacturerCountry ?? ''} onChange={(event) => setDraft((current) => ({ ...current, manufacturerCountry: event.target.value }))} />
                  </label>
                </div>
              </div>
              <div className="product-form-subsection">
                <h3>Importeur / EU-verantwoordelijke</h3>
                <div className="product-table-intro compact">
                  <span>Deze velden worden automatisch gevuld vanuit jullie eigen importeurprofiel, maar blijven handmatig aanpasbaar.</span>
                </div>
                <div className="form-grid">
                  <label>Importeur naam
                    <input value={draft.importerName ?? ''} onChange={(event) => setDraft((current) => ({ ...current, importerName: event.target.value }))} />
                  </label>
                  <label>Importeur e-mail
                    <input value={draft.importerEmail ?? ''} onChange={(event) => setDraft((current) => ({ ...current, importerEmail: event.target.value }))} />
                  </label>
                  <label>Importeur straat + huisnummer
                    <input value={draft.importerAddress ?? ''} onChange={(event) => setDraft((current) => ({ ...current, importerAddress: event.target.value }))} />
                  </label>
                  <label>Importeur website
                    <input value={draft.importerWebsite ?? ''} onChange={(event) => setDraft((current) => ({ ...current, importerWebsite: event.target.value }))} />
                  </label>
                  <label>Importeur postcode
                    <input value={draft.importerPostalCode ?? ''} onChange={(event) => setDraft((current) => ({ ...current, importerPostalCode: event.target.value }))} />
                  </label>
                  <label>Importeur plaats
                    <input value={draft.importerCity ?? ''} onChange={(event) => setDraft((current) => ({ ...current, importerCity: event.target.value }))} />
                  </label>
                  <label>Importeur land
                    <input value={draft.importerCountry ?? ''} onChange={(event) => setDraft((current) => ({ ...current, importerCountry: event.target.value }))} />
                  </label>
                </div>
              </div>
              <div className="product-form-subsection">
                <h3>Veiligheid</h3>
                <div className="form-grid">
                  <label className="span-2">Waarschuwing
                    <textarea value={draft.warning ?? ''} onChange={(event) => setDraft((current) => ({ ...current, warning: event.target.value }))} />
                  </label>
                  <label className="span-2">Veiligheidsinformatie
                    <textarea value={draft.safetyInfo ?? ''} onChange={(event) => setDraft((current) => ({ ...current, safetyInfo: event.target.value }))} />
                  </label>
                </div>
              </div>
            </div>
          )}
            {activeTab === 'packaging' && (
              <div className="product-section-body">
                {applyBatchNumber ? (
                  <div className="inline-notice" style={{ marginBottom: 12 }}>
                    Deze actie werkt batchgericht voor <strong>{applyBatchNumber}</strong>. Als er voor die batch nog geen bestaande batchregistratie is, wordt nu alleen het product bijgewerkt.
                  </div>
                ) : null}
                <div className="product-form-subsection">
                  <div className="product-subsection-header">
                    <h3>Verpakking algemeen</h3>
                    <button type="button" className="secondary-button" onClick={addPackagingLayer} disabled={packagingLayers.length >= packagingLayerNames.length}>
                      <Plus size={16} /> Laag toevoegen
                    </button>
                  </div>
                  <div className="packaging-meta-grid">
                    <label>Stuks per verpakking
                      <input
                        value={draft.packagingUnit ?? '1'}
                        inputMode="decimal"
                        placeholder="1"
                        onChange={(event) => setDraft((current) => ({ ...current, packagingUnit: event.target.value }))}
                      />
                    </label>
                    <label>Afvalstromen
                      <input value={derivedPackagingWasteStream ?? ''} readOnly />
                    </label>
                    <label>Gewicht totaal verpakking (g)
                      <input value={derivedPackagingWeightTotal ?? draft.packagingWeightTotalGrams ?? ''} readOnly />
                    </label>
                  </div>
                </div>
                <div className="product-form-subsection">
                  <h3>Verpakkingslagen</h3>
                  <p className="product-section-hint">Leg per SKU alle verpakkingscomponenten vast. Dit vormt straks de basis voor Verpact/PPWR-export per materiaalcode.</p>
                  <div className="packaging-layer-table-header">
                    <span>Component</span>
                    <span>Materiaalcode</span>
                    <span>Rol</span>
                    <span>Afvalstroom</span>
                    <span>Gewicht (g)</span>
                    <span>% PCR</span>
                    <span>Recyclebaar</span>
                    <span>Productsticker</span>
                    <span>Labelicoon</span>
                    <span className="sr-only">Acties</span>
                  </div>
                  <div className="packaging-layer-stack">
                    {packagingLayers.map((layer, index) => {
                      const selectedOption = findPackagingMaterialOption(layer.material);
                      const layerWasteStream = selectedOption?.wasteStream ?? '';

                      return (
                        <div key={`${layer.name ?? packagingLayerNames[index]}-${index}`} className="packaging-layer-card">
                          <div className="packaging-layer-grid">
                            <div className="packaging-layer-name">
                              <strong>{layer.name ?? packagingLayerNames[index]}</strong>
                            </div>
                            <div className="packaging-layer-field">
                              <span className="packaging-layer-mobile-label">Materiaalcode</span>
                              <select value={layer.material ?? ''} onChange={(event) => applyPackagingMaterial(index, event.target.value)}>
                                <option value="">Selecteer...</option>
                                {layer.material && !selectedOption ? <option value={layer.material}>{layer.material}</option> : null}
                                {packagingMaterialOptions.map((option) => <option key={`${index}-${option.recycleCode}`} value={option.value}>{option.label}</option>)}
                              </select>
                            </div>
                            <div className="packaging-layer-field">
                              <span className="packaging-layer-mobile-label">Rol</span>
                              <select value={layer.packagingRole ?? ''} onChange={(event) => updatePackagingLayer(index, { packagingRole: (event.target.value || undefined) as ProductPackagingLayer['packagingRole'] })}>
                                <option value="">Selecteer...</option>
                                {packagingRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                              </select>
                            </div>
                            <div className="packaging-layer-field">
                              <span className="packaging-layer-mobile-label">Afvalstroom</span>
                              <input value={layerWasteStream} readOnly />
                            </div>
                            <div className="packaging-layer-field">
                              <span className="packaging-layer-mobile-label">Gewicht (g)</span>
                              <input
                                value={layer.weightGrams ?? ''}
                                inputMode="decimal"
                                placeholder="0,00000000"
                                onChange={(event) => updatePackagingLayer(index, { weightGrams: event.target.value || undefined })}
                              />
                            </div>
                            <div className="packaging-layer-field">
                              <span className="packaging-layer-mobile-label">% PCR</span>
                              <input
                                value={layer.recycledContentPercent ?? ''}
                                inputMode="decimal"
                                placeholder="0"
                                onChange={(event) => updatePackagingLayer(index, { recycledContentPercent: event.target.value || undefined })}
                              />
                            </div>
                            <div className="packaging-layer-field">
                              <span className="packaging-layer-mobile-label">Recyclebaar</span>
                              <select value={layer.recyclabilityClass ?? ''} onChange={(event) => updatePackagingLayer(index, { recyclabilityClass: (event.target.value || undefined) as ProductPackagingLayer['recyclabilityClass'] })}>
                                <option value="">Selecteer...</option>
                                {recyclabilityClassOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </div>
                            <div className="packaging-layer-field">
                              <span className="packaging-layer-mobile-label">Productsticker</span>
                              <select value={layer.productStickerMaterial ?? ''} onChange={(event) => updatePackagingLayer(index, { productStickerMaterial: (event.target.value || undefined) as ProductPackagingLayer['productStickerMaterial'] })}>
                                <option value="">N.v.t.</option>
                                {productStickerMaterialOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </div>
                            <div className="packaging-layer-preview">
                              <span className="packaging-layer-mobile-label">Labelicoon</span>
                              {isStickerPackagingLayer(layer) ? <span className="packaging-label-skip">Niet op label</span> : <PackagingMaterialIcon option={selectedOption} compact />}
                            </div>
                            <div className="packaging-layer-actions">
                              <button
                                type="button"
                                className="danger-icon-button"
                                onClick={() => removePackagingLayer(index)}
                                disabled={packagingLayers.length <= 2 && !layer.material && !layer.recycleCode && !layer.weightGrams && !layer.recycledContentPercent && !layer.recyclabilityClass && !layer.packagingRole && !layer.productStickerMaterial}
                                aria-label={`${layer.name ?? packagingLayerNames[index]} verwijderen`}
                              >
                                <XCircle size={18} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="product-form-subsection">
                  <h3>Opmerkingen</h3>
                  <div className="form-grid">
                  <label className="span-2">Verpakkingsopmerking
                    <textarea value={draft.packagingNotes ?? ''} onChange={(event) => setDraft((current) => ({ ...current, packagingNotes: event.target.value }))} />
                  </label>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'batches' && (
            <div className="product-section-body">
              <div className="product-form-subsection">
                <div className="product-table-intro compact">
                  <strong>Batchhistorie per product</strong>
                  <span>Per batch zie je hier de hoeveelheid, verpakking en de batchspecifieke prijzen van dit product.</span>
                </div>
                <div className="product-batch-summary-grid">
                  <div className="panel detail-card">
                    <span className="detail-card-title">Batches</span>
                    <strong>{batchOverviewTotals.batches}</strong>
                  </div>
                  <div className="panel detail-card">
                    <span className="detail-card-title">Totaal qty</span>
                    <strong>{formatQuantity(batchOverviewTotals.quantity)}</strong>
                  </div>
                  <div className="panel detail-card">
                    <span className="detail-card-title">Gem. inkoop</span>
                    <strong>{batchOverviewTotals.quantity > 0 ? formatCurrency((batchOverviewTotals.purchaseTotalEur / batchOverviewTotals.quantity).toFixed(4)) : '-'}</strong>
                  </div>
                  <div className="panel detail-card">
                    <span className="detail-card-title">Gem. kostprijs</span>
                    <strong>{batchOverviewTotals.quantity > 0 ? formatCurrency((batchOverviewTotals.costTotalEur / batchOverviewTotals.quantity).toFixed(4)) : '-'}</strong>
                  </div>
                </div>
              </div>
              <div className="product-form-subsection">
                {batchOverviewRows.length === 0 ? (
                  <div className="product-table-intro compact">
                    <span>Nog geen batchregels gevonden voor dit product.</span>
                  </div>
                ) : (
                  <div className="table-wrap product-batch-overview-wrap">
                    <table className="inventory-table product-batch-overview-table">
                      <thead>
                        <tr>
                          <th>Batch nr</th>
                          <th>QTY</th>
                          <th>Verpakking</th>
                          <th>Inkoop</th>
                          <th>Kostprijs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchOverviewRows.map((row) => (
                          <tr key={row.batchId}>
                            <td>{row.batchNumber}</td>
                            <td>{formatQuantity(row.quantity)}</td>
                            <td>{row.packaging}</td>
                            <td>{formatCurrency(row.purchasePerUnitEur.toFixed(4))}</td>
                            <td>{formatCurrency(row.costPerUnitEur.toFixed(4))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="drawer-actions">
            {message ? <p className="drawer-note">{message}</p> : null}
            {dymoMessage && <p className="drawer-note product-dymo-message">{dymoMessage}</p>}
            <button type="button" className="secondary-button" onClick={onClose}>Sluiten</button>
            <div className="modal-submit-actions">
              <button
                className="secondary-button"
                type="submit"
                disabled={saving}
                onClick={() => setSaveMode('product')}
              >
                {saving && saveMode === 'product' ? 'Opslaan...' : 'Opslaan'}
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
                onClick={() => setSaveMode('apply')}
              >
                {saving && saveMode === 'apply'
                  ? 'Toepassen...'
                  : applyBatchNumber
                    ? `Opslaan + toepassen op batch ${applyBatchNumber}`
                    : 'Opslaan + toepassen op batchregels'}
              </button>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}

function SuppliersPage({
  suppliers,
  importers,
  supplierContacts,
  products,
  onSaveSupplier,
  onSaveImporter,
  onSaveSupplierContact,
  onImportFromProducts,
  message,
}: {
  suppliers: Supplier[];
  importers: Importer[];
  supplierContacts: SupplierContact[];
  products: Product[];
  onSaveSupplier: (supplier: Supplier) => Promise<void>;
  onSaveImporter: (importer: Importer) => Promise<void>;
  onSaveSupplierContact: (contact: SupplierContact) => Promise<void>;
  onImportFromProducts: () => Promise<void>;
  message: string;
}) {
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showAddImporter, setShowAddImporter] = useState(false);
  const [selectedImporter, setSelectedImporter] = useState<Importer | null>(null);
  const sortedSuppliers = [...suppliers].sort((a, b) => {
    const activeRank = Number(b.active !== false) - Number(a.active !== false);
    if (activeRank !== 0) return activeRank;
    return a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' });
  });
  const sortedImporters = [...importers].sort((a, b) => {
    const activeRank = Number(b.active !== false) - Number(a.active !== false);
    if (activeRank !== 0) return activeRank;
    return a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' });
  });

  function productsForSupplier(supplier: Supplier) {
    return products.filter((product) => supplierNameMatches(supplier, product.supplier));
  }

  const productSupplierCount = new Set(products.map((product) => product.supplier?.trim()).filter(Boolean)).size;

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Leveranciers</h1>
          <span>{suppliers.length} leveranciers aangemaakt, {productSupplierCount} namen gevonden bij producten</span>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => void onImportFromProducts()}><DatabaseZap size={16} /> Uit producten halen</button>
          <button className="secondary-button" onClick={() => setShowAddImporter(true)}><Plus size={16} /> Importeur</button>
          <button className="secondary-button" onClick={() => setShowAddSupplier(true)}><Plus size={16} /> Leverancier</button>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <section className="panel table-panel">
        <div className="panel-title"><Factory size={16} /> Leveranciers / fabrikanten</div>
        {sortedSuppliers.length === 0 ? (
          <div className="empty-state inline"><Factory size={22} /><strong>Geen leveranciers aangemaakt</strong><span>Maak leveranciers aan zodat producten fabrikantgegevens kunnen overnemen.</span></div>
        ) : (
          <div className="dealer-table supplier-table">
            <div className="dealer-table-header supplier-table-header">
              <span>Leverancier</span>
              <span>Plaats</span>
              <span>Land</span>
              <span>Gekoppelde producten</span>
              <span>Actief</span>
            </div>
            {sortedSuppliers.map((supplier) => (
              <button className="dealer-table-row supplier-table-row" key={supplier.id} onClick={() => setSelectedSupplier(supplier)}>
                <span>{supplier.name}</span>
                <span>{supplier.city || '-'}</span>
                <span>{supplier.country || '-'}</span>
                <span>{productsForSupplier(supplier).length}</span>
                <span className={supplier.active === false ? 'inactive-status' : 'active-status'}>
                  {supplier.active === false ? '-' : <CheckCircle2 size={18} aria-label="Actief" />}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="panel table-panel">
        <div className="panel-title"><ShieldCheck size={16} /> Importeurs / EU-verantwoordelijke</div>
        {sortedImporters.length === 0 ? (
          <div className="empty-state inline"><ShieldCheck size={22} /><strong>Nog geen importeurs aangemaakt</strong><span>Maak hier jullie eigen importeursprofielen aan en koppel ze daarna aan fabrikanten.</span></div>
        ) : (
          <div className="dealer-table supplier-table">
            <div className="dealer-table-header supplier-table-header">
              <span>Importeur</span>
              <span>Plaats</span>
              <span>Land</span>
              <span>Gekoppelde fabrikanten</span>
              <span>Actief</span>
            </div>
            {sortedImporters.map((importer) => (
              <button className="dealer-table-row supplier-table-row" key={importer.id} onClick={() => setSelectedImporter(importer)}>
                <span>{importer.name}</span>
                <span>{importer.city || '-'}</span>
                <span>{importer.country || '-'}</span>
                <span>{suppliers.filter((supplier) => supplier.importerId === importer.id).length}</span>
                <span className={importer.active === false ? 'inactive-status' : 'active-status'}>
                  {importer.active === false ? '-' : <CheckCircle2 size={18} aria-label="Actief" />}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      {showAddSupplier && (
        <SupplierModal
          title="Nieuwe leverancier"
          importers={sortedImporters}
          contacts={[]}
          onClose={() => setShowAddSupplier(false)}
          onSave={async (supplier) => {
            await onSaveSupplier(supplier);
            setShowAddSupplier(false);
          }}
          onSaveContact={onSaveSupplierContact}
        />
      )}
      {selectedSupplier && (
        <SupplierModal
          supplier={selectedSupplier}
          title={selectedSupplier.name}
          importers={sortedImporters}
          contacts={supplierContacts.filter((contact) => contact.supplierId === selectedSupplier.id)}
          onClose={() => setSelectedSupplier(null)}
          onSave={async (supplier) => {
            await onSaveSupplier(supplier);
            setSelectedSupplier(supplier);
          }}
          onSaveContact={onSaveSupplierContact}
        />
      )}
      {showAddImporter && (
        <ImporterModal
          title="Nieuwe importeur"
          onClose={() => setShowAddImporter(false)}
          onSave={async (importer) => {
            await onSaveImporter(importer);
            setShowAddImporter(false);
          }}
        />
      )}
      {selectedImporter && (
        <ImporterModal
          importer={selectedImporter}
          title={selectedImporter.name}
          onClose={() => setSelectedImporter(null)}
          onSave={async (importer) => {
            await onSaveImporter(importer);
            setSelectedImporter(importer);
          }}
        />
      )}
    </>
  );
}

function supplierFromForm(form: FormData, existing?: Supplier): Supplier {
  const name = String(form.get('name') ?? '').trim();
  const isImportCompany = form.get('isImportCompany') === 'on';
  const contactName = String(form.get('contactName') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  const mobile = String(form.get('mobile') ?? '').trim();
  const website = String(form.get('website') ?? '').trim();
  const address = String(form.get('address') ?? '').trim();
  const postalCode = String(form.get('postalCode') ?? '').trim();
  const city = String(form.get('city') ?? '').trim();
  const country = String(form.get('country') ?? '').trim();
  const importerId = String(form.get('importerId') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();

  return {
    id: existing?.id ?? stableId('supplier', name || email || website || mobile),
    name,
    isImportCompany,
    importerId: importerId || undefined,
    contactName: contactName || undefined,
    email: email || undefined,
    phone: phone || undefined,
    mobile: mobile || undefined,
    website: website || undefined,
    address: address || undefined,
    postalCode: postalCode || undefined,
    city: city || undefined,
    country: country || undefined,
    notes: notes || undefined,
    active: existing?.active ?? true,
  };
}

function importerFromForm(form: FormData, existing?: Importer): Importer {
  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const website = String(form.get('website') ?? '').trim();
  const address = String(form.get('address') ?? '').trim();
  const postalCode = String(form.get('postalCode') ?? '').trim();
  const city = String(form.get('city') ?? '').trim();
  const country = String(form.get('country') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();
  const active = form.get('active') === 'on';

  return {
    id: existing?.id ?? stableId('importer', name || email || website || address),
    name,
    email: email || undefined,
    website: website || undefined,
    address: address || undefined,
    postalCode: postalCode || undefined,
    city: city || undefined,
    country: country || undefined,
    notes: notes || undefined,
    active,
  };
}

function supplierContactFromForm(form: FormData, supplierId: string, existing?: SupplierContact): SupplierContact {
  const name = String(form.get('name') ?? '').trim();
  const role = String(form.get('role') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  const mobile = String(form.get('mobile') ?? '').trim();
  const wechat = String(form.get('wechat') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();
  const isPrimary = form.get('isPrimary') === 'on';

  return {
    id: existing?.id ?? stableId('supplier-contact', `${supplierId}-${name || email || mobile || wechat}-${Date.now()}`),
    supplierId,
    name,
    role: role || undefined,
    email: email || undefined,
    phone: phone || undefined,
    mobile: mobile || undefined,
    wechat: wechat || undefined,
    notes: notes || undefined,
    isPrimary,
    active: existing?.active ?? true,
  };
}

function SupplierModal({
  supplier,
  title,
  importers,
  contacts,
  onClose,
  onSave,
  onSaveContact,
}: {
  supplier?: Supplier;
  title: string;
  importers: Importer[];
  contacts: SupplierContact[];
  onClose: () => void;
  onSave: (supplier: Supplier) => Promise<void>;
  onSaveContact: (contact: SupplierContact) => Promise<void>;
}) {
  const isActive = supplier?.active !== false;
  const isImportCompany = supplier?.isImportCompany === true;
  const [showAddContact, setShowAddContact] = useState(false);
  const [selectedContact, setSelectedContact] = useState<SupplierContact | null>(null);
  const sortedContacts = [...contacts].sort((a, b) => {
    const primaryRank = Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary));
    if (primaryRank !== 0) return primaryRank;
    return a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' });
  });
  const importerOptions = importers
    .filter((importer) => importer.active !== false || importer.id === supplier?.importerId)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(supplierFromForm(new FormData(event.currentTarget), supplier));
  }

  return (
    <>
      <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal-card dealer-modal" onSubmit={submitSupplier} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span>Leverancier / fabrikant</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <div className="form-grid">
          <label>Bedrijfsnaam*<input name="name" defaultValue={supplier?.name ?? ''} required /></label>
          <label>Contactpersoon<input name="contactName" defaultValue={supplier?.contactName ?? ''} /></label>
          <label>E-mail<input name="email" type="email" defaultValue={supplier?.email ?? ''} /></label>
          <label>Telefoon<input name="phone" defaultValue={supplier?.phone ?? ''} /></label>
          <label>Mobiel<input name="mobile" defaultValue={supplier?.mobile ?? ''} /></label>
          <label>Website<input name="website" defaultValue={supplier?.website ?? ''} /></label>
          <label>Straat + huisnummer<input name="address" defaultValue={supplier?.address ?? ''} /></label>
          <label>Postcode<input name="postalCode" defaultValue={supplier?.postalCode ?? ''} /></label>
          <label>Plaats<input name="city" defaultValue={supplier?.city ?? ''} /></label>
          <label>Land<input name="country" defaultValue={supplier?.country ?? ''} /></label>
          <label>Importeur / EU-verantwoordelijke
            <select name="importerId" defaultValue={supplier?.importerId ?? ''}>
              <option value="">Geen gekoppelde importeur</option>
              {importerOptions.map((importer) => <option key={importer.id} value={importer.id}>{importer.name}</option>)}
            </select>
          </label>
          <label className="checkbox-field">
            <input name="isImportCompany" type="checkbox" defaultChecked={isImportCompany} />
            Tonen bij Eigen import
          </label>
          <label className="span-2">Notities<textarea name="notes" defaultValue={supplier?.notes ?? ''} /></label>
        </div>
        <section className="supplier-contacts-section">
          <div className="supplier-contacts-header">
            <div>
              <h3>Contactpersonen</h3>
              <span>{supplier ? `${sortedContacts.length} gekoppeld` : 'Sla de leverancier eerst op om contactpersonen toe te voegen.'}</span>
            </div>
            {supplier && (
              <button type="button" className="secondary-button" onClick={() => setShowAddContact(true)}>
                <Plus size={16} /> Contactpersoon
              </button>
            )}
          </div>
          {supplier && sortedContacts.length > 0 && (
            <div className="supplier-contact-list">
              {sortedContacts.map((contact) => (
                <button type="button" className="supplier-contact-row" key={contact.id} onClick={() => setSelectedContact(contact)}>
                  <span>
                    <strong>{contact.name}</strong>
                    {contact.role && <small>{contact.role}</small>}
                  </span>
                  <span>{contact.email || '-'}</span>
                  <span>{contact.mobile || contact.phone || '-'}</span>
                  <span>{contact.wechat || '-'}</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <div className="modal-actions">
          {supplier && (
            <button
              type="button"
              className={isActive ? 'secondary-button' : 'primary-button'}
              onClick={() => onSave({ ...supplier, active: !isActive })}
            >
              {isActive ? 'Zet niet actief' : 'Zet actief'}
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onClose}>Annuleren</button>
          <button className="primary-button" type="submit">Opslaan</button>
        </div>
      </form>
      </div>
      {supplier && showAddContact && (
        <SupplierContactModal
          supplierId={supplier.id}
          title="Nieuwe contactpersoon"
          onClose={() => setShowAddContact(false)}
          onSave={async (contact) => {
            await onSaveContact(contact);
            setShowAddContact(false);
          }}
        />
      )}
      {supplier && selectedContact && (
        <SupplierContactModal
          supplierId={supplier.id}
          contact={selectedContact}
          title={selectedContact.name}
          onClose={() => setSelectedContact(null)}
          onSave={async (contact) => {
            await onSaveContact(contact);
            setSelectedContact(contact);
          }}
        />
      )}
    </>
  );
}

function ImporterModal({
  importer,
  title,
  onClose,
  onSave,
}: {
  importer?: Importer;
  title: string;
  onClose: () => void;
  onSave: (importer: Importer) => Promise<void>;
}) {
  const isActive = importer?.active !== false;

  async function submitImporter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(importerFromForm(new FormData(event.currentTarget), importer));
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal-card dealer-modal" onSubmit={submitImporter} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span>Importeur / EU-verantwoordelijke</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <div className="form-grid">
          <label>Bedrijfsnaam*<input name="name" defaultValue={importer?.name ?? ''} required /></label>
          <label>E-mail<input name="email" type="email" defaultValue={importer?.email ?? ''} /></label>
          <label>Website<input name="website" defaultValue={importer?.website ?? ''} /></label>
          <label>Straat + huisnummer<input name="address" defaultValue={importer?.address ?? ''} /></label>
          <label>Postcode<input name="postalCode" defaultValue={importer?.postalCode ?? ''} /></label>
          <label>Plaats<input name="city" defaultValue={importer?.city ?? ''} /></label>
          <label>Land<input name="country" defaultValue={importer?.country ?? ''} /></label>
          <label className="checkbox-field">
            <input name="active" type="checkbox" defaultChecked={isActive} />
            Actief
          </label>
          <label className="span-2">Notities<textarea name="notes" defaultValue={importer?.notes ?? ''} /></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Annuleren</button>
          <button className="primary-button" type="submit">Opslaan</button>
        </div>
      </form>
    </div>
  );
}

function SupplierContactModal({ supplierId, contact, title, onClose, onSave }: { supplierId: string; contact?: SupplierContact; title: string; onClose: () => void; onSave: (contact: SupplierContact) => Promise<void> }) {
  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(supplierContactFromForm(new FormData(event.currentTarget), supplierId, contact));
  }

  return (
    <div className="modal-backdrop nested-modal" onMouseDown={onClose}>
      <form className="modal-card dealer-modal" onSubmit={submitContact} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span>Contactpersoon</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <div className="form-grid">
          <label>Naam*<input name="name" defaultValue={contact?.name ?? ''} required /></label>
          <label>Functie<input name="role" defaultValue={contact?.role ?? ''} /></label>
          <label>E-mail<input name="email" type="email" defaultValue={contact?.email ?? ''} /></label>
          <label>Telefoon<input name="phone" defaultValue={contact?.phone ?? ''} /></label>
          <label>Mobiel<input name="mobile" defaultValue={contact?.mobile ?? ''} /></label>
          <label>WeChat<input name="wechat" defaultValue={contact?.wechat ?? ''} /></label>
          <label className="checkbox-field"><input name="isPrimary" type="checkbox" defaultChecked={Boolean(contact?.isPrimary)} /> Primair contact</label>
          <label className="span-2">Notities<textarea name="notes" defaultValue={contact?.notes ?? ''} /></label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Annuleren</button>
          <button className="primary-button" type="submit">Opslaan</button>
        </div>
      </form>
    </div>
  );
}

function Dealers({ dealers, scooters, onImport, onAddDealer, onUpdateDealer, message }: { dealers: Dealer[]; scooters: Scooter[]; onImport: (event: ChangeEvent<HTMLInputElement>) => void; onAddDealer: (event: FormEvent<HTMLFormElement>) => Promise<void>; onUpdateDealer: (dealer: Dealer) => Promise<void>; message: string }) {
  const [showAddDealer, setShowAddDealer] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const sortedDealers = [...dealers].sort((a, b) => {
    const activeRank = Number(b.active !== false) - Number(a.active !== false);
    if (activeRank !== 0) return activeRank;
    return (a.company || a.name).localeCompare(b.company || b.name, 'nl', { sensitivity: 'base' });
  });
  async function submitDealer(event: FormEvent<HTMLFormElement>) {
    await onAddDealer(event);
    setShowAddDealer(false);
  }
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Dealers</h1>
          <span>Totaal dealers: {dealers.length}</span>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => setShowAddDealer(true)}><Plus size={16} /> Dealer</button>
          <label className="upload-button"><Upload size={16} /> Dealers importeren<input type="file" accept=".csv,.xlsx,.xls" onChange={onImport} /></label>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="two-col">
        <DealerTablePanel dealers={sortedDealers} onSelect={setSelectedDealer} />
        <ConsignmentDealerPanel dealers={sortedDealers} scooters={scooters} onSelect={setSelectedDealer} />
      </div>
      {showAddDealer && (
        <div className="modal-backdrop" onMouseDown={() => setShowAddDealer(false)}>
          <form className="modal-card dealer-modal" onSubmit={submitDealer} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span>Dealers</span>
                <h2>Nieuwe dealer</h2>
              </div>
              <button type="button" onClick={() => setShowAddDealer(false)}>Close</button>
            </div>
            <div className="form-grid">
              <label>Email<input name="email" type="email" /></label>
              <label>Mobiel<input name="phone" /></label>
              <label>Bedrijfsnaam<input name="company" required /></label>
              <label>Voornaam<input name="firstName" /></label>
              <label>Achternaam<input name="lastName" /></label>
              <label>Straat<input name="street" /></label>
              <label>Huisnummer<input name="houseNumber" /></label>
              <label>Postcode<input name="postalCode" /></label>
              <label>Woonplaats<input name="city" /></label>
              <label>Extra info<textarea name="extraInfo" /></label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowAddDealer(false)}>Annuleren</button>
              <button className="primary-button" type="submit">Toevoegen</button>
            </div>
          </form>
        </div>
      )}
      {selectedDealer && (
        <DealerDetailModal
          dealer={selectedDealer}
          scooters={scooters}
          onClose={() => setSelectedDealer(null)}
          onUpdate={async (dealer) => {
            await onUpdateDealer(dealer);
            setSelectedDealer(dealer);
          }}
        />
      )}
    </>
  );
}

function DealerTablePanel({ dealers, onSelect }: { dealers: Dealer[]; onSelect: (dealer: Dealer) => void }) {
  return (
    <section className="panel list-panel">
      <div className="panel-title"><UsersRound size={16} /> Alle dealers</div>
      {dealers.length === 0 ? (
        <p className="empty">N.V.T.</p>
      ) : (
        <div className="dealer-table">
          <div className="dealer-table-header">
            <span>Company name</span>
            <span>Klantnaam</span>
            <span>Actief</span>
          </div>
          {dealers.map((dealer) => (
            <button className="dealer-table-row" key={dealer.id} onClick={() => onSelect(dealer)}>
              <span>{dealer.company || '-'}</span>
              <span>{dealer.name || '-'}</span>
              <span className={dealer.active === false ? 'inactive-status' : 'active-status'}>
                {dealer.active === false ? '-' : <CheckCircle2 size={18} aria-label="Actief" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ConsignmentDealerPanel({ dealers, scooters, onSelect }: { dealers: Dealer[]; scooters: Scooter[]; onSelect: (dealer: Dealer) => void }) {
  return (
    <section className="panel list-panel">
      <div className="panel-title"><UsersRound size={16} /> In consignatie</div>
      {dealers.length === 0 ? (
        <p className="empty">N.V.T.</p>
      ) : dealers.map((dealer) => {
        const count = scooters.filter((scooter) => scooter.dealerId === dealer.id && scooter.status === 'In consignatie').length;
        return (
          <button className={`simple-row clickable-row ${dealer.active === false ? 'muted-row' : ''}`} key={dealer.id} onClick={() => onSelect(dealer)}>
            <span>{count} bij {dealer.company || dealer.name} ({dealer.city || '-'})</span>
            <Plus size={14} />
          </button>
        );
      })}
    </section>
  );
}

function DealerDetailModal({ dealer, scooters, onClose, onUpdate }: { dealer: Dealer; scooters: Scooter[]; onClose: () => void; onUpdate: (dealer: Dealer) => Promise<void> }) {
  const isActive = dealer.active !== false;
  const consignmentScooters = scooters.filter((scooter) => scooter.dealerId === dealer.id && scooter.status === 'In consignatie');
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal-card dealer-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span>Dealerkaart</span>
            <h2>{dealer.company || dealer.name}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <dl className="dealer-detail-list">
          <dt>Company name</dt><dd>{dealer.company || '-'}</dd>
          <dt>Klantnaam</dt><dd>{dealer.name || '-'}</dd>
          <dt>Status</dt><dd>{isActive ? 'Actief' : 'Niet actief'}</dd>
          <dt>Email</dt><dd>{dealer.email || '-'}</dd>
          <dt>Telefoon</dt><dd>{dealer.phone || '-'}</dd>
          <dt>Straat + huisnummer</dt><dd>{dealer.address || '-'}</dd>
          <dt>Postcode</dt><dd>{dealer.Postalcode || '-'}</dd>
          <dt>Woonplaats</dt><dd>{dealer.city || '-'}</dd>
        </dl>
        <div className="modal-actions">
          <button
            className={isActive ? 'secondary-button' : 'primary-button'}
            type="button"
            onClick={() => onUpdate({ ...dealer, active: !isActive })}
          >
            {isActive ? 'Zet niet actief' : 'Zet actief'}
          </button>
        </div>
        <section className="dealer-scooter-overview">
          <h3>In consignatie ({consignmentScooters.length})</h3>
          {consignmentScooters.length === 0 ? (
            <p className="empty">Geen scooters in consignatie.</p>
          ) : consignmentScooters.map((scooter) => (
            <div className="dealer-scooter-row" key={scooter.id}>
              <strong>{scooter.frameNumber}</strong>
              <span>{scooter.model}</span>
              <span>{scooter.color}</span>
              <span>{normalizeSpeedValue(scooter.speed) || '-'}</span>
              <small>{scooter.licensePlate || 'Geen kenteken'}</small>
            </div>
          ))}
        </section>
      </section>
    </div>
  );
}

function Warranty({ data, products, addWarranty, updateWarranty, message }: { data: AppData; products: Product[]; addWarranty: (event: FormEvent<HTMLFormElement>) => Promise<boolean>; updateWarranty: (warranty: WarrantyPart) => Promise<void>; message: string }) {
  const [selectedFrame, setSelectedFrame] = useState('');
  const [selectedClaim, setSelectedClaim] = useState<WarrantyPart | null>(null);
  const [claimQuery, setClaimQuery] = useState('');
  const [claimStatusFilter, setClaimStatusFilter] = useState('');
  const [claimDealerFilter, setClaimDealerFilter] = useState('');
  const [claimWarrantyFilter, setClaimWarrantyFilter] = useState<'all' | 'active' | 'expired'>('all');
  const selectedScooter = data.scooters.find((scooter) => scooter.frameNumber === selectedFrame);
  const [licensePlate, setLicensePlate] = useState('');
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const [claimItems, setClaimItems] = useState<Array<{ productCode: string; productLookup: string; partName: string; partNumber: string; partPrice: string }>>([
    { productCode: '', productLookup: '', partName: '', partNumber: '', partPrice: '' },
  ]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number | null>(null);
  const registrationDate = selectedScooter?.firstRegistrationDate || selectedScooter?.firstAdmissionDate;
  const calculatedAge = formatVehicleAge(registrationDate);
  const warrantyUntil = addMonthsToInputDate(registrationDate);
  const warrantyExpired = isPastInputDate(warrantyUntil);

  function handleScooterChange(frameNumber: string) {
    const scooter = data.scooters.find((item) => item.frameNumber === frameNumber);
    setSelectedFrame(frameNumber);
    setLicensePlate(scooter?.licensePlate ?? '');
    setSelectedDealerId(scooter?.dealerId ?? '');
  }

  function handleLicensePlateChange(value: string) {
    setLicensePlate(value);
    const scooter = data.scooters.find((item) => normalizeLookup(item.licensePlate ?? '') === normalizeLookup(value));
    if (!scooter) {
      setSelectedFrame('');
      setSelectedDealerId('');
      return;
    }
    setSelectedFrame(scooter.frameNumber);
    setSelectedDealerId(scooter.dealerId ?? '');
  }

  const sortedProducts = [...products].sort((a, b) => a.description.localeCompare(b.description, 'nl', { sensitivity: 'base' }));
  const warrantyDealers = useMemo(
    () => Array.from(new Set(
      data.warranties
        .map((claim) => data.dealers.find((dealer) => dealer.id === claim.dealerId)?.company || '')
        .filter(Boolean),
    )).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' })),
    [data.dealers, data.warranties],
  );
  const filteredClaims = useMemo(() => {
    const query = normalizeLookup(claimQuery);
    return data.warranties.filter((claim) => {
      const dealerName = data.dealers.find((dealer) => dealer.id === claim.dealerId)?.company || '';
      const matchesQuery = !query || [
        claim.claimNumber || '',
        claim.scooterFrame,
        claim.licensePlate || '',
        claim.partName || '',
        claim.partNumber || '',
        dealerName,
      ].some((value) => normalizeLookup(value).includes(query));
      const matchesStatus = !claimStatusFilter || claim.status === claimStatusFilter;
      const matchesDealer = !claimDealerFilter || dealerName === claimDealerFilter;
      const isExpired = Boolean(claim.warrantyUntil) && isPastInputDate(claim.warrantyUntil);
      const matchesWarranty = claimWarrantyFilter === 'all'
        ? true
        : claimWarrantyFilter === 'expired'
          ? isExpired
          : !isExpired;
      return matchesQuery && matchesStatus && matchesDealer && matchesWarranty;
    });
  }, [claimDealerFilter, claimQuery, claimStatusFilter, claimWarrantyFilter, data.dealers, data.warranties]);
  const openClaims = data.warranties.filter((claim) => claim.status === 'Open').length;
  const processingClaims = data.warranties.filter((claim) => claim.status === 'In behandeling').length;
  const closedClaims = data.warranties.filter((claim) => claim.status === 'Afgehandeld').length;
  const expiredClaims = data.warranties.filter((claim) => claim.warrantyUntil && isPastInputDate(claim.warrantyUntil)).length;
  const totalClaimValue = data.warranties.reduce((sum, claim) => sum + Number(warrantyTotalPrice(claim) || 0), 0);

  function updateClaimItem(index: number, field: 'productCode' | 'productLookup' | 'partName' | 'partNumber' | 'partPrice', value: string) {
    setClaimItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  }

  function productLookupLabel(product: Product) {
    return `${product.code} - ${product.description}`;
  }

  function resolveProductFromLookup(value: string) {
    const normalizedValue = normalizeLookup(value);
    if (!normalizedValue) return undefined;
    return products.find((product) => {
      const codeMatch = normalizeLookup(product.code) === normalizedValue;
      const descriptionMatch = normalizeLookup(product.description) === normalizedValue;
      const labelMatch = normalizeLookup(productLookupLabel(product)) === normalizedValue;
      return codeMatch || descriptionMatch || labelMatch;
    });
  }

  function applyProductToClaimItem(index: number, code: string, lookupOverride?: string) {
    const selectedProduct = products.find((product) => product.code === code);
    setClaimItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (!selectedProduct) return { ...item, productCode: code, productLookup: lookupOverride ?? item.productLookup };
      return {
        ...item,
        productCode: code,
        productLookup: lookupOverride ?? productLookupLabel(selectedProduct),
        partName: selectedProduct.description || item.partName,
        partNumber: selectedProduct.code || item.partNumber,
        partPrice: parseCurrencyInput(selectedProduct.costPrice || selectedProduct.salePrice || '') || item.partPrice,
      };
    }));
    setActiveSuggestionIndex(null);
  }

  function handleClaimProductLookupChange(index: number, value: string) {
    setClaimItems((current) => current.map((item, itemIndex) => (itemIndex === index ? {
      ...item,
      productLookup: value,
      productCode: value.trim() ? item.productCode : '',
    } : item)));
    const matchedProduct = resolveProductFromLookup(value);
    if (matchedProduct) {
      applyProductToClaimItem(index, matchedProduct.code, productLookupLabel(matchedProduct));
      return;
    }
    setActiveSuggestionIndex(index);
  }

  function filteredProductSuggestions(item: { productCode: string; productLookup: string; partName: string; partNumber: string; partPrice: string }) {
    const query = normalizeLookup(item.productLookup);
    if (!query) return sortedProducts.slice(0, 8);
    return sortedProducts.filter((product) => {
      const haystacks = [product.code, product.description, product.barcode ?? '', product.supplier ?? ''];
      return haystacks.some((entry) => normalizeLookup(entry).includes(query));
    }).slice(0, 8);
  }

  function addClaimItemRow() {
    setClaimItems((current) => [...current, { productCode: '', productLookup: '', partName: '', partNumber: '', partPrice: '' }]);
  }

  function removeClaimItemRow(index: number) {
    setClaimItems((current) => current.length === 1 ? [{ productCode: '', productLookup: '', partName: '', partNumber: '', partPrice: '' }] : current.filter((_, itemIndex) => itemIndex !== index));
    setActiveSuggestionIndex(null);
  }

  async function handleWarrantySubmit(event: FormEvent<HTMLFormElement>) {
    const saved = await addWarranty(event);
    if (!saved) return;
    setSelectedFrame('');
    setLicensePlate('');
    setSelectedDealerId('');
    setClaimItems([{ productCode: '', productLookup: '', partName: '', partNumber: '', partPrice: '' }]);
    setActiveSuggestionIndex(null);
  }

  const claimItemsPayload = JSON.stringify(claimItems);
  const claimItemsTotal = claimItems.reduce((sum, item) => {
    const amount = Number(parseCurrencyInput(item.partPrice));
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Garantie claims</h1>
          <span>{data.warranties.length} claims geregistreerd</span>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <section className="panel">
        <div className="panel-title"><ShieldCheck size={16} /> Garantie dashboard</div>
        <div className="warranty-dashboard-toolbar">
          <input
            value={claimQuery}
            onChange={(event) => setClaimQuery(event.target.value)}
            placeholder="Zoek op claimnummer, framenummer, kenteken, onderdeel of dealer"
          />
          <select value={claimStatusFilter} onChange={(event) => setClaimStatusFilter(event.target.value)}>
            <option value="">Alle statussen</option>
            {warrantyStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={claimDealerFilter} onChange={(event) => setClaimDealerFilter(event.target.value)}>
            <option value="">Alle dealers</option>
            {warrantyDealers.map((dealer) => <option key={dealer} value={dealer}>{dealer}</option>)}
          </select>
          <select value={claimWarrantyFilter} onChange={(event) => setClaimWarrantyFilter(event.target.value as 'all' | 'active' | 'expired')}>
            <option value="all">Alle garanties</option>
            <option value="active">Binnen garantie</option>
            <option value="expired">Garantie verlopen</option>
          </select>
        </div>
      </section>
      <section className="stats-row warranty-stats">
        <article className="stat-card">
          <span>Totaal claims</span>
          <strong>{data.warranties.length}</strong>
          <small>{filteredClaims.length} zichtbaar na filters</small>
        </article>
        <article className="stat-card">
          <span>Open</span>
          <strong>{openClaims}</strong>
          <small>Nieuwe aanvragen</small>
        </article>
        <article className="stat-card">
          <span>In behandeling</span>
          <strong>{processingClaims}</strong>
          <small>Lopende claims</small>
        </article>
        <article className="stat-card">
          <span>Afgehandeld</span>
          <strong>{closedClaims}</strong>
          <small>Afgeronde claims</small>
        </article>
        <article className="stat-card">
          <span>Claimwaarde</span>
          <strong>{formatCurrency(totalClaimValue ? totalClaimValue.toFixed(2) : '')}</strong>
          <small>Onderdelen totaal</small>
        </article>
        <article className="stat-card">
          <span>Verlopen garantie</span>
          <strong>{expiredClaims}</strong>
          <small>Buiten garantietermijn</small>
        </article>
      </section>
      <div className="two-col warranty-layout">
        <section className="panel">
          <div className="panel-title"><ShieldCheck size={16} /> Claimoverzicht</div>
          {filteredClaims.length === 0 ? (
            <div className="empty-state inline">
              <ShieldCheck size={22} />
              <strong>{data.warranties.length === 0 ? 'Nog geen garantieclaims' : 'Geen claims binnen deze filters'}</strong>
              <span>{data.warranties.length === 0 ? 'Nieuwe claims verschijnen hier zodra je ze toevoegt.' : 'Pas de filters aan om meer claims te tonen.'}</span>
            </div>
          ) : filteredClaims.map((claim) => (
            <div className="claim-row" key={claim.id}>
              {warrantyStatusIcon(claim.status)}
              <button type="button" className="claim-row-main" onClick={() => setSelectedClaim(claim)}>
                <strong>{claim.claimNumber || claim.id} - {claim.licensePlate || 'geen kenteken'}</strong>
                <span>{claim.partName || 'Geen onderdeel'}{claim.partNumber ? ` - ${claim.partNumber}` : ''}</span>
                <small>{claim.scooterFrame}</small>
                <small>{warrantyItemsForClaim(claim).length} onderdeel{warrantyItemsForClaim(claim).length === 1 ? '' : 'en'} - totaal {formatCurrency(warrantyTotalPrice(claim))}</small>
                <small>{claim.mileage || '0'} km - ouderdom {claim.age || '-'}</small>
              </button>
              <div className="claim-row-side">
                <label className="compact-select-label">
                  Status
                  <select value={claim.status} onChange={(event) => updateWarranty({ ...claim, status: event.target.value as WarrantyPart['status'] })}>
                    {warrantyStatuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <small className="claim-row-date">Garantie tot {formatDate(claim.warrantyUntil)}</small>
              </div>
            </div>
          ))}
        </section>
        <form className="panel form-panel" onSubmit={handleWarrantySubmit}>
          <div className="panel-title"><ClipboardList size={16} /> Nieuwe garantieaanvraag</div>
          <div className="form-grid warranty-form-grid">
            <div className="wide-field form-section-label">
              <strong>Scooter en dealer</strong>
              <span>Kies eerst de scooter en dealer, daarna vullen we de claimgegevens aan.</span>
            </div>
            <label>Scooter<select name="scooterFrame" value={selectedFrame} onChange={(event) => handleScooterChange(event.target.value)}><option value="">Selecteer...</option>{data.scooters.map((s) => <option key={s.id} value={s.frameNumber}>{s.frameNumber}</option>)}</select></label>
            <label>Dealer<select name="dealerId" value={selectedDealerId} onChange={(event) => setSelectedDealerId(event.target.value)}><option value="">Selecteer...</option>{data.dealers.map((d) => <option value={d.id} key={d.id}>{d.company}</option>)}</select></label>
            <label>Kenteken<input name="licensePlate" value={licensePlate} onChange={(event) => handleLicensePlateChange(event.target.value)} /></label>
            <label>Kilometerstand<input name="mileage" inputMode="numeric" /></label>
            <div className="wide-field form-section-label">
              <strong>Claimgegevens</strong>
              <span>Leg de claimdatum, status en garantietermijn vast.</span>
            </div>
            <label>Ouderdom<input name="age" value={calculatedAge === '-' ? '' : calculatedAge} readOnly placeholder="Eerste tenaamstelling ontbreekt" /></label>
            <label>Claim date<input name="claimDate" type="date" required /></label>
            <label>Status<select name="status" defaultValue="Open">{warrantyStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>Garantie tot<input name="warrantyUntil" type="date" value={warrantyUntil} readOnly required /></label>
            <input type="hidden" name="claimItemsJson" value={claimItemsPayload} readOnly />
            <div className="wide-field warranty-items-panel">
              <div className="warranty-items-header">
                <strong>Onderdelen</strong>
                <button type="button" className="secondary-button" onClick={addClaimItemRow}>
                  <Plus size={14} /> Onderdeel toevoegen
                </button>
              </div>
              <div className="warranty-items-list">
                {claimItems.map((item, index) => (
                  <div className="warranty-item-row" key={`claim-item-${index}`}>
                    <div className="warranty-item-primary">
                      <label>
                        Product
                        <div className="suggestion-field">
                          <input
                            value={item.productLookup}
                            onChange={(event) => handleClaimProductLookupChange(index, event.target.value)}
                            onFocus={() => setActiveSuggestionIndex(index)}
                            onBlur={() => window.setTimeout(() => setActiveSuggestionIndex((current) => (current === index ? null : current)), 150)}
                            placeholder="Typ code of omschrijving..."
                            autoComplete="off"
                          />
                          {activeSuggestionIndex === index && filteredProductSuggestions(item).length > 0 && (
                            <div className="suggestion-list">
                              {filteredProductSuggestions(item).map((product) => (
                                <button
                                  key={product.id}
                                  type="button"
                                  className="suggestion-option"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    applyProductToClaimItem(index, product.code, productLookupLabel(product));
                                  }}
                                >
                                  <strong>{product.code}</strong>
                                  <span>{product.description}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>
                      <button type="button" className="icon-button danger-button warranty-item-remove" onClick={() => removeClaimItemRow(index)} aria-label={`Onderdeel ${index + 1} verwijderen`}>
                        <XCircle size={16} />
                      </button>
                    </div>
                    <div className="warranty-item-secondary">
                      <label>Onderdeel<input value={item.partName} onChange={(event) => updateClaimItem(index, 'partName', event.target.value)} required={index === 0} placeholder="Bijv. schokbrekerset achter" /></label>
                      <label>Part nummer<input value={item.partNumber} onChange={(event) => updateClaimItem(index, 'partNumber', event.target.value)} placeholder="Bijv. 2507001526" /></label>
                      <label>Prijs onderdeel<input value={item.partPrice} onChange={(event) => updateClaimItem(index, 'partPrice', event.target.value)} inputMode="decimal" placeholder="Bijv. 89,95" /></label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="warranty-items-summary">
                <span>{claimItems.filter((item) => item.partName.trim()).length} onderdeel{claimItems.filter((item) => item.partName.trim()).length === 1 ? '' : 'en'}</span>
                <strong>Totaal: {formatCurrency(claimItemsTotal ? claimItemsTotal.toFixed(2) : '')}</strong>
              </div>
            </div>
            <label className="wide-field">Notes<textarea name="notes" /></label>
          </div>
          {warrantyUntil ? (
            <p className={warrantyExpired ? 'inline-notice warning-notice' : 'inline-notice success-notice'}>
              {warrantyExpired
                ? `Garantie verlopen op ${formatDate(warrantyUntil)}.`
                : `Garantie geldig tot ${formatDate(warrantyUntil)} op basis van 24 maanden na eerste tenaamstelling.`}
            </p>
          ) : (
            <p className="inline-notice warning-notice">Geen eerste tenaamstelling bekend. Haal eerst RDW data op via de scooterkaart.</p>
          )}
          <button className="primary-button">Toevoegen</button>
        </form>
      </div>
      {selectedClaim && (
        <WarrantyDetailModal
          claim={selectedClaim}
          scooter={data.scooters.find((scooter) => scooter.frameNumber === selectedClaim.scooterFrame)}
          dealer={data.dealers.find((dealer) => dealer.id === selectedClaim.dealerId)}
          onClose={() => setSelectedClaim(null)}
        />
      )}
    </>
  );
}

function WarrantyDetailModal({ claim, scooter, dealer, onClose }: { claim: WarrantyPart; scooter?: Scooter; dealer?: Dealer; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal-card warranty-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span>Garantieclaim</span>
            <h2>{claim.claimNumber || claim.id}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <dl className="dealer-detail-list">
          <dt>Status</dt><dd>{claim.status}</dd>
          <dt>Primair onderdeel</dt><dd>{claim.partName}</dd>
          <dt>Part nummer</dt><dd>{claim.partNumber || '-'}</dd>
          <dt>Totale onderdelenprijs</dt><dd>{formatCurrency(warrantyTotalPrice(claim))}</dd>
          <dt>Kenteken</dt><dd>{claim.licensePlate || scooter?.licensePlate || '-'}</dd>
          <dt>Framenummer</dt><dd>{claim.scooterFrame}</dd>
          <dt>Scooter</dt><dd>{scooter ? `${scooter.model} - ${scooter.color} - ${normalizeSpeedValue(scooter.speed)}` : '-'}</dd>
          <dt>Dealer</dt><dd>{dealer?.company || '-'}</dd>
          <dt>Kilometerstand</dt><dd>{claim.mileage || '-'}</dd>
          <dt>Ouderdom</dt><dd>{claim.age || '-'}</dd>
          <dt>Claimdatum</dt><dd>{formatDate(claim.claimDate)}</dd>
          <dt>Garantie tot</dt><dd>{formatDate(claim.warrantyUntil)}</dd>
          <dt>Notities</dt><dd>{claim.notes || '-'}</dd>
        </dl>
        <section className="warranty-detail-items">
          <h3>Onderdelen in deze claim</h3>
          <div className="warranty-detail-item-table">
            <div className="warranty-detail-item-head">Onderdeel</div>
            <div className="warranty-detail-item-head">Part nummer</div>
            <div className="warranty-detail-item-head">Prijs</div>
            {warrantyItemsForClaim(claim).map((item, index) => (
              <Fragment key={`${claim.id}-item-${index}`}>
                <div>{item.partName}</div>
                <div>{item.partNumber || '-'}</div>
                <div>{formatCurrency(item.partPrice)}</div>
              </Fragment>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function Maintenance({ data, addMaintenance, message }: { data: AppData; addMaintenance: (event: FormEvent<HTMLFormElement>) => void; message: string }) {
  const [historyQuery, setHistoryQuery] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<keyof typeof maintenancePackages>('small');
  const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceRecord | null>(null);
  const sortedMaintenance = [...data.maintenance].sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  const [selectedFrame, setSelectedFrame] = useState(data.scooters[0]?.frameNumber ?? '');
  const [maintenanceLicensePlate, setMaintenanceLicensePlate] = useState(data.scooters[0]?.licensePlate ?? '');
  const selectedScooter = data.scooters.find((scooter) => scooter.frameNumber === selectedFrame);
  const historyNeedle = normalizePlate(historyQuery);
  const historyScooter = historyNeedle
    ? data.scooters.find((scooter) =>
      normalizePlate(scooter.licensePlate ?? '').includes(historyNeedle) ||
      normalizePlate(scooter.frameNumber).includes(historyNeedle))
    : null;
  const visibleMaintenance = historyScooter
    ? sortedMaintenance.filter((record) => record.scooterFrame === historyScooter.frameNumber || normalizePlate(record.licensePlate ?? '') === normalizePlate(historyScooter.licensePlate ?? ''))
    : sortedMaintenance;
  const historyWarranties = historyScooter
    ? data.warranties.filter((claim) => claim.scooterFrame === historyScooter.frameNumber)
    : [];

  function normalizePlate(value: string) {
    return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
  }

  function handleMaintenanceScooterChange(frameNumber: string) {
    const scooter = data.scooters.find((item) => item.frameNumber === frameNumber);
    setSelectedFrame(frameNumber);
    setMaintenanceLicensePlate(scooter?.licensePlate ?? '');
  }

  function handleMaintenancePlateChange(value: string) {
    setMaintenanceLicensePlate(value);
    const scooter = data.scooters.find((item) => normalizePlate(item.licensePlate ?? '') === normalizePlate(value));
    if (scooter) setSelectedFrame(scooter.frameNumber);
  }

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Onderhoud</h1>
          <span>{data.maintenance.length} onderhoudsregels geregistreerd</span>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <section className="panel maintenance-search">
        <div className="panel-title"><Search size={16} /> Scooter historie zoeken</div>
        <div className="inline-search">
          <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Zoek kenteken of framenummer" />
        </div>
        {historyQuery && !historyScooter && <p className="empty">Geen scooter gevonden voor deze zoekopdracht.</p>}
        {historyScooter && (
          <div className="history-card">
            <dl className="detail-list rdw-list">
              <dt>Kenteken</dt><dd>{historyScooter.licensePlate || '-'}</dd>
              <dt>Framenummer</dt><dd>{historyScooter.frameNumber}</dd>
              <dt>Model</dt><dd>{historyScooter.model}</dd>
              <dt>Kleur</dt><dd>{historyScooter.color}</dd>
              <dt>Snelheid</dt><dd>{normalizeSpeedValue(historyScooter.speed)}</dd>
              <dt>Status</dt><dd>{historyScooter.status}</dd>
              <dt>RDW</dt><dd>{formatDate(historyScooter.firstAdmissionDate)} - {historyScooter.emissionClass || '-'}</dd>
            </dl>
            <div className="history-columns">
              <div>
                <strong>Onderhoud ({visibleMaintenance.length})</strong>
                {visibleMaintenance.length === 0 ? <p className="empty">Geen onderhoud geregistreerd.</p> : visibleMaintenance.map((record) => (
                  <p key={record.id}>{formatDate(record.serviceDate)} - {record.serviceType} - {record.mileage || '0'} km</p>
                ))}
              </div>
              <div>
                <strong>Warranty ({historyWarranties.length})</strong>
                {historyWarranties.length === 0 ? <p className="empty">Geen warranty claims.</p> : historyWarranties.map((claim) => (
                  <p key={claim.id}>{claim.partName} - {claim.status}</p>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
      <div className="two-col maintenance-layout">
        <section className="panel">
          <div className="panel-title"><ClipboardList size={16} /> Scooter onderhoud</div>
          {visibleMaintenance.length === 0 ? (
            <div className="empty-state inline"><ClipboardList size={22} /><strong>Nog geen onderhoud</strong><span>Nieuwe onderhoudsregels verschijnen hier zodra je ze toevoegt.</span></div>
          ) : visibleMaintenance.map((record) => {
            const scooter = data.scooters.find((item) => item.frameNumber === record.scooterFrame);
            return (
              <button className="maintenance-row" key={record.id} onClick={() => setSelectedMaintenance(record)}>
                <div>
                  <strong>{record.licensePlate || scooter?.licensePlate || 'Geen kenteken'}</strong>
                  <span>{record.scooterFrame} - {scooter?.model || 'Scooter'} - {record.servicePackage || record.serviceType}</span>
                  <small>{formatDate(record.serviceDate)} - {record.mileage || '0'} km</small>
                  {record.checklist?.length ? <small>{record.checklist.length} checklistpunten afgevinkt</small> : null}
                </div>
                <span className="status-pill">{record.status}</span>
                <small>Volgende: {formatDate(record.nextServiceDate)}</small>
              </button>
            );
          })}
        </section>
        <form className="panel form-panel" onSubmit={addMaintenance}>
          <div className="panel-title"><Plus size={16} /> Onderhoud toevoegen</div>
          <div className="form-grid warranty-form-grid">
            <label>Scooter
              <select name="scooterFrame" required value={selectedFrame} onChange={(event) => handleMaintenanceScooterChange(event.target.value)}>
                {data.scooters.map((scooter) => (
                  <option value={scooter.frameNumber} key={scooter.id}>
                    {scooter.model}
                  </option>
                ))}
              </select>
            </label>
            <label>Onderhoudsdatum<input name="serviceDate" type="date" required /></label>
            <label>Kenteken<input name="licensePlate" placeholder="bijv. FVZ16T" value={maintenanceLicensePlate} onChange={(event) => handleMaintenancePlateChange(event.target.value)} /></label>
            <label>Framenummer<input value={selectedScooter?.frameNumber ?? ''} readOnly /></label>
            <label>Onderhoudspakket
              <select name="servicePackage" value={maintenancePackages[selectedPackage].label} onChange={(event) => setSelectedPackage(event.target.value === maintenancePackages.large.label ? 'large' : 'small')}>
                <option>{maintenancePackages.small.label}</option>
                <option>{maintenancePackages.large.label}</option>
              </select>
            </label>
            <label>Kilometerstand<input name="mileage" inputMode="numeric" /></label>
            <label>Volgende onderhoudsdatum<input name="nextServiceDate" type="date" /></label>
            <label>Status
              <select name="status" defaultValue="Gepland">
                <option>Gepland</option>
                <option>Uitgevoerd</option>
                <option>Aandacht nodig</option>
              </select>
            </label>
            <fieldset className="maintenance-checklist">
              <legend>{maintenancePackages[selectedPackage].label}</legend>
              {maintenancePackages[selectedPackage].items.map((item) => (
                <label key={item}><input type="checkbox" name="checklist" value={item} /> {item}</label>
              ))}
            </fieldset>
            <label className="wide-field">Notities<textarea name="notes" /></label>
          </div>
          <button className="primary-button">Toevoegen</button>
        </form>
      </div>
      {selectedMaintenance && (
        <MaintenanceDetailModal
          record={selectedMaintenance}
          scooter={data.scooters.find((item) => item.frameNumber === selectedMaintenance.scooterFrame)}
          onClose={() => setSelectedMaintenance(null)}
        />
      )}
    </>
  );
}

function MaintenanceDetailModal({ record, scooter, onClose }: { record: MaintenanceRecord; scooter?: Scooter; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal-card maintenance-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span>Onderhoud</span>
            <h2>{record.licensePlate || scooter?.licensePlate || record.scooterFrame}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <dl className="dealer-detail-list">
          <dt>Kenteken</dt><dd>{record.licensePlate || scooter?.licensePlate || '-'}</dd>
          <dt>Framenummer</dt><dd>{record.scooterFrame}</dd>
          <dt>Scooter</dt><dd>{scooter ? `${scooter.model} - ${scooter.color} - ${normalizeSpeedValue(scooter.speed)}` : '-'}</dd>
          <dt>Pakket</dt><dd>{record.servicePackage || '-'}</dd>
          <dt>Type onderhoud</dt><dd>{record.serviceType}</dd>
          <dt>Onderhoudsdatum</dt><dd>{formatDate(record.serviceDate)}</dd>
          <dt>Kilometerstand</dt><dd>{record.mileage || '-'}</dd>
          <dt>Volgende onderhoud</dt><dd>{formatDate(record.nextServiceDate)}</dd>
          <dt>Status</dt><dd>{record.status}</dd>
          <dt>Notities</dt><dd>{record.notes || '-'}</dd>
        </dl>
        <section className="maintenance-detail-checklist">
          <h3>Checklist ({record.checklist?.length ?? 0})</h3>
          {record.checklist?.length ? record.checklist.map((item) => (
            <div className="checklist-result" key={item}><CheckCircle2 size={16} /> {item}</div>
          )) : <p className="empty">Geen checklistpunten afgevinkt.</p>}
        </section>
      </section>
    </div>
  );
}

function GlobalSearch({ data, query, setQuery, scooters, onSelect }: { data: AppData; query: string; setQuery: (value: string) => void; scooters: Scooter[]; onSelect: (scooter: Scooter) => void }) {
  const [searchField, setSearchField] = useState<SearchField>('frameNumber');
  const [panelFilters, setPanelFilters] = useState<ScooterPanelFilters>({
    speed: '',
    model: '',
    color: '',
    status: '',
  });
  const visibleScooters = filterScootersForPanel(scooters, query, searchField, panelFilters);
  return (
    <>
      <h1>Zoeken</h1>
      <SearchPanel
        scooters={scooters}
        query={query}
        setQuery={setQuery}
        searchField={searchField}
        setSearchField={setSearchField}
        panelFilters={panelFilters}
        setPanelFilters={setPanelFilters}
      />
      <ScooterTable scooters={visibleScooters} dealers={data.dealers} query={query} setQuery={setQuery} onSelect={onSelect} />
    </>
  );
}

function SearchPanel({
  scooters,
  query,
  setQuery,
  searchField,
  setSearchField,
  panelFilters,
  setPanelFilters,
}: {
  scooters: Scooter[];
  query: string;
  setQuery: (value: string) => void;
  searchField: SearchField;
  setSearchField: (value: SearchField) => void;
  panelFilters: ScooterPanelFilters;
  setPanelFilters: (value: ScooterPanelFilters) => void;
}) {
  const speedOptions = speedOptionsFromScooters(scooters);
  const modelOptions = Array.from(new Set(scooters.map((scooter) => scooter.model).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const colorOptions = Array.from(new Set(scooters.map((scooter) => scooter.color).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));
  const statusOptions = Array.from(new Set(scooters.map((scooter) => scooter.status).filter(Boolean)));
  const placeholder = searchField === 'frameNumber'
    ? 'Zoek op framenummer'
    : searchField === 'engineNumber'
      ? 'Zoek op motornummer'
      : 'Zoek op kenteken';

  return (
    <section className="panel search-panel">
      <div className="panel-title"><Search size={16} /> Zoeken</div>
      <div className="search-grid">
        <div>
          <strong>Zoek in</strong>
          <label><input type="checkbox" checked={searchField === 'frameNumber'} onChange={() => setSearchField('frameNumber')} /> Frame nummer</label>
          <label><input type="checkbox" checked={searchField === 'engineNumber'} onChange={() => setSearchField('engineNumber')} /> Engine nummer</label>
          <label><input type="checkbox" checked={searchField === 'licensePlate'} onChange={() => setSearchField('licensePlate')} /> Kenteken</label>
        </div>
        <div>
          <strong>voor</strong>
          <div className="inline-search">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} />
            <button className="primary-button" type="button" onClick={() => setQuery('')}><Search size={15} /></button>
          </div>
        </div>
        <div>
          <strong>met</strong>
          <select value={panelFilters.speed} onChange={(event) => setPanelFilters({ ...panelFilters, speed: event.target.value })}>
            <option value="">Alle snelheden</option>
            {speedOptions.map((speed) => <option key={speed} value={speed}>{speed}</option>)}
          </select>
          <select value={panelFilters.model} onChange={(event) => setPanelFilters({ ...panelFilters, model: event.target.value })}>
            <option value="">Alle modellen</option>
            {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
          <select value={panelFilters.color} onChange={(event) => setPanelFilters({ ...panelFilters, color: event.target.value })}>
            <option value="">Alle kleuren</option>
            {colorOptions.map((color) => <option key={color} value={color}>{color}</option>)}
          </select>
          <select value={panelFilters.status} onChange={(event) => setPanelFilters({ ...panelFilters, status: event.target.value })}>
            <option value="">Alle statussen</option>
            {statusOptions.map((status) => <option key={status} value={status}>{scooterStatusLabel(status)}</option>)}
          </select>
        </div>
      </div>
    </section>
  );
}

function ListPanel({ title, items, green = false }: { title: string; items: string[]; green?: boolean }) {
  return (
    <section className="panel list-panel">
      <div className="panel-title"><UsersRound size={16} /> {title}</div>
      {items.length === 0 ? <p className="empty">N.V.T.</p> : items.map((item) => <div className={green ? 'green-row' : 'simple-row'} key={item}>{item}<Plus size={14} /></div>)}
    </section>
  );
}

function ContainerListPanel({
  title,
  containers,
  scooters,
  dealers,
  onSelect,
  onMarkContainerAvailable,
  green = false,
  emptyMessage = 'N.V.T.',
}: {
  title: string;
  containers: Container[];
  scooters: Scooter[];
  dealers: Dealer[];
  onSelect: (scooter: Scooter) => void;
  onMarkContainerAvailable?: (container: Container, arrivedAtInput: string) => Promise<void>;
  green?: boolean;
  emptyMessage?: string;
}) {
  const [openContainerId, setOpenContainerId] = useState<string | null>(null);
  return (
    <section className="panel list-panel">
      <div className="panel-title"><Boxes size={16} /> {title}</div>
      {containers.length === 0 ? <p className="empty">{emptyMessage}</p> : containers.map((container) => {
        const containerScooters = scooters.filter((scooter) => scooter.containerId === container.id);
        const readyScooters = containerScooters.filter((scooter) => scooter.status === 'Beschikbaar' || scooter.status === 'In consignatie').length;
        const isOpen = openContainerId === container.id;
        return (
          <div className="container-list-item" key={container.id}>
            <button className={green ? 'green-row container-toggle-row' : 'simple-row container-toggle-row'} onClick={() => setOpenContainerId(isOpen ? null : container.id)}>
              <span>
                <strong>{container.number}</strong>
                <small>{container.invoiceNumber} - {formatDate(container.arrivedAt || container.eta)}</small>
              </span>
              <span className="container-row-meta">{readyScooters}/{containerScooters.length} scooters {isOpen ? '-' : '+'}</span>
            </button>
            {isOpen && (
              <div className="container-expanded-content">
                <ContainerAvailabilityBoard
                  container={container}
                  scooters={containerScooters}
                  dealers={dealers}
                  onSelect={onSelect}
                  onMarkContainerAvailable={onMarkContainerAvailable}
                />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function ScooterDrawer({
  scooter,
  dealers,
  warranties,
  maintenance,
  documents,
  onClose,
  onUpdate,
  onAddDocument,
  onOpenDocument,
  onDownloadDocument,
}: {
  scooter: Scooter;
  dealers: Dealer[];
  warranties: WarrantyPart[];
  maintenance: MaintenanceRecord[];
  documents: DocumentRecord[];
  onClose: () => void;
  onUpdate: (scooter: Scooter) => void | Promise<void>;
  onAddDocument: (scooterFrame: string, type: DocumentRecord['type'], note: string, file: File) => Promise<DocumentRecord>;
  onOpenDocument: (document: DocumentRecord) => Promise<void>;
  onDownloadDocument: (document: DocumentRecord) => Promise<void>;
}) {
  const [draft, setDraft] = useState(scooter);
  const [rdwLoading, setRdwLoading] = useState(false);
  const [rdwMessage, setRdwMessage] = useState('');
  const [dymoPrinting, setDymoPrinting] = useState(false);
  const [dymoMessage, setDymoMessage] = useState('');
  const [documentMessage, setDocumentMessage] = useState('');
  const [documentUploading, setDocumentUploading] = useState(false);
  const registrationComplete = isRegistrationComplete(scooter);
  const selectableDealers = dealers
    .filter((dealer) => dealer.active !== false || dealer.id === draft.dealerId)
    .sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name, 'nl', { sensitivity: 'base' }));

  async function handleRdwFetch() {
    setRdwLoading(true);
    setRdwMessage('');
    try {
      const rdwData = await fetchRdwRegistration(draft.licensePlate ?? '');
      const nextDraft = {
        ...draft,
        speed: rdwData.speed || draft.speed,
        firstAdmissionDate: rdwData.firstAdmissionDate || draft.firstAdmissionDate,
        firstRegistrationDate: rdwData.firstRegistrationDate || draft.firstRegistrationDate,
        lastRegistrationDate: rdwData.lastRegistrationDate || draft.lastRegistrationDate,
        emissionClass: rdwData.emissionClass || draft.emissionClass,
        rdwType: rdwData.rdwType || draft.rdwType,
        rdwTypeApprovalNumber: rdwData.rdwTypeApprovalNumber || draft.rdwTypeApprovalNumber,
        rdwVariant: rdwData.rdwVariant || draft.rdwVariant,
        rdwExecution: rdwData.rdwExecution || draft.rdwExecution,
      };
      setDraft(nextDraft);
      await onUpdate(nextDraft);
      setRdwMessage('RDW voertuigdata is opgehaald en opgeslagen.');
    } catch (error) {
      setRdwMessage(`RDW ophalen mislukt: ${importErrorMessage(error)}`);
    } finally {
      setRdwLoading(false);
    }
  }

  async function handleDocumentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get('file');
    const type = String(form.get('type') ?? 'Overig') as DocumentRecord['type'];
    const note = String(form.get('note') ?? '').trim();

    if (!(file instanceof File) || file.size === 0) {
      setDocumentMessage('Kies eerst een bestand om te uploaden.');
      return;
    }

    setDocumentUploading(true);
    setDocumentMessage('');
    try {
      await onAddDocument(scooter.frameNumber, type, note, file);
      setDocumentMessage(`${file.name} is toegevoegd bij ${scooter.frameNumber}.`);
      formElement.reset();
    } catch (error) {
      setDocumentMessage(`Document upload mislukt: ${importErrorMessage(error)}`);
    } finally {
      setDocumentUploading(false);
    }
  }

  async function handleOpenDocument(document: DocumentRecord) {
    try {
      await onOpenDocument(document);
    } catch (error) {
      setDocumentMessage(`Document openen mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function handleDownloadDocument(document: DocumentRecord) {
    try {
      await onDownloadDocument(document);
    } catch (error) {
      setDocumentMessage(`Document downloaden mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function handleDymoPrint() {
    setDymoPrinting(true);
    setDymoMessage('');
    try {
      const printerName = await printScooterDymoLabel(draft, dealers.find((dealer) => dealer.id === draft.dealerId));
      setDymoMessage(`Label verstuurd naar ${printerName}.`);
    } catch (error) {
      setDymoMessage(`DYMO print mislukt: ${importErrorMessage(error)}`);
    } finally {
      setDymoPrinting(false);
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <span>Scooter detail</span>
            <h2>{scooter.frameNumber}</h2>
          </div>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="drawer-grid detail-grid">
          <section className="panel detail-card">
            <div className="panel-title"><Bike size={16} /> Identificatie</div>
            <dl className="detail-list">
              <dt>Frame nummer</dt><dd>{scooter.frameNumber}</dd>
              <dt>Engine nummer</dt><dd>{scooter.engineNumber || '-'}</dd>
              <dt>Merk</dt><dd>{scooter.brand}</dd>
              <dt>Model</dt><dd>{scooter.model}</dd>
              <dt>Kleur</dt><dd>{scooter.color}</dd>
              <dt>Kleur No</dt><dd>{scooter.colorNumber || '-'}</dd>
              <dt>Snelheid</dt><dd>{normalizeSpeedValue(scooter.speed)}</dd>
              <dt>Kenteken</dt><dd>{scooter.licensePlate || '-'}</dd>
              <dt>Factuur</dt><dd>{scooter.invoiceNumber || '-'}</dd>
              <dt>Status</dt><dd>{scooter.status}</dd>
              <dt>Uitgepakt</dt><dd>{scooter.isUnpacked ? <span className="registration-badge"><CheckCircle2 size={16} /> Ja</span> : 'Nee'}</dd>
              <dt>Dealer</dt><dd>{dealerName(dealers, scooter.dealerId) || '-'}</dd>
            </dl>
          </section>
          <section className="panel drawer-edit-card">
            <div className="panel-title"><Wrench size={16} /> Gegevens wijzigen</div>
            <div className="drawer-form">
              <label>Kleur<input value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
              <label>Kleur No<input value={draft.colorNumber ?? ''} onChange={(e) => setDraft({ ...draft, colorNumber: e.target.value })} /></label>
              <label>Snelheid<input value={draft.speed} onChange={(e) => setDraft({ ...draft, speed: e.target.value })} /></label>
              <label>Kenteken<input value={draft.licensePlate ?? ''} onChange={(e) => setDraft({ ...draft, licensePlate: e.target.value })} /></label>
              <label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ScooterStatus })}>{(Object.keys(statusColor) as ScooterStatus[]).map((status) => <option key={status} value={status}>{scooterStatusLabel(status)}</option>)}</select></label>
              <label>Dealer<select value={draft.dealerId ?? ''} onChange={(e) => setDraft({ ...draft, dealerId: e.target.value })}><option value="">Geen dealer</option>{selectableDealers.map((dealer) => <option value={dealer.id} key={dealer.id}>{dealer.company || dealer.name}</option>)}</select></label>
              <label>Factuur<input value={draft.invoiceNumber ?? ''} onChange={(e) => setDraft({ ...draft, invoiceNumber: e.target.value })} /></label>
              <label className="checkbox-field">
                <input type="checkbox" checked={Boolean(draft.isUnpacked)} onChange={(e) => setDraft({ ...draft, isUnpacked: e.target.checked })} />
                Uitgepakt
              </label>
            </div>
            <div className="drawer-actions">
              <button className="primary-button" onClick={() => onUpdate(draft)}>Verander gegevens</button>
              <button className="secondary-button" disabled={rdwLoading} onClick={handleRdwFetch}>
                <RefreshCw size={15} /> {rdwLoading ? 'RDW ophalen...' : 'Haal RDW data op'}
              </button>
              <button className="secondary-button" disabled={dymoPrinting} onClick={handleDymoPrint}>
                <Printer size={15} /> {dymoPrinting ? 'Label printen...' : 'Print Dymo label'}
              </button>
            </div>
            {rdwMessage && <p className="drawer-note">{rdwMessage}</p>}
            {dymoMessage && <p className="drawer-note">{dymoMessage}</p>}
          </section>
        </div>
        <section className="panel drawer-info-panel"><div className="panel-title"><ShieldCheck size={16} /> Warranty</div>{warranties.length ? warranties.map((w) => <p key={w.id}>{w.claimNumber || w.id} - {w.partName} - {w.status}</p>) : <p>Geen warranty claims</p>}</section>
        <section className="panel drawer-info-panel">
          <div className="panel-title"><ClipboardList size={16} /> Onderhoud</div>
          {maintenance.length ? maintenance.map((record) => (
            <p key={record.id}>{formatDate(record.serviceDate)} - {record.serviceType} - {record.status}</p>
          )) : <p>Geen onderhoud geregistreerd</p>}
        </section>
        <section className="panel drawer-info-panel">
          <div className="panel-title"><FileText size={16} /> Documenten</div>
          {documents.length ? documents.map((document) => (
            <div className="document-row" key={document.id}>
              <div>
                <strong>{document.fileName}</strong>
                <span>{document.type}{document.uploadedAt ? ` - ${formatDate(document.uploadedAt)}` : ''}</span>
                <small>{document.note || 'Geen notitie'}</small>
              </div>
              <div className="document-row-actions">
                <button className="secondary-button" type="button" onClick={() => void handleOpenDocument(document)}>Openen</button>
                <button className="secondary-button" type="button" onClick={() => void handleDownloadDocument(document)}>Downloaden</button>
              </div>
            </div>
          )) : <p>Nog geen documenten toegevoegd</p>}
          <form className="document-upload-form" onSubmit={handleDocumentSubmit}>
            <label>Type bestand
              <select name="type" defaultValue="Overig">
                <option value="CVO">CVO</option>
                <option value="Overschrijving">Overschrijving</option>
                <option value="Vrijwaringsbewijs">Vrijwaringsbewijs</option>
                <option value="Tijdelijk document">Tijdelijk document</option>
                <option value="Factuur">Factuur</option>
                <option value="Overig">Overig</option>
              </select>
            </label>
            <label>Selecteer bestand
              <input name="file" type="file" />
            </label>
            <label className="wide-field">Notitie
              <textarea name="note" placeholder="Bijvoorbeeld: klantfactuur of foto bij aflevering" />
            </label>
            <button className="primary-button" type="submit" disabled={documentUploading}>
              <Upload size={16} /> {documentUploading ? 'Uploaden...' : 'Document toevoegen'}
            </button>
          </form>
          {documentMessage ? <p className="drawer-note">{documentMessage}</p> : null}
        </section>
        <section className="panel drawer-info-panel rdw-panel">
          <div className="panel-title"><ShieldCheck size={16} /> RDW voertuiggegevens</div>
          <dl className="detail-list rdw-list">
            <dt>Eerste toelating</dt><dd>{formatDate(scooter.firstAdmissionDate)}</dd>
            <dt>Eerste eigenaar</dt><dd>{formatDate(scooter.firstRegistrationDate)}</dd>
            <dt>Laatste tenaamstelling</dt><dd>{formatDate(scooter.lastRegistrationDate)}</dd>
            <dt>Emissie</dt><dd>{scooter.emissionClass || '-'}</dd>
            <dt>Type</dt><dd>{scooter.rdwType || '-'}</dd>
            <dt>Typegoedkeuringsnummer</dt><dd>{scooter.rdwTypeApprovalNumber || '-'}</dd>
            <dt>Variant</dt><dd>{scooter.rdwVariant || '-'}</dd>
            <dt>Uitvoering</dt><dd>{scooter.rdwExecution || '-'}</dd>
            <dt>Ouderdom</dt><dd>{formatVehicleAge(scooter.firstAdmissionDate)}</dd>
            <dt>Status</dt><dd>{registrationComplete ? <span className="registration-badge"><CheckCircle2 size={16} /> Tenaamgesteld</span> : 'Nog niet compleet'}</dd>
          </dl>
        </section>
      </aside>
    </div>
  );
}

