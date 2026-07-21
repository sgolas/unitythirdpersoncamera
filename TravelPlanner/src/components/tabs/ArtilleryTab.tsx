import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Users, Loader2, Crosshair, Wind, Maximize2, Minimize2, X, ChevronUp, ChevronDown } from 'lucide-react';
import { TabHeader } from '../ui';
import { getSyncCode, isSyncConfigured } from '../../lib/config';
import { chatDeviceId } from '../../lib/chatUnread';
import { getDeviceName } from '../../db/database';
import { useTravelers } from '../../hooks/useTrip';
import type { Room, Peer } from '../../lib/realtime';
import {
  WORLD, GRAVITY, WIND_ACCEL, WEAPONS, weaponById, newGame, launch, explode,
  nextTurn, checkOver, terrainAt, snapshot, applySnapshot,
  type GameState, type PlayerSeed, type Snapshot,
} from '../../game/artillery';

type Proj = { x: number; y: number; vx: number; vy: number; weapon: string; rolling?: boolean; rollDist?: number; split?: boolean; dead?: boolean; life?: number };
type Flash = { x: number; y: number; r: number; t: number; color: string };

export function ArtilleryTab() {
  const travelers = useTravelers();
  const myId = chatDeviceId();
  const myName = travelers[0]?.name || getDeviceName();
  const configured = isSyncConfigured();

  const [screen, setScreen] = useState<'menu' | 'lobby' | 'game'>('menu');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const roomRef = useRef<Room | null>(null);
  const online = useRef(false);

  const gameRef = useRef<GameState | null>(null);
  const [, force] = useState(0);
  const rerender = useCallback(() => force(v => v + 1), []);

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
  useEffect(() => {
    const onChange = () => setNativeFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Collapse the battle bar to reclaim the whole screen for the field.
  const [barOpen, setBarOpen] = useState(true);

  // ── Realtime lobby ────────────────────────────────────────────────
  async function goOnline() {
    setConnecting(true); setError('');
    try {
      const { joinRoom } = await import('../../lib/realtime');
      const room = await joinRoom(`artillery:${getSyncCode()}`, { id: myId, name: myName, emoji: travelers[0]?.emoji || '🎮' });
      roomRef.current = room; online.current = true;
      room.onPeers(p => setPeers([...p]));
      room.on('start', (payload: { seed: number; players: PlayerSeed[] }) => {
        gameRef.current = newGame(payload.seed, payload.players);
        setScreen('game'); rerender();
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

  function startOnlineGame() {
    const room = roomRef.current; if (!room) return;
    const players: PlayerSeed[] = room.peers().map(p => ({ id: String(p.id), name: String(p.name || 'Player') }));
    if (players.length < 2) { setError('Need at least 2 players in the room to start.'); return; }
    const seed = (Math.random() * 2 ** 31) | 0;
    room.send('start', { seed, players });
  }

  function startHotseat() {
    online.current = false; roomRef.current?.leave(); roomRef.current = null;
    const players: PlayerSeed[] = [{ id: 'p1', name: 'Player 1' }, { id: 'p2', name: 'Player 2' }];
    gameRef.current = newGame((Math.random() * 2 ** 31) | 0, players);
    setScreen('game'); rerender();
  }

  function quitGame() {
    cancelAnim();
    if (document.fullscreenElement) (document.exitFullscreen?.() as any)?.catch?.(() => {});
    if (online.current) { setScreen('lobby'); }
    else { gameRef.current = null; setScreen('menu'); }
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
    const l = launch(t);
    simRef.current = { projs: [{ ...l, weapon: t.weapon }], flashes: simRef.current?.flashes ?? [], authority };
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
      if (p.life > 2000) { p.dead = true; continue; }
      if (p.rolling) {
        const dir = terrainAt(g, p.x + 3) <= terrainAt(g, p.x - 3) ? 1 : -1;
        p.x += dir * 2.4; p.y = terrainAt(g, p.x); p.rollDist = (p.rollDist ?? 0) + 2.4;
        const settled = terrainAt(g, p.x - 3) >= p.y && terrainAt(g, p.x + 3) >= p.y;
        if (settled || (p.rollDist ?? 0) > 340 || p.x < 4 || p.x > WORLD.w - 4) impact(p, sim);
        continue;
      }
      p.vy += GRAVITY; p.vx += wind * WIND_ACCEL; p.x += p.vx; p.y += p.vy;
      // MIRV splits into three on the way down — children are 'split' so they
      // don't re-split, and we cap the total to be safe.
      if (w.kind === 'mirv' && !p.split && p.vy > 1.5 && sim.projs.length < 24) {
        p.split = true; p.dead = true;
        for (const dvx of [-1.6, 0, 1.6]) sim.projs.push({ x: p.x, y: p.y, vx: p.vx + dvx, vy: p.vy, weapon: 'mirv', split: true });
        continue;
      }
      if (p.y >= terrainAt(g, p.x) || hitTank(g, p.x, p.y)) {
        if (w.kind === 'roller' && !p.rolling) { p.rolling = true; p.y = terrainAt(g, p.x); continue; }
        impact(p, sim);
      } else if (p.x < -20 || p.x > WORLD.w + 20 || p.y > WORLD.h + 40) {
        p.dead = true; // dud — flew off the world
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
  }

  function resolve(sim: { projs: Proj[]; flashes: Flash[]; authority: boolean }) {
    const g = gameRef.current!;
    if (sim.authority) {
      checkOver(g);
      if (g.phase !== 'over') nextTurn(g);
      if (online.current) roomRef.current?.send('snap', snapshot(g));
      else g.phase = g.phase === 'over' ? 'over' : 'aim';
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
    // Fit the fixed 960×540 world into the canvas, centred (letterbox), and
    // paint the whole canvas so there are no bare edges.
    const scale = Math.min(cw / WORLD.w, ch / WORLD.h);
    const ox = (cw - WORLD.w * scale) / 2;
    const oy = (ch - WORLD.h * scale) / 2;
    // sky fills the entire canvas (including any letterbox margin)
    const sky = ctx.createLinearGradient(0, 0, 0, ch);
    sky.addColorStop(0, '#0b1220'); sky.addColorStop(1, '#1e293b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
    // terrain — extended down past the world floor so the ground meets the
    // bottom screen edge even when the field is letterboxed.
    const floor = WORLD.h + oy / scale + 4;
    ctx.beginPath(); ctx.moveTo(0, floor);
    ctx.lineTo(0, g.terrain[0]);
    for (let x = 1; x < WORLD.w; x++) ctx.lineTo(x, g.terrain[x]);
    ctx.lineTo(WORLD.w, floor); ctx.closePath();
    const grd = ctx.createLinearGradient(0, WORLD.h * 0.3, 0, WORLD.h);
    grd.addColorStop(0, '#3f6212'); grd.addColorStop(1, '#1a2e05');
    ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, g.terrain[0]);
    for (let x = 1; x < WORLD.w; x++) ctx.lineTo(x, g.terrain[x]);
    ctx.strokeStyle = '#65a30d'; ctx.lineWidth = 2; ctx.stroke();
    // tanks
    for (const t of g.tanks) {
      if (!t.alive) { ctx.globalAlpha = 0.35; }
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.ellipse(t.x, t.y - 5, 13, 7, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(t.x - 13, t.y - 5, 26, 5);
      // barrel
      const a = (t.angle * Math.PI) / 180;
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(t.x, t.y - 8); ctx.lineTo(t.x + Math.cos(a) * 18, t.y - 8 - Math.sin(a) * 18); ctx.stroke();
      // health bar
      if (t.alive) {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(t.x - 15, t.y - 24, 30, 5);
        ctx.fillStyle = t.health > 40 ? '#4ade80' : '#f87171'; ctx.fillRect(t.x - 15, t.y - 24, 30 * (t.health / 100), 5);
      }
      ctx.globalAlpha = 1;
    }
    // projectiles + flashes
    const sim = simRef.current;
    if (sim) {
      for (const p of sim.projs) { if (p.dead) continue; ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 7); ctx.fill(); }
      for (const f of sim.flashes) {
        const a = 1 - f.t / 18; ctx.globalAlpha = a;
        ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + f.t / 24), 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
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

  return (
    <div className="animate-fadeUp">
      <TabHeader title="Trip Artillery" subtitle="Live tank battle with your trip" gradient="linear-gradient(135deg,#7c2d12,#ea580c)" icon="💣" />

      <div className="px-4 py-4 space-y-4">
        {screen === 'menu' && (
          <div className="space-y-3">
            <p className="text-sm text-muted">A turn-based artillery duel — adjust your angle and power, pick a weapon, and blow up the terrain. Play live with everyone on your trip, or pass one phone around.</p>
            {error && <p className="text-sm text-sunset">{error}</p>}
            <button onClick={goOnline} disabled={!configured || connecting}
              className="w-full accent-gradient text-white font-bold rounded-2xl py-3.5 flex items-center justify-center gap-2 press disabled:opacity-50">
              {connecting ? <Loader2 size={18} className="animate-spin" /> : <Users size={18} />}
              {connecting ? 'Connecting…' : 'Play live with the trip'}
            </button>
            {!configured && <p className="text-xs text-muted text-center">Set up trip sharing (Settings) to play live with the family.</p>}
            <button onClick={startHotseat} className="w-full bg-surface border border-line rounded-2xl py-3.5 font-bold text-content press">
              Pass &amp; play (this phone)
            </button>
          </div>
        )}

        {screen === 'lobby' && (
          <div className="space-y-4">
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
            <p className="text-xs text-muted text-center">Everyone on the trip who opens Trip Artillery shows up here. Start when your players are in.</p>
            {error && <p className="text-sm text-sunset text-center">{error}</p>}
            <button onClick={startOnlineGame} disabled={peers.length < 2}
              className="w-full accent-gradient text-white font-bold rounded-2xl py-3.5 press disabled:opacity-50">
              Start battle ({peers.length} in)
            </button>
            <button onClick={() => { roomRef.current?.leave(); roomRef.current = null; online.current = false; setScreen('menu'); }}
              className="w-full text-muted text-sm py-2">Leave room</button>
          </div>
        )}

        {screen === 'game' && g && createPortal(
          // Portal to <body> so the fixed overlay is viewport-relative (the tab's
          // own `animate-fadeUp` transform would otherwise become its containing
          // block and shrink the field to the tab's content height).
          <div ref={wrapRef} className="fixed inset-0 z-[300] bg-slate-950 overflow-hidden select-none">
            {/* Full-bleed battlefield */}
            <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

            {/* ── Top HUD: quit · turn/wind · fullscreen ── */}
            <div className="absolute top-0 left-0 right-0 flex items-start justify-between gap-2 px-3 pointer-events-none"
              style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
              <button onClick={quitGame} aria-label="Quit game"
                className="pointer-events-auto w-9 h-9 rounded-full bg-black/45 text-white/90 active:bg-black/70 flex items-center justify-center backdrop-blur">
                <X size={18} />
              </button>

              <div className="flex flex-wrap items-center justify-center gap-2 max-w-[60%]">
                <span className="px-3 py-1.5 rounded-full bg-black/45 backdrop-blur text-sm font-bold whitespace-nowrap" style={{ color: active?.color }}>
                  {g.phase === 'over'
                    ? (g.winnerId ? `${g.tanks.find(t => t.id === g.winnerId)?.name} wins! 🏆` : 'Draw')
                    : myTurn ? 'Your turn' : `${active?.name}’s turn`}
                </span>
                <span className="px-3 py-1.5 rounded-full bg-black/45 backdrop-blur text-sm text-white/85 flex items-center gap-1.5 whitespace-nowrap">
                  <Wind size={14} /> {g.wind === 0 ? 'calm' : `${Math.abs(g.wind * 100) | 0} ${g.wind > 0 ? '→' : '←'}`}
                </span>
              </div>

              <button onClick={toggleNativeFs} aria-label={nativeFs ? 'Exit full screen' : 'Full screen'}
                className="pointer-events-auto w-9 h-9 rounded-full bg-black/45 text-white/90 active:bg-black/70 flex items-center justify-center backdrop-blur">
                {nativeFs ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            </div>

            {/* Player health chips */}
            <div className="absolute left-0 right-0 flex flex-wrap gap-1.5 justify-center px-3 pointer-events-none"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 54px)' }}>
              {g.tanks.map(t => (
                <span key={t.id} className={`text-[11px] font-bold px-2 py-0.5 rounded-full backdrop-blur ${t.alive ? '' : 'opacity-40 line-through'}`}
                  style={{ background: `${t.color}33`, color: t.color, boxShadow: t.id === active?.id && g.phase !== 'over' ? `0 0 0 1.5px ${t.color}` : 'none' }}>
                  {t.name} · {t.health}
                </span>
              ))}
            </div>

            {/* ── Bottom RTS battle bar ── */}
            <div className="absolute left-0 right-0 bottom-0 px-2 pointer-events-none"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
              <div className="flex justify-center mb-1">
                <button onClick={() => setBarOpen(o => !o)} aria-label={barOpen ? 'Hide controls' : 'Show controls'}
                  className="pointer-events-auto px-5 h-6 rounded-t-lg bg-slate-900/85 backdrop-blur border border-white/10 border-b-0 text-white/70 flex items-center">
                  {barOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              </div>

              {barOpen && (
                <div className="pointer-events-auto mx-auto max-w-3xl bg-slate-900/85 backdrop-blur border border-white/10 rounded-2xl p-3 shadow-2xl">
                  {g.phase === 'over' ? (
                    <button onClick={() => (online.current ? startOnlineGame() : startHotseat())}
                      className="w-full accent-gradient text-white font-bold rounded-xl py-3 press">Rematch</button>
                  ) : myTurn && active ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-[11px] font-semibold text-white/60">Angle <span className="text-white">{active.angle}°</span>
                          <input type="range" min={0} max={180} value={active.angle} onChange={e => setAim({ angle: +e.target.value })} className="w-full accent-orange-500" />
                        </label>
                        <label className="text-[11px] font-semibold text-white/60">Power <span className="text-white">{active.power}</span>
                          <input type="range" min={5} max={100} value={active.power} onChange={e => setAim({ power: +e.target.value })} className="w-full accent-orange-500" />
                        </label>
                      </div>
                      <div className="flex items-stretch gap-2">
                        <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
                          {WEAPONS.map(w => (
                            <button key={w.id} onClick={() => setAim({ weapon: w.id })}
                              className={`flex-shrink-0 w-14 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl border text-white ${active.weapon === w.id ? 'bg-orange-500/25 border-orange-400' : 'bg-white/5 border-white/10'}`}>
                              <span className="text-lg leading-none">{w.emoji}</span>
                              <span className="text-[9px] font-semibold text-white/70 leading-tight text-center">{w.name}</span>
                            </button>
                          ))}
                        </div>
                        <button onClick={fire} aria-label="Fire"
                          className="flex-shrink-0 w-24 accent-gradient text-white font-extrabold rounded-xl flex flex-col items-center justify-center gap-0.5 press">
                          <Crosshair size={20} /> FIRE
                        </button>
                      </div>
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

/** True if a live tank sits at (x,y) — used for direct hits. */
function hitTank(g: GameState, x: number, y: number): boolean {
  for (const t of g.tanks) {
    if (!t.alive) continue;
    if (Math.abs(t.x - x) < 12 && Math.abs(t.y - y) < 12) return true;
  }
  return false;
}
