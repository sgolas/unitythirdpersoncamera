// ============================================================================
// Void Protocol — engine tests (pure logic, no browser).
// Run with:  node tests/engine.test.mjs
// Exits non-zero on any failure.
// ============================================================================
import { Grid } from '../src/js/grid.js';
import { Combat } from '../src/js/combat.js';

let failures = 0;
function check(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ ' + msg); failures++; }
}
// small deterministic RNG so runs are reproducible
function lcg(seed) { let s = seed & 0x7fffffff; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

console.log('Grid:');
{
  const rng = lcg(12345);
  const g = new Grid(5, rng);
  check(g.cells.length === 25, 'grid has 25 cells');
  check(g.findMatches().length === 0, 'fresh board has no matches');

  g.set(0, 0, 'fire'); g.set(1, 0, 'fire'); g.set(2, 0, 'fire');
  check(g.findMatches().length === 1, 'horizontal run of 3 detected');

  g.fill();
  g.set(0, 0, 'ice'); g.set(1, 0, 'ice'); g.set(2, 0, 'ice');
  g.set(0, 1, 'ice'); g.set(0, 2, 'ice');
  const m = g.findMatches();
  check(m.length === 1 && m[0].cells.length === 5, 'L-shape merges into one group of 5');

  g.fill();
  g.set(0, 0, null); g.set(0, 1, null);
  const before = g.tileCount();
  g.collapse('down');
  check(g.tileCount() === before, 'collapse preserves tile count (no refill)');

  g.set(0, 0, null); g.set(0, 1, null); g.set(0, 2, null);
  g.gravity('down');
  check(g.tileCount() === 25, 'gravity refills board to full');

  const snap = g.snapshot();
  g.conveyor('down');
  check(g.tileCount() === 25 && g.snapshot().some((v, i) => v !== snap[i]), 'conveyor churns a full board');
}

console.log('Combat — damage:');
{
  const rng = lcg(777);
  const c = new Combat('drone', {}, rng);
  for (let i = 0; i < 5; i++) c.grid.set(i, 4, 'gravity'); // plant a guaranteed match
  const res = c.spaceCollapse('down');
  check(res.ok && res.damage > 0, 'planted match deals damage (' + res.damage + ')');
}

console.log('Combat — greedy playthroughs reach a terminal state:');
{
  const dirs = ['up', 'down', 'left', 'right'];
  function greedy(c) {
    let best = null, bestDmg = -1;
    for (const dir of dirs) for (const act of ['gravity', 'collapse']) {
      if (act === 'gravity' && !c.canGravity()) continue;
      if (act === 'collapse' && !c.canCollapse()) continue;
      const p = Object.assign(Object.create(Object.getPrototypeOf(c)), c);
      p.grid = c.grid.clone(); p.enemy = { ...c.enemy }; p.player = { ...c.player }; p.history = []; p.log = [];
      const r = act === 'gravity' ? p.gravityShift(dir) : p.spaceCollapse(dir);
      const d = r.ok ? r.damage : -1;
      if (d > bestDmg) { bestDmg = d; best = { act, dir }; }
    }
    if (!best) return false;
    best.act === 'gravity' ? c.gravityShift(best.dir) : c.spaceCollapse(best.dir);
    return true;
  }
  let wins = 0;
  for (const id of ['drone', 'sentinel', 'crawler', 'wraith', 'warden', 'overseer']) {
    const c = new Combat(id, { dmgMult: 0.5, maxHp: 80, extraAction: 1 }, lcg(id.charCodeAt(0) * 31 + 5));
    let guard = 0;
    while (!c.over && guard++ < 600) { if (c.actionsLeft <= 0) c.endTurn(); else if (!greedy(c)) c.endTurn(); }
    check(c.over, id + ' reaches a terminal state (' + c.result + ')');
    if (c.result === 'win') wins++;
  }
  check(wins >= 5, 'geared greedy player wins most fights (' + wins + '/6)');
}

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
