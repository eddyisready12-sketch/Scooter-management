import Papa from 'papaparse';
import type { CsvScooterRow, Dealer, Scooter, ScooterStatus } from '../types';

const statusFallback: ScooterStatus = 'Beschikbaar';

function pick(row: Record<string, unknown>, keys: string[]) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), String(value ?? '').trim()]),
  );
  for (const key of keys) {
    const value = normalized[normalizeHeader(key)];
    if (value) return value;
  }
  return '';
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${value.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
}

function containerIdForImport(container: string, arrivedAt?: string) {
  const dateKey = arrivedAt ? arrivedAt.slice(0, 10) : '';
  return stableId('container', [container, dateKey].filter(Boolean).join('-'));
}

function parseImportDate(value: string) {
  const clean = value.trim();
  if (!clean) return '';
  const dutchDate = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (dutchDate) {
    const [, day, month, year, hour = '00', minute = '00'] = dutchDate;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).toISOString();
  }
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function nameVariants(value: string) {
  const clean = value.trim();
  const variants = new Set([clean]);
  if (clean.includes(',')) {
    const [last, first] = clean.split(',').map((part) => part.trim());
    if (first && last) variants.add(`${first} ${last}`);
  } else {
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) variants.add(`${parts.slice(1).join(' ')}, ${parts[0]}`);
  }
  return Array.from(variants).map(normalizeValue).filter(Boolean);
}

function normalizeStatus(value: string): ScooterStatus {
  const status = value.toLowerCase();
  if (status.includes('dealer')) return 'Verkocht dealer';
  if (status.includes('klant')) return 'Verkocht klant';
  if (status.includes('lever')) return 'Af te leveren';
  if (status.includes('onderweg')) return 'Nog onderweg';
  if (status.includes('consign')) return 'In consignatie';
  if (status.includes('optie')) return 'In optie';
  return statusFallback;
}

function normalizeRows(rows: Record<string, unknown>[]): CsvScooterRow[] {
  return rows.map((row) => {
    const container = pick(row, ['container', 'container number', 'containernummer', 'container nr']);
    const arrivedAt = parseImportDate(pick(row, ['date arrived', 'datearrived', 'aankomstdatum', 'arrived', 'arrived at']));

    return {
      model: pick(row, ['model', 'type', 'artikel', 'product', 'scooter model']),
      frameNumber: pick(row, ['frameNumber', 'frame nummer', 'frame #', 'frame', 'vin', 'chassis', 'chassisnummer', 'framenr', 'vin nummer']),
      engineNumber: pick(row, ['engineNumber', 'engine nummer', 'motor nummer', 'engine', 'motornummer', 'motornr']),
      color: pick(row, ['kleur', 'color', 'colour', 'kleurcode']),
      speed: pick(row, ['snelheid', 'speed', 'kmh', 'km/h']),
      status: normalizeStatus(pick(row, ['status'])),
      dealer: pick(row, ['dealer']),
      container,
      containerId: container ? containerIdForImport(container, arrivedAt) : '',
      arrivedAt,
      licensePlate: pick(row, ['kenteken', 'license plate', 'nummerplaat']),
      batteryNumber: pick(row, ['accu', 'battery', 'batteryNumber', 'accunummer', 'accu nummer']),
      invoiceNumber: pick(row, ['factuur', 'factuur nummer', 'factuurnummer', 'invoice', 'invoice number', 'invoicenumber']),
    };
  }).filter((row) => row.frameNumber);
}

function normalizeDealerRows(rows: Record<string, unknown>[]): Dealer[] {
  return rows.map((row) => {
    const company = pick(row, ['bedrijf', 'bedrijfsnaam', 'company', 'dealer', 'dealernaam', 'naam']);
    const firstName = pick(row, ['voornaam', 'first name', 'firstname']);
    const lastName = pick(row, ['achternaam', 'last name', 'lastname']);
    const name = pick(row, ['contactpersoon', 'contact', 'naam contact']) || [firstName, lastName].filter(Boolean).join(' ') || company;
    const email = pick(row, ['email', 'e-mail', 'mail']);
    const phone = pick(row, ['telefoon', 'tel', 'phone', 'mobiel', 'mobile']);
    const city = pick(row, ['woonplaats', 'plaats', 'city', 'stad']);
    const street = pick(row, ['adres', 'address', 'straat']);
    const houseNumber = pick(row, ['huisnummer', 'house number', 'housenumber', 'nr']);
    const address = [street, houseNumber].filter(Boolean).join(' ');
    const Postalcode = pick(row, ['postcode', 'postal code', 'zipcode', 'postalcode']);
    const stableKey = company || email || phone || name;
    return {
      id: `dealer-${stableKey.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
      name,
      company,
      email,
      phone,
      city,
      address,
      Postalcode,
    };
  }).filter((dealer) => dealer.company || dealer.email || dealer.name);
}

function readCsvRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        resolve(result.data);
      },
      error: reject,
    });
  });
}

async function readExcelRows(file: File, headerCandidates: string[]): Promise<Record<string, unknown>[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], {
    header: 1,
    defval: '',
    raw: false,
  });
  const headerIndex = rawRows.findIndex((row) =>
    row.some((cell) => headerCandidates.includes(normalizeHeader(String(cell)))),
  );
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
    defval: '',
    raw: false,
    range: headerIndex >= 0 ? headerIndex : 0,
  });
}

export function parseScooterImport(file: File): Promise<CsvScooterRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx' || extension === 'xls') {
    return readExcelRows(file, ['framenumber', 'framenummer', 'frame', 'framevin', 'vin', 'chassis']).then(normalizeRows);
  }
  return readCsvRows(file).then(normalizeRows);
}

export function parseDealerImport(file: File): Promise<Dealer[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx' || extension === 'xls') {
    return readExcelRows(file, ['bedrijf', 'bedrijfsnaam', 'company', 'dealer', 'dealernaam', 'email', 'telefoon']).then(normalizeDealerRows);
  }
  return readCsvRows(file).then(normalizeDealerRows);
}

function findDealerId(dealers: Dealer[], dealerName?: string) {
  if (!dealerName) return undefined;
  const needles = nameVariants(dealerName);
  const companyMatch = dealers.find((dealer) => {
    const company = normalizeValue(dealer.company || '');
    return needles.some((needle) => company === needle || company.includes(needle) || needle.includes(company));
  });
  if (companyMatch) return companyMatch.id;

  return dealers.find((dealer) => {
    const haystack = [dealer.name, dealer.email]
      .filter(Boolean)
      .flatMap((value) => nameVariants(value));
    return needles.some((needle) =>
      haystack.some((value) => value.includes(needle) || needle.includes(value)),
    );
  })?.id;
}

export function dealerRowsFromScooterRows(rows: CsvScooterRow[], existing: Dealer[]): Dealer[] {
  const byName = new Map(existing.flatMap((dealer) =>
    [dealer.company, dealer.name].filter(Boolean).map((value) => [normalizeValue(value), dealer] as const),
  ));
  const created = new Map<string, Dealer>();

  rows.forEach((row) => {
    const dealerName = row.dealer?.trim();
    if (!dealerName || findDealerId([...existing, ...created.values()], dealerName)) return;
    const id = `dealer-${normalizeValue(dealerName)}`;
    const dealer = byName.get(normalizeValue(dealerName)) ?? {
      id,
      name: dealerName,
      company: dealerName,
      email: '',
      phone: '',
      city: '',
      address: '',
      Postalcode: '',
    };
    created.set(dealer.id, dealer);
  });

  return Array.from(created.values());
}

export function csvRowsToScooters(rows: CsvScooterRow[], existing: Scooter[], statusOverride?: ScooterStatus, dealers: Dealer[] = []): Scooter[] {
  const byFrame = new Map(existing.map((scooter) => [normalizeValue(scooter.frameNumber), scooter]));

  rows.forEach((row) => {
    if (!row.frameNumber) return;
    const frameKey = normalizeValue(row.frameNumber);
    const previous = byFrame.get(frameKey);
    const importedDealerId = findDealerId(dealers, row.dealer);
    byFrame.set(frameKey, {
      id: previous?.id ?? `scooter-${row.frameNumber.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
      frameNumber: row.frameNumber,
      engineNumber: row.engineNumber || previous?.engineNumber || '',
      brand: 'RSO',
      model: row.model || previous?.model || 'SENSE',
      color: row.color || previous?.color || 'MATT BLACK',
      speed: row.speed || previous?.speed || '45km/h',
      status: statusOverride || row.status || previous?.status || 'Beschikbaar',
      dealerId: importedDealerId || previous?.dealerId,
      containerId: row.containerId || previous?.containerId,
      licensePlate: row.licensePlate || previous?.licensePlate,
      batteryNumber: row.batteryNumber || previous?.batteryNumber,
      invoiceNumber: row.invoiceNumber || previous?.invoiceNumber,
      arrivedAt: row.arrivedAt || previous?.arrivedAt,
      deliveredAt: previous?.deliveredAt,
      soldAt: previous?.soldAt,
    });
  });

  return Array.from(byFrame.values());
}
