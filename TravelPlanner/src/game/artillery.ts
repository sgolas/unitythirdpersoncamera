/**
 * Artillery — a Scorched-Earth-style turn-based tank game engine (pure logic,
 * no React/Canvas). Deterministic terrain from a seed; a destructible heightmap
 * world with optional buildings; projectile physics with gravity + wind;
 * several weapons; configurable match settings and multi-round scoring. The
 * React component (ArtilleryTab) owns rendering and the per-frame projectile
 * animation and calls into these helpers for terrain/damage.
 */

export const WORLD = { w: 960, h: 540 };
// Base gravity. Lowered from the old 0.16 for floatier, more realistic arcs;
// the match settings scale it (see gravityValue). WIND_ACCEL nudges sideways.
export const GRAVITY = 0.095;
export const WIND_ACCEL = 0.014; // per unit of wind (-1..1)

export interface Tank {
  id: string; name: string; color: string;
  x: number; y: number; health: number; alive: boolean;
  angle: number; power: number; weapon: string;
}

/** A destructible building/structure that sits on the terrain and blocks shots. */
export interface Structure {
  id: string;
  x: number; y: number; w: number; h: number; // top-left + size (world units)
  hp: number; maxHp: number;
  kind: 'tower' | 'block' | 'bunker';
  hue: number; // base colour hue so each looks distinct
}

export type WeaponKind =
  | 'normal' | 'mirv' | 'roller' | 'dirt'
  | 'bounce' | 'cluster' | 'banana' | 'holy' | 'airstrike' | 'homing';
export interface Weapon {
  id: string; name: string; emoji: string;
  radius: number; damage: number; kind: WeaponKind;
  fuse?: number;    // frames before a bouncy weapon self-detonates
  bounces?: number; // how many times a bouncy weapon rebounds off terrain
  hidden?: boolean; // helper projectiles (cluster bomblets) — not shown in the toolbar
}

/**
 * A Worms-Armageddon-flavoured arsenal. The character is in the *mechanics*,
 * not just the names: grenades bounce on a fuse, cluster/banana bombs burst
 * into bomblets, the air strike rains bombs from the sky, the sheep walks the
 * ground before blowing up, and the homing missile chases the nearest enemy.
 */
export const WEAPONS: Weapon[] = [
  { id: 'bazooka', name: 'Bazooka',      emoji: '🚀', radius: 34, damage: 42, kind: 'normal' },
  { id: 'grenade', name: 'Grenade',      emoji: '💣', radius: 32, damage: 44, kind: 'bounce', fuse: 150, bounces: 8 },
  { id: 'cluster', name: 'Cluster Bomb', emoji: '🧨', radius: 22, damage: 26, kind: 'cluster' },
  { id: 'banana',  name: 'Banana Bomb',  emoji: '🍌', radius: 30, damage: 40, kind: 'banana', fuse: 170, bounces: 6 },
  { id: 'holy',    name: 'Holy Grenade',  emoji: '🙏', radius: 72, damage: 96, kind: 'holy', fuse: 130, bounces: 3 },
  { id: 'mortar',  name: 'Mortar',       emoji: '☄️', radius: 26, damage: 32, kind: 'mirv' },
  { id: 'airstrike', name: 'Air Strike', emoji: '✈️', radius: 30, damage: 38, kind: 'airstrike' },
  { id: 'homing',  name: 'Homing',       emoji: '🎯', radius: 34, damage: 46, kind: 'homing' },
  { id: 'sheep',   name: 'Sheep',        emoji: '🐑', radius: 34, damage: 52, kind: 'roller' },
  { id: 'girder',  name: 'Girder',       emoji: '🧱', radius: 42, damage: 0,  kind: 'dirt' },
  // Cluster/banana bomblets — spawned in play, never selectable.
  { id: 'bomblet', name: 'Bomblet',      emoji: '•',  radius: 20, damage: 22, kind: 'normal', hidden: true },
];
export const weaponById = (id: string) => WEAPONS.find(w => w.id === id) ?? WEAPONS[0];
/** Weapons shown in the toolbar (excludes helper projectiles). */
export const PICKABLE_WEAPONS = WEAPONS.filter(w => !w.hidden);

/* ── Match settings (mirrors the original game's options screen) ─────── */
export type WindSetting = 'off' | 'low' | 'high';
export type GravitySetting = 'low' | 'normal' | 'high';
export type TerrainSetting = 'hills' | 'mountains' | 'plains';

export interface GameSettings {
  players: number;          // local (hotseat) player count, 2..4
  wind: WindSetting;
  gravity: GravitySetting;
  rounds: number;           // rounds per match (1,3,5,…)
  structures: boolean;      // place buildings on the map
  terrain: TerrainSetting;  // map style
}

export const DEFAULT_SETTINGS: GameSettings = {
  players: 2, wind: 'low', gravity: 'normal', rounds: 3, structures: true, terrain: 'hills',
};

/** Resolve a gravity setting to the per-frame acceleration used by the sim. */
export function gravityValue(s: GravitySetting): number {
  return s === 'low' ? GRAVITY * 0.7 : s === 'high' ? GRAVITY * 1.5 : GRAVITY;
}
/** Max |wind| a setting allows (wind itself is stored/rendered in -1..1). */
export function windMaxFor(s: WindSetting): number {
  return s === 'off' ? 0 : s === 'high' ? 1 : 0.5;
}

export interface GameState {
  seed: number;
  terrain: number[];   // surface Y per column [0..WORLD.w-1]; larger = lower
  structures: Structure[];
  tanks: Tank[];
  turn: number;        // index of the active tank
  wind: number;        // -1..1
  gravity: number;     // resolved per-frame gravity for this match
  windMax: number;     // resolved max |wind| for this match
  settings: GameSettings;
  round: number;       // 1-based current round
  scores: Record<string, number>; // wins per tank id across rounds
  phase: 'aim' | 'flying' | 'over';
  winnerId: string | null; // winner of THIS round (null = draw / ongoing)
}

/** Deterministic PRNG (mulberry32) so every device builds the identical world. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rolling hills from summed sine octaves, then a couple of smoothing passes for
 * the soft, modern look. The terrain style scales the amplitude/baseline.
 */
export function genTerrain(seed: number, style: TerrainSetting = 'hills'): number[] {
  const rand = rng(seed);
  const n = WORLD.w;
  const h = new Array(n).fill(0);
  const cfg = style === 'mountains'
    ? { base: 0.62, amp: [0.24, 0.14, 0.07, 0.035] }
    : style === 'plains'
      ? { base: 0.72, amp: [0.07, 0.045, 0.025, 0.015] }
      : { base: 0.58, amp: [0.16, 0.09, 0.05, 0.03] };
  const base = WORLD.h * cfg.base;
  const octaves = [
    { amp: WORLD.h * cfg.amp[0], len: 520, ph: rand() * 7 },
    { amp: WORLD.h * cfg.amp[1], len: 240, ph: rand() * 7 },
    { amp: WORLD.h * cfg.amp[2], len: 110, ph: rand() * 7 },
    { amp: WORLD.h * cfg.amp[3], len: 54,  ph: rand() * 7 },
  ];
  for (let x = 0; x < n; x++) {
    let y = base;
    for (const o of octaves) y -= Math.sin((x / o.len) * Math.PI * 2 + o.ph) * o.amp;
    h[x] = y;
  }
  // Smooth (moving average) for gentle, modern curves — twice.
  for (let pass = 0; pass < 2; pass++) {
    const src = h.slice();
    const k = 6;
    for (let x = 0; x < n; x++) {
      let sum = 0, cnt = 0;
      for (let d = -k; d <= k; d++) { const i = x + d; if (i >= 0 && i < n) { sum += src[i]; cnt++; } }
      h[x] = sum / cnt;
    }
  }
  for (let x = 0; x < n; x++) h[x] = Math.max(WORLD.h * 0.2, Math.min(WORLD.h - 8, h[x]));
  return h;
}

const TANK_COLORS = ['#38bdf8', '#fb7185', '#34d399', '#f59e0b', '#a78bfa', '#f472b6', '#22d3ee', '#facc15'];

export interface PlayerSeed { id: string; name: string }

/** Place a few destructible buildings in the gaps between tanks. */
export function genStructures(seed: number, terrain: number[], tanks: Tank[]): Structure[] {
  const rand = rng(seed ^ 0x5bd1e995);
  const out: Structure[] = [];
  const count = 2 + Math.floor(rand() * 3); // 2..4 buildings
  let tries = 0;
  while (out.length < count && tries < 60) {
    tries++;
    const w = 30 + Math.round(rand() * 34);
    const h = 44 + Math.round(rand() * 60);
    const cx = 80 + Math.round(rand() * (WORLD.w - 160));
    // Keep clear of tanks and other structures.
    if (tanks.some(t => Math.abs(t.x - cx) < 46)) continue;
    if (out.some(s => Math.abs((s.x + s.w / 2) - cx) < 70)) continue;
    const groundY = terrain[Math.max(0, Math.min(WORLD.w - 1, cx))];
    const kind: Structure['kind'] = rand() < 0.34 ? 'tower' : rand() < 0.6 ? 'bunker' : 'block';
    const hh = kind === 'tower' ? h + 22 : kind === 'bunker' ? Math.min(h, 52) : h;
    const ww = kind === 'bunker' ? w + 16 : kind === 'tower' ? Math.max(26, w - 10) : w;
    const maxHp = Math.round((ww * hh) / 26);
    out.push({
      id: `st${out.length}`,
      x: Math.round(cx - ww / 2), y: Math.round(groundY - hh), w: ww, h: hh,
      hp: maxHp, maxHp, kind, hue: Math.round(rand() * 360),
    });
  }
  return out.sort((a, b) => a.x - b.x);
}

/** Build a fresh game: terrain from the seed, tanks spread evenly across it. */
export function newGame(
  seed: number, players: PlayerSeed[], settings: GameSettings = DEFAULT_SETTINGS,
  opts: { round?: number; scores?: Record<string, number> } = {},
): GameState {
  const terrain = genTerrain(seed, settings.terrain);
  const n = players.length;
  const tanks: Tank[] = players.map((p, i) => {
    const x = Math.round(WORLD.w * ((i + 1) / (n + 1)));
    return {
      id: p.id, name: p.name, color: TANK_COLORS[i % TANK_COLORS.length],
      x, y: terrain[x], health: 100, alive: true,
      angle: x < WORLD.w / 2 ? 55 : 125, power: 58, weapon: 'bazooka',
    };
  });
  const structures = settings.structures ? genStructures(seed, terrain, tanks) : [];
  const windMax = windMaxFor(settings.wind);
  const scores = opts.scores ?? Object.fromEntries(players.map(p => [p.id, 0]));
  return {
    seed, terrain, structures, tanks, turn: 0,
    wind: windFor(seed, 0, windMax),
    gravity: gravityValue(settings.gravity), windMax, settings,
    round: opts.round ?? 1, scores,
    phase: 'aim', winnerId: null,
  };
}

/** Deterministic wind per turn so all clients agree without extra messages. */
export function windFor(seed: number, turnCount: number, windMax = 0.5): number {
  const r = rng(seed ^ (turnCount * 0x9e3779b1))();
  return Math.round((r * 2 - 1) * windMax * 100) / 100;
}

export const activeTank = (s: GameState): Tank | undefined => s.tanks[s.turn];

/** Surface height at a fractional column (linear interpolation). */
export function terrainAt(s: GameState, x: number): number {
  if (x <= 0) return s.terrain[0];
  if (x >= WORLD.w - 1) return s.terrain[WORLD.w - 1];
  const i = Math.floor(x), f = x - i;
  return s.terrain[i] * (1 - f) + s.terrain[i + 1] * f;
}

/** The intact structure (hp>0) containing point (x,y), or null. */
export function structureAt(s: GameState, x: number, y: number): Structure | null {
  for (const st of s.structures) {
    if (st.hp <= 0) continue;
    if (x >= st.x && x <= st.x + st.w && y >= st.y && y <= st.y + st.h) return st;
  }
  return null;
}

/** Muzzle position + initial velocity for a tank's current angle/power. */
export function launch(t: Tank): { x: number; y: number; vx: number; vy: number } {
  const a = (t.angle * Math.PI) / 180;
  // Slightly higher muzzle speed pairs with the lower gravity for long, lofty arcs.
  const speed = 3 + (t.power / 100) * 13;
  return {
    x: t.x + Math.cos(a) * 16,
    y: t.y - 14 - Math.sin(a) * 16,
    vx: Math.cos(a) * speed,
    vy: -Math.sin(a) * speed,
  };
}

/** Damage structures within a blast; returns true if any were hit. */
export function damageStructures(s: GameState, cx: number, cy: number, w: Weapon): void {
  if (w.damage <= 0 || w.radius <= 0) return;
  const r = w.radius;
  for (const st of s.structures) {
    if (st.hp <= 0) continue;
    // distance from blast centre to the structure rect
    const nx = Math.max(st.x, Math.min(cx, st.x + st.w));
    const ny = Math.max(st.y, Math.min(cy, st.y + st.h));
    const d = Math.hypot(cx - nx, cy - ny);
    if (d < r) {
      const dmg = Math.round((w.damage + 20) * (1 - d / r));
      st.hp = Math.max(0, st.hp - dmg);
    }
  }
}

/** Carve (or, for dirt, raise) a circular crater and damage nearby tanks +
 *  structures. Mutates the state's terrain + tanks + structures. */
export function explode(s: GameState, cx: number, cy: number, w: Weapon): void {
  if (w.radius <= 0) return;
  const r = w.radius;
  for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(WORLD.w - 1, Math.ceil(cx + r)); x++) {
    const dx = x - cx;
    const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
    if (w.kind === 'dirt') {
      s.terrain[x] = Math.min(s.terrain[x], Math.max(cy - dy, 12));
    } else {
      const bottom = cy + dy;
      if (bottom > s.terrain[x]) s.terrain[x] = Math.min(WORLD.h, bottom);
    }
  }
  if (w.damage > 0) {
    for (const t of s.tanks) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - cx, t.y - cy);
      if (d < r + 6) {
        const dmg = Math.round(w.damage * (1 - d / (r + 6)));
        t.health = Math.max(0, t.health - dmg);
      }
    }
    damageStructures(s, cx, cy, w);
  }
  settleTanks(s);
}

/** Drop tanks onto the (possibly changed) terrain; apply fall damage; kill the
 *  dead. Call after any terrain change. */
export function settleTanks(s: GameState): void {
  for (const t of s.tanks) {
    if (!t.alive) continue;
    const ground = terrainAt(s, t.x);
    if (ground > t.y + 2) {
      const fall = ground - t.y;
      if (fall > 60) t.health = Math.max(0, t.health - Math.round((fall - 60) / 4));
    }
    t.y = ground;
    if (t.health <= 0) t.alive = false;
  }
}

/** True once ≤1 tank remains; sets winnerId. */
export function checkOver(s: GameState): boolean {
  const alive = s.tanks.filter(t => t.alive);
  if (alive.length <= 1) {
    s.phase = 'over';
    s.winnerId = alive[0]?.id ?? null;
    return true;
  }
  return false;
}

/** Award the round win (call once when a round ends). */
export function awardRound(s: GameState): void {
  if (s.winnerId) s.scores[s.winnerId] = (s.scores[s.winnerId] ?? 0) + 1;
}

/** True when the whole match (all rounds) is decided. */
export function matchOver(s: GameState): boolean {
  return s.round >= s.settings.rounds;
}

/** id of the overall match leader (or null on a tie). */
export function matchChampion(s: GameState): string | null {
  let best: string | null = null, bestN = -1, tie = false;
  for (const [id, n] of Object.entries(s.scores)) {
    if (n > bestN) { bestN = n; best = id; tie = false; }
    else if (n === bestN) tie = true;
  }
  return tie ? null : best;
}

/** Advance to the next living tank and roll fresh wind. */
export function nextTurn(s: GameState): void {
  if (checkOver(s)) return;
  let next = s.turn;
  for (let i = 0; i < s.tanks.length; i++) {
    next = (next + 1) % s.tanks.length;
    if (s.tanks[next].alive) break;
  }
  s.turn = next;
  s.wind = windFor(s.seed, (s.wind * 1000 + Date.now()) | 0, s.windMax);
  s.phase = 'aim';
}

/** A compact, JSON-safe snapshot the active player broadcasts as the
 *  authoritative post-shot state (terrain packed as rounded ints). */
export interface Snapshot {
  terrain: number[]; structures: Structure[]; tanks: Tank[];
  turn: number; wind: number; gravity: number; windMax: number;
  settings: GameSettings; round: number; scores: Record<string, number>;
  phase: GameState['phase']; winnerId: string | null;
}
export function snapshot(s: GameState): Snapshot {
  return {
    terrain: s.terrain.map(v => Math.round(v)),
    structures: s.structures.map(st => ({ ...st })),
    tanks: s.tanks.map(t => ({ ...t })),
    turn: s.turn, wind: s.wind, gravity: s.gravity, windMax: s.windMax,
    settings: s.settings, round: s.round, scores: { ...s.scores },
    phase: s.phase, winnerId: s.winnerId,
  };
}
export function applySnapshot(s: GameState, snap: Snapshot): void {
  s.terrain = snap.terrain.slice();
  s.structures = snap.structures.map(st => ({ ...st }));
  s.tanks = snap.tanks.map(t => ({ ...t }));
  s.turn = snap.turn; s.wind = snap.wind;
  s.gravity = snap.gravity ?? s.gravity; s.windMax = snap.windMax ?? s.windMax;
  if (snap.settings) s.settings = snap.settings;
  if (snap.round) s.round = snap.round;
  if (snap.scores) s.scores = { ...snap.scores };
  s.phase = snap.phase; s.winnerId = snap.winnerId;
}
