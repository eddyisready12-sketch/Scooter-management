import type { FormEvent } from 'react';
import type { SupplierContact } from '../types';

function stableId(prefix: string, value: string) {
  return `${prefix}-${value.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
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

export function SupplierContactModal({ supplierId, contact, title, onClose, onSave }: { supplierId: string; contact?: SupplierContact; title: string; onClose: () => void; onSave: (contact: SupplierContact) => Promise<void> }) {
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


