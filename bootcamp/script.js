'use strict';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const menuButton = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('#mobile-nav');
function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Ouvrir le menu');
  mobileNav.hidden = true;
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  menuButton.setAttribute('aria-label', open ? 'Ouvrir le menu' : 'Fermer le menu');
  mobileNav.hidden = open;
});
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !mobileNav.hidden) { closeMenu(); menuButton.focus(); }
});
window.matchMedia('(min-width: 541px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

const tabs = [...document.querySelectorAll('[role="tab"]')];
function activateTab(tab) {
  tabs.forEach(item => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); activateTab(tabs[next]); tabs[next].focus(); }
  });
});

const priceState = document.querySelector('.price-state');
const priceAmount = document.querySelector('#price-amount');
const installmentCount = document.querySelector('#installment-count');
const priceDescription = document.querySelector('#price-description');
const priceTotal = document.querySelector('#price-total');
const offerLabel = document.querySelector('.annual-offer-cta .cta-label');
const paymentNote = document.querySelector('#paypal-payment-note');
function updatePayment() {
  const four = document.querySelector('input[name="payment"]:checked').value === 'four';
  priceAmount.textContent = four ? '50' : '200';
  installmentCount.hidden = !four;
  priceDescription.textContent = four ? '50 € à l’achat, puis 3 mensualités de 50 €.' : 'Un seul règlement pour toute l’année.';
  priceTotal.textContent = four ? 'Total : 200 € · option à choisir sur PayPal*.' : 'Ou 4 × 50 € sans frais avec PayPal*.';
  offerLabel.textContent = four ? 'Choisir le 4× sur PayPal' : 'S’inscrire sur PayPal — 200 €';
  paymentNote.textContent = four ? 'Sur PayPal, choisis « Payer en plusieurs fois », puis le 4× si proposé.' : 'Règlement sur PayPal ou par carte bancaire.';
  priceState.classList.remove('changing');
  if (!reducedMotion.matches) requestAnimationFrame(() => priceState.classList.add('changing'));
}
document.querySelectorAll('input[name="payment"]').forEach(input => input.addEventListener('change', updatePayment));
priceState.addEventListener('animationend', () => priceState.classList.remove('changing'));
updatePayment();

const sticky = document.querySelector('.sticky-cta');
const hero = document.querySelector('.hero');
const offer = document.querySelector('#rejoindre');
let heroVisible = true, offerVisible = false;
function updateSticky() {
  sticky.classList.toggle('visible', !heroVisible && !offerVisible);
  sticky.inert = heroVisible || offerVisible;
}
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.target === hero) heroVisible = entry.isIntersecting;
      if (entry.target === offer) offerVisible = entry.isIntersecting;
    });
    updateSticky();
  }, {threshold: 0});
  observer.observe(hero);
  observer.observe(offer);
}
updateSticky();

// Reveal once, in the reference site's 700 ms rhythm. No content depends on JS.
let revealObserver;
const revealElements = [...document.querySelectorAll('.pillar, .section>.eyebrow, .section>h2, .prose, .manifesto, .fit-list, .coach-section, .curriculum, .live-heading, .live-card, .live-timeline, .bonus-heading, .bonus-sessions article, .feature-row, .club-year, .annual-offer-heading, .annual-offer-card, .faq-list, .closing, .testimonials-heading, .testimonial-card, .testimonials-bottom')];
function showEverything() {
  revealObserver?.disconnect();
  document.documentElement.classList.remove('motion-ready');
  revealElements.forEach(element => element.classList.add('revealed'));
}
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  try {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {threshold: 0, rootMargin: '0px 0px -32px 0px'});
    revealElements.forEach(element => {
      element.classList.add('reveal');
      // Hash navigation must never land above hidden content.
      if (element.getBoundingClientRect().top < window.innerHeight - 32) element.classList.add('revealed');
      else revealObserver.observe(element);
    });
    document.querySelectorAll('.pillar').forEach((element, i) => element.style.setProperty('--reveal-delay', `${i * 70}ms`));
    [...hero.children].forEach((element, i) => element.style.setProperty('--hero-delay', `${Math.min(i * 65, 325)}ms`));
    document.documentElement.classList.add('motion-ready');
  } catch { showEverything(); }
}
reducedMotion.addEventListener('change', event => { if (event.matches) showEverything(); });
window.addEventListener('pageshow', event => { if (event.persisted) showEverything(); });
