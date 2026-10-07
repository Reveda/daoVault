/**
 * DAOvault AI — "Crack the Vault" quiz (landing page, just above the footer)
 *
 * Five questions. A right answer glows gold, fires a coin burst and locks one of the
 * five bolts on the vault door (the wheel turns a notch). A wrong answer shakes red and
 * the right one lights up in gold. After question 5 the door swings open with the score
 * and the next steps (connect / dashboard, invite link). Options are shuffled each run.
 */
import { gsap } from 'gsap';
import { LITE } from './perf.ts';

type Question = { q: string; options: string[]; answer: number; why: string };

/** gold line icons for the spinning 3D question coin (one per question) */
const ICONS = [
  // DAO: members linked as one organisation
  '<circle cx="12" cy="5" r="2.6"/><circle cx="5" cy="17" r="2.6"/><circle cx="19" cy="17" r="2.6"/><path d="M12 7.6v4.4M12 12l-5 3M12 12l5 3"/><circle cx="12" cy="12" r="1.4"/>',
  // blockchain: linked blocks
  '<rect x="2.5" y="8" width="7" height="7" rx="1.5"/><rect x="14.5" y="8" width="7" height="7" rx="1.5"/><path d="M9.5 11.5h5"/><path d="M6 8V5.5M18 15v2.5"/>',
  // wallet
  '<path d="M4 7.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5A2 2 0 0 1 5 4.5h11"/><path d="M20 11.5h-4a2 2 0 0 0 0 4h4"/><circle cx="16.2" cy="13.5" r=".9"/>',
  // DeFi: coin stack
  '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 10v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4"/><path d="M5 14v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4"/>',
  // community: globe
  '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5S14.6 18.1 12 20.5M12 3.5C9.4 5.9 8.1 8.7 8.1 12s1.3 6.1 3.9 8.5"/>',
];

const QUESTIONS: Question[] = [
  { q: 'What does DAO stand for?', options: ['Digital Asset Organization', 'Decentralized Autonomous Organization', 'Digital Automated Operation'], answer: 1, why: 'A DAO is run by its community through transparent rules, not by a boss.' },
  { q: 'Which technology does DAOVAULT use?', options: ['Blockchain', 'Email', 'Cloud Storage'], answer: 0, why: 'Every activation is recorded on BNB Smart Chain, so anyone can verify it.' },
  { q: 'What is a crypto wallet mainly used for?', options: ['Storing and managing digital assets', 'Watching videos', 'Sending emails'], answer: 0, why: 'Your wallet holds your keys, so you stay in control of your assets.' },
  { q: 'What is DeFi?', options: ['Decentralized Finance', 'Digital File', 'Direct Finance'], answer: 0, why: 'Financial tools that run on smart contracts instead of banks.' },
  { q: 'What is the main idea of DAOVAULT?', options: ['Decentralized and community-driven finance', 'Social media platform', 'Online shopping'], answer: 0, why: 'Your assets. Your community. Your decisions.' },
];

const CHEERS = ['Bolt locked!', 'Vault genius!', 'Smooth as gold!', 'Click. Locked in.', 'Crypto brain!'];
const OOPS = ['Not quite!', 'The vault says no...', 'Close, but no key!', 'Oops, wrong combo!'];
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function shuffled(q: Question): { options: string[]; answer: number } {
  const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
  return { options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

export function initVaultQuiz(): void {
  const root = document.getElementById('vaultQuiz');
  const body = document.getElementById('quizBody');
  const bar = document.getElementById('quizBar');
  const scoreEl = document.getElementById('quizScore');
  const boltsG = root?.querySelector<SVGGElement>('.qv-bolts');
  const wheel = root?.querySelector<SVGGElement>('.qv-wheel');
  if (!root || !body || !boltsG || !wheel) return;
  const section = document.getElementById('quiz');
  const sky = section ? startQuizLightning(section) : { strike: () => {} };
  const vaultEl = root.querySelector<HTMLElement>('.qv-frame');

  // five bolts around the door
  boltsG.innerHTML = QUESTIONS.map((_, i) => {
    const a = ((i / QUESTIONS.length) * 360 - 90) * (Math.PI / 180);
    const x = 100 + Math.cos(a) * 66;
    const y = 100 + Math.sin(a) * 66;
    return `<circle class="qv-bolt" data-i="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" />`;
  }).join('');
  const bolts = [...boltsG.querySelectorAll<SVGCircleElement>('.qv-bolt')];

  let index = 0;
  let streak = 0;
  let score = 0;
  let turn = 0;

  const burst = (from: HTMLElement) => {
    if (reduceMotion()) return;
    const r = from.getBoundingClientRect();
    for (let i = 0; i < 14; i++) {
      const c = document.createElement('span');
      c.className = 'quiz-coin';
      c.style.left = `${r.left + r.width * (0.2 + Math.random() * 0.6)}px`;
      c.style.top = `${r.top + r.height / 2}px`;
      document.body.appendChild(c);
      gsap.fromTo(c, { x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.6 + Math.random() * 0.6 }, {
        x: (Math.random() - 0.5) * 220, y: -60 - Math.random() * 140, rotate: (Math.random() - 0.5) * 540,
        opacity: 0, duration: 0.9 + Math.random() * 0.5, ease: 'power2.out', onComplete: () => c.remove(),
      });
    }
  };

  const lockBolt = () => {
    const bolt = bolts[score - 1];
    bolt?.classList.add('is-locked');
    turn += 72;
    gsap.to(wheel, { rotate: turn, svgOrigin: '100 100', duration: 0.9, ease: 'back.out(1.6)' });
    if (scoreEl) scoreEl.textContent = String(score);
    gsap.fromTo(scoreEl, { scale: 1.6 }, { scale: 1, duration: 0.5, ease: 'back.out(2)' });
  };

  const render = () => {
    const q = QUESTIONS[index];
    const { options, answer } = shuffled(q);
    if (bar) bar.style.width = `${(index / QUESTIONS.length) * 100}%`;
    body.innerHTML = `
      <div class="quiz-meta mono"><span>QUESTION ${index + 1} / ${QUESTIONS.length}</span><span class="quiz-streak" ${streak > 1 ? '' : 'hidden'}>&#128293; x${streak}</span><span class="quiz-react" aria-live="polite"></span></div>
      <div class="quiz-q-row">
        <div class="quiz-icon" aria-hidden="true"><div class="quiz-icon-coin">
          <span class="qi-face qi-back"><img src="/favicon.png" alt="" /></span>
          ${'<i class="qi-rim"></i>'.repeat(8)}
          <span class="qi-face qi-front"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[index]}</svg></span>
        </div></div>
        <h3 class="quiz-q">${q.q}</h3>
      </div>
      <div class="quiz-options">
        ${options.map((o, i) => `<button type="button" class="quiz-opt" data-i="${i}"><span class="quiz-letter mono"><span class="ql-coin"><b class="ql-face ql-front">${'ABC'[i]}</b><b class="ql-face ql-back"></b></span></span><span>${o}</span></button>`).join('')}
      </div>
      <p class="quiz-why" hidden></p>`;
    const react = body.querySelector<HTMLElement>('.quiz-react')!;
    const why = body.querySelector<HTMLElement>('.quiz-why')!;
    const buttons = [...body.querySelectorAll<HTMLButtonElement>('.quiz-opt')];
    if (!reduceMotion()) gsap.from(buttons, { y: 26, opacity: 0, rotateX: -60, duration: 0.5, stagger: 0.08, ease: 'back.out(1.7)', clearProps: 'transform,opacity' });

    buttons.forEach((btn) => btn.addEventListener('click', () => {
      const chosen = Number(btn.dataset.i);
      buttons.forEach((b) => { b.disabled = true; });
      const right = chosen === answer;
      if (right) {
        btn.classList.add('is-right');
        btn.querySelector('.ql-back')!.textContent = '✓';
        score++;
        streak++;
        const sEl = body.querySelector<HTMLElement>('.quiz-streak');
        if (sEl && streak > 1) { sEl.hidden = false; sEl.innerHTML = `&#128293; x${streak}`; gsap.fromTo(sEl, { scale: 1.8 }, { scale: 1, duration: 0.5, ease: 'back.out(2.2)' }); }
        react.textContent = pick(CHEERS);
        react.className = 'quiz-react is-right';
        burst(btn);
        lockBolt();
        sky.strike(vaultEl, 'gold');
      } else {
        btn.classList.add('is-wrong');
        btn.querySelector('.ql-back')!.textContent = '✕';
        buttons[answer].querySelector('.ql-back')!.textContent = '✓';
        streak = 0;
        body.querySelector<HTMLElement>('.quiz-streak')?.setAttribute('hidden', '');
        buttons[answer].classList.add('is-right', 'is-reveal');
        react.textContent = pick(OOPS);
        react.className = 'quiz-react is-wrong';
        sky.strike(btn, 'red');
        if (!reduceMotion()) gsap.fromTo(root.querySelector('.quiz-vault'), { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
      }
      why.hidden = false;
      why.textContent = q.why;
      window.setTimeout(() => {
        index++;
        if (index < QUESTIONS.length) render();
        else finish();
      }, right ? 1500 : 2300);
    }));
  };

  const finish = () => {
    if (bar) bar.style.width = '100%';
    root.classList.add('is-open');
    try { localStorage.setItem('daovault_quiz_done', String(score)); } catch { /* ignore */ }
    const verdict = score === 5 ? 'Perfect crack! You are a true DAOVAULT insider.'
      : score >= 3 ? 'Vault opened! You know your DeFi.'
        : 'The vault took pity on you. Now you know the basics!';
    body.innerHTML = `
      <div class="quiz-done">
        <div class="quiz-medal mono">${score} / ${QUESTIONS.length}</div>
        <h3 class="quiz-q">Vault unlocked</h3>
        <p class="quiz-verdict">${verdict}</p>
        <div class="quiz-cta">
          <button type="button" class="btn btn-grad quiz-open"><span>Open my dashboard &rarr;</span></button>
          <a class="btn btn-line" href="#how"><span>How to get my invite link</span></a>
        </div>
        <button type="button" class="quiz-again mono">Play again</button>
      </div>`;
    // same as the page's other Connect buttons: wallet picker, or straight to the dashboard when connected
    body.querySelector<HTMLElement>('.quiz-open')?.addEventListener('click', () => {
      document.querySelector<HTMLElement>('[data-connect-trigger]')?.click();
    });
    body.querySelector('.quiz-again')?.addEventListener('click', () => {
      index = 0; score = 0; turn = 0; streak = 0;
      root.classList.remove('is-open');
      bolts.forEach((b) => b.classList.remove('is-locked'));
      gsap.to(wheel, { rotate: 0, svgOrigin: '100 100', duration: 0.6 });
      if (scoreEl) scoreEl.textContent = '0';
      render();
    });
    if (!reduceMotion()) {
      gsap.from(body.querySelector('.quiz-done'), { scale: 0.85, opacity: 0, duration: 0.6, ease: 'back.out(1.6)' });
      for (let i = 0; i < 3; i++) window.setTimeout(() => burst(root.querySelector('.qv-frame') as HTMLElement), i * 260);
    }
  };


  // the question card leans toward the pointer (mouse / pen only)
  const card = root.querySelector<HTMLElement>('.quiz-card');
  if (card && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion()) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--qx', `${((e.clientY - r.top) / r.height - 0.5) * -7}deg`);
      card.style.setProperty('--qy', `${((e.clientX - r.left) / r.width - 0.5) * 9}deg`);
    });
    card.addEventListener('pointerleave', () => { card.style.setProperty('--qx', '0deg'); card.style.setProperty('--qy', '0deg'); });
  }

  render();
}

// ── Lightning behind the quiz ────────────────────────────────────────────

type Bolt = { pts: Array<[number, number]>; branches: Array<Array<[number, number]>>; color: string; born: number; life: number; width: number };

function boltPath(x0: number, y0: number, x1: number, y1: number, spread: number, depth = 6): Array<[number, number]> {
  let pts: Array<[number, number]> = [[x0, y0], [x1, y1]];
  let off = spread;
  for (let d = 0; d < depth; d++) {
    const next: Array<[number, number]> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const nx = -(by - ay);
      const ny = bx - ax;
      const len = Math.hypot(nx, ny) || 1;
      const k = (Math.random() - 0.5) * off;
      next.push([ax, ay], [(ax + bx) / 2 + (nx / len) * k, (ay + by) / 2 + (ny / len) * k]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
    off *= 0.55;
  }
  return pts;
}

/** Canvas lightning for the quiz background. Returns strike(target, colour) for answers. */
function startQuizLightning(section: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'quiz-bolts';
  canvas.setAttribute('aria-hidden', 'true');
  const flash = document.createElement('div');
  flash.className = 'quiz-flash';
  section.prepend(canvas, flash);
  const ctx = canvas.getContext('2d');
  const noop = { strike: (_t?: HTMLElement | null, _c?: 'gold' | 'red') => {} };
  if (!ctx || reduceMotion()) return noop;

  const bolts: Bolt[] = [];
  let w = 0, h = 0, dpr = 1, raf = 0, visible = false, nextAmbient = 0;
  const resize = () => {
    dpr = LITE ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    w = section.clientWidth; h = section.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  };
  new ResizeObserver(resize).observe(section);
  resize();

  const COLORS = { gold: '255, 214, 110', red: '255, 70, 70', white: '255, 246, 214' };
  const add = (x0: number, y0: number, x1: number, y1: number, color: string, width: number, life: number) => {
    const pts = boltPath(x0, y0, x1, y1, Math.hypot(x1 - x0, y1 - y0) * 0.35);
    const branches = Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => {
      const [bx, by] = pts[Math.floor(pts.length * (0.25 + Math.random() * 0.5))];
      const a = Math.atan2(y1 - y0, x1 - x0) + (Math.random() - 0.5) * 1.6;
      const l = 40 + Math.random() * 110;
      return boltPath(bx, by, bx + Math.cos(a) * l, by + Math.sin(a) * l, l * 0.4, 4);
    });
    bolts.push({ pts, branches, color, born: performance.now(), life, width });
  };

  const ambient = () => {
    const x = w * (0.08 + Math.random() * 0.84);
    add(x, -10, x + (Math.random() - 0.5) * w * 0.35, h * (0.35 + Math.random() * 0.45), Math.random() < 0.7 ? COLORS.gold : COLORS.white, 1.6, 520);
  };

  const draw = (now: number) => {
    raf = 0;
    if (!visible) return;
    if (now > nextAmbient) { ambient(); nextAmbient = now + (LITE ? 2600 : 1400) + Math.random() * 2600; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const t = (now - b.born) / b.life;
      if (t >= 1) { bolts.splice(i, 1); continue; }
      // quick double flicker, then fade
      const a = (t < 0.12 ? 1 : t < 0.2 ? 0.35 : t < 0.3 ? 0.95 : 1 - (t - 0.3) / 0.7) * 0.95;
      const stroke = (pts: Array<[number, number]>, width: number) => {
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.lineWidth = width * 4; ctx.strokeStyle = `rgba(${b.color}, ${a * 0.18})`; ctx.stroke();
        ctx.lineWidth = width; ctx.strokeStyle = `rgba(${b.color}, ${a})`; ctx.stroke();
        ctx.lineWidth = width * 0.4; ctx.strokeStyle = `rgba(255, 255, 255, ${a})`; ctx.stroke();
      };
      stroke(b.pts, b.width);
      b.branches.forEach((br) => stroke(br, b.width * 0.55));
    }
    raf = requestAnimationFrame(draw);
  };

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(draw);
  }).observe(section);

  return {
    /** a big strike from the top of the section onto `target` (the vault) */
    strike(target?: HTMLElement | null, colour: 'gold' | 'red' = 'gold') {
      if (!visible) return;
      const s = section.getBoundingClientRect();
      const r = (target ?? section).getBoundingClientRect();
      const tx = r.left - s.left + r.width / 2;
      const ty = r.top - s.top + r.height * 0.45;
      const color = colour === 'red' ? COLORS.red : COLORS.gold;
      add(tx + (Math.random() - 0.5) * w * 0.3, -10, tx, ty, color, colour === 'red' ? 2.2 : 3.2, colour === 'red' ? 600 : 800);
      if (colour === 'gold') add(tx + (Math.random() - 0.5) * w * 0.5, -10, tx, ty, COLORS.white, 1.6, 650);
      flash.className = `quiz-flash is-${colour}`;
      void flash.offsetWidth;
      flash.classList.add('is-on');
    },
  };
}
