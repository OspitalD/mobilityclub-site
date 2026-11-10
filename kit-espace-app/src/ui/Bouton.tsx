import type { MouseEventHandler, ReactNode } from 'react';

const Fleche = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

interface Props {
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  type?: 'button' | 'submit';
  disabled?: boolean;
  fleche?: boolean;
  auto?: boolean;
  className?: string;
}

// L'action principale de l'écran : bouton vert à remplissage. Une seule par écran, jamais deux.
export function Bouton({ children, href, onClick, type = 'button', disabled, fleche = true, auto, className = '' }: Props) {
  const cls = `bouton${auto ? ' auto' : ''} ${className}`.trim();
  const contenu = (<><span className="rempli" />{children}{fleche && <Fleche />}</>);
  if (href && !disabled) return <a className={cls} href={href} onClick={onClick}>{contenu}</a>;
  return <button className={cls} type={type} onClick={onClick} disabled={disabled}>{contenu}</button>;
}

export { Fleche };
