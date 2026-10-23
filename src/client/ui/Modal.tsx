import { useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion, sfx } from './codex.tsx';
import { Icon } from './icons.tsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
  footer,
  variant = 'page',
  night,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
  /** A page turning in from the spine, or a scroll unrolling (charters, proclamations). */
  variant?: 'page' | 'scroll';
  night?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  // Closing from inside the dialog plays the page leaving before the parent unmounts it.
  const requestClose = () => {
    if (closing) return;
    sfx('ui.close');
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    setTimeout(onClose, 170);
  };
  // Whatever had focus before the dialog, captured while rendering: by the time an effect runs, a child's autoFocus
  // has already moved focus inside, and restoring to that would drop focus on the page body when the dialog closes.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)));
  const close = useRef(requestClose);
  close.current = requestClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab' || !ref.current) return;
      // Keep keyboard focus inside the dialog: the page behind it is inert to pointer users too.
      const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !ref.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    sfx(variant === 'scroll' ? 'ui.page' : 'ui.open');
    // Respect a child's autoFocus (e.g. the primary action); otherwise focus the dialog itself.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      // After the dialog has left the page (not on a StrictMode re-run, which keeps it), and only if the opener remains.
      const dialog = ref.current;
      setTimeout(() => {
        if (dialog?.isConnected || !opener?.isConnected) return;
        // Something else already took focus (a navigation, another dialog): leave it there.
        if (document.activeElement && document.activeElement !== document.body) return;
        opener.focus?.();
      }, 0);
    };
  }, []);
  return (
    <div className={`modal-backdrop${closing ? ' is-closing' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div className={`panel modal${wide ? ' modal-wide' : ''}${variant === 'scroll' ? ' modal-scroll' : ''}${night ? ' panel-night' : ''}${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header className="modal-head">
          <div className="modal-titles">
            <h2 className="modal-title">{title}</h2>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={requestClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
