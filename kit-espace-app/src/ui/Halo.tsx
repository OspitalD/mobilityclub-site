// Trois lumières en dégradés radiaux (jamais de filter:blur) : posées derrière un Verre, jamais seules.
export function Halo({ className = '', seulOr = false }: { className?: string; seulOr?: boolean }) {
  return (
    <div className={`halo${seulOr ? ' seul-or' : ''} ${className}`.trim()} aria-hidden="true">
      <i className="hv" /><i className="hp" /><i className="ho" />
    </div>
  );
}
