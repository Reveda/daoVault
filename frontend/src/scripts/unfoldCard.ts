/**
 * Scroll "drop and unfold" for big landing cards marked [data-unfold] (owner, 2026-10-12, the rank
 * calculator). Scrolling DOWN onto the card: it drops in from above, then its content opens top to
 * bottom. Scrolling UP onto it: it rises from below and opens bottom to top. It closes again once it
 * has left the screen, so it plays every time. Transform / clip-path / opacity only (no layout shift,
 * smooth on phones). Reduced motion: shown as is.
 */
export function initUnfoldCards(): void {
  const cards = [...document.querySelectorAll<HTMLElement>('[data-unfold]')];
  if (!cards.length) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    cards.forEach((c) => c.classList.add('is-unfolded'));
    return;
  }
  let lastY = window.scrollY;
  let dir: 'down' | 'up' = 'down';
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (Math.abs(y - lastY) > 2) dir = y > lastY ? 'down' : 'up';
    lastY = y;
  }, { passive: true });

  cards.forEach((c) => c.classList.add('unfold-ready'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const card = entry.target as HTMLElement;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.12 && !card.classList.contains('is-unfolded')) {
        // which side it came from decides the direction: from below while scrolling down -> drops from above
        card.dataset.from = dir === 'down' ? 'top' : 'bottom';
        card.style.setProperty('--unfold-h', `${card.offsetHeight}px`); // the seam runs the full height
        void card.offsetWidth;
        card.classList.add('is-unfolded');
      } else if (!entry.isIntersecting && card.classList.contains('is-unfolded')) {
        card.classList.remove('is-unfolded'); // off screen again: ready to play next time
      }
    });
  }, { threshold: [0, 0.12] });
  cards.forEach((c) => io.observe(c));
}
