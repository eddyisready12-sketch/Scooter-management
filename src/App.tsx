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
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { demoData } from './data/demo-data';
import { csvRowsToScooters, parseDealerImport, parseScooterImport } from './lib/csv';
import { loadSupabaseData, subscribeToSupabase, supabase, upsertDealers, upsertScooters } from './lib/supabase';
import type { AppData, Battery, Container, Dealer, Scooter, ScooterStatus, WarrantyPart } from './types';

type View = 'dashboard' | 'containers' | 'scooters' | 'batteries' | 'dealers' | 'warranty' | 'search';

const views: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'containers', label: 'Containers', icon: Boxes },
  { id: 'scooters', label: 'Scooters', icon: Bike },
  { id: 'batteries', label: "Accu's", icon: BatteryCharging },
  { id: 'dealers', label: 'Dealers', icon: UsersRound },
  { id: 'warranty', label: 'Warranty parts', icon: ShieldCheck },
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

function dealerName(dealers: Dealer[], dealerId?: string) {
  return dealers.find((dealer) => dealer.id === dealerId)?.company ?? '';
}

function importErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return JSON.stringify(error);
}

export function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState<View>('dashboard');
  const [data, setData] = useState<AppData>(demoData);
  const [query, setQuery] = useState('');
  const [selectedScooter, setSelectedScooter] = useState<Scooter | null>(null);
  const [csvMessage, setCsvMessage] = useState('');
  const [dealerImportMessage, setDealerImportMessage] = useState('');

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
    if (!needle) return data.scooters;
    return data.scooters.filter((scooter) =>
      [scooter.frameNumber, scooter.engineNumber, scooter.model, scooter.color, scooter.status, scooter.licensePlate, dealerName(data.dealers, scooter.dealerId)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [data.dealers, data.scooters, query]);

  async function handleInventoryImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseScooterImport(file);
      if (rows.length === 0) {
        setCsvMessage(`Geen scooters gevonden in ${file.name}. Controleer of er een kolom Frame #, VIN of Chassis aanwezig is.`);
        return;
      }

      const nextScooters = csvRowsToScooters(rows, data.scooters);
      const importedFrames = new Set(rows.map((row) => row.frameNumber).filter(Boolean));
      const importedScooters = nextScooters.filter((scooter) => importedFrames.has(scooter.frameNumber));

      setData((current) => ({ ...current, scooters: nextScooters }));
      await upsertScooters(importedScooters);
      setCsvMessage(`${rows.length} scooterregels geimporteerd naar het Scooters voorraadblok uit ${file.name}.`);
    } catch (error) {
      setCsvMessage(`Import mislukt: ${importErrorMessage(error)}`);
    } finally {
      event.target.value = '';
    }
  }

  async function handleDealerImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dealers = await parseDealerImport(file);
      if (dealers.length === 0) {
        setDealerImportMessage(`Geen dealers gevonden in ${file.name}. Controleer kolommen zoals Bedrijfsnaam, Dealer, Email of Telefoon.`);
        return;
      }

      setData((current) => {
        const byId = new Map(current.dealers.map((dealer) => [dealer.id, dealer]));
        dealers.forEach((dealer) => byId.set(dealer.id, dealer));
        return { ...current, dealers: Array.from(byId.values()) };
      });
      await upsertDealers(dealers);
      setDealerImportMessage(`${dealers.length} dealers geimporteerd naar het Dealers blok uit ${file.name}.`);
    } catch (error) {
      setDealerImportMessage(`Dealer import mislukt: ${importErrorMessage(error)}`);
    } finally {
      event.target.value = '';
    }
  }

  function updateScooter(updated: Scooter) {
    setData((current) => ({
      ...current,
      scooters: current.scooters.map((scooter) => (scooter.id === updated.id ? updated : scooter)),
    }));
    setSelectedScooter(updated);
  }

  function addWarranty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const record: WarrantyPart = {
      id: `w-${Date.now()}`,
      scooterFrame: String(form.get('scooterFrame')),
      partName: String(form.get('partName')),
      partNumber: String(form.get('partNumber')),
      claimDate: String(form.get('claimDate')),
      warrantyUntil: String(form.get('warrantyUntil')),
      status: 'Open',
      dealerId: String(form.get('dealerId')),
      notes: String(form.get('notes')),
    };
    setData((current) => ({ ...current, warranties: [record, ...current.warranties] }));
    event.currentTarget.reset();
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
          {view === 'dashboard' && <Dashboard data={data} onImport={handleInventoryImport} message={csvMessage} query={query} setQuery={setQuery} scooters={filteredScooters} onSelect={setSelectedScooter} />}
          {view === 'containers' && <Containers data={data} />}
          {view === 'scooters' && <Scooters data={data} query={query} setQuery={setQuery} scooters={filteredScooters} onSelect={setSelectedScooter} />}
          {view === 'batteries' && <Batteries batteries={data.batteries} scooters={data.scooters} />}
          {view === 'dealers' && <Dealers dealers={data.dealers} scooters={data.scooters} onImport={handleDealerImport} message={dealerImportMessage} />}
          {view === 'warranty' && <Warranty data={data} addWarranty={addWarranty} />}
          {view === 'search' && <GlobalSearch data={data} query={query} setQuery={setQuery} scooters={filteredScooters} onSelect={setSelectedScooter} />}
        </section>
      </main>

      {selectedScooter && (
        <ScooterDrawer
          scooter={selectedScooter}
          dealers={data.dealers}
          warranties={data.warranties.filter((warranty) => warranty.scooterFrame === selectedScooter.frameNumber)}
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

function Dashboard({ data, onImport, message, query, setQuery, scooters, onSelect }: {
  data: AppData;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  message: string;
  query: string;
  setQuery: (value: string) => void;
  scooters: Scooter[];
  onSelect: (scooter: Scooter) => void;
}) {
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
        <label className="upload-button"><Upload size={16} /> CSV / Excel importeren<input type="file" accept=".csv,.xlsx,.xls" onChange={onImport} /></label>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="stat-grid">
        {cards.map(({ label, icon: Icon }) => (
          <div className="stat-card" key={label}>
            <div className={`stat-icon ${statusColor[label]}`}><Icon size={24} /></div>
            <div><span>{label}</span><strong>{countByStatus(data.scooters, label)}</strong></div>
          </div>
        ))}
      </div>
      <ScooterTable scooters={scooters.slice(0, 20)} dealers={data.dealers} query={query} setQuery={setQuery} onSelect={onSelect} />
    </>
  );
}

function ScooterTable({ scooters, dealers, query, setQuery, onSelect }: {
  scooters: Scooter[];
  dealers: Dealer[];
  query: string;
  setQuery: (value: string) => void;
  onSelect: (scooter: Scooter) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-title"><Bike size={16} /> Beschikbare scooters</div>
      <div className="table-toolbar">
        <div className="button-group"><button>CSV</button><button>Excel</button><button>PDF</button><button>Print</button></div>
        <label>Search: <input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Model</th><th>Frame #</th><th>Kleur</th><th>Kenteken</th><th>Snelheid</th><th>Status</th><th>Dealer</th></tr></thead>
          <tbody>
            {scooters.map((scooter) => (
              <tr key={scooter.id} onClick={() => onSelect(scooter)}>
                <td>{scooter.model}</td>
                <td><button className="link-button">{scooter.frameNumber}</button></td>
                <td>{scooter.color}</td>
                <td>{scooter.licensePlate || '-'}</td>
                <td>{scooter.speed}</td>
                <td>{scooter.status}</td>
                <td>{dealerName(dealers, scooter.dealerId) || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">Showing 1 to {scooters.length} of {scooters.length} entries</div>
    </section>
  );
}

function Containers({ data }: { data: AppData }) {
  return (
    <>
      <h1>Containers</h1>
      <section className="panel import-row"><button className="link-button"><Upload size={15} /> Container importeren</button><Plus size={18} /></section>
      <div className="two-col">
        <ListPanel title="Containers nog niet aangekomen" items={data.containers.filter((c) => c.status !== 'Aangekomen').map((c) => `${c.number} - ${c.invoiceNumber}`)} />
        <ListPanel title="Meest recent aangekomen containers" items={data.containers.filter((c) => c.status === 'Aangekomen').map((c) => `${c.number} - ${c.invoiceNumber}`)} green />
      </div>
      <h2>Scooters per container</h2>
      <div className="container-grid">
        {data.containers.map((container) => <ContainerCard key={container.id} container={container} scooters={data.scooters.filter((s) => s.containerId === container.id)} dealers={data.dealers} />)}
      </div>
    </>
  );
}

function ContainerCard({ container, scooters, dealers }: { container: Container; scooters: Scooter[]; dealers: Dealer[] }) {
  return (
    <section className="panel container-card">
      <div className="panel-title"><Boxes size={16} /> {container.number}</div>
      <dl>
        <dt>Invoice number</dt><dd>{container.invoiceNumber}</dd>
        <dt>Seal number</dt><dd>{container.sealNumber}</dd>
        <dt>Status</dt><dd className="green-text">{container.status}</dd>
        <dt>Arrived</dt><dd>{formatDate(container.arrivedAt)}</dd>
        <dt>Total scooters</dt><dd>{scooters.length}</dd>
      </dl>
      <div className="lane-columns">
        {(['Beschikbaar', 'In consignatie', 'Verkocht klant'] as ScooterStatus[]).map((status) => (
          <div key={status}>
            <strong>{status}</strong>
            {scooters.filter((s) => s.status === status).slice(0, 4).map((s) => <p key={s.id}>{s.frameNumber} {s.model}<span>{dealerName(dealers, s.dealerId)}</span></p>)}
          </div>
        ))}
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

function Batteries({ batteries, scooters }: { batteries: Battery[]; scooters: Scooter[] }) {
  return (
    <>
      <h1>Accu's</h1>
      <SearchPanel query="" setQuery={() => undefined} />
      <div className="two-col">
        <ListPanel title="Alle accu's" items={batteries.map((battery) => `${battery.lotNumber}, ${battery.spec}`)} />
        <section className="panel form-panel">
          <div className="panel-title"><Plus size={16} /> Voeg nieuwe accu toe</div>
          <div className="form-grid"><label>Model<input /></label><label>Lotnum<input /></label><label>Laad datum<input type="date" /></label><label>Scooter<select>{scooters.slice(0, 8).map((s) => <option key={s.id}>{s.frameNumber}</option>)}</select></label></div>
          <button className="primary-button">Toevoegen</button>
        </section>
      </div>
    </>
  );
}

function Dealers({ dealers, scooters, onImport, message }: { dealers: Dealer[]; scooters: Scooter[]; onImport: (event: ChangeEvent<HTMLInputElement>) => void; message: string }) {
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Dealers</h1>
          <span>Totaal dealers: {dealers.length}</span>
        </div>
        <label className="upload-button"><Upload size={16} /> Dealers importeren<input type="file" accept=".csv,.xlsx,.xls" onChange={onImport} /></label>
      </div>
      {message && <div className="notice">{message}</div>}
      <SearchPanel query="" setQuery={() => undefined} />
      <div className="two-col">
        <ListPanel title="Alle dealers" items={dealers.map((dealer) => `${dealer.name} - ${dealer.company} - ${dealer.email}`)} />
        <ListPanel title="In consignatie" items={dealers.map((dealer) => `${scooters.filter((s) => s.dealerId === dealer.id && s.status === 'In consignatie').length} bij ${dealer.company} (${dealer.city})`)} />
      </div>
      <section className="panel form-panel dealer-form">
        <div className="panel-title"><UsersRound size={16} /> Voeg nieuwe dealer toe</div>
        <div className="form-grid"><label>Email<input /></label><label>Mobiel<input /></label><label>Bedrijfsnaam<input /></label><label>Voornaam<input /></label><label>Achternaam<input /></label><label>Postcode<input /></label><label>Woonplaats<input /></label><label>Extra info<textarea /></label></div>
        <button className="primary-button">Toevoegen</button>
      </section>
    </>
  );
}

function Warranty({ data, addWarranty }: { data: AppData; addWarranty: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <>
      <h1>Warranty parts</h1>
      <div className="two-col warranty-layout">
        <section className="panel">
          <div className="panel-title"><ShieldCheck size={16} /> Warranty claims</div>
          {data.warranties.map((claim) => (
            <div className="claim-row" key={claim.id}>
              <div><strong>{claim.partName}</strong><span>{claim.scooterFrame} - {claim.partNumber}</span></div>
              <span className="status-pill">{claim.status}</span>
              <small>Warranty until {formatDate(claim.warrantyUntil)}</small>
            </div>
          ))}
        </section>
        <form className="panel form-panel" onSubmit={addWarranty}>
          <div className="panel-title"><ClipboardList size={16} /> Nieuw warranty part</div>
          <div className="form-grid single">
            <label>Scooter<select name="scooterFrame">{data.scooters.map((s) => <option key={s.id}>{s.frameNumber}</option>)}</select></label>
            <label>Dealer<select name="dealerId">{data.dealers.map((d) => <option value={d.id} key={d.id}>{d.company}</option>)}</select></label>
            <label>Part name<input name="partName" required /></label>
            <label>Part number<input name="partNumber" required /></label>
            <label>Claim date<input name="claimDate" type="date" required /></label>
            <label>Warranty until<input name="warrantyUntil" type="date" required /></label>
            <label>Notes<textarea name="notes" /></label>
          </div>
          <button className="primary-button">Toevoegen</button>
        </form>
      </div>
    </>
  );
}

function GlobalSearch({ data, query, setQuery, scooters, onSelect }: { data: AppData; query: string; setQuery: (value: string) => void; scooters: Scooter[]; onSelect: (scooter: Scooter) => void }) {
  return (
    <>
      <h1>Zoeken</h1>
      <SearchPanel query={query} setQuery={setQuery} />
      <ScooterTable scooters={scooters.slice(0, 25)} dealers={data.dealers} query={query} setQuery={setQuery} onSelect={onSelect} />
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

function ScooterDrawer({ scooter, dealers, warranties, onClose, onUpdate }: { scooter: Scooter; dealers: Dealer[]; warranties: WarrantyPart[]; onClose: () => void; onUpdate: (scooter: Scooter) => void }) {
  const [draft, setDraft] = useState(scooter);
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
            </div>
            <div className="drawer-actions">
              <button className="primary-button" onClick={() => onUpdate(draft)}>Verander gegevens</button>
            </div>
          </section>
        </div>
        <div className="two-col">
          <section className="panel drawer-info-panel"><div className="panel-title"><UserRound size={16} /> Dealer</div><p>{dealerName(dealers, scooter.dealerId) || 'Nog geen dealer geselecteerd'}</p></section>
          <section className="panel drawer-info-panel"><div className="panel-title"><ShieldCheck size={16} /> Warranty</div>{warranties.length ? warranties.map((w) => <p key={w.id}>{w.partName} - {w.status}</p>) : <p>Geen warranty claims</p>}</section>
        </div>
        <section className="panel drawer-info-panel"><div className="panel-title"><FileText size={16} /> Documenten</div><p>Nog geen documenten toegevoegd</p></section>
      </aside>
    </div>
  );
}
