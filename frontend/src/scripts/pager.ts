/**
 * Small pager used on the admin dashboard (ledger, top earners, withdrawal queue):
 * "‹ Prev · Page 2 of 5 · Next ›". Hidden when everything fits on one page.
 */
export function renderPager(el: HTMLElement | null, page: number, pages: number, onPage: (page: number) => void): void {
  if (!el) return;
  el.hidden = pages <= 1;
  if (pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button type="button" class="pg-btn mono" data-go="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">&lsaquo; Prev</button>
    <span class="pg-info mono">Page <b>${page}</b> of ${pages}</span>
    <button type="button" class="pg-btn mono" data-go="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next page">Next &rsaquo;</button>`;
  el.onclick = (e) => {
    const go = Number((e.target as HTMLElement).closest<HTMLButtonElement>('[data-go]')?.dataset.go);
    if (go >= 1 && go <= pages) onPage(go);
  };
}

/** One page of a list held in memory. */
export const pageOf = <T>(items: T[], page: number, size: number): T[] => items.slice((page - 1) * size, page * size);
export const pageCount = (total: number, size: number): number => Math.max(1, Math.ceil(total / size));
