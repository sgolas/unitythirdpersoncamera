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
  // Economy & defences (Scorched-Earth shop system)
  cash: number;
  inventory: Record<string, number>; // weaponId -> rounds owned (UNLIMITED = infinite)
  armor: number;      // shield/battery points; absorbs damage before health
  parachutes: number; // auto-deployed to cancel fall damage
}

/** Inventory sentinel meaning "never runs out" (JSON-safe, unlike Infinity). */
export const UNLIMITED = 999999;
export const isUnlimited = (n: number) => n >= 100000;

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
  | 'bounce' | 'cluster' | 'banana' | 'holy' | 'airstrike' | 'homing'
  | 'digger' | 'leapfrog' | 'napalm';
export interface Weapon {
  id: string; name: string; emoji: string;
  radius: number; damage: number; kind: WeaponKind;
  fuse?: number;     // frames before a bouncy weapon self-detonates
  bounces?: number;  // how many times a bouncy weapon rebounds off terrain
  splits?: number;   // MIRV/Death's Head child count
  bomblets?: number; // cluster/funky burst count
  leaps?: number;    // leapfrog hop count
  rollMs?: number;   // roller/sheep: how long it rolls/walks before self-detonating
  cat?: string;      // toolbar grouping label
  hidden?: boolean;  // helper projectiles (cluster bomblets) — not selectable
}

/**
 * A big Scorched-Earth arsenal (plus a few Worms-flavoured extras). The
 * character is in the *mechanics*: missiles/nukes escalate in size, MIRV and
 * Death's Head rain sub-munitions, grenades and the banana/holy bombs bounce on
 * a fuse, cluster & funky bombs burst into bomblets, leapfrog walks a chain of
 * blasts forward, napalm lays a wide sheet of fire, rollers walk downhill,
 * diggers bore shafts, dirt weapons build terrain, riot charges clear it
 * without damage, and the tracer is a no-damage ranging shot.
 */
export const WEAPONS: Weapon[] = [
  // Missiles & nukes ─ escalating direct blasts
  { id: 'baby',     name: 'Baby Missile', emoji: '🚀', radius: 22, damage: 24, kind: 'normal', cat: 'Missiles' },
  { id: 'missile',  name: 'Missile',      emoji: '🚀', radius: 34, damage: 42, kind: 'normal', cat: 'Missiles' },
  { id: 'babynuke', name: 'Baby Nuke',    emoji: '☢️', radius: 52, damage: 66, kind: 'normal', cat: 'Missiles' },
  { id: 'nuke',     name: 'Nuke',         emoji: '💥', radius: 82, damage: 98, kind: 'normal', cat: 'Missiles' },
  // Sub-munitions
  { id: 'mirv',     name: 'MIRV',         emoji: '✳️', radius: 26, damage: 30, kind: 'mirv', splits: 5, cat: 'Cluster' },
  { id: 'deaths',   name: "Death's Head", emoji: '💀', radius: 32, damage: 40, kind: 'mirv', splits: 9, cat: 'Cluster' },
  { id: 'cluster',  name: 'Cluster Bomb', emoji: '🧨', radius: 22, damage: 26, kind: 'cluster', bomblets: 5, cat: 'Cluster' },
  { id: 'funky',    name: 'Funky Bomb',   emoji: '🎉', radius: 22, damage: 24, kind: 'cluster', bomblets: 9, cat: 'Cluster' },
  { id: 'leapfrog', name: 'Leapfrog',     emoji: '🐸', radius: 28, damage: 32, kind: 'leapfrog', leaps: 4, cat: 'Cluster' },
  // Fire
  { id: 'napalm',   name: 'Napalm',       emoji: '🔥', radius: 42, damage: 36, kind: 'napalm', cat: 'Fire' },
  { id: 'hotnapalm',name: 'Hot Napalm',   emoji: '🔥', radius: 58, damage: 50, kind: 'napalm', cat: 'Fire' },
  // Worms-style specials
  { id: 'grenade',  name: 'Grenade',      emoji: '💣', radius: 32, damage: 44, kind: 'bounce', fuse: 150, bounces: 8, cat: 'Special' },
  { id: 'banana',   name: 'Banana Bomb',  emoji: '🍌', radius: 30, damage: 40, kind: 'banana', fuse: 170, bounces: 6, bomblets: 5, cat: 'Special' },
  { id: 'holy',     name: 'Holy Grenade', emoji: '🙏', radius: 72, damage: 96, kind: 'holy', fuse: 130, bounces: 3, cat: 'Special' },
  { id: 'airstrike',name: 'Air Strike',   emoji: '✈️', radius: 30, damage: 38, kind: 'airstrike', cat: 'Special' },
  { id: 'homing',   name: 'Homing',       emoji: '🎯', radius: 34, damage: 46, kind: 'homing', cat: 'Special' },
  { id: 'sheep',    name: 'Sheep',        emoji: '🐑', radius: 34, damage: 52, kind: 'roller', rollMs: 5000, cat: 'Special' },
  // Rollers ─ roll along the ground for a few seconds before blowing up
  { id: 'babyroll', name: 'Baby Roller',  emoji: '🎳', radius: 24, damage: 30, kind: 'roller', rollMs: 4000, cat: 'Rollers' },
  { id: 'roller',   name: 'Roller',       emoji: '🎳', radius: 34, damage: 48, kind: 'roller', rollMs: 4000, cat: 'Rollers' },
  { id: 'heavyroll',name: 'Heavy Roller', emoji: '🎳', radius: 48, damage: 72, kind: 'roller', rollMs: 4000, cat: 'Rollers' },
  // Diggers ─ bore a shaft straight down
  { id: 'babydig',  name: 'Baby Digger',  emoji: '⛏️', radius: 18, damage: 22, kind: 'digger', cat: 'Diggers' },
  { id: 'digger',   name: 'Digger',       emoji: '⛏️', radius: 28, damage: 34, kind: 'digger', cat: 'Diggers' },
  { id: 'heavydig', name: 'Heavy Digger', emoji: '⛏️', radius: 40, damage: 50, kind: 'digger', cat: 'Diggers' },
  // Dirt ─ build terrain (shields / bridges)
  { id: 'dirtclod', name: 'Dirt Clod',    emoji: '🟫', radius: 30, damage: 0, kind: 'dirt', cat: 'Dirt' },
  { id: 'dirtball', name: 'Dirt Ball',    emoji: '🟫', radius: 46, damage: 0, kind: 'dirt', cat: 'Dirt' },
  { id: 'tondirt',  name: 'Ton of Dirt',  emoji: '⛰️', radius: 70, damage: 0, kind: 'dirt', cat: 'Dirt' },
  // Riot ─ clear dirt without harming tanks
  { id: 'riotbomb', name: 'Riot Bomb',    emoji: '🧹', radius: 44, damage: 0, kind: 'normal', cat: 'Riot' },
  { id: 'riotblast',name: 'Riot Blast',   emoji: '🧹', radius: 68, damage: 0, kind: 'normal', cat: 'Riot' },
  // Utility
  { id: 'tracer',   name: 'Tracer',       emoji: '➰', radius: 0, damage: 0, kind: 'normal', cat: 'Utility' },
  // Helper projectiles — spawned in play, never selectable.
  { id: 'bomblet',  name: 'Bomblet',      emoji: '•', radius: 20, damage: 22, kind: 'normal', hidden: true },
  { id: 'meteor',   name: 'Meteor',       emoji: '☄️', radius: 40, damage: 44, kind: 'normal', hidden: true },
];
export const weaponById = (id: string) => WEAPONS.find(w => w.id === id) ?? WEAPONS[0];
/** Weapons shown in the toolbar (excludes helper projectiles). */
export const PICKABLE_WEAPONS = WEAPONS.filter(w => !w.hidden);

/* ── Match settings (mirrors the original game's options screen) ─────── */
export type WindSetting = 'none' | 'constant' | 'changing';
export type GravitySetting = 'low' | 'normal' | 'high';
export type TerrainSetting = 'hills' | 'mountains' | 'plains';
export type WeatherSetting = 'off' | 'light' | 'heavy';
export type OrderSetting = 'sequential' | 'random' | 'losers' | 'winners';

export interface GameSettings {
  players: number;          // local (hotseat) player count, 2..4
  wind: WindSetting;        // none · constant (fixed per round) · changing (per turn)
  gravity: GravitySetting;
  rounds: number;           // rounds per match (1,3,5,10)
  cash: number;             // starting cash for the shop
  weather: WeatherSetting;  // meteor-shower intensity
  order: OrderSetting;      // how the turn order cycles
  structures: boolean;      // place buildings on the map
  terrain: TerrainSetting;  // map style
}

export const DEFAULT_SETTINGS: GameSettings = {
  players: 2, wind: 'changing', gravity: 'normal', rounds: 10, cash: 25000,
  weather: 'off', order: 'sequential', structures: true, terrain: 'hills',
};

/** Resolve a gravity setting to the per-frame acceleration used by the sim. */
export function gravityValue(s: GravitySetting): number {
  return s === 'low' ? GRAVITY * 0.7 : s === 'high' ? GRAVITY * 1.5 : GRAVITY;
}
/** Max |wind| a setting allows (wind itself is stored/rendered in -1..1). */
export function windMaxFor(s: WindSetting): number {
  return s === 'none' ? 0 : 0.6;
}

/* ── Shop / economy ──────────────────────────────────────────────────── */
export type ShopKind = 'weapon' | 'armor' | 'parachute';
export interface ShopItem {
  id: string; name: string; emoji: string;
  price: number; qty: number;   // cost buys `qty` units
  kind: ShopKind; value?: number; // armor: points added per unit
}

/** Weapons every tank always owns (free, unlimited) — never in the shop. */
export const FREE_WEAPONS = ['baby'];

/** Price/pack for a weapon, tiered by rough destructive power. */
function weaponPrice(w: Weapon): { price: number; qty: number } {
  const power = w.damage + w.radius * 0.6
    + (w.splits ? w.splits * 5 : 0) + (w.bomblets ? w.bomblets * 4 : 0)
    + (w.kind === 'homing' ? 30 : 0) + (w.kind === 'airstrike' ? 25 : 0)
    + (w.kind === 'dirt' ? 20 : 0);
  if (power < 26) return { price: 800, qty: 10 };
  if (power < 50) return { price: 1875, qty: 10 };
  if (power < 78) return { price: 5000, qty: 5 };
  if (power < 108) return { price: 10000, qty: 3 };
  return { price: 15000, qty: 1 };
}

/** The between-rounds shop: buyable weapons + defences. */
export const SHOP_ITEMS: ShopItem[] = [
  ...PICKABLE_WEAPONS.filter(w => !FREE_WEAPONS.includes(w.id)).map(w => {
    const { price, qty } = weaponPrice(w);
    return { id: w.id, name: w.name, emoji: w.emoji, price, qty, kind: 'weapon' as const };
  }),
  { id: 'parachute', name: 'Parachutes', emoji: '🪂', price: 1200, qty: 3, kind: 'parachute' },
  { id: 'shield',    name: 'Shield',       emoji: '🛡️', price: 2500,  qty: 1, kind: 'armor', value: 50 },
  { id: 'battery',   name: 'Battery',      emoji: '🔋', price: 3500,  qty: 1, kind: 'armor', value: 75 },
  { id: 'heavysh',   name: 'Heavy Shield', emoji: '🛡️', price: 5000,  qty: 1, kind: 'armor', value: 100 },
  { id: 'forcesh',   name: 'Force Shield', emoji: '🛡️', price: 10000, qty: 1, kind: 'armor', value: 200 },
];

/** A fresh tank inventory: unlimited Baby Missile (+ everything if `all`). */
export function startInventory(all: boolean): Record<string, number> {
  const inv: Record<string, number> = {};
  for (const w of PICKABLE_WEAPONS) inv[w.id] = all || FREE_WEAPONS.includes(w.id) ? UNLIMITED : 0;
  if (!all) { inv.missile = 3; inv.dirtclod = 2; } // a small starter kit
  return inv;
}

/** Buy a shop item for a tank if affordable; mutates the tank. Returns success. */
export function buyItem(t: Tank, item: ShopItem): boolean {
  if (t.cash < item.price) return false;
  t.cash -= item.price;
  if (item.kind === 'weapon') {
    const cur = t.inventory[item.id] ?? 0;
    if (!isUnlimited(cur)) t.inventory[item.id] = cur + item.qty;
  } else if (item.kind === 'armor') {
    t.armor += (item.value ?? 0) * item.qty;
  } else if (item.kind === 'parachute') {
    t.parachutes += item.qty;
  }
  return true;
}

/** Owned, selectable weapons for a tank (count > 0), in toolbar order. */
export function ownedWeapons(t: Tank): Weapon[] {
  return PICKABLE_WEAPONS.filter(w => (t.inventory[w.id] ?? 0) > 0);
}

/** Spend one round of a weapon (no-op for unlimited weapons). */
export function consumeWeapon(t: Tank, id: string): void {
  const cur = t.inventory[id] ?? 0;
  if (cur > 0 && !isUnlimited(cur)) t.inventory[id] = cur - 1;
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
  order: number[];     // tank indices in play order for this round
  economy: boolean;    // shop/economy active (local play) vs unlimited (online)
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

/** Per-tank state carried between rounds (cash, inventory, defences). */
export interface Carry { cash: number; inventory: Record<string, number>; armor: number; parachutes: number }

/** Build a fresh game: terrain from the seed, tanks spread evenly across it. */
export function newGame(
  seed: number, players: PlayerSeed[], settings: GameSettings = DEFAULT_SETTINGS,
  opts: { round?: number; scores?: Record<string, number>; carry?: Record<string, Carry>; economy?: boolean } = {},
): GameState {
  const terrain = genTerrain(seed, settings.terrain);
  const n = players.length;
  const economy = opts.economy ?? true;
  const scores = opts.scores ?? Object.fromEntries(players.map(p => [p.id, 0]));
  const tanks: Tank[] = players.map((p, i) => {
    const x = Math.round(WORLD.w * ((i + 1) / (n + 1)));
    const c = opts.carry?.[p.id];
    return {
      id: p.id, name: p.name, color: TANK_COLORS[i % TANK_COLORS.length],
      x, y: terrain[x], health: 100, alive: true,
      angle: x < WORLD.w / 2 ? 55 : 125, power: 58, weapon: 'baby',
      cash: c ? c.cash : (economy ? settings.cash : 0),
      inventory: c ? { ...c.inventory } : startInventory(!economy),
      armor: c ? c.armor : 0,
      parachutes: c ? c.parachutes : 0,
    };
  });
  const structures = settings.structures ? genStructures(seed, terrain, tanks) : [];
  const windMax = windMaxFor(settings.wind);
  const order = turnOrder(seed, tanks, scores, settings.order);
  return {
    seed, terrain, structures, tanks, turn: order[0] ?? 0,
    wind: windFor(seed, 0, windMax),
    gravity: gravityValue(settings.gravity), windMax, settings,
    round: opts.round ?? 1, scores, order, economy,
    phase: 'aim', winnerId: null,
  };
}

/** Extract each tank's carry-over economy state (for the next round). */
export function carryOf(s: GameState): Record<string, Carry> {
  const out: Record<string, Carry> = {};
  for (const t of s.tanks) out[t.id] = { cash: t.cash, inventory: { ...t.inventory }, armor: t.armor, parachutes: t.parachutes };
  return out;
}

/** Build the round's play order (indices into tanks) per the order setting. */
export function turnOrder(seed: number, tanks: Tank[], scores: Record<string, number>, mode: OrderSetting): number[] {
  const idx = tanks.map((_, i) => i);
  if (mode === 'random') {
    const rand = rng(seed ^ 0x1234567);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  } else if (mode === 'losers') {
    idx.sort((a, b) => (scores[tanks[a].id] ?? 0) - (scores[tanks[b].id] ?? 0));
  } else if (mode === 'winners') {
    idx.sort((a, b) => (scores[tanks[b].id] ?? 0) - (scores[tanks[a].id] ?? 0));
  }
  return idx;
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

/** Apply damage to a tank, absorbed by armor (shields/battery) first. */
export function applyDamage(t: Tank, dmg: number): void {
  if (dmg <= 0) return;
  if (t.armor > 0) {
    const absorbed = Math.min(t.armor, dmg);
    t.armor -= absorbed; dmg -= absorbed;
  }
  if (dmg > 0) t.health = Math.max(0, t.health - dmg);
}

/** Carve (or, for dirt, raise) a circular crater and damage nearby tanks +
 *  structures. Mutates the state's terrain + tanks + structures. */
export function explode(s: GameState, cx: number, cy: number, w: Weapon): void {
  if (w.radius <= 0) return;
  const r = w.radius;
  if (w.kind === 'digger') {
    // Bore a deep, narrow shaft straight down from the surface.
    const hw = Math.max(5, Math.round(r * 0.4));
    const depth = r * 2.4;
    for (let x = Math.max(0, Math.round(cx - hw)); x <= Math.min(WORLD.w - 1, Math.round(cx + hw)); x++) {
      s.terrain[x] = Math.min(WORLD.h, s.terrain[x] + depth);
    }
    for (const t of s.tanks) {
      if (!t.alive) continue;
      if (Math.abs(t.x - cx) < hw + 6 && t.y >= cy - 12) applyDamage(t, w.damage);
    }
    settleTanks(s); return;
  }
  if (w.kind === 'napalm') {
    // A wide, shallow sheet of fire: light surface scorch + broad tank burn.
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(WORLD.w - 1, Math.ceil(cx + r)); x++) {
      s.terrain[x] = Math.min(WORLD.h, s.terrain[x] + 3);
    }
    const burn = r * 1.4;
    for (const t of s.tanks) {
      if (!t.alive) continue;
      const d = Math.abs(t.x - cx);
      if (d < burn && Math.abs(t.y - cy) < 70) applyDamage(t, Math.round(w.damage * (1 - d / burn)));
    }
    damageStructures(s, cx, cy, w);
    settleTanks(s); return;
  }
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
      if (d < r + 6) applyDamage(t, Math.round(w.damage * (1 - d / (r + 6))));
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
      // A parachute auto-deploys to cancel a damaging fall; else take fall damage.
      if (fall > 60) {
        if (t.parachutes > 0) t.parachutes -= 1;
        else applyDamage(t, Math.round((fall - 60) / 4));
      }
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

/** Pay out cash at the end of a round: survival + health + a win bonus. */
export function awardCash(s: GameState): void {
  if (!s.economy) return;
  for (const t of s.tanks) {
    let earned = 1000; // participation
    if (t.alive) earned += 2000 + Math.round(t.health * 15);
    if (t.id === s.winnerId) earned += 6000;
    t.cash += earned;
  }
}

/** Finish a round: credit the win and pay out cash. */
export function endRound(s: GameState): void {
  awardRound(s);
  awardCash(s);
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

/** Advance to the next living tank (following the round's play order) and,
 *  when wind is 'changing', roll fresh wind. */
export function nextTurn(s: GameState): void {
  if (checkOver(s)) return;
  const order = s.order.length === s.tanks.length ? s.order : s.tanks.map((_, i) => i);
  const pos = Math.max(0, order.indexOf(s.turn));
  for (let i = 1; i <= order.length; i++) {
    const cand = order[(pos + i) % order.length];
    if (s.tanks[cand]?.alive) { s.turn = cand; break; }
  }
  if (s.settings.wind === 'changing') {
    s.wind = windFor(s.seed, (s.wind * 1000 + Date.now()) | 0, s.windMax);
  }
  s.phase = 'aim';
}

/** A compact, JSON-safe snapshot the active player broadcasts as the
 *  authoritative post-shot state (terrain packed as rounded ints). */
export interface Snapshot {
  terrain: number[]; structures: Structure[]; tanks: Tank[];
  turn: number; wind: number; gravity: number; windMax: number;
  settings: GameSettings; round: number; scores: Record<string, number>;
  order?: number[]; economy?: boolean;
  phase: GameState['phase']; winnerId: string | null;
}
export function snapshot(s: GameState): Snapshot {
  return {
    terrain: s.terrain.map(v => Math.round(v)),
    structures: s.structures.map(st => ({ ...st })),
    tanks: s.tanks.map(t => ({ ...t })),
    turn: s.turn, wind: s.wind, gravity: s.gravity, windMax: s.windMax,
    settings: s.settings, round: s.round, scores: { ...s.scores },
    order: s.order.slice(), economy: s.economy,
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
  if (snap.order) s.order = snap.order.slice();
  if (typeof snap.economy === 'boolean') s.economy = snap.economy;
  s.phase = snap.phase; s.winnerId = snap.winnerId;
}
