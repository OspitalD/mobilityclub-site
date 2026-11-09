import { useRef, type ReactNode } from 'react';
import { useInView } from 'motion/react';
import { ScrollReveal } from '../components/10k/web-scroll-reveal/ScrollReveal.tsx';

// Apparition au défilement : le fondu vient de web-scroll-reveal (fade-in, et il se désactive tout seul
// sous prefers-reduced-motion). Le glissement de 14 px, lui, n'est pas réglable dans les props du composant
// (ses variantes glissent de 40 px avec un flou) : il est porté par un enfant, déclenché par le même
// critère de visibilité, comme .apparait de la page de vente.
export function Apparait({ children, delai = 0, className = '' }: { children: ReactNode; delai?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const vu = useInView(ref, { amount: 0.15, once: true });
  return (
    <ScrollReveal variant="fade-in" duration={0.5} delay={delai} className={className}>
      <div ref={ref} className={`apparait glisse${vu ? ' vu' : ''}`} style={{ transitionDelay: `${delai}s` }}>{children}</div>
    </ScrollReveal>
  );
}
