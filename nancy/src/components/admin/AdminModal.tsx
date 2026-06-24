"use client";

interface AdminModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function AdminModal({ title, onClose, children }: AdminModalProps) {
  return (
    <div className="nancy-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" className="nancy-modal__backdrop" onClick={onClose} aria-label="Close" />
      <div className="nancy-modal__panel">
        <header className="nancy-modal__header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="nancy-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="nancy-modal__body">{children}</div>
      </div>
    </div>
  );
}
