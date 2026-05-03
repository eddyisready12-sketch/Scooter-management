import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BatteryCharging,
  Bike,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  DatabaseZap,
  FileText,
  Gauge,
  Home,
  Lock,
  LogOut,
  Menu,
  PackagePlus,
  Plus,
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
import { demoData } from './data/demo-data';
import { csvRowsToScooters, dealerRowsFromScooterRows, parseDealerImport, parseScooterImport } from './lib/csv';
import { loadSupabaseData, subscribeToSupabase, supabase, upsertBatteries, upsertBatteryModels, upsertContainers, upsertDealers, upsertMaintenanceRecords, upsertScooters, upsertWarrantyParts } from './lib/supabase';
import type { AppData, Battery, BatteryModel, Container, CsvScooterRow, Dealer, MaintenanceRecord, Scooter, ScooterStatus, WarrantyPart } from './types';

type View = 'dashboard' | 'containers' | 'scooters' | 'batteries' | 'dealers' | 'warranty' | 'maintenance' | 'search';
type ImportTarget = 'scooters' | 'dealers';
type ImportScooterStatus = ScooterStatus | 'file';

const views: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'containers', label: 'Containers', icon: Boxes },
  { id: 'scooters', label: 'Scooters', icon: Bike },
  { id: 'batteries', label: "Accu's", icon: BatteryCharging },
  { id: 'dealers', label: 'Dealers', icon: UsersRound },
  { id: 'warranty', label: 'Warranty parts', icon: ShieldCheck },
  { id: 'maintenance', label: 'Onderhoud', icon: ClipboardList },
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

function formatDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: value.includes('T') ? '2-digit' : undefined,
    minute: value.includes('T') ? '2-digit' : undefined,
  }).format(new Date(value));
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

function isRegistrationComplete(scooter: Scooter) {
  return Boolean(
    scooter.licensePlate?.trim() &&
    scooter.firstAdmissionDate &&
    scooter.firstRegistrationDate &&
    scooter.lastRegistrationDate,
  );
}

function normalizeRegistrationStatus(scooter: Scooter): Scooter {
  return isRegistrationComplete(scooter) ? { ...scooter, status: 'Verkocht klant' } : scooter;
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

function stableId(prefix: string, value: string) {
  return `${prefix}-${value.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
}

function normalizeLookup(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
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
      const values = numericFirstColumn ? compactColumns.slice(1) : compactColumns;
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
    type?: string;
    typegoedkeuringsnummer?: string;
    variant?: string;
    uitvoering?: string;
  }>;
  const fuelRows = await fuelResponse.json() as Array<{
    uitlaatemissieniveau?: string;
    milieuklasse_eg_goedkeuring_licht?: string;
  }>;
  const record = vehicleRows[0];
  if (!record) throw new Error(`Geen RDW data gevonden voor kenteken ${normalizedPlate}.`);
  const fuelRecord = fuelRows[0];

  return {
    firstAdmissionDate: rdwDateToInputDate(record.datum_eerste_toelating_dt || record.datum_eerste_toelating),
    firstRegistrationDate: rdwDateToInputDate(record.datum_eerste_tenaamstelling_in_nederland_dt || record.datum_eerste_tenaamstelling_in_nederland),
    lastRegistrationDate: rdwDateToInputDate(record.datum_tenaamstelling_dt || record.datum_tenaamstelling),
    emissionClass: fuelRecord?.uitlaatemissieniveau || fuelRecord?.milieuklasse_eg_goedkeuring_licht || '',
    rdwType: record.type || '',
    rdwTypeApprovalNumber: record.typegoedkeuringsnummer || '',
    rdwVariant: record.variant || '',
    rdwExecution: record.uitvoering || '',
  };
}

export function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [data, setData] = useState<AppData>(demoData);
  const [query, setQuery] = useState('');
  const [selectedScooter, setSelectedScooter] = useState<Scooter | null>(null);
  const [csvMessage, setCsvMessage] = useState('');
  const [dealerImportMessage, setDealerImportMessage] = useState('');
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [batteryMessage, setBatteryMessage] = useState('');
  const [warrantyMessage, setWarrantyMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScooterStatus | 'all'>('all');

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      try {
        const remote = await loadSupabaseData();
        if (mounted && Object.keys(remote).length > 0) {
          setData((current) => ({ ...current, ...remote }));
        }
      } catch {
        setCsvMessage('Supabase kon niet laden, demo data blijft actief.');
      }
    }
    void hydrate();
    const unsubscribe = subscribeToSupabase(() => void hydrate());
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const filteredScooters = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return data.scooters.filter((scooter) =>
      (statusFilter === 'all' || scooter.status === statusFilter) &&
      (!needle || [scooter.frameNumber, scooter.engineNumber, scooter.model, scooter.color, scooter.status, scooter.licensePlate, scooter.invoiceNumber, dealerName(data.dealers, scooter.dealerId)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))),
    );
  }, [data.dealers, data.scooters, query, statusFilter]);

  async function importScooterFile(file: File, statusOverride?: ScooterStatus) {
    try {
      const rows = await parseScooterImport(file);
      if (rows.length === 0) {
        setCsvMessage(`Geen scooters gevonden in ${file.name}. Controleer of er een kolom Frame #, VIN of Chassis aanwezig is.`);
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
      setCsvMessage(`${rows.length} scooterregels geimporteerd naar het Scooters voorraadblok${targetStatus} uit ${file.name}.${dealerMessage}${containerMessage}`);
    } catch (error) {
      setCsvMessage(`Import mislukt: ${importErrorMessage(error)}`);
    }
  }

  async function importDealerFile(file: File, showDashboardMessage = false) {
    try {
      const dealers = await parseDealerImport(file);
      if (dealers.length === 0) {
        const message = `Geen dealers gevonden in ${file.name}. Controleer kolommen zoals Bedrijfsnaam, Dealer, Email of Telefoon.`;
        if (showDashboardMessage) setCsvMessage(message);
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
      if (showDashboardMessage) setCsvMessage(message);
      setDealerImportMessage(message);
    } catch (error) {
      const message = `Dealer import mislukt: ${importErrorMessage(error)}`;
      if (showDashboardMessage) setCsvMessage(message);
      setDealerImportMessage(message);
    }
  }

  async function handleInventoryImport(target: ImportTarget, status: ImportScooterStatus, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (target === 'dealers') {
        await importDealerFile(file, true);
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
      setCsvMessage(isRegistrationComplete(normalized)
        ? `${normalized.frameNumber} is tenaamgesteld en automatisch naar Verkocht klant gezet.`
        : `${normalized.frameNumber} is bijgewerkt.`);
    } catch (error) {
      setCsvMessage(`Scooter opslaan mislukt: ${importErrorMessage(error)}`);
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
    setCsvMessage(message);
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
      setCsvMessage('Container import mislukt: vul invoice, container, seal en container content in.');
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
      setCsvMessage('Container import mislukt: geen scooterregels gevonden in de geplakte content.');
      return;
    }

    try {
      await upsertContainers([container]);
      if (importMode === 'update-existing') {
        const existingByFrame = new Map(data.scooters.map((scooter) => [normalizeLookup(scooter.frameNumber), scooter]));
        const updates: Scooter[] = scooters
          .flatMap((imported) => {
            const existing = existingByFrame.get(normalizeLookup(imported.frameNumber));
            if (!existing) return [];
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
        const missing = scooters.length - updates.length;
        if (updates.length > 0) await upsertScooters(updates);
        setData((current) => {
          const containers = new Map(current.containers.map((item) => [item.id, item]));
          containers.set(container.id, container);
          const updatesById = new Map(updates.map((scooter) => [scooter.id, scooter]));
          return { ...current, containers: [...containers.values()], scooters: current.scooters.map((scooter) => updatesById.get(scooter.id) ?? scooter) };
        });
        setCsvMessage(`${updates.length} bestaande scooters bijgewerkt voor container ${container.number}.${missing ? ` ${missing} framenummers niet gevonden.` : ''}`);
      } else {
        await upsertScooters(scooters);
        setData((current) => {
          const containers = new Map(current.containers.map((item) => [item.id, item]));
          containers.set(container.id, container);
          const scooterMap = new Map(current.scooters.map((item) => [item.id, item]));
          scooters.forEach((scooter) => scooterMap.set(scooter.id, scooter));
          return { ...current, containers: [...containers.values()], scooters: [...scooterMap.values()] };
        });
        setCsvMessage(`${scooters.length} scooters geimporteerd in container ${container.number}.`);
      }
      formElement.reset();
    } catch (error) {
      setCsvMessage(`Container import mislukt: ${importErrorMessage(error)}`);
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
    const record: WarrantyPart = {
      id: `w-${Date.now()}`,
      claimNumber: nextWarrantyClaimNumber(data.warranties),
      scooterFrame: scooter?.frameNumber || submittedFrame,
      licensePlate: submittedPlate || scooter?.licensePlate || '',
      partName: String(form.get('partName')),
      partNumber: String(form.get('partNumber')),
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
    } catch (error) {
      setWarrantyMessage(`Garantie opslaan mislukt: ${importErrorMessage(error)}`);
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

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} supabaseEnabled={Boolean(supabase)} />;
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
            <span>Rob</span>
            <button className="icon-button" aria-label="Log out" onClick={() => setLoggedIn(false)}>
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <section className="content">
          {view === 'dashboard' && <Dashboard data={data} onImport={handleInventoryImport} message={csvMessage} query={query} setQuery={setQuery} scooters={filteredScooters} onSelect={setSelectedScooter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onBulkRdwCheck={checkScootersWithRdw} />}
          {view === 'containers' && <Containers data={data} message={csvMessage} onImport={addContainerImport} />}
          {view === 'scooters' && <Scooters data={data} query={query} setQuery={setQuery} scooters={filteredScooters} onSelect={setSelectedScooter} />}
          {view === 'batteries' && <Batteries data={data} addBatteries={addBatteries} addBatteryModel={addBatteryModel} updateBattery={updateBattery} onSelectScooter={setSelectedScooter} message={batteryMessage} />}
          {view === 'dealers' && <Dealers dealers={data.dealers} scooters={data.scooters} onImport={handleDealerImport} onAddDealer={addDealer} onUpdateDealer={updateDealer} message={dealerImportMessage} />}
          {view === 'warranty' && <Warranty data={data} addWarranty={addWarranty} updateWarranty={updateWarranty} message={warrantyMessage} />}
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
          onClose={() => setSelectedScooter(null)}
          onUpdate={updateScooter}
        />
      )}
    </div>
  );
}

function LoginScreen({ onLogin, supabaseEnabled }: { onLogin: () => void; supabaseEnabled: boolean }) {
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={(event) => { event.preventDefault(); onLogin(); }}>
        <div className="login-logo">RSO</div>
        <h1>Scooter Management</h1>
        <label>Email</label>
        <input type="email" defaultValue="rob@rso-scooters.nl" />
        <label>Password</label>
        <input type="password" defaultValue="demo" />
        <button className="primary-button" type="submit"><Lock size={16} /> Login</button>
        <p>{supabaseEnabled ? 'Auth can be connected to Supabase.' : 'Demo login active. Add Supabase keys for production auth.'}</p>
      </form>
    </div>
  );
}

function Dashboard({ data, onImport, message, query, setQuery, scooters, onSelect, statusFilter, setStatusFilter, onBulkRdwCheck }: {
  data: AppData;
  onImport: (target: ImportTarget, status: ImportScooterStatus, event: ChangeEvent<HTMLInputElement>) => void;
  message: string;
  query: string;
  setQuery: (value: string) => void;
  scooters: Scooter[];
  onSelect: (scooter: Scooter) => void;
  statusFilter: ScooterStatus | 'all';
  setStatusFilter: (status: ScooterStatus | 'all') => void;
  onBulkRdwCheck: (scooters: Scooter[]) => Promise<string>;
}) {
  const [importTarget, setImportTarget] = useState<ImportTarget>('scooters');
  const [importStatus, setImportStatus] = useState<ImportScooterStatus>('file');
  const cards: Array<{ label: ScooterStatus; icon: typeof Bike }> = [
    { label: 'Beschikbaar', icon: Bike },
    { label: 'Verkocht dealer', icon: Wrench },
    { label: 'Verkocht klant', icon: Wrench },
    { label: 'Af te leveren', icon: PackagePlus },
    { label: 'Nog onderweg', icon: Boxes },
    { label: 'In consignatie', icon: BriefcaseBusiness },
    { label: 'In optie', icon: CalendarDays },
  ];
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Dashboard</h1>
          <span>Totaal voorraad: {data.scooters.length}</span>
        </div>
        <div className="import-controls">
          <label>
            Import naar
            <select value={importTarget} onChange={(event) => setImportTarget(event.target.value as ImportTarget)}>
              <option value="scooters">Scooters voorraadblok</option>
              <option value="dealers">Dealers blok</option>
            </select>
          </label>
          {importTarget === 'scooters' && (
            <label>
              Scooter status
              <select value={importStatus} onChange={(event) => setImportStatus(event.target.value as ImportScooterStatus)}>
                <option value="file">Status uit bestand</option>
                {Object.keys(statusColor).map((status) => <option value={status} key={status}>{status}</option>)}
              </select>
            </label>
          )}
          <label className="upload-button"><Upload size={16} /> CSV / Excel importeren<input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => onImport(importTarget, importStatus, event)} /></label>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="stat-grid">
        {cards.map(({ label, icon: Icon }) => (
          <button
            className={`stat-card stat-button ${statusFilter === label ? 'selected' : ''}`}
            key={label}
            onClick={() => setStatusFilter(statusFilter === label ? 'all' : label)}
          >
            <div className={`stat-icon ${statusColor[label]}`}><Icon size={24} /></div>
            <div><span>{label}</span><strong>{countByStatus(data.scooters, label)}</strong></div>
          </button>
        ))}
      </div>
      {statusFilter !== 'all' && (
        <div className="filter-notice">
          Gefilterd op <strong>{statusFilter}</strong>
          <button onClick={() => setStatusFilter('all')}>Toon alles</button>
        </div>
      )}
      <ScooterTable
        scooters={scooters}
        dealers={data.dealers}
        query={query}
        setQuery={setQuery}
        onSelect={onSelect}
        title={statusFilter === 'all' ? 'Beschikbare scooters' : `Scooters: ${statusFilter} (${scooters.length})`}
        onBulkRdwCheck={statusFilter === 'Verkocht dealer' || statusFilter === 'Verkocht klant' ? onBulkRdwCheck : undefined}
      />
    </>
  );
}

function ScooterTable({ scooters, dealers, query, setQuery, onSelect, title = 'Beschikbare scooters', onBulkRdwCheck }: {
  scooters: Scooter[];
  dealers: Dealer[];
  query: string;
  setQuery: (value: string) => void;
  onSelect: (scooter: Scooter) => void;
  title?: string;
  onBulkRdwCheck?: (scooters: Scooter[]) => Promise<string>;
}) {
  const [pageSize, setPageSize] = useState<number | 'all'>(20);
  const [page, setPage] = useState(1);
  const [rdwChecking, setRdwChecking] = useState(false);
  const [rdwCheckMessage, setRdwCheckMessage] = useState('');
  const [columnFilters, setColumnFilters] = useState({
    model: '',
    frame: '',
    color: '',
    licensePlate: '',
    speed: '',
    status: '',
    dealer: '',
    invoice: '',
    registration: '',
  });
  const filteredRows = scooters.filter((scooter) => {
    const dealer = dealerName(dealers, scooter.dealerId);
    const registrationComplete = isRegistrationComplete(scooter);
    return (
      scooter.model.toLowerCase().includes(columnFilters.model.toLowerCase()) &&
      scooter.frameNumber.toLowerCase().includes(columnFilters.frame.toLowerCase()) &&
      scooter.color.toLowerCase().includes(columnFilters.color.toLowerCase()) &&
      (scooter.licensePlate || '').toLowerCase().includes(columnFilters.licensePlate.toLowerCase()) &&
      (!columnFilters.speed || scooter.speed === columnFilters.speed) &&
      (!columnFilters.status || scooter.status === columnFilters.status) &&
      dealer.toLowerCase().includes(columnFilters.dealer.toLowerCase()) &&
      (scooter.invoiceNumber || '').toLowerCase().includes(columnFilters.invoice.toLowerCase()) &&
      (!columnFilters.registration || (columnFilters.registration === 'complete' ? registrationComplete : !registrationComplete))
    );
  });
  const speedOptions = Array.from(new Set(scooters.map((scooter) => scooter.speed).filter(Boolean))).sort();
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleScooters = pageSize === 'all'
    ? filteredRows
    : filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const firstEntry = filteredRows.length === 0 ? 0 : pageSize === 'all' ? 1 : (safePage - 1) * pageSize + 1;
  const lastEntry = pageSize === 'all' ? filteredRows.length : Math.min(safePage * pageSize, filteredRows.length);
  function setColumnFilter(key: keyof typeof columnFilters, value: string) {
    setColumnFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
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
        <div className="button-group"><button>CSV</button><button>Excel</button><button>PDF</button><button>Print</button></div>
        <div className="table-controls">
          <label>Rows:
            <select value={pageSize} onChange={(event) => { setPageSize(event.target.value === 'all' ? 'all' : Number(event.target.value)); setPage(1); }}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value="all">Alles</option>
            </select>
          </label>
          <label>Search: <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Model</th><th>Frame #</th><th>Kleur</th><th>Kenteken</th><th>Snelheid</th><th>Status</th><th>Dealer</th><th>Factuur</th><th>Tenaam</th></tr>
            <tr className="filter-row">
              <th><input value={columnFilters.model} onChange={(event) => setColumnFilter('model', event.target.value)} aria-label="Filter model" /></th>
              <th><input value={columnFilters.frame} onChange={(event) => setColumnFilter('frame', event.target.value)} aria-label="Filter frame" /></th>
              <th><input value={columnFilters.color} onChange={(event) => setColumnFilter('color', event.target.value)} aria-label="Filter kleur" /></th>
              <th><input value={columnFilters.licensePlate} onChange={(event) => setColumnFilter('licensePlate', event.target.value)} aria-label="Filter kenteken" /></th>
              <th><select value={columnFilters.speed} onChange={(event) => setColumnFilter('speed', event.target.value)} aria-label="Filter snelheid"><option value="">Alle</option>{speedOptions.map((speed) => <option value={speed} key={speed}>{speed}</option>)}</select></th>
              <th><select value={columnFilters.status} onChange={(event) => setColumnFilter('status', event.target.value)} aria-label="Filter status"><option value="">Alle</option>{Object.keys(statusColor).map((status) => <option value={status} key={status}>{status}</option>)}</select></th>
              <th><input value={columnFilters.dealer} onChange={(event) => setColumnFilter('dealer', event.target.value)} aria-label="Filter dealer" /></th>
              <th><input value={columnFilters.invoice} onChange={(event) => setColumnFilter('invoice', event.target.value)} aria-label="Filter factuur" /></th>
              <th><select value={columnFilters.registration} onChange={(event) => setColumnFilter('registration', event.target.value)} aria-label="Filter tenaamstelling"><option value="">Alle</option><option value="complete">Compleet</option><option value="missing">Mist data</option></select></th>
            </tr>
          </thead>
          <tbody>
            {visibleScooters.map((scooter) => (
              <tr key={scooter.id} onClick={() => onSelect(scooter)}>
                <td>{scooter.model}</td>
                <td><button className="link-button">{scooter.frameNumber}</button></td>
                <td>{scooter.color}</td>
                <td>{scooter.licensePlate || '-'}</td>
                <td>{scooter.speed}</td>
                <td>{scooter.status}</td>
                <td>{dealerName(dealers, scooter.dealerId) || '-'}</td>
                <td>{scooter.invoiceNumber || '-'}</td>
                <td className="registration-cell">{isRegistrationComplete(scooter) ? <CheckCircle2 className="registration-check" size={18} aria-label="Tenaamgesteld" /> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>Showing {firstEntry} to {lastEntry} of {filteredRows.length} entries</span>
        {pageSize !== 'all' && (
          <div className="pagination">
            <button disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span>{safePage} / {totalPages}</span>
            <button disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
          </div>
        )}
      </div>
    </section>
  );
}

function Containers({ data, message, onImport }: { data: AppData; message: string; onImport: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const [showImport, setShowImport] = useState(false);
  const sortedContainers = [...data.containers].sort((a, b) => containerSortTime(b) - containerSortTime(a));
  const pending = sortedContainers.filter((container) => container.status !== 'Aangekomen');
  const arrived = sortedContainers.filter((container) => container.status === 'Aangekomen');
  const inTransit = data.containers.filter((container) => container.status === 'Onderweg');
  const origin = data.containers.filter((container) => container.status === 'In land van herkomst');
  const containerScooters = data.scooters.filter((scooter) => scooter.containerId);
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Containers</h1>
          <span>{data.containers.length} containers geregistreerd</span>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <section className="panel container-command-panel">
        <div>
          <span>Container import</span>
          <strong>Nieuwe zending toevoegen</strong>
          <small>Importeer containerregels of voeg handmatig een container toe om scooters per zending te volgen.</small>
        </div>
        <div className="container-command-actions">
          <button className="primary-button" onClick={() => setShowImport(true)}><Upload size={16} /> Container importeren</button>
        </div>
      </section>
      <div className="container-overview-grid">
        <div className="container-summary-grid">
          <section className="panel container-summary-card">
            <span>Totaal</span>
            <strong>{data.containers.length}</strong>
            <small>{containerScooters.length} scooters gekoppeld</small>
          </section>
          <section className="panel container-summary-card">
            <span>Nog onderweg</span>
            <strong>{pending.length}</strong>
            <small>{inTransit.length} onderweg, {origin.length} herkomstland</small>
          </section>
          <section className="panel container-summary-card">
            <span>Aangekomen</span>
            <strong>{arrived.length}</strong>
            <small>Meest recent bovenaan</small>
          </section>
        </div>
        <div className="container-status-grid">
          <ContainerListPanel title="Containers nog niet aangekomen" containers={pending} scooters={data.scooters} />
          <ContainerListPanel title="Meest recent aangekomen containers" containers={arrived} scooters={data.scooters} green />
        </div>
      </div>
      <div className="section-heading">
        <div>
          <h2>Scooters per container</h2>
          <span>Bekijk per zending welke scooters beschikbaar, in consignatie of verkocht zijn.</span>
        </div>
      </div>
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
        <div className="container-grid">
          {sortedContainers.map((container) => <ContainerCard key={container.id} container={container} scooters={data.scooters.filter((s) => s.containerId === container.id)} dealers={data.dealers} />)}
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

function ContainerCard({ container, scooters, dealers }: { container: Container; scooters: Scooter[]; dealers: Dealer[] }) {
  const baseStatuses = ['Beschikbaar', 'In consignatie', 'Verkocht dealer', 'Verkocht klant', 'Nog onderweg', 'Af te leveren', 'In optie'] as ScooterStatus[];
  const statuses = baseStatuses.filter((status) => scooters.some((scooter) => scooter.status === status));

  return (
    <section className="panel container-card">
      <div className="panel-title"><Boxes size={16} /> {container.number}</div>
      <div className="container-card-metrics">
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
          <span>Arrived</span>
          <strong>{formatDate(container.arrivedAt)}</strong>
        </div>
        <div className="container-card-metric">
          <span>Scooters</span>
          <strong>{scooters.length}</strong>
        </div>
      </div>
      <div className="container-card-status-grid">
        {(statuses.length ? statuses : ['Beschikbaar']).map((status) => {
          const statusScooters = scooters.filter((scooter) => scooter.status === status);

          return (
            <section className="container-card-status-column" key={status}>
              <div className="container-card-status-header">
                <span>{status}</span>
                <strong>{statusScooters.length}</strong>
              </div>
              <div className="container-card-scooter-list">
                {statusScooters.length ? statusScooters.map((scooter) => (
                  <div className="container-card-scooter-row" key={scooter.id}>
                    <strong>{scooter.frameNumber}</strong>
                    <span>{scooter.model || '-'} - {scooter.color || '-'} - {scooter.speed || '-'}</span>
                    <small>{dealerName(dealers, scooter.dealerId) || '-'}</small>
                  </div>
                )) : <p className="container-card-empty">Geen scooters</p>}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function Scooters({ data, query, setQuery, scooters, onSelect }: { data: AppData; query: string; setQuery: (value: string) => void; scooters: Scooter[]; onSelect: (scooter: Scooter) => void }) {
  const groups = ['Beschikbaar', 'In optie', 'Af te leveren', 'Nog onderweg', 'In consignatie', 'Verkocht klant', 'Verkocht dealer'] as ScooterStatus[];
  return (
    <>
      <h1>Scooters</h1>
      <SearchPanel query={query} setQuery={setQuery} />
      <div className="card-grid">
        {groups.map((status) => (
          <section className="panel compact-list" key={status}>
            <div className="panel-title"><Bike size={16} /> Recent {status.toLowerCase()}</div>
            {scooters.filter((s) => s.status === status).slice(0, 5).map((scooter) => (
              <button key={scooter.id} className="record-row" onClick={() => onSelect(scooter)}>
                <span>{scooter.frameNumber}</span>
                {scooter.model} {scooter.color} {scooter.speed}
                <strong>{dealerName(data.dealers, scooter.dealerId)}</strong>
              </button>
            ))}
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
      <SearchPanel query="" setQuery={() => undefined} />
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
              <span>{scooter.model} - {scooter.color} - {scooter.speed}</span>
              <small>{scooter.licensePlate || 'Geen kenteken'}</small>
            </div>
          ))}
        </section>
      </section>
    </div>
  );
}

function Warranty({ data, addWarranty, updateWarranty, message }: { data: AppData; addWarranty: (event: FormEvent<HTMLFormElement>) => Promise<void>; updateWarranty: (warranty: WarrantyPart) => Promise<void>; message: string }) {
  const [selectedFrame, setSelectedFrame] = useState(data.scooters[0]?.frameNumber ?? '');
  const [selectedClaim, setSelectedClaim] = useState<WarrantyPart | null>(null);
  const selectedScooter = data.scooters.find((scooter) => scooter.frameNumber === selectedFrame) ?? data.scooters[0];
  const [licensePlate, setLicensePlate] = useState(selectedScooter?.licensePlate ?? '');
  const [selectedDealerId, setSelectedDealerId] = useState(selectedScooter?.dealerId ?? data.dealers[0]?.id ?? '');
  const registrationDate = selectedScooter?.firstRegistrationDate || selectedScooter?.firstAdmissionDate;
  const calculatedAge = formatVehicleAge(registrationDate);
  const warrantyUntil = addMonthsToInputDate(registrationDate);
  const warrantyExpired = isPastInputDate(warrantyUntil);

  function handleScooterChange(frameNumber: string) {
    const scooter = data.scooters.find((item) => item.frameNumber === frameNumber);
    setSelectedFrame(frameNumber);
    setLicensePlate(scooter?.licensePlate ?? '');
    setSelectedDealerId(scooter?.dealerId ?? data.dealers[0]?.id ?? '');
  }

  function handleLicensePlateChange(value: string) {
    setLicensePlate(value);
    const scooter = data.scooters.find((item) => normalizeLookup(item.licensePlate ?? '') === normalizeLookup(value));
    if (!scooter) return;
    setSelectedFrame(scooter.frameNumber);
    setSelectedDealerId(scooter.dealerId ?? data.dealers[0]?.id ?? '');
  }

  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Warranty parts</h1>
          <span>{data.warranties.length} claims geregistreerd</span>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="two-col warranty-layout">
        <section className="panel">
          <div className="panel-title"><ShieldCheck size={16} /> Warranty claims</div>
          {data.warranties.length === 0 ? (
            <div className="empty-state inline"><ShieldCheck size={22} /><strong>Nog geen warranty claims</strong><span>Nieuwe claims verschijnen hier zodra je ze toevoegt.</span></div>
          ) : data.warranties.map((claim) => (
            <div className="claim-row" key={claim.id}>
              {warrantyStatusIcon(claim.status)}
              <button type="button" className="claim-row-main" onClick={() => setSelectedClaim(claim)}>
                <strong>{claim.claimNumber || claim.id} - {claim.partName}</strong>
                <span>{claim.scooterFrame} - {claim.licensePlate || 'geen kenteken'} - {claim.partNumber}</span>
                <small>{claim.mileage || '0'} km - ouderdom {claim.age || '-'}</small>
              </button>
              <label className="compact-select-label">
                Status
                <select value={claim.status} onChange={(event) => updateWarranty({ ...claim, status: event.target.value as WarrantyPart['status'] })}>
                  {warrantyStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <small>Warranty until {formatDate(claim.warrantyUntil)}</small>
            </div>
          ))}
        </section>
        <form className="panel form-panel" onSubmit={addWarranty}>
          <div className="panel-title"><ClipboardList size={16} /> Nieuw warranty part</div>
          <div className="form-grid warranty-form-grid">
            <label>Scooter<select name="scooterFrame" value={selectedScooter?.frameNumber ?? ''} onChange={(event) => handleScooterChange(event.target.value)}>{data.scooters.map((s) => <option key={s.id} value={s.frameNumber}>{s.frameNumber}</option>)}</select></label>
            <label>Dealer<select name="dealerId" value={selectedDealerId} onChange={(event) => setSelectedDealerId(event.target.value)}>{data.dealers.map((d) => <option value={d.id} key={d.id}>{d.company}</option>)}</select></label>
            <label>Kenteken<input name="licensePlate" value={licensePlate} onChange={(event) => handleLicensePlateChange(event.target.value)} /></label>
            <label>Kilometerstand<input name="mileage" inputMode="numeric" /></label>
            <label>Ouderdom<input name="age" value={calculatedAge === '-' ? '' : calculatedAge} readOnly placeholder="Eerste tenaamstelling ontbreekt" /></label>
            <label>Part name<input name="partName" required /></label>
            <label>Part number<input name="partNumber" required /></label>
            <label>Claim date<input name="claimDate" type="date" required /></label>
            <label>Status<select name="status" defaultValue="Open">{warrantyStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>Garantie tot<input name="warrantyUntil" type="date" value={warrantyUntil} readOnly required /></label>
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
            <span>Warranty claim</span>
            <h2>{claim.claimNumber || claim.id}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <dl className="dealer-detail-list">
          <dt>Status</dt><dd>{claim.status}</dd>
          <dt>Onderdeel</dt><dd>{claim.partName}</dd>
          <dt>Part nummer</dt><dd>{claim.partNumber || '-'}</dd>
          <dt>Kenteken</dt><dd>{claim.licensePlate || scooter?.licensePlate || '-'}</dd>
          <dt>Framenummer</dt><dd>{claim.scooterFrame}</dd>
          <dt>Scooter</dt><dd>{scooter ? `${scooter.model} - ${scooter.color} - ${scooter.speed}` : '-'}</dd>
          <dt>Dealer</dt><dd>{dealer?.company || '-'}</dd>
          <dt>Kilometerstand</dt><dd>{claim.mileage || '-'}</dd>
          <dt>Ouderdom</dt><dd>{claim.age || '-'}</dd>
          <dt>Claimdatum</dt><dd>{formatDate(claim.claimDate)}</dd>
          <dt>Garantie tot</dt><dd>{formatDate(claim.warrantyUntil)}</dd>
          <dt>Notities</dt><dd>{claim.notes || '-'}</dd>
        </dl>
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
              <dt>Snelheid</dt><dd>{historyScooter.speed}</dd>
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
          <dt>Scooter</dt><dd>{scooter ? `${scooter.model} - ${scooter.color} - ${scooter.speed}` : '-'}</dd>
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
  return (
    <>
      <h1>Zoeken</h1>
      <SearchPanel query={query} setQuery={setQuery} />
      <ScooterTable scooters={scooters} dealers={data.dealers} query={query} setQuery={setQuery} onSelect={onSelect} />
    </>
  );
}

function SearchPanel({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  return (
    <section className="panel search-panel">
      <div className="panel-title"><Search size={16} /> Zoeken</div>
      <div className="search-grid">
        <div><strong>Zoek in</strong><label><input type="checkbox" defaultChecked /> Frame nummer</label><label><input type="checkbox" /> Engine nummer</label><label><input type="checkbox" /> Kenteken</label></div>
        <div><strong>voor</strong><div className="inline-search"><input value={query} onChange={(event) => setQuery(event.target.value)} /><button className="primary-button"><Search size={15} /></button></div></div>
        <div><strong>met</strong><select><option>Snelheid</option></select><select><option>Model</option></select><select><option>Kleur</option></select><select><option>Status</option></select></div>
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

function ContainerListPanel({ title, containers, scooters, green = false }: { title: string; containers: Container[]; scooters: Scooter[]; green?: boolean }) {
  const [openContainerId, setOpenContainerId] = useState<string | null>(containers[0]?.id ?? null);
  return (
    <section className="panel list-panel">
      <div className="panel-title"><Boxes size={16} /> {title}</div>
      {containers.length === 0 ? <p className="empty">N.V.T.</p> : containers.map((container) => {
        const containerScooters = scooters.filter((scooter) => scooter.containerId === container.id);
        const isOpen = openContainerId === container.id;
        return (
          <div className="container-list-item" key={container.id}>
            <button className={green ? 'green-row container-toggle-row' : 'simple-row container-toggle-row'} onClick={() => setOpenContainerId(isOpen ? null : container.id)}>
              <span>
                <strong>{container.number}</strong>
                <small>{container.invoiceNumber} - {formatDate(container.arrivedAt || container.eta)}</small>
              </span>
              <span className="container-row-meta">{containerScooters.length} scooters {isOpen ? '-' : '+'}</span>
            </button>
            {isOpen && (
              <div className="container-scooter-list">
                {containerScooters.length === 0 ? (
                  <p className="empty">Geen scooters gekoppeld.</p>
                ) : (
                  <div className="container-scooter-table-wrap">
                    <table className="container-scooter-table">
                      <thead>
                        <tr>
                          <th>Frame</th>
                          <th>Model</th>
                          <th>Kleur</th>
                          <th>Snelheid</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {containerScooters.map((scooter) => (
                          <tr key={scooter.id}>
                            <td><strong>{scooter.frameNumber}</strong></td>
                            <td>{scooter.model || '-'}</td>
                            <td>{scooter.color || '-'}</td>
                            <td>{scooter.speed || '-'}</td>
                            <td><span className="status-pill compact">{scooter.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function ScooterDrawer({ scooter, dealers, warranties, maintenance, onClose, onUpdate }: { scooter: Scooter; dealers: Dealer[]; warranties: WarrantyPart[]; maintenance: MaintenanceRecord[]; onClose: () => void; onUpdate: (scooter: Scooter) => void | Promise<void> }) {
  const [draft, setDraft] = useState(scooter);
  const [rdwLoading, setRdwLoading] = useState(false);
  const [rdwMessage, setRdwMessage] = useState('');
  const registrationComplete = isRegistrationComplete(scooter);

  async function handleRdwFetch() {
    setRdwLoading(true);
    setRdwMessage('');
    try {
      const rdwData = await fetchRdwRegistration(draft.licensePlate ?? '');
      const nextDraft = {
        ...draft,
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
              <dt>Snelheid</dt><dd>{scooter.speed}</dd>
              <dt>Kenteken</dt><dd>{scooter.licensePlate || '-'}</dd>
              <dt>Factuur</dt><dd>{scooter.invoiceNumber || '-'}</dd>
              <dt>Status</dt><dd>{scooter.status}</dd>
              <dt>Dealer</dt><dd>{dealerName(dealers, scooter.dealerId) || '-'}</dd>
            </dl>
          </section>
          <section className="panel drawer-edit-card">
            <div className="panel-title"><Wrench size={16} /> Gegevens wijzigen</div>
            <div className="drawer-form">
              <label>Kleur<input value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
              <label>Snelheid<input value={draft.speed} onChange={(e) => setDraft({ ...draft, speed: e.target.value })} /></label>
              <label>Kenteken<input value={draft.licensePlate ?? ''} onChange={(e) => setDraft({ ...draft, licensePlate: e.target.value })} /></label>
              <label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ScooterStatus })}>{Object.keys(statusColor).map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>Dealer<select value={draft.dealerId ?? ''} onChange={(e) => setDraft({ ...draft, dealerId: e.target.value })}><option value="">Geen dealer</option>{dealers.map((d) => <option value={d.id} key={d.id}>{d.company}</option>)}</select></label>
              <label>Factuur<input value={draft.invoiceNumber ?? ''} onChange={(e) => setDraft({ ...draft, invoiceNumber: e.target.value })} /></label>
            </div>
            <div className="drawer-actions">
              <button className="primary-button" onClick={() => onUpdate(draft)}>Verander gegevens</button>
              <button className="secondary-button" disabled={rdwLoading} onClick={handleRdwFetch}>
                <RefreshCw size={15} /> {rdwLoading ? 'RDW ophalen...' : 'Haal RDW data op'}
              </button>
            </div>
            {rdwMessage && <p className="drawer-note">{rdwMessage}</p>}
          </section>
        </div>
        <section className="panel drawer-info-panel"><div className="panel-title"><ShieldCheck size={16} /> Warranty</div>{warranties.length ? warranties.map((w) => <p key={w.id}>{w.claimNumber || w.id} - {w.partName} - {w.status}</p>) : <p>Geen warranty claims</p>}</section>
        <section className="panel drawer-info-panel">
          <div className="panel-title"><ClipboardList size={16} /> Onderhoud</div>
          {maintenance.length ? maintenance.map((record) => (
            <p key={record.id}>{formatDate(record.serviceDate)} - {record.serviceType} - {record.status}</p>
          )) : <p>Geen onderhoud geregistreerd</p>}
        </section>
        <section className="panel drawer-info-panel"><div className="panel-title"><FileText size={16} /> Documenten</div><p>Nog geen documenten toegevoegd</p></section>
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
