/**
 * DAOvault AI — Comprehensive Scroll Intersection Animation Engine
 * GSAP ScrollTrigger + IntersectionObserver integration.
 *
 * Triggers distinct, cinematic animations on EVERY section as user scrolls:
 * - #hero:    Immediate grand entrance (title, kicker, 3D Vault Core, and floating exchange cards)
 * - #ranks:   Section laser beam draws, trophy card golden boom shockwave, rank tabs cascade in, 50:50 meter bars animate
 * - #matrix:  Laser beam draws, pipeline flow bead travels, all 5 matrix cards stagger in with 3D tilt-up, simulator reveals
 * - #compare: Laser beam draws, comparison table rows slide in sequentially
 * - #how:     step cards drop in and expand one at a time (landingFx.ts initJoinSteps)
 * - #join:    Laser beam draws, CTA title scales in, buttons bounce in with back.out(2)
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { setActiveTier } from './matrixAutoDeck.ts';

gsap.registerPlugin(ScrollTrigger);

// What these timelines animate. Cleanup clears only these, never 'all': clearing
// 'all' wipes the inline styles written in the HTML too (that shrank the final
// CTA heading and let its text run full width once its animation finished).
const ANIMATED_PROPS = 'transform,translate,rotate,scale,opacity,filter';

export function initScrollAnimations(): void {
  if (typeof window === 'undefined') return;

  // ─────────────────────────────────────────────────────────────────────────
  // 1. GLOBAL: Section Header Laser Beams & Title Reveals (Every .section-head)
  // ─────────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.section-head').forEach((head) => {
    ScrollTrigger.create({
      trigger: head,
      start: 'top 85%',
      onEnter: () => {
        head.classList.add('revealed');
      },
    });

    const beamLine = head.querySelector('.beam-line');
    const beamDot = head.querySelector('.beam-dot');
    const titleSpan = head.querySelectorAll('.wm-line > span');
    const tag = head.querySelector('.section-tag');
    const sub = head.querySelector('.section-sub');

    const headTl = gsap.timeline({
      scrollTrigger: {
        trigger: head,
        start: 'top 85%',
        once: true,
      },
      defaults: { ease: 'power3.out' },
    });

    if (tag) {
      headTl.fromTo(tag, { y: 25, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 });
    }

    if (beamLine) {
      headTl.fromTo(
        beamLine,
        { strokeDashoffset: 470 },
        { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' },
        '-=0.3'
      );
    }

    if (beamDot) {
      headTl.fromTo(beamDot, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4 }, '-=0.3');
    }

    if (titleSpan.length) {
      headTl.fromTo(
        titleSpan,
        { y: '110%', opacity: 0 },
        { y: '0%', opacity: 1, duration: 0.7, stagger: 0.08, clearProps: ANIMATED_PROPS },
        '-=0.5'
      );
    }

    if (sub) {
      headTl.fromTo(sub, { y: 25, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, '-=0.4');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. #HERO – Immediate Entrance (Never blocked by scroll triggers)
  // ─────────────────────────────────────────────────────────────────────────
  const heroLeft = document.querySelector('.hero-left') as HTMLElement;
  const heroRight = document.querySelector('.hero-right') as HTMLElement;

  if (heroLeft && heroRight) {
    heroLeft.classList.add('revealed');
    heroRight.classList.add('revealed');

    const heroTl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        // Spread into plain elements: an empty NodeList inside the array (the exchange
        // cards move to #heroMetrics on load) is treated by GSAP as a target with no
        // `style` and throws inside its ticker, breaking other running tweens.
        gsap.set(
          [
            heroLeft,
            heroRight,
            ...heroLeft.querySelectorAll<HTMLElement>('.wm-line span, .kicker, .hero-lead, .hero-actions, .countdown-box'),
            ...heroRight.querySelectorAll<HTMLElement>('.crypto-exchange-card'),
          ],
          { clearProps: ANIMATED_PROPS }
        );
      },
    });

    heroTl.fromTo(
      heroLeft.querySelectorAll('.kicker, .section-path-beam'),
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.65, stagger: 0.1 }
    );

    heroTl.fromTo(
      heroLeft.querySelectorAll('.wm-line span'),
      { y: 50, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, stagger: 0.08 },
      '-=0.35'
    );

    heroTl.fromTo(
      heroLeft.querySelectorAll('.hero-lead, .hero-actions, .countdown-box'),
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.1 },
      '-=0.4'
    );

    heroTl.fromTo(
      heroRight,
      { x: 50, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.85, ease: 'power3.out' },
      '-=0.7'
    );
    // (the signal cards moved out of the hero into #heroMetrics; they animate there)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. #RANKS – 11-Tier Rank Rewards Section
  // ─────────────────────────────────────────────────────────────────────────
  const ranksSection = document.querySelector('#ranks');
  if (ranksSection) {
    // A. Rank tab buttons cascade in
    const tabBtns = ranksSection.querySelectorAll('.rank-tab-btn');
    if (tabBtns.length) {
      gsap.fromTo(
        tabBtns,
        { x: -35, opacity: 0 },
        {
          scrollTrigger: { trigger: '#rankTabs', start: 'top 88%', once: true },
          x: 0,
          opacity: 1,
          duration: 0.45,
          stagger: 0.05,
          ease: 'power2.out',
          clearProps: ANIMATED_PROPS,
        }
      );
    }

    // B. Rank Display Card & 50:50 Meter animation
    const rankDisplayCard = ranksSection.querySelector('.border-beam-card');
    if (rankDisplayCard) {
      gsap.fromTo(
        rankDisplayCard,
        { y: 50, opacity: 0, scale: 0.96 },
        {
          scrollTrigger: { trigger: rankDisplayCard, start: 'top 85%', once: true },
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.75,
          ease: 'power3.out',
          clearProps: ANIMATED_PROPS,
          onComplete: () => {
            // Animate 50:50 leg meter bars filling up
            const legPower = ranksSection.querySelector('.leg-power') as HTMLElement;
            const legOther = ranksSection.querySelector('.leg-other') as HTMLElement;
            if (legPower && legOther) {
              gsap.fromTo(legPower, { width: '0%' }, { width: '50%', duration: 1.2, ease: 'power2.out' });
              gsap.fromTo(legOther, { width: '0%' }, { width: '50%', duration: 1.2, ease: 'power2.out' });
            }
          },
        }
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. #MATRIX – 20-Level Matrix Plan Section
  // ─────────────────────────────────────────────────────────────────────────
  const matrixSection = document.querySelector('#matrix');
  if (matrixSection) {
    // A. Pipeline Flow Bead streaks across
    const pipelineBead = matrixSection.querySelector('.pipeline-flow-bead') as HTMLElement;
    if (pipelineBead) {
      gsap.fromTo(
        pipelineBead,
        { left: '0%', opacity: 0 },
        {
          scrollTrigger: { trigger: '.matrix-pipeline-flow', start: 'top 88%', once: true },
          left: '100%',
          opacity: 1,
          duration: 2.5,
          ease: 'power1.inOut',
          repeat: -1,
        }
      );
    }

    // B. Matrix 3D Stacking Deck (All 5 cards stacked initially, top cards peel away sequentially on scroll)
    const deck = document.getElementById('levelMatrixGrid');
    const stackCards = gsap.utils.toArray<HTMLElement>('.matrix-stack-card');

    if (deck && stackCards.length > 1) {
      const isMobile = window.innerWidth <= 600;
      const stepY = isMobile ? -16 : -22;
      const stepScale = isMobile ? 0.024 : 0.032;
      const transitionCount = stackCards.length - 1;
      const spreadDistance = isMobile ? 108 : 112;

      // Transforms do not contribute to normal document flow. Reserve the
      // space occupied by the cards after they spread, otherwise the simulator
      // below the deck overlaps the cards (the issue visible in the screenshot).
      const cardHeight = stackCards[0]?.offsetHeight ?? 0;
      if (cardHeight > 0) {
        const requiredSpace = Math.ceil(
          cardHeight * transitionCount * (spreadDistance / 100) + 48,
        );
        deck.style.paddingBottom = `${requiredSpace}px`;
      }

      // 1. Initial State: All cards visible in an authentic 3D physical deck.
      // Like a real deck, the cards underneath show only their edges: their
      // content stays hidden until each card slides out (no text bleeding
      // through or peeking above the front card).
      const cardBodies = stackCards.map((card) => card.querySelector<HTMLElement>('.cypheir-card-body'));
      stackCards.forEach((card, i) => {
        gsap.set(card, {
          y: i * stepY,
          scale: 1 - i * stepScale,
          zIndex: 10 - i,
          opacity: 1,
          transformOrigin: 'center top',
        });
        const body = cardBodies[i];
        if (i > 0 && body) gsap.set(body, { opacity: 0 });
      });

      // 2. Natural document-scroll timeline. The page keeps moving while the
      // cards spread, instead of pinning the deck to the viewport.
      const deckTl = gsap.timeline({
        scrollTrigger: {
          id: 'matrixDeckST',
          trigger: deck,
          start: isMobile ? 'top 72%' : 'top 70%',
          end: isMobile ? '+=800' : '+=1000',
          // Direct scroll-linked motion: every scroll movement moves the cards
          // immediately while the document continues to scroll normally.
          scrub: 0.2,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            // There are N cards but only N-1 peel transitions. Round to the
            // nearest card state so indicators stay aligned with the deck.
            const activeIdx = Math.min(
              Math.round(self.progress * transitionCount),
              stackCards.length - 1,
            );
            setActiveTier(activeIdx, false);
          },
        },
      });

      // 3. Sequential reveal on scroll down:
      // Keep the first card as the anchor and spread the remaining cards
      // downward one-by-one. This preserves the initial deck but prevents
      // every card from replacing the same front position.
      for (let i = 1; i < stackCards.length; i++) {
        const card = stackCards[i];
        const stepPosition = i - 1;

        deckTl.to(
          card,
          {
            y: 0,
            yPercent: i * spreadDistance,
            scale: 1,
            zIndex: 10 - i,
            opacity: 1,
            ease: 'power2.inOut',
            duration: 1,
          },
          stepPosition,
        );
        const body = cardBodies[i];
        if (body) deckTl.to(body, { opacity: 1, ease: 'power1.in', duration: 0.55 }, stepPosition + 0.45);
      }
    }

    // C. 20-Level Simulator Box reveals
    const calcBox = matrixSection.querySelector('.matrix-calc-box');
    if (calcBox) {
      const calcHeader = calcBox.querySelector('.calc-header');
      const calcPills = calcBox.querySelector('.level-pills-row');
      const calcStats = calcBox.querySelectorAll('.calc-stat');
      const calcReveal = gsap.timeline({ paused: true });

      // Reveal from above when the simulator enters the viewport, then play
      // the same sequence backwards when it leaves so the section feels alive
      // in both scroll directions.
      calcReveal
        .fromTo(calcBox, { y: -70, opacity: 0, scale: 0.96 }, {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.72,
          ease: 'power3.out',
        })
        .fromTo(calcHeader, { y: -22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: 'power2.out' }, '-=0.42')
        .fromTo(calcPills, { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, ease: 'power2.out' }, '-=0.22')
        .fromTo(calcStats, { y: -20, opacity: 0, scale: 0.94 }, {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.46,
          stagger: 0.1,
          ease: 'back.out(1.2)',
        }, '-=0.16');

      ScrollTrigger.create({
        trigger: calcBox,
        start: 'top 84%',
        end: 'bottom 12%',
        onEnter: () => calcReveal.restart(),
        onLeave: () => calcReveal.reverse(),
        onEnterBack: () => calcReveal.restart(),
        onLeaveBack: () => calcReveal.reverse(),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. #COMPARE – Architectural Pillars & Comparison Matrix Section
  // ─────────────────────────────────────────────────────────────────────────
  const compareSection = document.querySelector('#compare');
  if (compareSection) {
    // Comparison Matrix Table rows slide in (the #about flip cards deal in through
    // their [data-reveal] CSS, see "TPR motion layer" in main.css)
    const tableWrap = compareSection.querySelector('.compare-matrix-wrap');
    if (tableWrap) {
      gsap.fromTo(
        tableWrap,
        { y: 50, opacity: 0 },
        {
          scrollTrigger: { trigger: tableWrap, start: 'top 85%', once: true },
          y: 0,
          opacity: 1,
          duration: 0.75,
          ease: 'power3.out',
          clearProps: ANIMATED_PROPS,
        }
      );

      const tableRows = tableWrap.querySelectorAll('tbody tr');
      if (tableRows.length) {
        // phones show the rows as a list of cards: they rise in rather than slide sideways
        const rowsAsCards = window.matchMedia('(max-width: 600px)').matches;
        gsap.fromTo(
          tableRows,
          rowsAsCards ? { y: 26, opacity: 0 } : { x: -30, opacity: 0 },
          {
            scrollTrigger: { trigger: tableWrap, start: 'top 80%', once: true },
            x: 0,
            y: 0,
            opacity: 1,
            duration: 0.5,
            stagger: 0.08,
            ease: 'power2.out',
            clearProps: ANIMATED_PROPS,
          }
        );
      }
    }
  }

  // 6. #HOW – expanding step cards: landingFx.ts initJoinSteps (iorca-style)

  // ─────────────────────────────────────────────────────────────────────────
  // 7. #JOIN – Final CTA Section
  // ─────────────────────────────────────────────────────────────────────────
  const joinSection = document.querySelector('#join');
  if (joinSection) {
    const ctaInner = joinSection.querySelector('.cta-inner');
    if (ctaInner) {
      const ctaTl = gsap.timeline({
        scrollTrigger: { trigger: joinSection, start: 'top 80%', once: true },
        defaults: { ease: 'power3.out' },
        onComplete: () => {
          gsap.set(ctaInner.querySelectorAll('*'), { clearProps: ANIMATED_PROPS });
        },
      });

      ctaTl.fromTo(
        joinSection.querySelectorAll('.section-path-beam, .section-tag'),
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.1 }
      );

      ctaTl.fromTo(
        joinSection.querySelectorAll('h2, .section-sub'),
        { scale: 0.92, opacity: 0, y: 30 },
        { scale: 1, opacity: 1, y: 0, duration: 0.7, stagger: 0.1 },
        '-=0.3'
      );

      ctaTl.fromTo(
        joinSection.querySelectorAll('.btn'),
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, stagger: 0.12, ease: 'back.out(1.8)' },
        '-=0.3'
      );
    }
  }

  // Refresh ScrollTrigger calculations after all styles settle
  setTimeout(() => {
    ScrollTrigger.refresh();
  }, 350);

}
