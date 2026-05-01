import Papa from 'papaparse';
import type { CsvScooterRow, Scooter, ScooterStatus } from '../types';

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
  return rows.map((row) => ({
    model: pick(row, ['model', 'type', 'artikel', 'product', 'scooter model']),
    frameNumber: pick(row, ['frameNumber', 'frame nummer', 'frame #', 'frame', 'vin', 'chassis', 'chassisnummer', 'framenr', 'vin nummer']),
    engineNumber: pick(row, ['engineNumber', 'engine nummer', 'motor nummer', 'engine', 'motornummer', 'motornr']),
    color: pick(row, ['kleur', 'color', 'colour', 'kleurcode']),
    speed: pick(row, ['snelheid', 'speed', 'kmh', 'km/h']),
    status: normalizeStatus(pick(row, ['status'])),
    dealer: pick(row, ['dealer']),
    container: pick(row, ['container', 'container number', 'containernummer', 'container nr']),
    licensePlate: pick(row, ['kenteken', 'license plate', 'nummerplaat']),
    batteryNumber: pick(row, ['accu', 'battery', 'batteryNumber', 'accunummer', 'accu nummer']),
  })).filter((row) => row.frameNumber);
}

function parseScooterCsv(file: File): Promise<CsvScooterRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        resolve(normalizeRows(result.data));
      },
      error: reject,
    });
  });
}

async function parseScooterExcel(file: File): Promise<CsvScooterRow[]> {
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
    row.some((cell) => ['framenumber', 'framenummer', 'frame', 'frame', 'framevin', 'vin', 'chassis'].includes(normalizeHeader(String(cell)))),
  );
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], {
    defval: '',
    raw: false,
    range: headerIndex >= 0 ? headerIndex : 0,
  });
  return normalizeRows(rows);
}

export function parseScooterImport(file: File): Promise<CsvScooterRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx' || extension === 'xls') {
    return parseScooterExcel(file);
  }
  return parseScooterCsv(file);
}

export function csvRowsToScooters(rows: CsvScooterRow[], existing: Scooter[]): Scooter[] {
  const byFrame = new Map(existing.map((scooter) => [scooter.frameNumber, scooter]));

  rows.forEach((row, index) => {
    if (!row.frameNumber) return;
    const previous = byFrame.get(row.frameNumber);
    byFrame.set(row.frameNumber, {
      id: previous?.id ?? `csv-${Date.now()}-${index}`,
      frameNumber: row.frameNumber,
      engineNumber: row.engineNumber || previous?.engineNumber || '',
      brand: 'RSO',
      model: row.model || previous?.model || 'SENSE',
      color: row.color || previous?.color || 'MATT BLACK',
      speed: row.speed || previous?.speed || '45km/h',
      status: row.status || previous?.status || 'Beschikbaar',
      dealerId: previous?.dealerId,
      containerId: previous?.containerId,
      licensePlate: row.licensePlate || previous?.licensePlate,
      batteryNumber: row.batteryNumber || previous?.batteryNumber,
      invoiceNumber: previous?.invoiceNumber,
      arrivedAt: previous?.arrivedAt,
      deliveredAt: previous?.deliveredAt,
      soldAt: previous?.soldAt,
    });
  });

  return Array.from(byFrame.values());
}
