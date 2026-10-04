import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function Dialog({
  title,
  close,
  children,
  className,
  onEscape,
  onKeyDown,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  className?: string;
  onEscape?: () => void;
  onKeyDown?: React.KeyboardEventHandler;
}) {
  const panel = useRef<HTMLElement>(null),
    onClose = useRef(close),
    escape = useRef(onEscape);
  onClose.current = close;
  escape.current = onEscape;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('input,button,textarea,select')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (escape.current ?? onClose.current)();
      if (e.key === 'Tab') {
        const elements = [
          ...(panel.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea,select:not(:disabled),a[href],[tabindex="0"]',
          ) ?? []),
        ].filter((element) => element.getClientRects().length > 0);
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={panel}
        onKeyDown={onKeyDown}
        className={'dialog ' + (className ?? '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-top">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
