'use strict';
(() => {
  const entries = window.mobilityTestimonials;
  const dialog = document.querySelector('.proof-dialog');
  if (!entries?.length || !dialog || typeof dialog.showModal !== 'function') return;
  const heading = dialog.querySelector('#proof-title');
  const context = dialog.querySelector('#proof-context');
  const counter = dialog.querySelector('#proof-counter');
  const image = dialog.querySelector('.proof-image');
  const transcript = dialog.querySelector('.proof-transcript');
  const transcriptText = transcript.querySelector('p');
  const original = dialog.querySelector('.proof-original');
  const previous = dialog.querySelector('.proof-prev');
  const next = dialog.querySelector('.proof-next');
  const body = dialog.querySelector('.proof-body');
  let index = 0;
  let opener;

  function render(value) {
    index = Math.max(0, Math.min(entries.length - 1, value));
    const entry = entries[index];
    heading.textContent = entry.title;
    context.textContent = entry.context;
    counter.textContent = `${index + 1} / ${entries.length}`;
    image.src = entry.src;
    image.alt = `Capture originale : ${entry.title}. Le texte du message est disponible sous l’image.`;
    transcriptText.textContent = entry.transcript;
    transcript.open = false;
    original.href = entry.src;
    previous.disabled = index === 0;
    next.disabled = index === entries.length - 1;
    body.scrollTop = 0;
  }

  document.querySelectorAll('[data-proof-index]').forEach(link => {
    link.addEventListener('click', event => {
      // Preserve the ordinary link for modifier clicks and browsers without dialog.
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      render(Number(link.dataset.proofIndex));
      dialog.showModal();
      document.documentElement.classList.add('proof-open');
    });
  });
  previous.addEventListener('click', () => render(index - 1));
  next.addEventListener('click', () => render(index + 1));
  dialog.querySelector('.proof-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      render(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('proof-open');
    if (opener?.isConnected) opener.focus({preventScroll:true});
  });
})();
