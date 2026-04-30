import { useEffect } from 'react';
import { X } from 'lucide-react';
import Button from './Button';

export default function Modal({ open, onClose, title, children, footer, size = 'md', danger }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl', '2xl': 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${widths[size]} bg-cloud-card border border-cloud-border rounded shadow-2xl animate-slide-up`}>
        <div className={`flex items-center justify-between px-5 py-3.5 border-b border-cloud-border ${danger ? 'bg-red-900/20' : ''}`}>
          <h2 className="font-semibold text-white text-sm">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-0.5 rounded">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-cloud-border flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onCancel, onConfirm, title, message, confirmLabel = 'Delete', loading, danger }) {
  const handleClose = onClose || onCancel;
  return (
    <Modal open={open} onClose={handleClose} title={title} danger={danger} size="sm"
      footer={<>
        <Button variant="secondary" onClick={handleClose}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>}
    >
      <p className="text-gray-300 text-sm">{message}</p>
    </Modal>
  );
}
