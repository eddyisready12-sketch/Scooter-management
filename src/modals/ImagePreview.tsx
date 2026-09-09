import { XCircle } from 'lucide-react';

export function ImagePreview({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  return (
    <div className="modal-backdrop image-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="image-preview-dialog" role="dialog" aria-modal="true" aria-label={`Afbeelding ${alt}`} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="image-preview-close" onClick={onClose} aria-label="Afbeelding sluiten"><XCircle size={22} /></button>
        <img src={url} alt={alt} referrerPolicy="no-referrer" />
      </div>
    </div>
  );
}
