export function Progression3px({ pct, violet = false, label }: { pct: number; violet?: boolean; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return <div className={`barre3${violet ? ' violet' : ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}><i style={{ width: `${v}%` }} /></div>;
}
