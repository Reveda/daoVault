/**
 * DAOvault AI — Landing page motion extras (TPR World patterns)
 * - Scrollspy: the nav pill highlights the section in view
 * - How to Join: expanding step cards (one open at a time) with a progress stage
 * - Drop-and-open cards (iorca.xyz pattern)
 */

/** Highlights the nav link whose section crosses the middle of the screen. */
export function initScrollSpy(): void {
  const anchors = [...document.querySelectorAll<HTMLAnchorElement>('.top-header .nav-links a[href^="#"]')];
  const map = new Map<Element, HTMLAnchorElement>();
  anchors.forEach((a) => {
    const target = document.querySelector(a.getAttribute('href') || '');
    if (target) map.set(target, a);
  });
  if (!map.size || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const active = map.get(entry.target);
      anchors.forEach((a) => a.classList.toggle('active', a === active));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  map.forEach((_, section) => io.observe(section));

  // above the first tracked section nothing is highlighted
  window.addEventListener('scroll', () => {
    if (window.scrollY < window.innerHeight * 0.5) anchors.forEach((a) => a.classList.remove('active'));
  }, { passive: true });
}

/**
 * In-page links (#vision, #ranks, ...). The browser's own smooth jump measures the target
 * once; sections above it change height while the page scrolls (scroll animations, the
 * lazily built trophy), so it stopped short or overshot. Scroll there, then re-aim once
 * the scroll has settled until the section sits at the top. A wheel or touch by the
 * visitor cancels the re-aiming.
 */
export function initAnchorScroll(): void {
  const smooth: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  let stopCurrent: (() => void) | null = null;

  const scrollToSection = (target: Element) => {
    stopCurrent?.();
    const go = () => window.scrollTo({ top: Math.max(0, window.scrollY + target.getBoundingClientRect().top), behavior: smooth });
    let last = window.scrollY;
    let still = 0;
    let tries = 0;
    let started = false;
    let aimedAt = performance.now();
    const timer = window.setInterval(() => {
      const moved = Math.abs(window.scrollY - last) >= 1;
      last = window.scrollY;
      if (moved) started = true;
      still = moved ? 0 : still + 1;
      // wait until the scroll has run and settled; a smooth scroll that never started
      // (busy main thread) gets 1.5s before it is sent again
      const settled = started && still >= 3;
      if (!settled && performance.now() - aimedAt < 1500) return;
      if (Math.abs(target.getBoundingClientRect().top) <= 4 || ++tries > 4) { stop(); return; }
      still = 0;
      started = false;
      aimedAt = performance.now();
      go();
    }, 120);
    const cancel = () => stop();
    const stop = () => {
      window.clearInterval(timer);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      if (stopCurrent === stop) stopCurrent = null;
    };
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.setTimeout(stop, 9000);
    stopCurrent = stop;
    go();
  };

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const link = (e.target as Element | null)?.closest?.('a[href^="#"]');
    const href = link?.getAttribute('href');
    if (!href || href.length < 2) return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    history.pushState(null, '', href);
    scrollToSection(target);
  });
}

/**
 * "How to Join" as iorca-style expanding cards: one step is open at a time and
 * the stage beside the list shows its number, title and progress ring. While the
 * section is in view the steps advance on their own (a bar on the open card shows
 * the time left); clicking a step hands control to the visitor.
 */
const JOIN_STEP_MS = 4200;

/**
 * The How to Join stage, electrified: a spark rides the tip of the progress
 * ring, and gold lightning crackles out of the ring (a small arc now and then,
 * a burst whenever the step changes).
 */
function electrifyStage(stage: HTMLElement): { setProgress(p: number): void; zap(power: number): void } {
  const canvas = stage.querySelector<HTMLCanvasElement>('.join-stage-bolts');
  const ringSvg = stage.querySelector<SVGSVGElement>('.join-ring');
  const spark = stage.querySelector<SVGCircleElement>('.join-ring-spark');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas?.getContext('2d') ?? null;

  // spark: glides along the arc to the new progress, in step with the ring's fill
  let shown = 0;
  let sparkRaf = 0;
  const placeSpark = (p: number) => {
    if (!spark) return;
    const a = p * Math.PI * 2;
    spark.setAttribute('cx', (60 + 52 * Math.cos(a)).toFixed(2));
    spark.setAttribute('cy', (60 + 52 * Math.sin(a)).toFixed(2));
  };
  const setProgress = (p: number) => {
    cancelAnimationFrame(sparkRaf);
    const from = shown;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      shown = from + (p - from) * (1 - Math.pow(1 - t, 3));
      placeSpark(shown);
      if (t < 1) sparkRaf = requestAnimationFrame(step);
    };
    if (reduceMotion) { shown = p; placeSpark(p); } else sparkRaf = requestAnimationFrame(step);
  };

  // lightning: jagged arcs from the ring's edge outwards, fading in ~0.4s
  type Bolt = { pts: [number, number][]; born: number; width: number };
  let bolts: Bolt[] = [];
  let boltRaf = 0;
  const jagged = (x0: number, y0: number, x1: number, y1: number, depth: number, rough: number): [number, number][] => {
    let pts: [number, number][] = [[x0, y0], [x1, y1]];
    let off = Math.hypot(x1 - x0, y1 - y0) * rough;
    for (let d = 0; d < depth; d++) {
      const next: [number, number][] = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        next.push([(ax + bx) / 2 + (Math.random() - 0.5) * off, (ay + by) / 2 + (Math.random() - 0.5) * off], pts[i]);
      }
      pts = next;
      off *= 0.55;
    }
    return pts;
  };
  const draw = () => {
    if (!canvas || !ctx) return;
    const now = performance.now();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bolts = bolts.filter((b) => now - b.born < 420);
    bolts.forEach((b) => {
      const age = (now - b.born) / 420;
      const flicker = age < 0.2 ? 1 : (now / 45) % 2 < 1 ? 0.55 : 1;
      const alpha = Math.pow(1 - age, 1.4) * flicker;
      ctx.beginPath();
      b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = `rgba(212, 175, 55, ${alpha * 0.55})`;
      ctx.lineWidth = b.width * 4;
      ctx.shadowColor = 'rgba(255, 215, 106, 0.9)';
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 248, 220, ${alpha})`;
      ctx.lineWidth = b.width;
      ctx.shadowBlur = 0;
      ctx.stroke();
    });
    if (bolts.length) boltRaf = requestAnimationFrame(draw);
  };
  const zap = (power: number) => {
    if (reduceMotion || !canvas || !ctx || !ringSvg) return;
    const sr = stage.getBoundingClientRect();
    const rr = ringSvg.getBoundingClientRect();
    if (!sr.width || !rr.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(sr.width * dpr)) {
      canvas.width = Math.round(sr.width * dpr);
      canvas.height = Math.round(sr.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = rr.left - sr.left + rr.width / 2;
    const cy = rr.top - sr.top + rr.height / 2;
    const r = (rr.width / 120) * 52;
    const count = power >= 1 ? 4 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const len = r * (power >= 1 ? 0.55 + Math.random() * 0.6 : 0.3 + Math.random() * 0.35);
      const x0 = cx + Math.cos(a) * r, y0 = cy + Math.sin(a) * r;
      const x1 = cx + Math.cos(a + (Math.random() - 0.5) * 0.5) * (r + len);
      const y1 = cy + Math.sin(a + (Math.random() - 0.5) * 0.5) * (r + len);
      const pts = jagged(x0, y0, x1, y1, 5, 0.35);
      bolts.push({ pts, born: performance.now() + i * 40, width: power >= 1 ? 1.6 : 1.1 });
      // a fork off the main arc
      if (Math.random() < 0.6) {
        const [fx, fy] = pts[8 + Math.floor(Math.random() * 12)];
        const fa = a + (Math.random() - 0.5) * 1.6;
        bolts.push({ pts: jagged(fx, fy, fx + Math.cos(fa) * len * 0.5, fy + Math.sin(fa) * len * 0.5, 4, 0.4), born: performance.now() + i * 40, width: 0.8 });
      }
    }
    stage.classList.remove('is-charged');
    void stage.offsetWidth;
    stage.classList.add('is-charged');
    cancelAnimationFrame(boltRaf);
    boltRaf = requestAnimationFrame(draw);
  };

  return { setProgress, zap };
}

export function initJoinSteps(): void {
  const section = document.getElementById('how');
  const steps = [...document.querySelectorAll<HTMLElement>('#how .join-step')];
  if (!section || !steps.length) return;
  const stageNum = section.querySelector<HTMLElement>('.join-stage-num');
  const stageLabel = section.querySelector<HTMLElement>('.join-stage-label');
  const stageTitle = section.querySelector<HTMLElement>('.join-stage-title');
  const ring = section.querySelector<SVGCircleElement>('.join-ring-fill');
  const stage = section.querySelector<HTMLElement>('.join-stage');
  const circumference = 2 * Math.PI * 52;
  if (ring) ring.style.strokeDasharray = `${circumference}`;
  section.style.setProperty('--join-step-ms', `${JOIN_STEP_MS}ms`);

  const pad = (n: number) => String(n).padStart(2, '0');
  let current = -1;
  let timer = 0;
  let visible = false;
  let stopped = false;

  const select = (i: number) => {
    current = (i + steps.length) % steps.length;
    steps.forEach((step, n) => {
      const on = n === current;
      step.classList.toggle('is-active', on);
      step.classList.toggle('is-done', n < current);
      step.querySelector('.join-step-head')?.setAttribute('aria-expanded', String(on));
    });
    if (stageNum) stageNum.textContent = pad(current + 1);
    if (stageLabel) stageLabel.textContent = `STEP ${pad(current + 1)} / ${pad(steps.length)}`;
    if (stageTitle) stageTitle.textContent = steps[current].querySelector('.join-step-title')?.textContent ?? '';
    if (ring) ring.style.strokeDashoffset = `${circumference * (1 - (current + 1) / steps.length)}`;
    if (stage) {
      stage.classList.remove('is-switching');
      void stage.offsetWidth;
      stage.classList.add('is-switching');
    }
    stageFx?.setProgress((current + 1) / steps.length);
    if (visible) stageFx?.zap(1);
  };
  const stageFx = stage ? electrifyStage(stage) : null;

  // small arcs crackle now and then while the section is on screen
  let crackle = 0;
  const scheduleCrackle = () => {
    window.clearTimeout(crackle);
    if (!visible) return;
    crackle = window.setTimeout(() => { stageFx?.zap(0.4); scheduleCrackle(); }, 1800 + Math.random() * 2200);
  };

  const schedule = () => {
    window.clearTimeout(timer);
    section.classList.toggle('join-cycling', visible && !stopped);
    if (stopped || !visible) return;
    timer = window.setTimeout(() => { select(current + 1); restartBar(); schedule(); }, JOIN_STEP_MS);
  };
  // restart the countdown bar on the newly opened card
  const restartBar = () => {
    section.classList.remove('join-cycling');
    void section.offsetWidth;
    if (visible && !stopped) section.classList.add('join-cycling');
  };

  steps.forEach((step, i) => {
    step.querySelector('.join-step-head')?.addEventListener('click', () => {
      stopped = true;
      window.clearTimeout(timer);
      section.classList.remove('join-cycling');
      select(i);
    });
  });

  select(0);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      // let the cards finish dropping in before the first step change
      if (visible) {
        window.setTimeout(() => { restartBar(); schedule(); stageFx?.zap(1); }, 900);
        scheduleCrackle();
      } else {
        window.clearTimeout(timer);
        window.clearTimeout(crackle);
        section.classList.remove('join-cycling');
      }
    }, { threshold: 0.35 }).observe(section.querySelector('.join-flow') ?? section);
  }
}

/**
 * iorca-style "drop and open" cards: when a [data-drop-group] (or a lone
 * [data-drop] card) scrolls into view, its cards fall in from above one after
 * another, settle, and then their .drop-body unfolds (CSS in main.css).
 */
export function initDropCards(): void {
  const cards = [...document.querySelectorAll<HTMLElement>('[data-drop]')];
  if (!cards.length) return;
  const groups = new Map<Element, HTMLElement[]>();
  cards.forEach((card) => {
    const group = card.closest('[data-drop-group]') ?? card;
    const list = groups.get(group) ?? [];
    card.style.setProperty('--drop-i', String(list.length));
    list.push(card);
    groups.set(group, list);
  });
  if (!('IntersectionObserver' in window)) {
    cards.forEach((c) => c.classList.add('is-dropped'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      groups.get(entry.target)?.forEach((c) => c.classList.add('is-dropped'));
      io.unobserve(entry.target);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
  groups.forEach((_, group) => io.observe(group));
}

/**
 * Phones / tablets: the protocol-signal cards flip and turn into place as each
 * scrolls into view, and flip away again once it has scrolled off the top
 * (scrolling back down re-plays them). CSS in main.css ("signal cards flip").
 */
export function initSignalCardFlips(): void {
  const cards = [...document.querySelectorAll<HTMLElement>('#heroMetricsGrid .crypto-exchange-card')];
  if (!cards.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const card = entry.target as HTMLElement;
      if (entry.isIntersecting) {
        card.classList.add('fx-flip-in');
        card.classList.remove('fx-flip-past');
      } else {
        const above = entry.boundingClientRect.top < 0;
        card.classList.remove('fx-flip-in');
        card.classList.toggle('fx-flip-past', above);
      }
    });
  }, { threshold: 0.3 });
  cards.forEach((c) => io.observe(c));
}

/**
 * A gold highlight glides under the nav: it sits on the section in view
 * (the scrollspy's .active link) and follows the pointer while hovering.
 */
export function initNavIndicator(): void {
  const list = document.querySelector<HTMLElement>('.top-header .nav-links');
  if (!list) return;
  const indicator = document.createElement('span');
  indicator.className = 'nav-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  list.prepend(indicator);

  // Only write when something actually changes: classList.add/remove re-set the
  // attribute even when it's a no-op, which would re-trigger the observer below
  // forever (froze the page on the preloader).
  const moveTo = (a: HTMLElement | null) => {
    if (!a || !a.offsetWidth) {
      if (indicator.classList.contains('is-on')) indicator.classList.remove('is-on');
      return;
    }
    // measured against the list (each <li> is positioned, so offsetLeft would be ~0)
    const left = a.getBoundingClientRect().left - list.getBoundingClientRect().left;
    const width = `${a.offsetWidth}px`;
    const transform = `translateX(${left}px)`;
    if (indicator.style.width !== width) indicator.style.width = width;
    if (indicator.style.transform !== transform) indicator.style.transform = transform;
    if (!indicator.classList.contains('is-on')) indicator.classList.add('is-on');
  };
  const active = () => list.querySelector<HTMLElement>('a.active');

  list.querySelectorAll<HTMLElement>('a').forEach((a) => a.addEventListener('pointerenter', () => moveTo(a)));
  list.addEventListener('pointerleave', () => moveTo(active()));
  // watch the links' .active class (scrollspy), never the indicator itself
  new MutationObserver((records) => {
    if (records.some((r) => r.target !== indicator)) moveTo(active());
  }).observe(list, { subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => moveTo(active()));
  // the Dashboard link appears once a wallet connects
  new MutationObserver(() => moveTo(active())).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
