import Papa from 'papaparse';
import type { CsvScooterRow, Scooter, ScooterStatus } from '../types';

const statusFallback: ScooterStatus = 'Beschikbaar';

function pick(row: Record<string, unknown>, keys: string[]) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), String(value ?? '').trim()]),
  );
  for (const key of keys) {
    const value = normalized[key.toLowerCase()];
    if (value) return value;
  }
  return '';
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

export function parseScooterCsv(file: File): Promise<CsvScooterRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.map((row) => ({
          model: pick(row, ['model', 'type']),
          frameNumber: pick(row, ['frameNumber', 'frame nummer', 'frame #', 'vin']),
          engineNumber: pick(row, ['engineNumber', 'engine nummer', 'motor nummer']),
          color: pick(row, ['kleur', 'color']),
          speed: pick(row, ['snelheid', 'speed']),
          status: normalizeStatus(pick(row, ['status'])),
          dealer: pick(row, ['dealer']),
          container: pick(row, ['container', 'container number']),
          licensePlate: pick(row, ['kenteken', 'license plate']),
          batteryNumber: pick(row, ['accu', 'battery', 'batteryNumber']),
        })).filter((row) => row.frameNumber);
        resolve(rows);
      },
      error: reject,
    });
  });
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
