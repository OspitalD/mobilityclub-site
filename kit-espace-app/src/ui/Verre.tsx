import type { ReactNode } from 'react';
import { Halo } from './Halo.tsx';

// Le verre héros de la page de vente. `halo` pose la lumière derrière (position fixée par .zone>.halo).
export function Verre({ children, halo = false, seulOr = false, className = '' }: { children: ReactNode; halo?: boolean; seulOr?: boolean; className?: string }) {
  return (
    <div className="zone">
      {halo && <Halo seulOr={seulOr} />}
      <div className={`verre ${className}`.trim()}>{children}</div>
    </div>
  );
}
