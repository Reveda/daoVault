/* Runs first, in <head>, on every page (kept out of the HTML so the Content-Security-Policy
   can forbid inline scripts):
   1. html.lite on small / low-power devices (read by perf.ts LITE and the CSS);
   2. ?ref=CODE saved before anything else loads (core.ts captures it again later). */
try {
  var n = navigator;
  if (matchMedia('(max-width: 900px)').matches || (n.hardwareConcurrency || 8) <= 4 || (n.deviceMemory || 8) <= 4) {
    document.documentElement.classList.add('lite');
  }
} catch (e) {}
try {
  var ref = new URLSearchParams(window.location.search).get('ref');
  if (ref && ref.trim()) localStorage.setItem('daovault_pending_ref', ref.trim().toUpperCase());
} catch (e) {}
