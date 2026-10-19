/**
 * Dashboard entry (owner 2026-10-19): a tiny first script. It mounts the animated DAOVAULT logos (splash,
 * header, hero, footer) at once, then loads the page's big bundle (three.js, gsap ...). Before, the splash
 * showed its black JPEG fallback for seconds on slow connections and the animated logo popped in when the
 * bundle finally ran. dvLogo mounts each host only once, so the page's own initDvLogos() leaves these alone.
 * The page CSS is linked in the HTML (no unstyled flash on the dev server either), so nothing waits for this.
 */
import { initDvLogos } from './dvLogo.ts';

initDvLogos();
void import('./dashboard.ts');
