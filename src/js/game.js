// ============================================================================
// Void Protocol — Game State
// Player profile, currency, inventory/loadout, overworld progress and XP.
// Persists to localStorage so progress survives reloads.
// ============================================================================

import {
  SLOTS, GEAR_POOL, START_SHARDS, START_CRYSTALS, ZONES, RARITY,
} from './config.js';

const SAVE_KEY = 'voidprotocol.save.v1';

function newProfile() {
  return {
    name: 'Operative',
    level: 1,
    xp: 0,
    shards: START_SHARDS,
    crystals: START_CRYSTALS,
    inventory: [],            // array of gear instance ids referencing GEAR_POOL
    equipped: {},             // slot -> gear id
    keys: [],                 // owned door keys
    cleared: [],              // overworld node ids cleared
    unlockedZones: [ZONES[0].id],
    settings: { music: 70, sfx: 80, particles: true, shake: true },
  };
}

export class Game {
  constructor() {
    this.profile = this._load() || newProfile();
    // Always make sure the starter zone is unlocked.
    if (!this.profile.unlockedZones.includes(ZONES[0].id)) {
      this.profile.unlockedZones.push(ZONES[0].id);
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.profile)); } catch {}
  }
  reset() {
    this.profile = newProfile();
    this.save();
  }

  // --- Currency -----------------------------------------------------------
  addShards(n) { this.profile.shards += n; this.save(); }
  addCrystals(n) { this.profile.crystals += n; this.save(); }
  spendShards(n) {
    if (this.profile.shards < n) return false;
    this.profile.shards -= n; this.save(); return true;
  }
  spendCrystals(n) {
    if (this.profile.crystals < n) return false;
    this.profile.crystals -= n; this.save(); return true;
  }

  // --- XP / Level ---------------------------------------------------------
  xpForLevel(lvl) { return 100 + (lvl - 1) * 60; }
  addXp(n) {
    this.profile.xp += n;
    let leveled = 0;
    while (this.profile.xp >= this.xpForLevel(this.profile.level)) {
      this.profile.xp -= this.xpForLevel(this.profile.level);
      this.profile.level++;
      leveled++;
    }
    this.save();
    return leveled;
  }

  // --- Inventory / Loadout ------------------------------------------------
  gearDef(id) { return GEAR_POOL.find(g => g.id === id); }

  grantRandomGear() {
    const g = GEAR_POOL[Math.floor(Math.random() * GEAR_POOL.length)];
    this.profile.inventory.push(g.id);
    this.save();
    return g;
  }
  grantGear(id) {
    if (!this.gearDef(id)) return null;
    this.profile.inventory.push(id);
    this.save();
    return this.gearDef(id);
  }

  equip(gearId) {
    const def = this.gearDef(gearId);
    if (!def) return false;
    // accessory items can go in either accessory slot
    let slot = def.slot;
    if (slot === 'accessory1' || slot === 'accessory2' || def.slot === 'accessory') {
      slot = !this.profile.equipped.accessory1 ? 'accessory1'
           : !this.profile.equipped.accessory2 ? 'accessory2'
           : 'accessory1';
    }
    this.profile.equipped[slot] = gearId;
    this.save();
    return true;
  }
  unequip(slot) {
    delete this.profile.equipped[slot];
    this.save();
  }

  // Aggregate equipped gear into combat stats.
  loadoutStats() {
    const stats = { dmgMult: 0, extraAction: 0, maxHp: 0, elementBonus: {} };
    for (const slot of SLOTS) {
      const id = this.profile.equipped[slot];
      if (!id) continue;
      const def = this.gearDef(id);
      if (!def) continue;
      const s = def.stats || {};
      stats.dmgMult += s.dmgMult || 0;
      stats.extraAction += s.extraAction || 0;
      stats.maxHp += s.maxHp || 0;
      if (s.elementBonus) {
        for (const [k, v] of Object.entries(s.elementBonus)) {
          stats.elementBonus[k] = (stats.elementBonus[k] || 0) + v;
        }
      }
    }
    return stats;
  }

  // --- Overworld ----------------------------------------------------------
  isCleared(nodeId) { return this.profile.cleared.includes(nodeId); }
  hasKey(key) { return this.profile.keys.includes(key); }

  clearNode(node) {
    if (!this.isCleared(node.id)) this.profile.cleared.push(node.id);
    if (node.drops && !this.hasKey(node.drops)) this.profile.keys.push(node.drops);
    if (node.kind === 'boss') {
      // Clearing a zone boss unlocks the next zone.
      const zi = ZONES.findIndex(z => z.nodes.some(n => n.id === node.id));
      if (zi >= 0 && zi + 1 < ZONES.length) {
        const next = ZONES[zi + 1].id;
        if (!this.profile.unlockedZones.includes(next)) this.profile.unlockedZones.push(next);
      }
    }
    this.save();
  }

  // Can the player attempt this node? (door/lock gating)
  nodeAvailable(node) {
    if (node.locked && !this.hasKey(node.locked)) return false;
    return true;
  }
}

export { RARITY, SLOTS };
