import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

export function Modal({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <dialog ref={dialogRef} className="confirm-dialog" onKeyDown={handleKeyDown} onClick={onClose}>
      <div className="confirm-dialog-content detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="detail-modal-head">
          <h3>{title}</h3>
          <button className="ghost detail-close" type="button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
