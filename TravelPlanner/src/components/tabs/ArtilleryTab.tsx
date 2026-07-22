import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Users, Loader2, Crosshair, Wind, Maximize2, Minimize2, X, ChevronUp, ChevronDown, Settings2, Play, ChevronLeft } from 'lucide-react';
import { TabHeader } from '../ui';
import { getSyncCode, isSyncConfigured } from '../../lib/config';
import { chatDeviceId } from '../../lib/chatUnread';
import { getDeviceName } from '../../db/database';
import { useTravelers } from '../../hooks/useTrip';
import { lockLandscape, unlockOrientation } from '../../lib/orientation';
import type { Room, Peer } from '../../lib/realtime';
import {
  WORLD, WIND_ACCEL, PICKABLE_WEAPONS, weaponById, newGame, launch, explode,
  nextTurn, checkOver, terrainAt, structureAt, snapshot, applySnapshot,
  awardRound, matchOver, matchChampion, DEFAULT_SETTINGS,
  type GameState, type PlayerSeed, type Snapshot, type GameSettings, type Structure,
} from '../../game/artillery';

type Trail = { x: number; y: number }[];
type Proj = { x: number; y: number; vx: number; vy: number; weapon: string; rolling?: boolean; rollDist?: number; split?: boolean; dead?: boolean; life?: number; trail?: Trail; bounces?: number; leaps?: number };
type Flash = { x: number; y: number; r: number; t: number; color: string };

const SETTINGS_KEY = 'trip.artillery.settings';
function loadSettings(): GameSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

type StartPayload = { seed: number; players: PlayerSeed[]; settings: GameSettings; round: number; scores: Record<string, number> };

export function ArtilleryTab() {
  const travelers = useTravelers();
  const myId = chatDeviceId();
  const myName = travelers[0]?.name || getDeviceName();
  const configured = isSyncConfigured();

  const [screen, setScreen] = useState<'splash' | 'setup' | 'settings' | 'lobby' | 'game'>('splash');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const roomRef = useRef<Room | null>(null);
  const online = useRef(false);
  // Remember the running match's roster + rules so we can build the next round.
  const matchRef = useRef<{ players: PlayerSeed[]; settings: GameSettings } | null>(null);

  const gameRef = useRef<GameState | null>(null);
  const [, force] = useState(0);
  const rerender = useCallback(() => force(v => v + 1), []);

  function saveSettings(patch: Partial<GameSettings>) {
    setSettings(s => { const next = { ...s, ...patch }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); return next; });
  }

  // The game screen is ALWAYS a full-screen field (fixed overlay above the app
  // chrome). On top of that we can also request *native* fullscreen where the
  // platform supports it, which additionally hides the browser/system bars.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nativeFs, setNativeFs] = useState(false);
  function toggleNativeFs() {
    if (document.fullscreenElement) {
      (document.exitFullscreen?.() as any)?.catch?.(() => {});
    } else {
      const el: any = wrapRef.current;
      (el?.requestFullscreen?.() ?? el?.webkitRequestFullscreen?.())?.catch?.(() => {});
    }
  }
  // Enter immersive fullscreen to hide the Android system bars. Called from the
  // Start buttons so it runs inside a user gesture (required to go fullscreen).
  function goImmersive() {
    if (document.fullscreenElement) return;
    const el: any = document.documentElement;
    try { (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => {}); } catch { /* unsupported */ }
  }
  useEffect(() => {
    const onChange = () => setNativeFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Collapse the battle bar to reclaim the whole screen for the field.
  const [barOpen, setBarOpen] = useState(true);

  // Lock the game to landscape while it's on screen (enters fullscreen first,
  // which the Web Orientation API requires), and release it on the way out.
  useEffect(() => {
    if (screen !== 'game') return;
    void lockLandscape(wrapRef.current);
    return () => { void unlockOrientation(); };
  }, [screen]);

  // ── Realtime lobby ────────────────────────────────────────────────
  async function goOnline() {
    setConnecting(true); setError('');
    try {
      const { joinRoom } = await import('../../lib/realtime');
      const room = await joinRoom(`artillery:${getSyncCode()}`, { id: myId, name: myName, emoji: travelers[0]?.emoji || '🎮' });
      roomRef.current = room; online.current = true;
      room.onPeers(p => setPeers([...p]));
      room.on('start', (payload: StartPayload) => {
        matchRef.current = { players: payload.players, settings: payload.settings };
        gameRef.current = newGame(payload.seed, payload.players, payload.settings, { round: payload.round, scores: payload.scores });
        setBarOpen(true); setScreen('game'); rerender();
      });
      room.on('fire', (p: { angle: number; power: number; weapon: string; fromId: string }) => {
        if (p.fromId === myId) return; // we already animate our own shot
        const g = gameRef.current; if (!g) return;
        const t = g.tanks.find(tk => tk.id === p.fromId); if (!t) return;
        t.angle = p.angle; t.power = p.power; t.weapon = p.weapon;
        animateShot(t.id, false); // visual only; authoritative state arrives via 'snap'
      });
      room.on('snap', (snap: Snapshot) => {
        const g = gameRef.current; if (!g) return;
        applySnapshot(g, snap); cancelAnim(); rerender();
      });
      setScreen('lobby');
    } catch (e) {
      setError('Couldn’t connect for live play. Check your connection, or use Pass & play.');
    } finally { setConnecting(false); }
  }

  function sendStart(players: PlayerSeed[], round: number, scores: Record<string, number>) {
    const seed = (Math.random() * 2 ** 31) | 0;
    roomRef.current?.send('start', { seed, players, settings, round, scores } satisfies StartPayload);
  }

  function startOnlineGame() {
    const room = roomRef.current; if (!room) return;
    const players: PlayerSeed[] = room.peers().map(p => ({ id: String(p.id), name: String(p.name || 'Player') }));
    if (players.length < 2) { setError('Need at least 2 players in the room to start.'); return; }
    goImmersive();
    sendStart(players, 1, Object.fromEntries(players.map(p => [p.id, 0])));
  }

  /** Start a local pass-and-play match with the configured player count. */
  function startLocal() {
    goImmersive();
    online.current = false; roomRef.current?.leave(); roomRef.current = null;
    const n = Math.min(4, Math.max(2, settings.players));
    const players: PlayerSeed[] = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
    matchRef.current = { players, settings };
    gameRef.current = newGame((Math.random() * 2 ** 31) | 0, players, settings, { round: 1, scores: Object.fromEntries(players.map(p => [p.id, 0])) });
    setBarOpen(true); setScreen('game'); rerender();
  }

  /** Begin the next round (new terrain, carried scores) or a brand-new match. */
  function advance(fresh: boolean) {
    const g = gameRef.current; const m = matchRef.current; if (!m) return;
    const round = fresh ? 1 : (g?.round ?? 1) + 1;
    const scores = fresh ? Object.fromEntries(m.players.map(p => [p.id, 0])) : (g?.scores ?? {});
    if (online.current) { sendStart(m.players, round, scores); return; }
    gameRef.current = newGame((Math.random() * 2 ** 31) | 0, m.players, m.settings, { round, scores });
    setBarOpen(true); rerender();
  }

  function quitGame() {
    cancelAnim();
    if (document.fullscreenElement) (document.exitFullscreen?.() as any)?.catch?.(() => {});
    if (online.current) { setScreen('lobby'); }
    else { gameRef.current = null; setScreen('splash'); }
  }

  useEffect(() => () => { roomRef.current?.leave(); cancelAnim(); }, []); // eslint-disable-line

  // ── Projectile animation (authority mutates state + broadcasts) ────
  const rafRef = useRef<number | null>(null);
  const simRef = useRef<{ projs: Proj[]; flashes: Flash[]; authority: boolean } | null>(null);

  function cancelAnim() { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null; simRef.current = null; }

  function iAmActive(): boolean {
    const g = gameRef.current; if (!g) return false;
    const t = g.tanks[g.turn];
    if (!online.current) return true;         // hotseat: this device drives every turn
    return !!t && t.id === myId;
  }

  /** Who may start the next round online: the round winner (or the first peer). */
  function canAdvance(): boolean {
    if (!online.current) return true;
    const g = gameRef.current;
    if (g?.winnerId) return g.winnerId === myId;
    return roomRef.current?.peers()[0]?.id === myId;
  }

  function fire() {
    const g = gameRef.current; if (!g || g.phase !== 'aim') return;
    const t = g.tanks[g.turn]; if (!t || !t.alive) return;
    if (online.current) roomRef.current?.send('fire', { angle: t.angle, power: t.power, weapon: t.weapon, fromId: t.id });
    animateShot(t.id, true);
  }

  function animateShot(tankId: string, authority: boolean) {
    const g = gameRef.current; if (!g) return;
    const t = g.tanks.find(tk => tk.id === tankId); if (!t) return;
    g.phase = 'flying';
    const w = weaponById(t.weapon);
    let projs: Proj[];
    if (w.kind === 'airstrike') {
      // A flight of bombs rains down around the aimed spot (angle+power aim it).
      const a = (t.angle * Math.PI) / 180;
      const tx = Math.max(50, Math.min(WORLD.w - 50, t.x + Math.cos(a) * (20 + t.power * 4.5)));
      projs = [];
      for (let i = 0; i < 5; i++) {
        const ox = (i - 2) * 36;
        projs.push({ x: tx + ox, y: -24 - Math.abs(ox) * 0.2, vx: 0, vy: 2.2, weapon: t.weapon, split: true, trail: [] });
      }
    } else {
      const l = launch(t);
      projs = [{ ...l, weapon: t.weapon, trail: [], bounces: w.bounces, leaps: w.leaps }];
    }
    simRef.current = { projs, flashes: simRef.current?.flashes ?? [], authority };
    rerender();
    // Always (re)start the loop — a lingering, already-consumed frame id must
    // not block the next shot's animation (that was the "freezes after firing"
    // bug: the old `if (!rafRef.current)` guard never re-scheduled).
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }

  function step() {
    const g = gameRef.current; const sim = simRef.current;
    if (!g || !sim) { rafRef.current = null; return; }
    const wind = g.wind;
    const gravity = g.gravity;
    const shooter = g.tanks[g.turn];
    // Iterate a fixed count so projectiles spawned THIS frame (e.g. MIRV
    // children) are only simulated from the next frame — never in a same-frame
    // cascade (that exponential cascade was the MIRV freeze).
    const count = sim.projs.length;
    for (let i = 0; i < count; i++) {
      const p = sim.projs[i];
      if (p.dead) continue;
      const w = weaponById(p.weapon);
      // Hard safety: no projectile may fly forever.
      p.life = (p.life ?? 0) + 1;
      if (p.life > 2400) { p.dead = true; continue; }
      if (p.rolling) {
        // Sheep / roller: walk along the ground until it settles, then blow up.
        const dir = terrainAt(g, p.x + 3) <= terrainAt(g, p.x - 3) ? 1 : -1;
        p.x += dir * 2.4; p.y = terrainAt(g, p.x); p.rollDist = (p.rollDist ?? 0) + 2.4;
        const settled = terrainAt(g, p.x - 3) >= p.y && terrainAt(g, p.x + 3) >= p.y;
        if (settled || (p.rollDist ?? 0) > 340 || p.x < 4 || p.x > WORLD.w - 4 || hitTank(g, p.x, p.y)) impact(p, sim);
        continue;
      }
      const bouncy = w.kind === 'bounce' || w.kind === 'banana' || w.kind === 'holy';
      // Grenade-family: detonate when the fuse burns out, wherever it is.
      if (bouncy && w.fuse && p.life > w.fuse) { impact(p, sim); continue; }
      // record a short flight trail for the smoke ribbon
      (p.trail ??= []).push({ x: p.x, y: p.y });
      if (p.trail.length > 16) p.trail.shift();
      if (w.kind === 'homing') {
        // Steer toward the nearest enemy tank, with only light gravity.
        let tgt: typeof g.tanks[number] | null = null, best = 1e9;
        for (const tk of g.tanks) {
          if (!tk.alive || tk.id === shooter?.id) continue;
          const d = Math.hypot(tk.x - p.x, tk.y - p.y);
          if (d < best) { best = d; tgt = tk; }
        }
        if (tgt) {
          const dx = tgt.x - p.x, dy = (tgt.y - 8) - p.y, d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 0.5; p.vy += (dy / d) * 0.5;
          const sp = Math.hypot(p.vx, p.vy), max = 6.5;
          if (sp > max) { p.vx = p.vx / sp * max; p.vy = p.vy / sp * max; }
        }
        p.vy += gravity * 0.25; p.vx += wind * WIND_ACCEL * 0.3;
      } else {
        p.vy += gravity; p.vx += wind * WIND_ACCEL;
      }
      p.x += p.vx; p.y += p.vy;
      // MIRV / Death's Head: split into sub-munitions on the way down (children
      // marked so they don't re-split), capped for safety.
      if (w.kind === 'mirv' && !p.split && p.vy > 1.3 && sim.projs.length < 22) {
        const n = Math.min(w.splits ?? 3, 24 - sim.projs.length);
        p.split = true; p.dead = true;
        for (let k = 0; k < n; k++) {
          const dvx = (k - (n - 1) / 2) * 1.1;
          sim.projs.push({ x: p.x, y: p.y, vx: p.vx + dvx, vy: p.vy, weapon: p.weapon, split: true, trail: [] });
        }
        continue;
      }
      const tankHit = hitTank(g, p.x, p.y);
      const structHit = !!structureAt(g, p.x, p.y);
      const terrHit = p.y >= terrainAt(g, p.x);
      if (terrHit || tankHit || structHit) {
        if (w.kind === 'roller' && !p.rolling && !structHit && !tankHit) { p.rolling = true; p.y = terrainAt(g, p.x); continue; }
        // Bouncy weapons rebound off the terrain until their bounces/fuse run out.
        if (bouncy && terrHit && !tankHit && !structHit && (p.bounces ?? 0) > 0) {
          const s = (terrainAt(g, p.x + 3) - terrainAt(g, p.x - 3)) / 6; // slope dy/dx
          const nl = Math.hypot(s, 1), nx = -s / nl, ny = -1 / nl;        // upward normal
          const dot = p.vx * nx + p.vy * ny;
          p.vx = (p.vx - 2 * dot * nx) * 0.55; p.vy = (p.vy - 2 * dot * ny) * 0.55;
          p.y = terrainAt(g, p.x) - 3; p.bounces = (p.bounces ?? 0) - 1;
          continue;
        }
        impact(p, sim);
      } else if (p.y >= 0 && (p.x < -30 || p.x > WORLD.w + 30 || p.y > WORLD.h + 40)) {
        p.dead = true; // dud — flew off the world (airstrike bombs start above y=0)
      }
    }
    // fade flashes
    sim.flashes = sim.flashes.filter(f => (f.t += 1) < 18);
    rerender();
    if (sim.projs.every(p => p.dead)) { resolve(sim); return; }
    rafRef.current = requestAnimationFrame(step);
  }

  function impact(p: Proj, sim: { projs: Proj[]; flashes: Flash[]; authority: boolean }) {
    const g = gameRef.current!; const w = weaponById(p.weapon);
    p.dead = true;
    sim.flashes.push({ x: p.x, y: p.y, r: Math.max(14, w.radius), t: 0, color: w.kind === 'dirt' ? '#a16207' : '#fb923c' });
    if (sim.authority) explode(g, p.x, p.y, w);
    // Cluster / funky / banana bombs burst into a scatter of bomblets.
    if ((w.kind === 'cluster' || w.kind === 'banana') && !p.split) {
      const n = Math.min(w.bomblets ?? 5, Math.max(0, 22 - sim.projs.length));
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.4;
        const sp = 2.6 + Math.random() * 2.2;
        sim.projs.push({ x: p.x, y: p.y - 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, weapon: 'bomblet', split: true, trail: [] });
      }
    }
    // Leapfrog: hop a chain of blasts forward in the travel direction.
    if (w.kind === 'leapfrog' && (p.leaps ?? 0) > 0 && sim.projs.length < 22) {
      const dir = (p.vx || 1) >= 0 ? 1 : -1;
      sim.projs.push({ x: p.x + dir * 8, y: p.y - 8, vx: dir * 3.6, vy: -4.6, weapon: p.weapon, leaps: (p.leaps ?? 0) - 1, trail: [] });
    }
  }

  function resolve(sim: { projs: Proj[]; flashes: Flash[]; authority: boolean }) {
    const g = gameRef.current!;
    if (sim.authority) {
      checkOver(g);
      if (g.phase === 'over') awardRound(g); // credit the round win exactly once
      else nextTurn(g);
      if (online.current) roomRef.current?.send('snap', snapshot(g));
    }
    // Non-authority clients just keep the flashes fading and wait for 'snap'.
    simRef.current = { projs: [], flashes: sim.flashes, authority: sim.authority };
    // We're at the end of a step frame (its id is consumed) — schedule the fade
    // loop unconditionally so rafRef never gets stuck holding a dead id.
    rafRef.current = requestAnimationFrame(fadeOnly);
  }
  function fadeOnly() {
    const sim = simRef.current; if (!sim) { rafRef.current = null; return; }
    sim.flashes = sim.flashes.filter(f => (f.t += 1) < 18);
    rerender();
    if (sim.flashes.length) rafRef.current = requestAnimationFrame(fadeOnly);
    else { rafRef.current = null; if (simRef.current) simRef.current.projs = []; }
  }

  // ── Render ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => { draw(); });

  // Keep the canvas backing store matched to its on-screen size (× dpr) so the
  // battlefield fills the whole screen crisply. Re-fits on mount, window
  // resize, orientation change, and entering/leaving native fullscreen.
  useEffect(() => {
    if (screen !== 'game') return;
    function fit() {
      const cv = canvasRef.current; if (!cv) return;
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      draw();
    }
    fit();
    const t = setTimeout(fit, 60); // after layout settles
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    document.addEventListener('fullscreenchange', fit);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      document.removeEventListener('fullscreenchange', fit);
    };
  }, [screen, barOpen, nativeFs]); // eslint-disable-line

  function draw() {
    const cv = canvasRef.current; const g = gameRef.current; if (!cv || !g) return;
    const ctx = cv.getContext('2d')!;
    const cw = cv.width, ch = cv.height;
    const scale = Math.min(cw / WORLD.w, ch / WORLD.h);
    const ox = (cw - WORLD.w * scale) / 2;
    const oy = (ch - WORLD.h * scale) / 2;

    // Sky — soft dusk gradient filling the whole canvas, with a low sun glow.
    const sky = ctx.createLinearGradient(0, 0, 0, ch);
    sky.addColorStop(0, '#0a1530'); sky.addColorStop(0.55, '#243b63'); sky.addColorStop(1, '#3a5a7a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);
    const sunX = ox + WORLD.w * 0.8 * scale, sunY = oy + WORLD.h * 0.28 * scale;
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, WORLD.h * 0.5 * scale);
    glow.addColorStop(0, 'rgba(255,214,150,0.5)'); glow.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, cw, ch);

    ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
    const floor = WORLD.h + oy / scale + 4;

    // Distant parallax hills for depth (two soft bands behind the play field).
    for (const band of [{ base: 0.5, amp: 26, len: 340, col: 'rgba(30,58,95,0.55)', ph: 1.2 },
                        { base: 0.6, amp: 20, len: 220, col: 'rgba(22,44,74,0.6)', ph: 3.7 }]) {
      ctx.beginPath(); ctx.moveTo(0, floor);
      for (let x = 0; x <= WORLD.w; x += 8) {
        const y = WORLD.h * band.base - Math.sin(x / band.len * Math.PI * 2 + band.ph) * band.amp - band.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(WORLD.w, floor); ctx.closePath();
      ctx.fillStyle = band.col; ctx.fill();
    }

    // Main terrain — smooth filled ground with a bright grass rim.
    ctx.beginPath(); ctx.moveTo(0, floor);
    ctx.lineTo(0, g.terrain[0]);
    for (let x = 1; x < WORLD.w; x++) ctx.lineTo(x, g.terrain[x]);
    ctx.lineTo(WORLD.w, floor); ctx.closePath();
    const grd = ctx.createLinearGradient(0, WORLD.h * 0.25, 0, WORLD.h);
    grd.addColorStop(0, '#4d7c1a'); grd.addColorStop(0.5, '#356314'); grd.addColorStop(1, '#16300a');
    ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, g.terrain[0]);
    for (let x = 1; x < WORLD.w; x++) ctx.lineTo(x, g.terrain[x]);
    ctx.strokeStyle = '#84cc16'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

    // Structures (buildings) sitting on the terrain.
    for (const st of g.structures) drawStructure(ctx, st);

    // Tanks
    for (const t of g.tanks) {
      ctx.globalAlpha = t.alive ? 1 : 0.35;
      // soft shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(t.x, t.y - 1, 15, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.ellipse(t.x, t.y - 5, 13, 7, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(t.x - 13, t.y - 5, 26, 5);
      const a = (t.angle * Math.PI) / 180;
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(t.x, t.y - 8); ctx.lineTo(t.x + Math.cos(a) * 18, t.y - 8 - Math.sin(a) * 18); ctx.stroke();
      if (t.alive) {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(t.x - 15, t.y - 24, 30, 5);
        ctx.fillStyle = t.health > 40 ? '#4ade80' : '#f87171'; ctx.fillRect(t.x - 15, t.y - 24, 30 * (t.health / 100), 5);
      }
      ctx.globalAlpha = 1;
    }

    // Projectiles (glowing head + smoke trail) and explosion flashes.
    const sim = simRef.current;
    if (sim) {
      for (const p of sim.projs) {
        if (p.dead) continue;
        if (p.trail && p.trail.length > 1) {
          for (let i = 1; i < p.trail.length; i++) {
            const a = i / p.trail.length;
            ctx.strokeStyle = `rgba(253,224,138,${a * 0.5})`; ctx.lineWidth = a * 3;
            ctx.beginPath(); ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y); ctx.lineTo(p.trail[i].x, p.trail[i].y); ctx.stroke();
          }
        }
        ctx.fillStyle = '#fff7cc'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      }
      for (const f of sim.flashes) {
        const a = 1 - f.t / 18; const rr = f.r * (0.5 + f.t / 22);
        const rad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr);
        rad.addColorStop(0, `rgba(255,241,150,${a})`);
        rad.addColorStop(0.5, `${f.color}${Math.round(a * 200).toString(16).padStart(2, '0')}`);
        rad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ── UI ────────────────────────────────────────────────────────────
  const g = gameRef.current;
  const active = g?.tanks[g.turn];
  const myTurn = g && iAmActive() && g.phase === 'aim';

  function setAim(patch: { angle?: number; power?: number; weapon?: string }) {
    if (!g || !active) return;
    if (patch.angle != null) active.angle = patch.angle;
    if (patch.power != null) active.power = patch.power;
    if (patch.weapon != null) active.weapon = patch.weapon;
    rerender();
  }

  const champId = g && g.phase === 'over' && matchOver(g) ? matchChampion(g) : null;
  const champ = champId ? g!.tanks.find(t => t.id === champId) : null;

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Trip Artillery" subtitle="Live tank battle with your trip" gradient="linear-gradient(135deg,#7c2d12,#ea580c)" icon="💣" />

      <div className="px-4 py-4 space-y-4">
        {screen === 'splash' && (
          <div className="space-y-5">
            {/* Splash / title card */}
            <div className="relative overflow-hidden rounded-3xl border border-line p-6 text-center"
              style={{ background: 'radial-gradient(120% 100% at 50% 0%, #7c2d12 0%, #431407 55%, #0b0a09 100%)' }}>
              <div className="text-5xl mb-1">💥</div>
              <h2 className="text-3xl font-black tracking-tight text-white drop-shadow">TRIP ARTILLERY</h2>
              <p className="text-amber-200 text-sm font-semibold mt-1 drop-shadow">Scorched-Earth tank duels · 2–4 players</p>
              <div className="mt-3 flex justify-center gap-1 text-2xl opacity-90">🚀 🎯 ☢️ 💥 🎳</div>
            </div>

            {error && <p className="text-sm text-sunset text-center">{error}</p>}

            <div className="space-y-3">
              <button onClick={() => setScreen('setup')}
                className="w-full accent-gradient text-white font-bold rounded-2xl py-3.5 flex items-center justify-center gap-2 press">
                <Play size={18} /> Play on this phone
              </button>
              <button onClick={goOnline} disabled={!configured || connecting}
                className="w-full bg-surface border border-line text-content font-bold rounded-2xl py-3.5 flex items-center justify-center gap-2 press disabled:opacity-50">
                {connecting ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
                {connecting ? 'Connecting…' : 'Play live with the trip'}
              </button>
              {!configured && <p className="text-xs text-muted text-center">Set up trip sharing (Settings) to play live with the family.</p>}
              <button onClick={() => setScreen('settings')}
                className="w-full text-muted text-sm py-2 flex items-center justify-center gap-1.5">
                <Settings2 size={15} /> Game settings
              </button>
            </div>
          </div>
        )}

        {screen === 'setup' && (
          <div className="space-y-5">
            <BackRow onBack={() => setScreen('splash')} title="Pass & play" />
            <Seg label="Players" value={String(settings.players)} options={['2', '3', '4']}
              onPick={v => saveSettings({ players: +v })} render={v => `${v} players`} />
            <div className="rounded-2xl border border-line bg-surface p-3 text-xs text-muted">
              Take turns on one phone — each player aims and fires, then hands it to the next.
              Best of {settings.rounds} · wind {settings.wind} · gravity {settings.gravity}
              {settings.structures ? ' · buildings on' : ''}.
              <button onClick={() => setScreen('settings')} className="text-accent font-semibold ml-1">Change</button>
            </div>
            <button onClick={startLocal} className="w-full accent-gradient text-white font-bold rounded-2xl py-3.5 flex items-center justify-center gap-2 press">
              <Play size={18} /> Start battle
            </button>
          </div>
        )}

        {screen === 'settings' && (
          <div className="space-y-4">
            <BackRow onBack={() => setScreen('splash')} title="Game settings" />
            <Seg label="Players (local)" value={String(settings.players)} options={['2', '3', '4']} onPick={v => saveSettings({ players: +v })} render={v => v} />
            <Seg label="Rounds per match" value={String(settings.rounds)} options={['1', '3', '5']} onPick={v => saveSettings({ rounds: +v })} render={v => `Best of ${v}`} />
            <Seg label="Wind" value={settings.wind} options={['off', 'low', 'high']} onPick={v => saveSettings({ wind: v as GameSettings['wind'] })} render={v => v} />
            <Seg label="Gravity" value={settings.gravity} options={['low', 'normal', 'high']} onPick={v => saveSettings({ gravity: v as GameSettings['gravity'] })} render={v => v} />
            <Seg label="Terrain" value={settings.terrain} options={['plains', 'hills', 'mountains']} onPick={v => saveSettings({ terrain: v as GameSettings['terrain'] })} render={v => v} />
            <Seg label="Buildings" value={settings.structures ? 'on' : 'off'} options={['off', 'on']} onPick={v => saveSettings({ structures: v === 'on' })} render={v => v} />
            <button onClick={() => setScreen('splash')} className="w-full accent-gradient text-white font-bold rounded-2xl py-3 press">Done</button>
          </div>
        )}

        {screen === 'lobby' && (
          <div className="space-y-4">
            <BackRow onBack={() => { roomRef.current?.leave(); roomRef.current = null; online.current = false; setScreen('splash'); }} title="Live lobby" />
            <div className="bg-surface rounded-2xl border border-line p-4">
              <p className="font-bold text-content flex items-center gap-2 mb-3"><Users size={16} /> In the room ({peers.length})</p>
              <div className="flex flex-wrap gap-2">
                {peers.map(p => (
                  <span key={String(p.id)} className="px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-semibold">
                    {String(p.emoji || '🎮')} {String(p.name)}{String(p.id) === myId ? ' (you)' : ''}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted text-center">Everyone on the trip who opens Trip Artillery shows up here. Best of {settings.rounds} · wind {settings.wind} · gravity {settings.gravity}.
              <button onClick={() => setScreen('settings')} className="text-accent font-semibold ml-1">Settings</button>
            </p>
            {error && <p className="text-sm text-sunset text-center">{error}</p>}
            <button onClick={startOnlineGame} disabled={peers.length < 2}
              className="w-full accent-gradient text-white font-bold rounded-2xl py-3.5 press disabled:opacity-50">
              Start battle ({peers.length} in)
            </button>
          </div>
        )}

        {screen === 'game' && g && createPortal(
          // Portal to <body> so the fixed overlay is viewport-relative (the tab's
          // own `animate-fadeUp` transform would otherwise become its containing
          // block and shrink the field to the tab's content height).
          <div ref={wrapRef} className="fixed inset-0 z-[300] bg-slate-950 overflow-hidden select-none">
            <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

            {/* ── Top HUD ── corner buttons flank a centered info stack ── */}
            <button onClick={quitGame} aria-label="Quit game"
              className="absolute z-10 w-9 h-9 rounded-full bg-black/45 text-white/90 active:bg-black/70 flex items-center justify-center backdrop-blur"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)', left: 'calc(env(safe-area-inset-left, 0px) + 12px)' }}>
              <X size={18} />
            </button>
            <button onClick={toggleNativeFs} aria-label={nativeFs ? 'Exit full screen' : 'Full screen'}
              className="absolute z-10 w-9 h-9 rounded-full bg-black/45 text-white/90 active:bg-black/70 flex items-center justify-center backdrop-blur"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)', right: 'calc(env(safe-area-inset-right, 0px) + 12px)' }}>
              {nativeFs ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            <div className="absolute left-14 right-14 flex flex-col items-center gap-1.5 pointer-events-none"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
              <div className="flex items-center gap-2">
                {g.settings.rounds > 1 && (
                  <span className="px-3 py-1.5 rounded-full bg-black/45 backdrop-blur text-sm font-bold text-white/85 whitespace-nowrap">
                    Round {g.round}/{g.settings.rounds}
                  </span>
                )}
                <span className="px-3 py-1.5 rounded-full bg-black/45 backdrop-blur text-sm text-white/85 flex items-center gap-1.5 whitespace-nowrap">
                  <Wind size={14} /> {g.wind === 0 ? 'calm' : `${Math.abs(g.wind * 100) | 0} ${g.wind > 0 ? '→' : '←'}`}
                </span>
              </div>
              <span className="px-3 py-1.5 rounded-full bg-black/45 backdrop-blur text-sm font-bold whitespace-nowrap" style={{ color: active?.color }}>
                {g.phase === 'over'
                  ? (g.winnerId ? `${g.tanks.find(t => t.id === g.winnerId)?.name} wins the round! 🏆` : 'Round draw')
                  : myTurn ? 'Your turn' : `${active?.name}’s turn`}
              </span>
              {/* Player chips: health + round wins */}
              <div className="flex flex-wrap gap-1.5 justify-center">
                {g.tanks.map(t => (
                  <span key={t.id} className={`text-[11px] font-bold px-2 py-0.5 rounded-full backdrop-blur ${t.alive ? '' : 'opacity-40 line-through'}`}
                    style={{ background: `${t.color}33`, color: t.color, boxShadow: t.id === active?.id && g.phase !== 'over' ? `0 0 0 1.5px ${t.color}` : 'none' }}>
                    {t.name} · {t.health}{g.settings.rounds > 1 ? ` · ${'★'.repeat(g.scores[t.id] || 0) || '0'}` : ''}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Bottom RTS battle bar ── */}
            <div className="absolute left-0 right-0 bottom-0 pointer-events-none"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)', paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 8px)', paddingRight: 'calc(env(safe-area-inset-right, 0px) + 8px)' }}>
              <div className="flex justify-center mb-1">
                <button onClick={() => setBarOpen(o => !o)} aria-label={barOpen ? 'Hide controls' : 'Show controls'}
                  className="pointer-events-auto px-5 h-6 rounded-t-lg bg-slate-900/85 backdrop-blur border border-white/10 border-b-0 text-white/70 flex items-center">
                  {barOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              </div>

              {barOpen && (
                <div className="pointer-events-auto mx-auto max-w-4xl bg-slate-900/85 backdrop-blur border border-white/10 rounded-2xl p-2 shadow-2xl">
                  {g.phase === 'over' ? (
                    <div className="space-y-2 text-center">
                      {champ
                        ? <p className="text-white font-extrabold text-lg">🏆 {champ.name} wins the match!</p>
                        : champId === null && matchOver(g)
                          ? <p className="text-white font-bold">Match tied!</p>
                          : <p className="text-white/80 text-sm">{g.winnerId ? `${g.tanks.find(t => t.id === g.winnerId)?.name} takes round ${g.round}` : `Round ${g.round} drawn`}</p>}
                      {canAdvance() ? (
                        <button onClick={() => advance(matchOver(g))}
                          className="w-full accent-gradient text-white font-bold rounded-xl py-3 press">
                          {matchOver(g) ? 'New match' : 'Next round'}
                        </button>
                      ) : (
                        <p className="text-white/60 text-sm py-2">Waiting for the next round…</p>
                      )}
                    </div>
                  ) : myTurn && active ? (
                    // Compact single-row command strip so it stays out of the field.
                    <div className="flex items-center gap-2">
                      <label className="w-16 shrink-0 text-[10px] font-semibold text-white/60 leading-tight">
                        Angle <span className="text-white">{active.angle}°</span>
                        <input type="range" min={0} max={180} value={active.angle} onChange={e => setAim({ angle: +e.target.value })} className="w-full accent-orange-500" />
                      </label>
                      <label className="w-16 shrink-0 text-[10px] font-semibold text-white/60 leading-tight">
                        Power <span className="text-white">{active.power}</span>
                        <input type="range" min={5} max={100} value={active.power} onChange={e => setAim({ power: +e.target.value })} className="w-full accent-orange-500" />
                      </label>
                      <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar">
                        {PICKABLE_WEAPONS.map(w => (
                          <button key={w.id} onClick={() => setAim({ weapon: w.id })}
                            className={`flex-shrink-0 w-11 flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg border text-white ${active.weapon === w.id ? 'bg-orange-500/25 border-orange-400' : 'bg-white/5 border-white/10'}`}>
                            <span className="text-base leading-none">{w.emoji}</span>
                            <span className="text-[8px] font-semibold text-white/70 leading-none text-center truncate w-full">{w.name}</span>
                          </button>
                        ))}
                      </div>
                      <button onClick={fire} aria-label="Fire"
                        className="shrink-0 w-16 self-stretch accent-gradient text-white font-extrabold rounded-xl flex flex-col items-center justify-center gap-0.5 press">
                        <Crosshair size={18} /> <span className="text-xs">FIRE</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-center text-sm text-white/70 py-2 flex items-center justify-center gap-2">
                      {g.phase === 'flying'
                        ? <><Loader2 size={16} className="animate-spin" /> Incoming…</>
                        : `Waiting for ${active?.name}…`}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}

/** Back header row for the menu sub-screens. */
function BackRow({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onBack} aria-label="Back" className="w-9 h-9 rounded-full bg-surface border border-line flex items-center justify-center text-content press">
        <ChevronLeft size={18} />
      </button>
      <h3 className="font-bold text-content">{title}</h3>
    </div>
  );
}

/** A labelled segmented control used across the settings screens. */
function Seg({ label, value, options, onPick, render }:
  { label: string; value: string; options: string[]; onPick: (v: string) => void; render: (v: string) => string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted mb-1.5">{label}</p>
      <div className="flex gap-1.5">
        {options.map(o => (
          <button key={o} onClick={() => onPick(o)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border capitalize press ${value === o ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-line text-muted'}`}>
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Draw a single building/structure with simple windows + damage tint. */
function drawStructure(ctx: CanvasRenderingContext2D, st: Structure) {
  const dmg = 1 - st.hp / st.maxHp; // 0 intact .. 1 destroyed
  if (st.hp <= 0) {
    // rubble pile
    ctx.fillStyle = '#3f3f46';
    ctx.beginPath(); ctx.moveTo(st.x, st.y + st.h);
    ctx.lineTo(st.x + st.w * 0.3, st.y + st.h - 8);
    ctx.lineTo(st.x + st.w * 0.6, st.y + st.h - 3);
    ctx.lineTo(st.x + st.w, st.y + st.h);
    ctx.closePath(); ctx.fill();
    return;
  }
  const lum = 55 - dmg * 25;
  ctx.fillStyle = `hsl(${st.hue}, 18%, ${lum}%)`;
  ctx.fillRect(st.x, st.y, st.w, st.h);
  // roof / cap
  ctx.fillStyle = `hsl(${st.hue}, 20%, ${lum - 12}%)`;
  if (st.kind === 'tower') ctx.fillRect(st.x - 2, st.y, st.w + 4, 6);
  else if (st.kind === 'bunker') { ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.quadraticCurveTo(st.x + st.w / 2, st.y - 10, st.x + st.w, st.y); ctx.lineTo(st.x + st.w, st.y + 4); ctx.lineTo(st.x, st.y + 4); ctx.fill(); }
  else ctx.fillRect(st.x, st.y, st.w, 5);
  // lit windows
  ctx.fillStyle = `rgba(253,224,138,${0.85 - dmg * 0.6})`;
  const cols = Math.max(1, Math.floor(st.w / 14));
  const rows = Math.max(1, Math.floor(st.h / 16));
  const gx = st.w / (cols + 1), gy = st.h / (rows + 1);
  for (let c = 1; c <= cols; c++) for (let r = 1; r <= rows; r++) {
    if ((c * 7 + r * 13 + st.hue) % 5 === 0) continue; // a few dark windows
    ctx.fillRect(st.x + gx * c - 2.5, st.y + gy * r - 3, 5, 6);
  }
  // damage cracks / scorch as it gets hurt
  if (dmg > 0.25) {
    ctx.strokeStyle = `rgba(0,0,0,${dmg * 0.5})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(st.x + st.w * 0.3, st.y); ctx.lineTo(st.x + st.w * 0.5, st.y + st.h * 0.6); ctx.lineTo(st.x + st.w * 0.35, st.y + st.h); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(st.x + 0.5, st.y + 0.5, st.w - 1, st.h - 1);
}

/** True if a live tank sits at (x,y) — used for direct hits. */
function hitTank(g: GameState, x: number, y: number): boolean {
  for (const t of g.tanks) {
    if (!t.alive) continue;
    if (Math.abs(t.x - x) < 12 && Math.abs(t.y - y) < 12) return true;
  }
  return false;
}
