import type { FormEvent } from 'react';
import type { Importer } from '../types';

function stableId(prefix: string, value: string) {
  return `${prefix}-${value.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
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

export function ImporterModal({
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
            <span>EU-contactpartij</span>
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


