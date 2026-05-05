import { createPortal } from 'react-dom';
import { useEffect } from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string; // p.ej. "max-w-xl" | "max-w-2xl"
};

export default function Modal({ open, onClose, children, widthClass = 'max-w-xl' }: ModalProps) {
  if (!open) return null;

  // bloquear scroll del body mientras el modal está abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* Contenedor centrado */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className={`w-full ${widthClass} rounded-2xl shadow-xl bg-white dark:bg-gray-900`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
