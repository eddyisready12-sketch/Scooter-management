import type { DocStatus, Herkomst, IngekochtVerpakkingsartikel, PpwrSupplierRole, Supplier, VerpakkingsLaag } from '../types';

export const PPWR_SUPPLIER_SCHEMA_VERSION = 2;
export type PpwrSupplierStatus = 'compleet' | 'aanvullen' | 'geblokkeerd';

const euCountries = new Set([
  'belgie', 'bulgarije', 'cyprus', 'denemarken', 'duitsland', 'estland', 'finland', 'frankrijk',
  'griekenland', 'hongarije', 'ierland', 'italie', 'kroatie', 'letland', 'litouwen', 'luxemburg',
  'malta', 'nederland', 'oostenrijk', 'polen', 'portugal', 'roemenie', 'slovenie', 'slowakije',
  'spanje', 'tsjechie', 'zweden',
]);

function normalizeCountry(value?: string) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function roleHerkomst(role?: Supplier['ppwrSupplierRole']): Herkomst {
  return role === 'fabrikant_eu' || role === 'distributeur_eu' ? 'eu' : 'niet_eu';
}

export function migrateSupplierPpwr(supplier: Supplier): Supplier {
  if (supplier.supplierSchemaVersion === PPWR_SUPPLIER_SCHEMA_VERSION && supplier.herkomst) return supplier;

  const legacy = {
    eprNummer: supplier.ppwrEprNumber,
    contractstatus: supplier.ppwrContractStatus,
    aangiftestatus: supplier.ppwrDeclarationStatus,
  };
  if (Object.values(legacy).some(Boolean)) {
    console.info(`[PPWR migratie] Vervallen organisatievelden van leverancier ${supplier.name} zijn niet overgenomen.`, legacy);
  }

  const countryIsEu = euCountries.has(normalizeCountry(supplier.country));
  const role: PpwrSupplierRole = countryIsEu ? 'fabrikant_eu' : 'productleverancier_niet_eu';
  const declaration = supplier.ppwrDeclarationStatus;
  const migratedDocStatus: DocStatus = declaration === 'Ontvangen' || declaration === 'Goedgekeurd'
    ? 'ontvangen'
    : declaration === 'Aangevraagd' ? 'gevraagd' : 'niet_gevraagd';

  return {
    ...supplier,
    supplierSchemaVersion: PPWR_SUPPLIER_SCHEMA_VERSION,
    ppwrSupplierRole: role,
    herkomst: roleHerkomst(role),
    ...(countryIsEu ? {
      docStatus: supplier.docStatus ?? { status: migratedDocStatus, statusDatum: supplier.ppwrLastDeclarationAt ?? '' },
      packagingProfile: undefined,
    } : {
      docStatus: undefined,
      packagingProfile: supplier.packagingProfile ?? [],
    }),
    ppwrResponsibility: undefined,
    ppwrContractStatus: undefined,
    ppwrDeclarationStatus: undefined,
    ppwrEprNumber: undefined,
    ppwrLastDeclarationAt: undefined,
  };
}

export function ppwrSupplierStatus(supplier?: Supplier): PpwrSupplierStatus {
  if (!supplier) return 'aanvullen';
  const migrated = migrateSupplierPpwr(supplier);
  if (migrated.herkomst === 'eu') {
    if (migrated.docStatus?.status === 'kan_niet_leveren') return 'geblokkeerd';
    return migrated.docStatus?.status === 'ontvangen' ? 'compleet' : 'aanvullen';
  }

  const layers = migrated.packagingProfile ?? [];
  if (layers.some((layer) => layer.zorgwekkendeStoffen === 'aanwezig')) return 'geblokkeerd';
  const allValid = layers.length > 0 && layers.every((layer) => (
    Boolean(layer.id && layer.rol && layer.materiaalcode.trim() && layer.gewichtGram > 0 && layer.gewichtBasis && layer.zorgwekkendeStoffen && layer.bron)
  ));
  const hasVerifiedSource = layers.some((layer) => layer.bron !== 'schatting')
    || (migrated.packagingItems ?? []).some((item) => item.actief !== false && item.bron !== 'schatting');
  return allValid && hasVerifiedSource ? 'compleet' : 'aanvullen';
}

export function createPackagingProfileLayer(): VerpakkingsLaag {
  return {
    id: `laag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    naam: '',
    rol: 'primair',
    materiaalcode: '',
    gewichtGram: 0,
    gewichtBasis: 'per_stuk',
    herbruikbaar: false,
    zorgwekkendeStoffen: 'geen_bekend',
    bron: 'opgave_leverancier',
  };
}

export function createPurchasedPackagingItem(): IngekochtVerpakkingsartikel {
  return {
    id: `verpakking-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    categorie: 'overig',
    orderNummer: '',
    artikelCode: '',
    omschrijving: '',
    materiaalcode: '',
    gewichtGram: 0,
    gewichtBasis: 'per_stuk',
    herbruikbaar: false,
    zorgwekkendeStoffen: 'geen_bekend',
    bron: 'opgave_leverancier',
    actief: true,
  };
}

export function migratePpwrLocalStorage(key = 'yreb.ppwr.suppliers') {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { schemaVersion?: number; suppliers?: Supplier[] } | Supplier[];
    const suppliers = Array.isArray(parsed) ? parsed : parsed.suppliers ?? [];
    const migrated = suppliers.map(migrateSupplierPpwr);
    window.localStorage.setItem(key, JSON.stringify({ schemaVersion: PPWR_SUPPLIER_SCHEMA_VERSION, suppliers: migrated }));
  } catch (error) {
    console.warn('[PPWR migratie] localStorage kon niet worden gemigreerd; brondata is behouden.', error);
  }
}
