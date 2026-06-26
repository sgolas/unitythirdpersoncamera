// ============================================================================
// Void Protocol — UI Layer
// DOM rendering and interaction for every screen. Drives the Combat engine
// and animates its step events. Mobile-first.
// ============================================================================

import {
  ELEMENTS, ENEMIES, ZONES, SLOTS, RARITY, GEAR_POOL, GRID_SIZE,
} from './config.js';
import { Combat } from './combat.js';

const DIR_LABEL = { up: '↑', down: '↓', left: '←', right: '→' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export class UI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.screen = 'home';
    this.activeZone = ZONES[0];
    this.combat = null;
    this.busy = false;       // animation lock during battle
  }

  // --- Routing ------------------------------------------------------------
  go(screen, opts = {}) {
    this.screen = screen;
    if (opts.zone) this.activeZone = opts.zone;
    this.render();
  }

  render() {
    const p = this.game.profile;
    let body = '';
    switch (this.screen) {
      case 'home':     body = this.renderHome(); break;
      case 'campaign': body = this.renderCampaign(); break;
      case 'overworld':body = this.renderOverworld(); break;
      case 'battle':   body = this.renderBattle(); break;
      case 'loadout':  body = this.renderLoadout(); break;
      case 'shop':     body = this.renderShop(); break;
      case 'profile':  body = this.renderProfile(); break;
      case 'settings': body = this.renderSettings(); break;
      case 'arena':    body = this.renderStub('Arena', 'PvP matchmaking & seasonal leaderboards are on the roadmap.'); break;
      case 'pass':     body = this.renderStub('Battle Pass', 'Seasonal reward track, daily & weekly quests coming soon.'); break;
      default:         body = this.renderHome();
    }
    this.root.innerHTML = `${this.renderTopBar()}<main class="screen screen-${this.screen}">${body}</main>${this.renderNav()}`;
    this.bind();
    if (this.screen === 'battle') this.mountBattle();
  }

  // --- Chrome -------------------------------------------------------------
  renderTopBar() {
    const p = this.game.profile;
    return `
      <header class="topbar">
        <div class="brand"><span class="logo">◈</span> VOID&nbsp;PROTOCOL</div>
        <div class="currencies">
          <span class="cur shards" title="Void Shards">◇ ${p.shards}</span>
          <span class="cur crystals" title="Chrono Crystals">✦ ${p.crystals}</span>
        </div>
      </header>`;
  }

  renderNav() {
    if (this.screen === 'battle') return '';
    const tabs = [
      ['home', '⌂', 'Home'],
      ['campaign', '⚔', 'Campaign'],
      ['loadout', '🎒', 'Loadout'],
      ['shop', '🛒', 'Shop'],
      ['profile', '☰', 'Profile'],
    ];
    return `<nav class="nav">${tabs.map(([id, ic, label]) =>
      `<button class="nav-btn ${this.screen === id || (id==='campaign'&&this.screen==='overworld') ? 'active' : ''}" data-go="${id}">
        <span class="nav-ic">${ic}</span><span class="nav-lb">${label}</span>
      </button>`).join('')}</nav>`;
  }

  // --- Home ---------------------------------------------------------------
  renderHome() {
    const p = this.game.profile;
    const need = this.game.xpForLevel(p.level);
    const pct = Math.min(100, Math.round((p.xp / need) * 100));
    return `
      <div class="home">
        <div class="home-scene">
          <div class="parallax p1"></div><div class="parallax p2"></div><div class="parallax p3"></div>
          <div class="hero-char">🧑‍🚀</div>
          <div class="hero-rank">LVL ${p.level}</div>
        </div>
        <div class="home-info">
          <h1>${p.name}</h1>
          <div class="xpbar"><div class="xpbar-fill" style="width:${pct}%"></div><span>${p.xp} / ${need} XP</span></div>
        </div>
        <div class="home-actions">
          <button class="btn primary big" data-go="campaign">▶ Continue Campaign</button>
          <div class="home-grid">
            <button class="btn" data-go="loadout">🎒 Loadout</button>
            <button class="btn" data-go="arena">⚔ Arena</button>
            <button class="btn" data-go="shop">🛒 Shop</button>
            <button class="btn" data-go="pass">🎟 Battle Pass</button>
            <button class="btn" data-go="profile">☰ Profile</button>
            <button class="btn" data-go="settings">⚙ Settings</button>
          </div>
        </div>
      </div>`;
  }

  // --- Campaign (zone select) --------------------------------------------
  renderCampaign() {
    const p = this.game.profile;
    const cards = ZONES.map(z => {
      const unlocked = p.unlockedZones.includes(z.id);
      const total = z.nodes.filter(n => n.kind === 'enemy' || n.kind === 'boss').length;
      const done = z.nodes.filter(n => (n.kind === 'enemy' || n.kind === 'boss') && this.game.isCleared(n.id)).length;
      return `
        <button class="zone-card ${unlocked ? '' : 'locked'} bg-${z.bg}" ${unlocked ? `data-zone="${z.id}"` : ''}>
          <div class="zone-name">${z.name}</div>
          <div class="zone-tone">${z.tone}</div>
          <div class="zone-progress">${unlocked ? `${done}/${total} cleared` : '🔒 Locked — clear previous zone'}</div>
        </button>`;
    }).join('');
    return `<div class="panel"><h2>Campaign — Zone Select</h2><div class="zone-list">${cards}</div></div>`;
  }

  // --- Overworld ----------------------------------------------------------
  renderOverworld() {
    const z = this.activeZone;
    const reachable = this._reachableNodes(z);
    const links = z.links.map(([a, b]) => {
      const na = z.nodes.find(n => n.id === a), nb = z.nodes.find(n => n.id === b);
      const on = reachable.has(a) || reachable.has(b);
      return `<line x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}" class="path ${on ? 'live' : ''}" />`;
    }).join('');

    const nodes = z.nodes.map(n => {
      const cleared = this.game.isCleared(n.id);
      const reach = reachable.has(n.id);
      const avail = this.game.nodeAvailable(n);
      let icon = '◆', cls = 'node';
      if (n.kind === 'start') { icon = '⚑'; cls += ' start'; }
      else if (n.kind === 'enemy') { icon = ENEMIES[n.enemy].sprite; cls += ' enemy'; }
      else if (n.kind === 'boss') { icon = ENEMIES[n.enemy].sprite; cls += ' boss'; }
      else if (n.kind === 'terminal') { icon = '🖥️'; cls += ' terminal'; }
      else if (n.kind === 'door') { icon = this.game.hasKey(n.key) ? '🔓' : '🔒'; cls += ' door'; }
      if (cleared) cls += ' cleared';
      if (!reach) cls += ' faded';
      if (ENEMIES[n.enemy]?.aura) cls += ' aura';
      const interactive = reach && (n.kind === 'enemy' || n.kind === 'boss' || n.kind === 'terminal');
      return `<button class="${cls}" style="left:${n.x}%;top:${n.y}%" ${interactive ? `data-node="${n.id}"` : 'disabled'}>
          <span class="node-ic">${icon}</span>
          <span class="node-lb">${n.label || ENEMIES[n.enemy]?.name || ''}</span>
          ${cleared ? '<span class="node-check">✓</span>' : ''}
        </button>`;
    }).join('');

    return `
      <div class="overworld bg-${z.bg}">
        <div class="ow-head">
          <button class="btn ghost" data-go="campaign">‹ Zones</button>
          <span class="ow-title">${z.name}</span>
        </div>
        <div class="ow-map">
          <svg class="ow-paths" viewBox="0 0 100 100" preserveAspectRatio="none">${links}</svg>
          ${nodes}
        </div>
        <div class="ow-hint">Tap a lit node to engage. Defeat foes for Void Shards, gear and keys.</div>
      </div>`;
  }

  // Nodes reachable = start + neighbours of any cleared/start node, gated by locks.
  _reachableNodes(z) {
    const reach = new Set();
    const adj = {};
    for (const n of z.nodes) adj[n.id] = [];
    for (const [a, b] of z.links) { adj[a].push(b); adj[b].push(a); }
    const starts = z.nodes.filter(n => n.kind === 'start').map(n => n.id);
    const queue = [...starts];
    starts.forEach(s => reach.add(s));
    while (queue.length) {
      const id = queue.shift();
      const node = z.nodes.find(n => n.id === id);
      const passable = node.kind === 'start' || node.kind === 'terminal' || node.kind === 'door' || this.game.isCleared(id);
      // A door is passable only with its key.
      const doorOk = node.kind !== 'door' || this.game.hasKey(node.key);
      if (!passable || !doorOk) continue;
      for (const nb of adj[id]) {
        const nbNode = z.nodes.find(n => n.id === nb);
        if (!this.game.nodeAvailable(nbNode)) continue;
        if (!reach.has(nb)) { reach.add(nb); queue.push(nb); }
      }
    }
    return reach;
  }

  // --- Battle -------------------------------------------------------------
  startBattle(enemyId, node) {
    this.pendingNode = node;
    this.combat = new Combat(enemyId, this.game.loadoutStats());
    this.go('battle');
  }

  renderBattle() {
    const c = this.combat;
    const e = c.enemyDef;
    return `
      <div class="battle">
        <div class="battle-top">
          <button class="btn ghost small" id="flee">‹ Flee</button>
          <div class="turn-pill">Turn ${c.turn}</div>
        </div>
        <div class="enemy-area">
          <div class="enemy-portrait ${e.aura ? 'aura' : ''} ${e.boss ? 'boss' : ''}">${e.sprite}</div>
          <div class="enemy-meta">
            <div class="enemy-name">${e.name} <span class="etype">${e.type}</span></div>
            ${this.hpBar('enemy', c.enemy.hp, c.enemy.maxHp)}
            <div class="enemy-tags" id="enemy-tags">${this.enemyTags(c)}</div>
          </div>
        </div>
        <div class="grid-wrap">
          <div class="grid" id="grid" style="grid-template-columns:repeat(${GRID_SIZE},1fr)"></div>
          <div class="floater" id="floater"></div>
        </div>
        <div class="player-bar">
          ${this.hpBar('player', c.player.hp, c.player.maxHp)}
          <div class="actions-left" id="actions-left"></div>
        </div>
        <div class="action-deck" id="deck"></div>
        <div class="battle-log" id="log"></div>
      </div>`;
  }

  hpBar(who, hp, max) {
    const pct = Math.max(0, Math.round((hp / max) * 100));
    return `<div class="hpbar ${who}"><div class="hpbar-fill" style="width:${pct}%"></div>
      <span class="hpbar-label">${hp} / ${max}</span></div>`;
  }

  enemyTags(c) {
    const tags = [];
    if (c.enemy.shieldElement) tags.push(`<span class="tag shield">🛡 blocks ${ELEMENTS[c.enemy.shieldElement].glyph}</span>`);
    if (c.enemy.timeWarp) tags.push(`<span class="tag warp">⏳ time-warped</span>`);
    if (c.enemy.gravityLocked > 0) tags.push(`<span class="tag lock">🪐 gravity locked ${c.enemy.gravityLocked}</span>`);
    if (c.enemyDef.abilities.some(a => a.kind === 'spawner')) tags.push(`<span class="tag spawn">+ spawns tiles</span>`);
    return tags.join('');
  }

  mountBattle() {
    this.drawGrid();
    this.drawDeck();
    this.updateActionsLeft();
    this.drawLog();
    document.getElementById('flee').onclick = () => {
      if (confirm('Flee the battle? No rewards.')) this.go('overworld');
    };
  }

  drawGrid(board) {
    const g = document.getElementById('grid');
    if (!g) return;
    const cells = board || this.combat.grid.snapshot();
    g.innerHTML = cells.map((el, i) => {
      if (el === null) return `<div class="tile empty" data-i="${i}"></div>`;
      const E = ELEMENTS[el];
      return `<div class="tile el-${el}" data-i="${i}" style="--tcol:${E.color}"><span>${E.glyph}</span></div>`;
    }).join('');
  }

  drawDeck() {
    const c = this.combat;
    const deck = document.getElementById('deck');
    if (!deck) return;
    const dirBtns = (action, enabled) => ['up','down','left','right'].map(d =>
      `<button class="dirbtn" data-act="${action}" data-dir="${d}" ${enabled ? '' : 'disabled'}>${DIR_LABEL[d]}</button>`
    ).join('');
    deck.innerHTML = `
      <div class="card grav ${c.canGravity() ? '' : 'disabled'}">
        <div class="card-h">🪐 Gravity Shift</div>
        <div class="dirpad">${dirBtns('gravity', c.canGravity())}</div>
      </div>
      <div class="card coll ${c.canCollapse() ? '' : 'disabled'}">
        <div class="card-h">🌀 Space Collapse</div>
        <div class="dirpad">${dirBtns('collapse', c.canCollapse())}</div>
      </div>
      <div class="card time ${c.canTime() ? '' : 'disabled'}">
        <div class="card-h">⏳ Time Rewind</div>
        <button class="timebtn" data-act="time" ${c.canTime() ? '' : 'disabled'}>Rewind last move</button>
        <button class="endbtn" data-act="end">End Turn ⏭</button>
      </div>`;
    deck.querySelectorAll('[data-act]').forEach(btn => {
      btn.onclick = () => this.onAction(btn.dataset.act, btn.dataset.dir);
    });
  }

  updateActionsLeft() {
    const el = document.getElementById('actions-left');
    if (!el) return;
    const c = this.combat;
    let pips = '';
    for (let i = 0; i < c.actionsPerTurn; i++) {
      pips += `<span class="pip ${i < c.actionsLeft ? 'on' : ''}"></span>`;
    }
    el.innerHTML = `<span class="pip-label">Actions</span>${pips}`;
  }

  drawLog() {
    const el = document.getElementById('log');
    if (!el) return;
    el.innerHTML = this.combat.log.slice(-4).map(l => `<div>${l}</div>`).join('');
  }

  async onAction(act, dir) {
    if (this.busy || this.combat.over) return;
    this.busy = true;
    this.drawDeck(); // disables during animation via busy guard below
    let res;
    if (act === 'gravity') res = this.combat.gravityShift(dir);
    else if (act === 'collapse') res = this.combat.spaceCollapse(dir);
    else if (act === 'time') res = this.combat.timeRewind();
    else if (act === 'end') {
      const ev = this.combat.endTurn();
      await this.animateEnemy(ev);
      this.busy = false;
      this.refreshBattle();
      this.checkBattleEnd();
      return;
    }

    if (!res.ok) {
      this.toast(res.reason);
      this.busy = false;
      this.drawDeck();
      return;
    }

    await this.animateSteps(res.steps, res.damage);

    // If the player's action used the last action, the engine auto-ran the
    // enemy turn inside _afterAction via _checkEndTurn -> endTurn? No: engine
    // only flags. We run enemy turn here when actions hit 0.
    this.refreshBattle();
    if (!this.combat.over && this.combat.actionsLeft <= 0) {
      const ev = this.combat.endTurn();
      await sleep(250);
      await this.animateEnemy(ev);
      this.refreshBattle();
    }
    this.busy = false;
    this.refreshBattle();
    this.checkBattleEnd();
  }

  async animateSteps(steps, totalDamage) {
    for (const step of steps) {
      if (step.type === 'clear') {
        // flash cleared cells on the pre-clear board
        this.drawGrid(step.board);
        const grid = document.getElementById('grid');
        for (const g of step.groups) {
          for (const [x, y] of g.cells) {
            const cell = grid.children[y * GRID_SIZE + x];
            if (cell) cell.classList.add('clearing');
          }
        }
        if (step.scored.total > 0) {
          this.popDamage(step.scored.total, step.chain);
        } else if (step.scored.perGroup.some(p => p.blocked)) {
          this.popText('BLOCKED', '#ff5a3c');
        }
        await sleep(360);
      } else if (step.type === 'settle') {
        this.drawGrid(step.board);
        await sleep(200);
      }
    }
    this.drawGrid();
    this.refreshBattle();
  }

  async animateEnemy(ev) {
    if (!ev || !ev.events) return;
    const portrait = document.querySelector('.enemy-portrait');
    for (const e of ev.events) {
      if (e.type === 'attack') {
        if (portrait) portrait.classList.add('attack');
        this.shake();
        this.popText(`-${e.damage}`, '#ff4d6d', 'player');
        await sleep(450);
        if (portrait) portrait.classList.remove('attack');
      } else if (e.type === 'spawn') {
        this.popText(`+${ELEMENTS[e.element].glyph}`, ELEMENTS[e.element].color);
        await sleep(300);
      } else if (e.type === 'gravityLock') {
        this.popText('GRAVITY LOCKED', '#ff5ca8');
        await sleep(400);
      }
    }
    this.drawGrid();
  }

  refreshBattle() {
    const c = this.combat;
    // enemy hp
    const ew = document.querySelector('.enemy-area .hpbar');
    if (ew) ew.outerHTML = this.hpBar('enemy', c.enemy.hp, c.enemy.maxHp);
    const pw = document.querySelector('.player-bar .hpbar');
    if (pw) pw.outerHTML = this.hpBar('player', c.player.hp, c.player.maxHp);
    const tags = document.getElementById('enemy-tags');
    if (tags) tags.innerHTML = this.enemyTags(c);
    const turn = document.querySelector('.turn-pill');
    if (turn) turn.textContent = `Turn ${c.turn}`;
    this.updateActionsLeft();
    this.drawDeck();
    this.drawLog();
  }

  checkBattleEnd() {
    const c = this.combat;
    if (!c.over) return;
    if (c.result === 'win') this.onWin();
    else this.onLose();
  }

  onWin() {
    const node = this.pendingNode;
    const g = this.game;
    const reward = node?.reward || 30;
    g.addShards(reward);
    const xp = 40 + (this.combat.enemyDef.boss ? 120 : this.combat.turn * 5);
    const leveled = g.addXp(xp);
    let gearLine = '';
    if (node?.gear) {
      const gear = g.grantRandomGear();
      gearLine = `<div class="reward-gear" style="--rc:${RARITY[gear.rarity].color}">${gear.icon} ${gear.name} <em>${RARITY[gear.rarity].name}</em></div>`;
    }
    if (node) g.clearNode(node);
    let keyLine = node?.drops ? `<div class="reward-key">🔑 Obtained ${node.drops.replace('_', ' ')}</div>` : '';
    let lvlLine = leveled ? `<div class="reward-lvl">⬆ Level up! Now LVL ${g.profile.level}</div>` : '';
    this.overlay(`
      <div class="result win">
        <h2>VICTORY</h2>
        <div class="reward-line">◇ +${reward} Void Shards</div>
        <div class="reward-line">✦ +${xp} XP</div>
        ${gearLine}${keyLine}${lvlLine}
        <button class="btn primary big" id="result-ok">Continue</button>
      </div>`);
    document.getElementById('result-ok').onclick = () => { this.closeOverlay(); this.go('overworld'); };
  }

  onLose() {
    this.overlay(`
      <div class="result lose">
        <h2>DEFEATED</h2>
        <div class="reward-line">The Protocol reclaims you. Regroup and try again.</div>
        <button class="btn primary big" id="result-ok">Retreat</button>
      </div>`);
    document.getElementById('result-ok').onclick = () => { this.closeOverlay(); this.go('overworld'); };
  }

  // --- Loadout ------------------------------------------------------------
  renderLoadout() {
    const p = this.game.profile;
    const stats = this.game.loadoutStats();
    const slotRow = (slot, label) => {
      const id = p.equipped[slot];
      const def = id ? this.game.gearDef(id) : null;
      return `<button class="slot ${def ? 'filled' : ''}" data-slot="${slot}" ${def ? `style="--rc:${RARITY[def.rarity].color}"` : ''}>
        <span class="slot-label">${label}</span>
        <span class="slot-content">${def ? `${def.icon} ${def.name}` : '— empty —'}</span>
      </button>`;
    };
    const inv = p.inventory.length === 0
      ? `<div class="empty-inv">No gear yet — defeat enemies to find loot.</div>`
      : p.inventory.map((id, i) => {
          const def = this.game.gearDef(id);
          const equipped = Object.values(p.equipped).includes(id);
          return `<button class="inv-item ${equipped ? 'equipped' : ''}" data-equip="${id}" style="--rc:${RARITY[def.rarity].color}">
            <span class="inv-ic">${def.icon}</span>
            <span class="inv-name">${def.name}</span>
            <span class="inv-rar">${RARITY[def.rarity].name}</span>
            <span class="inv-slot">${def.slot.replace(/[12]/,'')}</span>
            ${equipped ? '<span class="inv-eq">EQUIPPED</span>' : ''}
          </button>`;
        }).join('');
    return `
      <div class="panel loadout">
        <h2>Loadout</h2>
        <div class="loadout-top">
          <div class="char-model">🧑‍🚀
            ${Object.entries(p.equipped).map(([s,id]) => `<span class="gear-pip">${this.game.gearDef(id)?.icon||''}</span>`).join('')}
          </div>
          <div class="stat-card">
            <div>Damage <b>+${Math.round((stats.dmgMult)*100)}%</b></div>
            <div>Max HP <b>+${stats.maxHp}</b></div>
            <div>Bonus Actions <b>+${stats.extraAction}</b></div>
            <div>Element Bonus <b>${Object.entries(stats.elementBonus).map(([k,v])=>`${ELEMENTS[k].glyph}+${Math.round(v*100)}%`).join(' ')||'—'}</b></div>
          </div>
        </div>
        <div class="slots">
          ${slotRow('helmet','Helmet')}${slotRow('body','Body')}${slotRow('gloves','Gloves')}
          ${slotRow('boots','Boots')}${slotRow('weapon','Weapon')}${slotRow('accessory1','Accessory I')}${slotRow('accessory2','Accessory II')}
        </div>
        <h3>Inventory</h3>
        <div class="inventory">${inv}</div>
      </div>`;
  }

  // --- Shop ---------------------------------------------------------------
  renderShop() {
    const offers = [
      { id: 'g_blade', cost: 120, cur: 'shards' },
      { id: 'g_gloves', cost: 80, cur: 'shards' },
      { id: 'g_core', cost: 40, cur: 'crystals' },
      { id: 'g_railgun', cost: 120, cur: 'crystals' },
    ];
    const cards = offers.map(o => {
      const def = this.game.gearDef(o.id);
      const owned = this.game.profile.inventory.includes(o.id);
      const sym = o.cur === 'shards' ? '◇' : '✦';
      return `<div class="shop-card" style="--rc:${RARITY[def.rarity].color}">
        <div class="shop-ic">${def.icon}</div>
        <div class="shop-name">${def.name}</div>
        <div class="shop-rar">${RARITY[def.rarity].name}</div>
        <button class="btn primary" data-buy="${o.id}" data-cost="${o.cost}" data-cur="${o.cur}" ${owned ? 'disabled' : ''}>
          ${owned ? 'Owned' : `${sym} ${o.cost}`}
        </button>
      </div>`;
    }).join('');
    return `<div class="panel"><h2>Shop</h2>
      <p class="muted">Spend Void Shards (◇) earned in battle, or premium Chrono Crystals (✦).</p>
      <div class="shop-grid">${cards}</div>
      <div class="iap-note">Crystal bundles, Battle Pass & Monthly VIP — monetisation integration is on the roadmap (cosmetic / convenience only, not pay-to-win).</div>
    </div>`;
  }

  // --- Profile / Settings / stubs ----------------------------------------
  renderProfile() {
    const p = this.game.profile;
    const totalCleared = ZONES.reduce((a, z) => a + z.nodes.filter(n => (n.kind==='enemy'||n.kind==='boss') && this.game.isCleared(n.id)).length, 0);
    return `<div class="panel">
      <h2>Profile</h2>
      <div class="profile-grid">
        <div class="stat-tile"><b>${p.level}</b><span>Level</span></div>
        <div class="stat-tile"><b>${totalCleared}</b><span>Foes Cleared</span></div>
        <div class="stat-tile"><b>${p.inventory.length}</b><span>Gear Found</span></div>
        <div class="stat-tile"><b>${p.keys.length}</b><span>Keys</span></div>
        <div class="stat-tile"><b>${p.shards}</b><span>Void Shards</span></div>
        <div class="stat-tile"><b>${p.crystals}</b><span>Crystals</span></div>
      </div>
      <button class="btn" data-go="settings">⚙ Settings</button>
      <button class="btn danger" id="reset">Reset Progress</button>
    </div>`;
  }

  renderSettings() {
    const s = this.game.profile.settings;
    return `<div class="panel">
      <h2>Settings</h2>
      <div class="setting"><label>Music Volume</label><input type="range" min="0" max="100" value="${s.music}" data-set="music"></div>
      <div class="setting"><label>SFX Volume</label><input type="range" min="0" max="100" value="${s.sfx}" data-set="sfx"></div>
      <div class="setting"><label>Particle Effects</label><input type="checkbox" ${s.particles?'checked':''} data-set="particles"></div>
      <div class="setting"><label>Screen Shake</label><input type="checkbox" ${s.shake?'checked':''} data-set="shake"></div>
      <h3>Account</h3>
      <button class="btn">Sign in with Google</button>
      <button class="btn">Sign in with Apple</button>
      <p class="muted">Auth, cloud save & privacy controls are stubbed for this prototype.</p>
      <button class="btn ghost" data-go="profile">‹ Back</button>
    </div>`;
  }

  renderStub(title, msg) {
    return `<div class="panel stub"><h2>${title}</h2><p class="muted">${msg}</p>
      <button class="btn ghost" data-go="home">‹ Back to Home</button></div>`;
  }

  // --- Binding ------------------------------------------------------------
  bind() {
    this.root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => this.go(b.dataset.go));
    this.root.querySelectorAll('[data-zone]').forEach(b => b.onclick = () => {
      const z = ZONES.find(z => z.id === b.dataset.zone);
      this.go('overworld', { zone: z });
    });
    this.root.querySelectorAll('[data-node]').forEach(b => b.onclick = () => this.onNode(b.dataset.node));
    this.root.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => {
      const id = b.dataset.equip;
      const p = this.game.profile;
      if (Object.values(p.equipped).includes(id)) {
        const slot = Object.keys(p.equipped).find(s => p.equipped[s] === id);
        this.game.unequip(slot);
      } else this.game.equip(id);
      this.render();
    });
    this.root.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => {
      const slot = b.dataset.slot;
      if (this.game.profile.equipped[slot]) { this.game.unequip(slot); this.render(); }
    });
    this.root.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
      const cost = +b.dataset.cost, cur = b.dataset.cur, id = b.dataset.buy;
      const ok = cur === 'shards' ? this.game.spendShards(cost) : this.game.spendCrystals(cost);
      if (!ok) { this.toast('Not enough currency'); return; }
      this.game.grantGear(id);
      this.toast('Purchased!');
      this.render();
    });
    this.root.querySelectorAll('[data-set]').forEach(inp => inp.onchange = () => {
      const k = inp.dataset.set;
      this.game.profile.settings[k] = inp.type === 'checkbox' ? inp.checked : +inp.value;
      this.game.save();
    });
    const reset = this.root.querySelector('#reset');
    if (reset) reset.onclick = () => { if (confirm('Erase all progress?')) { this.game.reset(); this.go('home'); } };
  }

  onNode(nodeId) {
    const node = this.activeZone.nodes.find(n => n.id === nodeId);
    if (!node) return;
    if (node.kind === 'terminal') {
      this.overlay(`<div class="terminal-modal"><h3>🖥️ ${node.label}</h3><p class="lore">${node.lore}</p>
        <button class="btn primary" id="result-ok">Close</button></div>`);
      document.getElementById('result-ok').onclick = () => this.closeOverlay();
      return;
    }
    if (node.kind === 'enemy' || node.kind === 'boss') {
      this.startBattle(node.enemy, node);
    }
  }

  // --- FX helpers ---------------------------------------------------------
  popDamage(n, chain) {
    this.popText(`-${n}${chain > 0 ? `  x${1 + chain * 0.5}` : ''}`, '#5cff9e', 'enemy');
  }
  popText(txt, color, where = 'enemy') {
    const f = document.getElementById('floater');
    if (!f) return;
    const span = document.createElement('span');
    span.className = `float-pop ${where}`;
    span.textContent = txt;
    span.style.color = color;
    f.appendChild(span);
    setTimeout(() => span.remove(), 900);
  }
  shake() {
    if (!this.game.profile.settings.shake) return;
    const b = this.root.querySelector('.battle');
    if (!b) return;
    b.classList.add('shake');
    setTimeout(() => b.classList.remove('shake'), 350);
  }
  toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 1400);
  }
  overlay(html) {
    let o = document.getElementById('overlay');
    if (!o) { o = document.createElement('div'); o.id = 'overlay'; document.body.appendChild(o); }
    o.innerHTML = `<div class="overlay-card">${html}</div>`;
    o.classList.add('show');
  }
  closeOverlay() {
    const o = document.getElementById('overlay');
    if (o) o.classList.remove('show');
  }
}
