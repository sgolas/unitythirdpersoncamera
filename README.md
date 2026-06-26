# ◈ Void Protocol

> Strategic puzzle-combat with open-world exploration. Pixel-art *Metroid-meets-cyberpunk*, built mobile-first for the web.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/sgolas/sylsrepo)

One-click deploy: the button pre-fills Netlify's import for this repo (no build, publish from root — see `netlify.toml`). After it deploys, add your subdomain under **Domain management**; if the domain's DNS is managed by Netlify the record and HTTPS are created automatically.

This repository contains a **playable vertical slice** of *Void Protocol* — a no-build, dependency-free web app you can open and play immediately. It implements the highest-priority systems from the design brief (the core puzzle-combat engine and the world/menus around it) and lays clean foundations for the rest.

---

## ▶ Run it

It's a static site using native ES modules — **no build step, no install**. ES modules require an `http://` origin (not `file://`), so serve the folder with any static server:

```bash
# from the repo root, pick one:
python3 -m http.server 8000
#   or
npx serve .
```

Then open <http://localhost:8000>. Designed for a phone-sized viewport; on desktop it renders in a centred phone frame. Progress saves to `localStorage`.

---

## 🎮 How to play

You explore a layered overworld, walk into enemies (Heroes-of-Might-&-Magic style) and resolve each fight as a **puzzle battle** on a 5×5 elemental grid.

**Each turn you get 3 actions**, drawn from three space-time powers:

| Action | What it does |
|---|---|
| 🪐 **Gravity Shift** *(↑↓←→)* | Conveyors a **fresh line of tiles** in from the chosen edge, sliding the whole board along. Your primary tool for feeding new material and lining up matches. |
| 🌀 **Space Collapse** *(↑↓←→)* | **Compresses** tiles toward a wall, squeezing out gaps to force matches between what's left. Best used after clears have opened holes. |
| ⏳ **Time Rewind** | Undo your last move (costs an action). Disabled while an enemy is *time-warped*. |

Match **3+** same-element tiles to clear them and damage the enemy. Bigger groups and **cascade chains** multiply damage, and each element is **strong or weak** against certain enemy types. If you don't whittle the enemy down, it hits you every turn — stalling loses.

**Elements:** 🔥 Fire · ❄ Ice · 🌀 Void · ⚡ Energy · ⏳ Time · 🪐 Gravity (heavier elements hit harder).

**Enemy mechanics** force tactical choices: *shield* enemies block one element, *spawners* inject tiles each turn, *gravity-locked* enemies disable your Gravity Shift, and *time-warped* enemies disable Rewind. Bosses have large HP pools and stacked abilities.

Win → earn **Void Shards**, XP, and sometimes gear or a **key** that unlocks gated doors and the next zone.

---

## ✅ What's implemented (priorities 1–8 of the brief)

- **Core puzzle grid & match system** — 5×5 grid, 6 elements, flood-merged match groups (L/T/cross shapes count once).
- **Gravity / Time / Space mechanics** — conveyor gravity, compaction collapse, and rewind, with cascade resolution and chain multipliers.
- **Combat loop** — player vs. enemy HP, 3 actions/turn, elemental effectiveness, weight-based damage, win/loss.
- **Enemy abilities** — shield, spawner, gravity-lock, time-warp; multi-ability **boss**.
- **Overworld** — node-based maps with visible enemies, reachability/path-gating, **locked doors + keys**, lore terminals, boss rooms, and zone-unlock progression across two zones.
- **Loadout & inventory** — 7 equipment slots, 5 rarity tiers, gear that aggregates into real combat stats (damage %, max HP, bonus actions, element bonuses).
- **Menus & navigation** — Home, Campaign, Loadout, Shop, Profile, Settings (+ Arena / Battle Pass placeholders).
- **Currency & shop** — Void Shards (earned) and Chrono Crystals (premium), spendable on gear; XP and levelling.

The combat engine is **balance-tested**: a simple greedy AI wins 10/12 simulated fights, with the shielded enemies and the boss correctly requiring gear/strategy. See `## Tests`.

## 🧭 Roadmap (remaining brief priorities)

These are scaffolded/stubbed in the UI and ready to build out:

- **Arena / PvP** — matchmaking, leaderboards, seasonal rankings.
- **Battle Pass** — reward track, daily/weekly quests, season timer.
- **Monetisation** — crystal bundles, Monthly VIP, opt-in ad rewards, cosmetic shop (cosmetic/convenience only — *not* pay-to-win).
- **Backend** — the brief targets Node/Express + PostgreSQL + Google/Apple auth for cloud saves; the current slice persists locally.
- **Polish** — richer particle FX, sound, more zones (Underground Bunker, Occupied City), environmental hazards.

If/when migrating to the brief's recommended engine, the pure-logic core (`grid.js`, `combat.js`) is framework-agnostic and drops straight into Phaser 3.

---

## 🏗 Architecture

No framework — small, readable ES modules with a clean split between **pure game logic** and the **DOM/UI layer**:

```
index.html              # entry; loads the ES module graph
src/
  css/style.css         # cyberpunk-neon, mobile-first styling
  js/
    config.js           # data: elements, enemies, gear, zones, tuning constants
    grid.js             # pure: 5x5 grid, matching, conveyor/collapse/refill
    combat.js           # pure: turns, damage, cascades, enemy AI/abilities
    game.js             # player state, currency, inventory, save/load
    ui.js               # all screens, rendering & the animated battle controller
    main.js             # bootstrap
```

`grid.js` and `combat.js` have **zero browser dependencies**, so they're unit-testable under Node and portable to another renderer.

---

## 🧪 Tests

Logic and an end-to-end browser smoke test live alongside development. The engine is exercised with deterministic RNG for: match detection, the three mechanics, cascade scoring, and full simulated battles against every enemy. A headless Chromium run drives the real UI (home → zone → battle → victory → shop) and asserts there are no console errors.

---

*Working title. All systems subject to revision during development.*
