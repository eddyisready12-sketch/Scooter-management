import { useEffect, useState } from 'react';
import type { Dealer, Scooter } from '../types';

function normalizeSpeedValue(value?: string) {
  if (!value) return '';
  const match = value.match(/\d{2,3}/);
  return match?.[0] ?? value.trim();
}

export function DealerDetailModal({ dealer, scooters, onClose, onUpdate }: { dealer: Dealer; scooters: Scooter[]; onClose: () => void; onUpdate: (dealer: Dealer) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Dealer>(dealer);

  useEffect(() => {
    setDraft(dealer);
    setEditing(false);
    setSaving(false);
  }, [dealer]);

  const isActive = dealer.active !== false;
  const consignmentScooters = scooters.filter((scooter) => scooter.dealerId === dealer.id && scooter.status === 'In consignatie');

  async function handleSave() {
    setSaving(true);
    try {
      await onUpdate({
        ...draft,
        company: draft.company.trim(),
        name: draft.name.trim() || draft.company.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        address: draft.address.trim(),
        Postalcode: draft.Postalcode?.trim() || '',
        city: draft.city.trim(),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

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
        {editing ? (
          <div className="dealer-detail-form">
            <div className="form-grid">
              <label>Company name<input value={draft.company || ''} onChange={(event) => setDraft((current) => ({ ...current, company: event.target.value }))} /></label>
              <label>Klantnaam<input value={draft.name || ''} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Email<input type="email" value={draft.email || ''} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
              <label>Telefoon<input value={draft.phone || ''} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label className="span-2">Straat + huisnummer<input value={draft.address || ''} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} /></label>
              <label>Postcode<input value={draft.Postalcode || ''} onChange={(event) => setDraft((current) => ({ ...current, Postalcode: event.target.value }))} /></label>
              <label>Woonplaats<input value={draft.city || ''} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} /></label>
              <label>Status
                <select
                  value={draft.active === false ? 'inactive' : 'active'}
                  onChange={(event) => setDraft((current) => ({ ...current, active: event.target.value === 'active' }))}
                >
                  <option value="active">Actief</option>
                  <option value="inactive">Niet actief</option>
                </select>
              </label>
            </div>
          </div>
        ) : (
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
        )}
        <div className="modal-actions">
          {editing ? (
            <>
              <button type="button" className="secondary-button" onClick={() => { setDraft(dealer); setEditing(false); }} disabled={saving}>Annuleren</button>
              <button type="button" className="primary-button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </>
          ) : (
            <>
              <button className="secondary-button" type="button" onClick={() => setEditing(true)}>Bewerken</button>
              <button
                className={isActive ? 'secondary-button' : 'primary-button'}
                type="button"
                onClick={() => onUpdate({ ...dealer, active: !isActive })}
              >
                {isActive ? 'Zet niet actief' : 'Zet actief'}
              </button>
            </>
          )}
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
