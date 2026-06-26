// ============================================================================
// Void Protocol — Combat Engine
// Orchestrates a single puzzle battle: turns, the three actions, cascade
// resolution, damage, enemy abilities and win/loss. Emits step events so the
// UI layer can animate. Pure logic — no DOM.
// ============================================================================

import {
  ACTIONS_PER_TURN, ELEMENTS, EFFECTIVENESS, BASE_MATCH_DAMAGE,
  CHAIN_MULTIPLIER_STEP, COMBO_SIZE_BONUS, MIN_MATCH, ENEMIES,
} from './config.js';
import { Grid } from './grid.js';

export class Combat {
  // loadoutStats: { dmgMult, extraAction, maxHp, elementBonus }
  constructor(enemyId, loadoutStats = {}, rng = Math.random) {
    const def = ENEMIES[enemyId];
    if (!def) throw new Error('unknown enemy ' + enemyId);
    this.enemyDef = def;
    this.stats = Object.assign({ dmgMult: 0, extraAction: 0, maxHp: 0, elementBonus: {} }, loadoutStats);
    this.rng = rng;

    this.grid = new Grid(undefined, rng);

    this.player = {
      maxHp: 100 + (this.stats.maxHp || 0),
      hp: 100 + (this.stats.maxHp || 0),
    };
    this.enemy = {
      maxHp: def.hp,
      hp: def.hp,
      attack: def.attack,
      shieldElement: null,        // element currently blocked
      gravityLocked: 0,           // turns gravity shift is disabled
      timeWarp: def.abilities.some(a => a.kind === 'timeWarp'),
    };
    this._applyShield();

    this.actionsPerTurn = ACTIONS_PER_TURN + (this.stats.extraAction || 0);
    this.actionsLeft = this.actionsPerTurn;
    this.turn = 1;
    this.over = false;
    this.result = null;          // 'win' | 'lose'
    this.history = [];           // snapshots for Time Manipulation (rewind)
    this.timeUsedThisTurn = false;
    this.log = [];
    this._gravLockCounter = 0;
  }

  _applyShield() {
    const shield = this.enemyDef.abilities.find(a => a.kind === 'shield');
    this.enemy.shieldElement = shield ? shield.element : null;
  }

  // --- Damage model -------------------------------------------------------
  // groups cleared in one cascade step at chain level `chain` (0-based).
  _scoreGroups(groups, chain) {
    const chainMult = 1 + chain * CHAIN_MULTIPLIER_STEP;
    let total = 0;
    const perGroup = [];
    for (const g of groups) {
      if (this.enemy.shieldElement === g.element) {
        perGroup.push({ element: g.element, damage: 0, blocked: true, size: g.cells.length });
        continue;
      }
      const el = ELEMENTS[g.element];
      const size = g.cells.length;
      const sizeBonus = 1 + Math.max(0, size - MIN_MATCH) * COMBO_SIZE_BONUS;
      let dmg = (BASE_MATCH_DAMAGE * size + el.power) * sizeBonus * chainMult;
      // element weight: heavier tiles hit harder
      dmg *= 1 + (el.weight - 1) * 0.08;
      // effectiveness vs enemy type
      const eff = (EFFECTIVENESS[g.element] || {})[this.enemyDef.type] || 1;
      dmg *= eff;
      // loadout bonuses
      dmg *= 1 + (this.stats.dmgMult || 0);
      dmg *= 1 + ((this.stats.elementBonus || {})[g.element] || 0);
      dmg = Math.round(dmg);
      total += dmg;
      perGroup.push({ element: g.element, damage: dmg, blocked: false, size, eff });
    }
    return { total, perGroup, chainMult };
  }

  // Resolve all cascades after a board transform. Returns a list of step
  // events for animation and the total damage dealt.
  // applyAfterClear(grid) is the refill behaviour between cascades:
  //   gravity action -> grid.gravity(dir); collapse action -> grid.collapse(dir)
  _resolve(refill) {
    const steps = [];
    let totalDamage = 0;
    let chain = 0;
    while (true) {
      const groups = this.grid.findMatches();
      if (groups.length === 0) break;
      const scored = this._scoreGroups(groups, chain);
      totalDamage += scored.total;
      steps.push({
        type: 'clear', groups: groups.map(g => ({ element: g.element, cells: g.cells })),
        scored, chain, board: this.grid.snapshot(),
      });
      this.grid.clearGroups(groups);
      const moved = refill();           // settle + (maybe) refill
      steps.push({ type: 'settle', board: this.grid.snapshot() });
      chain++;
      if (!moved && this.grid.findMatches().length === 0) break;
      if (chain > 20) break;            // safety
    }
    return { steps, totalDamage };
  }

  _pushHistory() {
    this.history.push({
      board: this.grid.snapshot(),
      enemyHp: this.enemy.hp,
      playerHp: this.player.hp,
      actionsLeft: this.actionsLeft,
    });
    if (this.history.length > 12) this.history.shift();
  }

  // --- Public actions -----------------------------------------------------
  // Each returns { ok, steps, damage, reason }.
  canGravity() { return !this.over && this.actionsLeft > 0 && this.enemy.gravityLocked === 0; }
  canCollapse() { return !this.over && this.actionsLeft > 0; }
  canTime() { return !this.over && this.actionsLeft > 0 && this.history.length > 0 && !this.enemy.timeWarp && !this.timeUsedThisTurn; }

  gravityShift(dir) {
    if (this.over) return { ok: false, reason: 'Battle over' };
    if (this.actionsLeft <= 0) return { ok: false, reason: 'No actions left' };
    if (this.enemy.gravityLocked > 0) return { ok: false, reason: 'Gravity locked!' };
    this._pushHistory();
    // The action conveyors a fresh line of tiles in from `dir`, sliding the
    // board along; cleared holes during cascades then refill in `dir`.
    this.grid.conveyor(dir);
    const { steps, totalDamage } = this._resolve(() => this.grid.gravity(dir));
    this._afterAction(`Gravity ${dir.toUpperCase()}`, totalDamage);
    return { ok: true, steps, damage: totalDamage, action: 'gravity', dir };
  }

  spaceCollapse(dir) {
    if (this.over) return { ok: false, reason: 'Battle over' };
    if (this.actionsLeft <= 0) return { ok: false, reason: 'No actions left' };
    this._pushHistory();
    this.grid.collapse(dir);
    // After collapse, cascades also collapse (no refill) so the board keeps
    // tightening. If the board nearly empties, top it up so play continues.
    const { steps, totalDamage } = this._resolve(() => this.grid.collapse(dir));
    if (this.grid.tileCount() < this.grid.size * 2) {
      this.grid.gravity('down');
      steps.push({ type: 'settle', board: this.grid.snapshot() });
    }
    this._afterAction(`Collapse ${dir.toUpperCase()}`, totalDamage);
    return { ok: true, steps, damage: totalDamage, action: 'collapse', dir };
  }

  timeRewind() {
    if (this.over) return { ok: false, reason: 'Battle over' };
    if (this.enemy.timeWarp) return { ok: false, reason: 'Time is warped — rewind disabled' };
    if (this.timeUsedThisTurn) return { ok: false, reason: 'Already rewound this turn' };
    if (this.history.length === 0) return { ok: false, reason: 'Nothing to rewind' };
    if (this.actionsLeft <= 0) return { ok: false, reason: 'No actions left' };
    const prev = this.history.pop();
    this.grid.restore(prev.board);
    this.enemy.hp = prev.enemyHp;
    this.player.hp = prev.playerHp;
    // Rewind refunds the rewound action but costs the time action: net is
    // restoring the previous actionsLeft, then spending one for the rewind.
    this.actionsLeft = prev.actionsLeft - 1;
    this.timeUsedThisTurn = true;
    this.log.push('⏳ Time rewound.');
    return { ok: true, steps: [{ type: 'settle', board: this.grid.snapshot() }], damage: 0, action: 'time' };
  }

  _afterAction(label, damage) {
    if (damage > 0) {
      this.enemy.hp = Math.max(0, this.enemy.hp - damage);
      this.log.push(`${label}: ${damage} dmg`);
    } else {
      this.log.push(`${label}: no match`);
    }
    this.actionsLeft--;
    if (this.enemy.hp <= 0) { this.over = true; this.result = 'win'; return; }
    // Turn-ending is driven by the UI so enemy-turn events can be animated.
  }

  // Enemy turn + start of next player turn. Public so a player can also end
  // the turn early.
  endTurn() {
    if (this.over) return { events: [] };
    const events = [];

    // Spawner ability: convert a random tile.
    for (const ab of this.enemyDef.abilities) {
      if (ab.kind === 'spawner') {
        const i = Math.floor(this.rng() * this.grid.cells.length);
        if (this.grid.cells[i] !== null) {
          this.grid.cells[i] = ab.element;
          events.push({ type: 'spawn', element: ab.element });
        }
      }
    }

    // Gravity lock ability: periodically lock gravity shift.
    const gl = this.enemyDef.abilities.find(a => a.kind === 'gravityLock');
    if (gl) {
      this._gravLockCounter++;
      if (this._gravLockCounter % (gl.cooldown + 1) === 0) {
        this.enemy.gravityLocked = gl.cooldown;
        events.push({ type: 'gravityLock', turns: gl.cooldown });
      }
    }

    // Enemy attack.
    const dmg = this.enemy.attack;
    this.player.hp = Math.max(0, this.player.hp - dmg);
    events.push({ type: 'attack', damage: dmg });
    this.log.push(`${this.enemyDef.name} hits for ${dmg}`);

    if (this.player.hp <= 0) {
      this.over = true; this.result = 'lose';
      return { events, over: true, result: 'lose' };
    }

    // Tick down statuses, start next turn.
    if (this.enemy.gravityLocked > 0) this.enemy.gravityLocked--;
    this.turn++;
    this.actionsLeft = this.actionsPerTurn;
    this.timeUsedThisTurn = false;
    this.history = [];
    return { events, over: false };
  }
}
