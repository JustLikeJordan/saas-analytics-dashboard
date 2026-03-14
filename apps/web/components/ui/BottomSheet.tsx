'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 m-0 h-full w-full border-none bg-transparent p-0 backdrop:bg-black/40 open:flex open:items-end"
    >
      <div className="w-full max-h-[80vh] overflow-y-auto rounded-t-xl border-t border-border bg-card shadow-lg animate-slide-up">
        {children}
      </div>
    </dialog>
  );
}
