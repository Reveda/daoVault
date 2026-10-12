/**
 * DAOvault AI — 11-Tier 3D Holographic Metallic Rank Crests Engine
 * Bespoke 3D vector emblems for every leadership rank milestone.
 * Features realistic metallic reflections, multi-plane depth, and tier-specific jewel highlights.
 */

export interface RankCrestMeta {
  id: number;
  name: string;
  metal: string;
  themeColor: string;
  glowColor: string;
}

export const RANK_CREST_METAS: RankCrestMeta[] = [
  { id: 1, name: 'Starter', metal: 'Bronze / Gold', themeColor: '#cd7f32', glowColor: 'rgba(205, 127, 50, 0.6)' },
  { id: 2, name: 'Builder', metal: 'Copper Core', themeColor: '#d97706', glowColor: 'rgba(217, 119, 6, 0.6)' },
  { id: 3, name: 'Leader', metal: 'Silver Laurel', themeColor: '#94a3b8', glowColor: 'rgba(148, 163, 184, 0.6)' },
  { id: 4, name: 'Elite Leader', metal: 'Cobalt Star', themeColor: '#38bdf8', glowColor: 'rgba(56, 189, 248, 0.6)' },
  { id: 5, name: 'Executive', metal: 'Amethyst Violet', themeColor: '#c084fc', glowColor: 'rgba(192, 132, 252, 0.6)' },
  { id: 6, name: 'Crown Executive', metal: 'Emerald Coronet', themeColor: '#34d399', glowColor: 'rgba(52, 211, 153, 0.6)' },
  { id: 7, name: 'Crown Director', metal: 'Ruby Imperial', themeColor: '#f43f5e', glowColor: 'rgba(244, 63, 94, 0.6)' },
  { id: 8, name: 'Ambassador', metal: 'Celestial Sapphire', themeColor: '#60a5fa', glowColor: 'rgba(96, 165, 250, 0.6)' },
  { id: 9, name: 'Crown Ambassador', metal: 'Diamond Diadem', themeColor: '#e2e8f0', glowColor: 'rgba(226, 232, 240, 0.7)' },
  { id: 10, name: 'President', metal: 'Solar Gold', themeColor: '#fbbf24', glowColor: 'rgba(251, 191, 36, 0.75)' },
  { id: 11, name: 'Crown President', metal: 'Apex Cosmic Crown', themeColor: '#ffd700', glowColor: 'rgba(255, 215, 0, 0.9)' },
];

/**
 * Returns a self-contained 3D metallic crest SVG for tier index (0 to 10)
 */
export function getRankCrestSvg(index: number): string {
  const i = Math.max(0, Math.min(10, index));
  const uid = `crest_${i}`;

  switch (i) {
    case 0: // 1. Starter: Bronze Aegis Shield with Central Star
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="Starter Rank Crest">
          <defs>
            <radialGradient id="${uid}_gold" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stop-color="#fff0b3"/>
              <stop offset="40%" stop-color="#cd7f32"/>
              <stop offset="100%" stop-color="#5c3814"/>
            </radialGradient>
            <linearGradient id="${uid}_plate" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#e6a15c"/>
              <stop offset="50%" stop-color="#a0521e"/>
              <stop offset="100%" stop-color="#4a2408"/>
            </linearGradient>
          </defs>
          <path d="M50 10 L82 24 L74 65 L50 90 L26 65 L18 24 Z" fill="url(#${uid}_plate)" stroke="#ffe0a3" stroke-width="2"/>
          <path d="M50 18 L74 29 L68 60 L50 80 L32 60 L26 29 Z" fill="#18130c" stroke="#cd7f32" stroke-width="1.5"/>
          <polygon points="50,30 54,42 66,42 56,50 60,62 50,54 40,62 44,50 34,42 46,42" fill="url(#${uid}_gold)"/>
          <circle cx="50" cy="46" r="3" fill="#fff"/>
        </svg>
      `;

    case 1: // 2. Builder: Copper-Gold Hex Core
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="Builder Rank Crest">
          <defs>
            <linearGradient id="${uid}_grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffd599"/>
              <stop offset="50%" stop-color="#d97706"/>
              <stop offset="100%" stop-color="#78350f"/>
            </linearGradient>
          </defs>
          <polygon points="50,8 86,28 86,72 50,92 14,72 14,28" fill="#13100b" stroke="url(#${uid}_grad)" stroke-width="3"/>
          <polygon points="50,18 78,34 78,66 50,82 22,66 22,34" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 2"/>
          <polygon points="50,28 69,39 69,61 50,72 31,61 31,39" fill="url(#${uid}_grad)"/>
          <rect x="44" y="44" width="12" height="12" fill="#fff" transform="rotate(45 50 50)"/>
        </svg>
      `;

    case 2: // 3. Leader: Silver Star & Laurel
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="Leader Rank Crest">
          <defs>
            <linearGradient id="${uid}_silver" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="45%" stop-color="#cbd5e1"/>
              <stop offset="70%" stop-color="#64748b"/>
              <stop offset="100%" stop-color="#334155"/>
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="40" fill="#0f172a" stroke="url(#${uid}_silver)" stroke-width="2.5"/>
          <path d="M26 40 C28 65 42 75 50 80 C58 75 72 65 74 40" fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>
          <polygon points="50,22 56,38 72,38 59,48 64,64 50,54 36,64 41,48 28,38 44,38" fill="url(#${uid}_silver)"/>
          <circle cx="50" cy="46" r="4" fill="#38bdf8"/>
        </svg>
      `;

    case 3: // 4. Elite Leader: Cobalt Starburst
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="Elite Leader Rank Crest">
          <defs>
            <radialGradient id="${uid}_cobalt" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stop-color="#bae6fd"/>
              <stop offset="40%" stop-color="#0284c7"/>
              <stop offset="100%" stop-color="#082f49"/>
            </radialGradient>
          </defs>
          <g transform="translate(50,50)">
            <rect x="-35" y="-35" width="70" height="70" fill="none" stroke="#38bdf8" stroke-width="2" transform="rotate(45)"/>
            <rect x="-32" y="-32" width="64" height="64" fill="#031525" stroke="#0ea5e9" stroke-width="1.5"/>
            <path d="M0 -30 L8 -8 L30 0 L8 8 L0 30 L-8 8 L-30 0 L-8 -8 Z" fill="url(#${uid}_cobalt)"/>
            <circle cx="0" cy="0" r="6" fill="#fff" filter="drop-shadow(0 0 4px #38bdf8)"/>
          </g>
        </svg>
      `;

    case 4: // 5. Executive: Amethyst Gem & Imperial Wings
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="Executive Rank Crest">
          <defs>
            <linearGradient id="${uid}_purp" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#f5d0fe"/>
              <stop offset="45%" stop-color="#a855f7"/>
              <stop offset="100%" stop-color="#581c87"/>
            </linearGradient>
          </defs>
          <path d="M12 40 C30 35 42 48 50 62 C58 48 70 35 88 40 C80 65 65 78 50 88 C35 78 20 65 12 40 Z" fill="#1a0c2e" stroke="#c084fc" stroke-width="2"/>
          <polygon points="50,18 72,36 62,68 38,68 28,36" fill="url(#${uid}_purp)" stroke="#fdf4ff" stroke-width="1.5"/>
          <polygon points="50,26 64,38 58,60 42,60 36,38" fill="#581c87"/>
          <circle cx="50" cy="46" r="4.5" fill="#fdf4ff"/>
        </svg>
      `;

    case 5: // 6. Crown Executive: Emerald Coronet
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="Crown Executive Rank Crest">
          <defs>
            <linearGradient id="${uid}_em" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#a7f3d0"/>
              <stop offset="50%" stop-color="#059669"/>
              <stop offset="100%" stop-color="#022c22"/>
            </linearGradient>
            <linearGradient id="${uid}_gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#fef08a"/>
              <stop offset="100%" stop-color="#ca8a04"/>
            </linearGradient>
          </defs>
          <path d="M18 68 L24 34 L38 50 L50 24 L62 50 L76 34 L82 68 Z" fill="url(#${uid}_gold)" stroke="#fff" stroke-width="1.5"/>
          <path d="M22 64 L78 64 L72 78 L28 78 Z" fill="#03251a" stroke="url(#${uid}_gold)" stroke-width="1.5"/>
          <polygon points="50,42 62,56 50,70 38,56" fill="url(#${uid}_em)" stroke="#6ee7b7" stroke-width="1"/>
          <circle cx="50" cy="56" r="3" fill="#fff"/>
          <circle cx="50" cy="22" r="3" fill="#6ee7b7"/>
          <circle cx="24" cy="32" r="2.5" fill="#6ee7b7"/>
          <circle cx="76" cy="32" r="2.5" fill="#6ee7b7"/>
        </svg>
      `;

    case 6: // 7. Crown Director: Ruby Imperial Shield
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="Crown Director Rank Crest">
          <defs>
            <radialGradient id="${uid}_ruby" cx="35%" cy="35%" r="70%">
              <stop offset="0%" stop-color="#fecdd3"/>
              <stop offset="45%" stop-color="#e11d48"/>
              <stop offset="100%" stop-color="#4c0519"/>
            </radialGradient>
          </defs>
          <path d="M50 8 L84 25 L84 55 C84 75 68 88 50 94 C32 88 16 75 16 55 L16 25 Z" fill="#1c050d" stroke="#f43f5e" stroke-width="2.5"/>
          <path d="M30 45 L50 25 L70 45 L50 65 Z" fill="url(#${uid}_ruby)" stroke="#fff" stroke-width="1.5"/>
          <path d="M28 68 L50 54 L72 68 L50 82 Z" fill="#881337"/>
          <circle cx="50" cy="45" r="4.5" fill="#fff" filter="drop-shadow(0 0 6px #f43f5e)"/>
        </svg>
      `;

    case 7: // 8. Ambassador: Celestial Sapphire Wings
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="Ambassador Rank Crest">
          <defs>
            <radialGradient id="${uid}_sapph" cx="40%" cy="30%" r="75%">
              <stop offset="0%" stop-color="#bfdbfe"/>
              <stop offset="50%" stop-color="#2563eb"/>
              <stop offset="100%" stop-color="#172554"/>
            </radialGradient>
          </defs>
          <!-- Wings -->
          <path d="M10 35 Q30 20 48 45 Q32 55 10 35 Z" fill="#1e3a8a" stroke="#60a5fa" stroke-width="1.5"/>
          <path d="M90 35 Q70 20 52 45 Q68 55 90 35 Z" fill="#1e3a8a" stroke="#60a5fa" stroke-width="1.5"/>
          <path d="M16 48 Q35 38 48 56 Q35 65 16 48 Z" fill="#172554" stroke="#93c5fd" stroke-width="1"/>
          <path d="M84 48 Q65 38 52 56 Q65 65 84 48 Z" fill="#172554" stroke="#93c5fd" stroke-width="1"/>
          <!-- Central Orb -->
          <circle cx="50" cy="52" r="20" fill="url(#${uid}_sapph)" stroke="#dbeafe" stroke-width="2"/>
          <ellipse cx="50" cy="52" rx="20" ry="6" fill="none" stroke="#93c5fd" stroke-width="1" stroke-dasharray="3 2"/>
          <circle cx="45" cy="46" r="4" fill="#fff"/>
        </svg>
      `;

    case 8: // 9. Crown Ambassador: Diamond Sovereignty Diadem
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="Crown Ambassador Rank Crest">
          <defs>
            <linearGradient id="${uid}_dia" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="45%" stop-color="#e2e8f0"/>
              <stop offset="80%" stop-color="#94a3b8"/>
              <stop offset="100%" stop-color="#334155"/>
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="42" fill="#090d16" stroke="url(#${uid}_dia)" stroke-width="2"/>
          <path d="M22 66 L30 30 L45 46 L50 20 L55 46 L70 30 L78 66 Z" fill="url(#${uid}_dia)" stroke="#fff" stroke-width="1.5"/>
          <!-- Diamond Inset -->
          <polygon points="50,42 62,54 50,68 38,54" fill="#f8fafc" stroke="#38bdf8" stroke-width="1.5"/>
          <polygon points="50,48 56,54 50,62 44,54" fill="#38bdf8"/>
          <circle cx="50" cy="18" r="3.5" fill="#fff" filter="drop-shadow(0 0 6px #fff)"/>
        </svg>
      `;

    case 9: // 10. President: Solar Gold Starburst
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg" aria-label="President Rank Crest">
          <defs>
            <linearGradient id="${uid}_sol" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#fffbeb"/>
              <stop offset="45%" stop-color="#f59e0b"/>
              <stop offset="100%" stop-color="#78350f"/>
            </linearGradient>
          </defs>
          <!-- Outer 12-point radiant starburst -->
          <path d="M50 6 L58 24 L78 18 L72 38 L90 44 L76 56 L86 74 L68 74 L64 94 L50 82 L36 94 L32 74 L14 74 L24 56 L10 44 L28 38 L22 18 L42 24 Z" fill="#1a1205" stroke="url(#${uid}_sol)" stroke-width="2"/>
          <circle cx="50" cy="50" r="26" fill="url(#${uid}_sol)" stroke="#fff" stroke-width="1.5"/>
          <polygon points="50,30 55,42 68,43 58,52 61,65 50,58 39,65 42,52 32,43 45,42" fill="#fff"/>
        </svg>
      `;

    case 10: // 11. Crown President: Apex Cosmic Crown
    default:
      return `
        <svg viewBox="0 0 100 100" class="rank-crest-svg is-apex" aria-label="Crown President Apex Crest">
          <defs>
            <radialGradient id="${uid}_apex" cx="45%" cy="35%" r="70%">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="25%" stop-color="#fef08a"/>
              <stop offset="60%" stop-color="#eab308"/>
              <stop offset="100%" stop-color="#713f12"/>
            </radialGradient>
            <linearGradient id="${uid}_aurora" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#38bdf8"/>
              <stop offset="50%" stop-color="#f59e0b"/>
              <stop offset="100%" stop-color="#ec4899"/>
            </linearGradient>
          </defs>
          <!-- Radiant Aura Ring -->
          <circle cx="50" cy="50" r="44" fill="none" stroke="url(#${uid}_aurora)" stroke-width="2.5" stroke-dasharray="6 3"/>
          <circle cx="50" cy="50" r="40" fill="#0d0903" stroke="#ffd700" stroke-width="2"/>
          <!-- Royal 5-peak Crown -->
          <path d="M16 66 L22 28 L36 46 L50 16 L64 46 L78 28 L84 66 Z" fill="url(#${uid}_apex)" stroke="#fff" stroke-width="2"/>
          <path d="M20 64 L80 64 L74 76 L26 76 Z" fill="#3b2505" stroke="#fde047" stroke-width="1.5"/>
          <circle cx="50" cy="14" r="4" fill="#fff" filter="drop-shadow(0 0 8px #ffd700)"/>
          <circle cx="22" cy="26" r="3" fill="#38bdf8" filter="drop-shadow(0 0 6px #38bdf8)"/>
          <circle cx="78" cy="26" r="3" fill="#38bdf8" filter="drop-shadow(0 0 6px #38bdf8)"/>
          <polygon points="50,44 58,56 50,68 42,56" fill="#fff"/>
        </svg>
      `;
  }
}

