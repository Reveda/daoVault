/**
 * Lite mode: phones and low-power devices get lighter effects (fewer particles, 30fps,
 * no backdrop blur, static small logos) so scrolling stays smooth. The class is set by
 * an inline script in each page's <head> before first paint; this just reads it.
 */
export const LITE = typeof document !== 'undefined' && document.documentElement.classList.contains('lite');
