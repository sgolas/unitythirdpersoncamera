// ============================================================================
// Void Protocol — Game Configuration
// Central data definitions for elements, enemies, gear and tunable constants.
// ============================================================================

export const GRID_SIZE = 5;            // 5x5 battle grid
export const ACTIONS_PER_TURN = 3;     // player gets 3 actions per turn
export const MIN_MATCH = 3;            // match 3+ to score

// --- Elements -------------------------------------------------------------
// Each element has a colour, a glyph, a "weight" (heavier = more fall damage)
// and a base power used in damage calculation.
export const ELEMENTS = {
  fire:    { id: 'fire',    name: 'Fire',    glyph: '🔥', color: '#ff5a3c', weight: 2, power: 12 },
  ice:     { id: 'ice',     name: 'Ice',     glyph: '❄',  color: '#46d6ff', weight: 2, power: 11 },
  void:    { id: 'void',    name: 'Void',    glyph: '🌀', color: '#a45cff', weight: 3, power: 14 },
  energy:  { id: 'energy',  name: 'Energy',  glyph: '⚡', color: '#5cff9e', weight: 1, power: 10 },
  time:    { id: 'time',    name: 'Time',    glyph: '⏳', color: '#ffd24a', weight: 1, power: 10 },
  gravity: { id: 'gravity', name: 'Gravity', glyph: '🪐', color: '#ff5ca8', weight: 4, power: 16 },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS);

// Elemental effectiveness: attacker element -> { enemyType: multiplier }
// Anything unlisted is neutral (1x).
export const EFFECTIVENESS = {
  fire:    { ice: 2.0, organic: 1.5, machine: 0.75 },
  ice:     { fire: 0.75, machine: 1.5, organic: 1.5 },
  void:    { machine: 2.0, spectral: 1.5 },
  energy:  { machine: 2.0, organic: 0.75 },
  time:    { spectral: 2.0, organic: 1.25 },
  gravity: { organic: 2.0, machine: 1.25, spectral: 0.75 },
};

// --- Damage tuning --------------------------------------------------------
export const BASE_MATCH_DAMAGE = 8;        // flat damage per cleared tile
export const CHAIN_MULTIPLIER_STEP = 0.5;  // each cascade adds +0.5x
export const COMBO_SIZE_BONUS = 0.35;      // each tile beyond MIN_MATCH adds bonus

// --- Enemies --------------------------------------------------------------
// Abilities:
//   shield:      blocks one element each turn (matches of it deal no damage)
//   spawner:     converts a random tile to its favoured element each turn
//   gravityLock: blocks Gravity Shift for `cooldown` turns periodically
//   timeWarp:    disables Time Manipulation
export const ENEMIES = {
  drone: {
    id: 'drone', name: 'Recon Drone', type: 'machine', sprite: '🤖',
    hp: 90, attack: 8, abilities: [],
    aura: false,
  },
  sentinel: {
    id: 'sentinel', name: 'Bunker Sentinel', type: 'machine', sprite: '🛡️',
    hp: 140, attack: 11, abilities: [{ kind: 'shield', element: 'energy' }],
    aura: false,
  },
  crawler: {
    id: 'crawler', name: 'Void Crawler', type: 'organic', sprite: '🦂',
    hp: 120, attack: 13, abilities: [{ kind: 'spawner', element: 'void' }],
    aura: false,
  },
  wraith: {
    id: 'wraith', name: 'Chrono Wraith', type: 'spectral', sprite: '👻',
    hp: 130, attack: 12, abilities: [{ kind: 'timeWarp' }],
    aura: false,
  },
  warden: {
    id: 'warden', name: 'Gravity Warden', type: 'machine', sprite: '👁️',
    hp: 170, attack: 14, abilities: [{ kind: 'gravityLock', cooldown: 2 }],
    aura: true,
  },
  // Boss
  overseer: {
    id: 'overseer', name: 'The Overseer', type: 'spectral', sprite: '💀',
    hp: 320, attack: 16, boss: true, aura: true,
    abilities: [
      { kind: 'shield', element: 'void' },
      { kind: 'spawner', element: 'time' },
    ],
  },
};

// --- Gear ------------------------------------------------------------------
export const RARITY = {
  common:    { name: 'Common',    color: '#9aa0a6' },
  uncommon:  { name: 'Uncommon',  color: '#5cff9e' },
  rare:      { name: 'Rare',      color: '#46d6ff' },
  epic:      { name: 'Epic',      color: '#a45cff' },
  legendary: { name: 'Legendary', color: '#ffb000' },
};

export const SLOTS = ['helmet', 'body', 'gloves', 'boots', 'weapon', 'accessory1', 'accessory2'];

// stat keys: dmgMult (damage %), extraAction (bonus actions), maxHp, elementBonus {id: mult}
export const GEAR_POOL = [
  { id: 'g_visor',    name: 'Neon Visor',       slot: 'helmet', rarity: 'common',   icon: '🥽', stats: { maxHp: 10 } },
  { id: 'g_helm',     name: 'Sentinel Helm',    slot: 'helmet', rarity: 'rare',     icon: '⛑️', stats: { maxHp: 25, dmgMult: 0.05 } },
  { id: 'g_vest',     name: 'Scrap Vest',       slot: 'body',   rarity: 'common',   icon: '🦺', stats: { maxHp: 20 } },
  { id: 'g_carapace', name: 'Void Carapace',    slot: 'body',   rarity: 'epic',     icon: '🪖', stats: { maxHp: 60, dmgMult: 0.1 } },
  { id: 'g_gloves',   name: 'Servo Gloves',     slot: 'gloves', rarity: 'uncommon', icon: '🧤', stats: { dmgMult: 0.08 } },
  { id: 'g_boots',    name: 'Mag Boots',        slot: 'boots',  rarity: 'uncommon', icon: '🥾', stats: { maxHp: 15, dmgMult: 0.04 } },
  { id: 'g_blade',    name: 'Plasma Edge',      slot: 'weapon', rarity: 'rare',     icon: '🗡️', stats: { dmgMult: 0.18 } },
  { id: 'g_railgun',  name: 'Singularity Gun',  slot: 'weapon', rarity: 'legendary',icon: '🔫', stats: { dmgMult: 0.3, elementBonus: { gravity: 0.5 } } },
  { id: 'g_core',     name: 'Chrono Core',      slot: 'accessory1', rarity: 'epic', icon: '💠', stats: { extraAction: 1 } },
  { id: 'g_amp',      name: 'Flux Amplifier',   slot: 'accessory2', rarity: 'rare', icon: '🔆', stats: { elementBonus: { energy: 0.4, time: 0.4 } } },
];

// --- Overworld zones ------------------------------------------------------
// Each node placed on a percentage grid (x,y in 0..100). `links` define paths.
export const ZONES = [
  {
    id: 'ruined_city', name: 'Outdoor Ruined City', tone: 'Expansive, desolate',
    bg: 'ruined',
    nodes: [
      { id: 'rc_start', x: 12, y: 78, kind: 'start', label: 'Landing Zone' },
      { id: 'rc_1', x: 30, y: 62, kind: 'enemy', enemy: 'drone', reward: 40 },
      { id: 'rc_2', x: 48, y: 74, kind: 'enemy', enemy: 'crawler', reward: 55, gear: true },
      { id: 'rc_lock', x: 50, y: 45, kind: 'door', label: 'Sealed Gate', key: 'rc_key' },
      { id: 'rc_3', x: 68, y: 55, kind: 'enemy', enemy: 'sentinel', reward: 60, drops: 'rc_key' },
      { id: 'rc_terminal', x: 32, y: 38, kind: 'terminal', label: 'Old Terminal',
        lore: 'LOG 0x1A — "The Protocol was never meant to wake. It dreams in the void between seconds."' },
      { id: 'rc_boss', x: 84, y: 30, kind: 'boss', enemy: 'warden', reward: 120, gear: true, locked: 'rc_key' },
    ],
    links: [
      ['rc_start', 'rc_1'], ['rc_1', 'rc_2'], ['rc_1', 'rc_terminal'],
      ['rc_2', 'rc_lock'], ['rc_2', 'rc_3'], ['rc_lock', 'rc_boss'], ['rc_3', 'rc_boss'],
    ],
  },
  {
    id: 'deep_dungeon', name: 'Deep Dungeon', tone: 'Dark, atmospheric',
    bg: 'dungeon',
    nodes: [
      { id: 'dd_start', x: 14, y: 80, kind: 'start', label: 'Descent' },
      { id: 'dd_1', x: 34, y: 66, kind: 'enemy', enemy: 'wraith', reward: 70 },
      { id: 'dd_2', x: 52, y: 50, kind: 'enemy', enemy: 'warden', reward: 90, gear: true },
      { id: 'dd_boss', x: 80, y: 26, kind: 'boss', enemy: 'overseer', reward: 250, gear: true },
    ],
    links: [['dd_start', 'dd_1'], ['dd_1', 'dd_2'], ['dd_2', 'dd_boss']],
  },
];

// Starting economy
export const START_SHARDS = 0;
export const START_CRYSTALS = 25;
