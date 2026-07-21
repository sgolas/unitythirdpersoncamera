/**
 * Artillery — a Scorched-Earth-style turn-based tank game engine (pure logic,
 * no React/Canvas). Deterministic terrain from a seed; a destructible heightmap
 * world; projectile physics with gravity + wind; several weapons. The React
 * component (ArtilleryTab) owns rendering and the per-frame projectile
 * animation and calls into these helpers for terrain/damage.
 */

export const WORLD = { w: 960, h: 540 };
export const GRAVITY = 0.16;
export const WIND_ACCEL = 0.012; // per unit of wind (-1..1)

export interface Tank {
  id: string; name: string; color: string;
  x: number; y: number; health: number; alive: boolean;
  angle: number; power: number; weapon: string;
}

export type WeaponKind = 'normal' | 'mirv' | 'roller' | 'dirt' | 'tracer';
export interface Weapon {
  id: string; name: string; emoji: string;
  radius: number; damage: number; kind: WeaponKind;
}

export const WEAPONS: Weapon[] = [
  { id: 'baby',    name: 'Baby Missile', emoji: '🚀', radius: 24, damage: 28, kind: 'normal' },
  { id: 'missile', name: 'Missile',      emoji: '🎯', radius: 36, damage: 45, kind: 'normal' },
  { id: 'babynuke',name: 'Baby Nuke',    emoji: '☢️', radius: 52, damage: 65, kind: 'normal' },
  { id: 'nuke',    name: 'Nuke',         emoji: '💥', radius: 78, damage: 95, kind: 'normal' },
  { id: 'mirv',    name: 'MIRV (×3)',    emoji: '✳️', radius: 30, damage: 38, kind: 'mirv' },
  { id: 'roller',  name: 'Roller',       emoji: '🎳', radius: 34, damage: 48, kind: 'roller' },
  { id: 'dirt',    name: 'Dirt Clod',    emoji: '🟫', radius: 40, damage: 0,  kind: 'dirt' },
  { id: 'tracer',  name: 'Tracer',       emoji: '➰', radius: 0,  damage: 0,  kind: 'tracer' },
];
export const weaponById = (id: string) => WEAPONS.find(w => w.id === id) ?? WEAPONS[0];

export interface GameState {
  seed: number;
  terrain: number[];   // surface Y per column [0..WORLD.w-1]; larger = lower
  tanks: Tank[];
  turn: number;        // index of the active tank
  wind: number;        // -1..1
  phase: 'aim' | 'flying' | 'over';
  winnerId: string | null;
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

/** Midpoint-displacement hills, clamped so tanks always have somewhere to sit. */
export function genTerrain(seed: number): number[] {
  const rand = rng(seed);
  const n = WORLD.w;
  const h = new Array(n).fill(0);
  const base = WORLD.h * 0.55;
  // Sum a few sine octaves with random phase for rolling hills.
  const octaves = [
    { amp: WORLD.h * 0.16, len: 520, ph: rand() * 7 },
    { amp: WORLD.h * 0.09, len: 210, ph: rand() * 7 },
    { amp: WORLD.h * 0.05, len: 95,  ph: rand() * 7 },
    { amp: WORLD.h * 0.03, len: 47,  ph: rand() * 7 },
  ];
  for (let x = 0; x < n; x++) {
    let y = base;
    for (const o of octaves) y -= Math.sin((x / o.len) * Math.PI * 2 + o.ph) * o.amp;
    h[x] = Math.max(WORLD.h * 0.22, Math.min(WORLD.h - 8, y));
  }
  return h;
}

const TANK_COLORS = ['#38bdf8', '#fb7185', '#34d399', '#f59e0b', '#a78bfa', '#f472b6', '#22d3ee', '#facc15'];

export interface PlayerSeed { id: string; name: string }

/** Build a fresh game: terrain from the seed, tanks spread evenly across it. */
export function newGame(seed: number, players: PlayerSeed[]): GameState {
  const terrain = genTerrain(seed);
  const n = players.length;
  const tanks: Tank[] = players.map((p, i) => {
    const x = Math.round(WORLD.w * ((i + 1) / (n + 1)));
    return {
      id: p.id, name: p.name, color: TANK_COLORS[i % TANK_COLORS.length],
      x, y: terrain[x], health: 100, alive: true,
      angle: x < WORLD.w / 2 ? 55 : 125, power: 55, weapon: 'baby',
    };
  });
  return { seed, terrain, tanks, turn: 0, wind: windFor(seed, 0), phase: 'aim', winnerId: null };
}

/** Deterministic wind per turn so all clients agree without extra messages. */
export function windFor(seed: number, turnCount: number): number {
  const r = rng(seed ^ (turnCount * 0x9e3779b1))();
  return Math.round((r * 2 - 1) * 100) / 100;
}

export const activeTank = (s: GameState): Tank | undefined => s.tanks[s.turn];

/** Surface height at a fractional column (linear interpolation). */
export function terrainAt(s: GameState, x: number): number {
  if (x <= 0) return s.terrain[0];
  if (x >= WORLD.w - 1) return s.terrain[WORLD.w - 1];
  const i = Math.floor(x), f = x - i;
  return s.terrain[i] * (1 - f) + s.terrain[i + 1] * f;
}

/** Muzzle position + initial velocity for a tank's current angle/power. */
export function launch(t: Tank): { x: number; y: number; vx: number; vy: number } {
  const a = (t.angle * Math.PI) / 180;
  const speed = 2 + (t.power / 100) * 12;
  return {
    x: t.x + Math.cos(a) * 16,
    y: t.y - 14 - Math.sin(a) * 16,
    vx: Math.cos(a) * speed,
    vy: -Math.sin(a) * speed,
  };
}

/** Carve (or, for dirt, raise) a circular crater and damage nearby tanks.
 *  Mutates the state's terrain + tanks. */
export function explode(s: GameState, cx: number, cy: number, w: Weapon): void {
  if (w.kind === 'tracer' || w.radius <= 0) return;
  const r = w.radius;
  for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(WORLD.w - 1, Math.ceil(cx + r)); x++) {
    const dx = x - cx;
    const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
    if (w.kind === 'dirt') {
      // Add a mound: raise the surface (lower Y) but never above the crater top.
      s.terrain[x] = Math.min(s.terrain[x], Math.max(cy - dy, 12));
    } else {
      // Remove ground down to the bottom of the blast circle at this column.
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

/** Advance to the next living tank and roll fresh wind. */
export function nextTurn(s: GameState): void {
  if (checkOver(s)) return;
  let next = s.turn;
  for (let i = 0; i < s.tanks.length; i++) {
    next = (next + 1) % s.tanks.length;
    if (s.tanks[next].alive) break;
  }
  s.turn = next;
  s.wind = windFor(s.seed, (s.wind * 1000 + Date.now()) | 0); // fresh, deterministic-enough
  s.phase = 'aim';
}

/** A compact, JSON-safe snapshot the active player broadcasts as the
 *  authoritative post-shot state (terrain packed as rounded ints). */
export interface Snapshot {
  terrain: number[]; tanks: Tank[]; turn: number; wind: number;
  phase: GameState['phase']; winnerId: string | null;
}
export function snapshot(s: GameState): Snapshot {
  return {
    terrain: s.terrain.map(v => Math.round(v)),
    tanks: s.tanks.map(t => ({ ...t })),
    turn: s.turn, wind: s.wind, phase: s.phase, winnerId: s.winnerId,
  };
}
export function applySnapshot(s: GameState, snap: Snapshot): void {
  s.terrain = snap.terrain.slice();
  s.tanks = snap.tanks.map(t => ({ ...t }));
  s.turn = snap.turn; s.wind = snap.wind; s.phase = snap.phase; s.winnerId = snap.winnerId;
}
