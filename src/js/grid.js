// ============================================================================
// Void Protocol — Puzzle Grid Engine
// Pure logic (no DOM). Models the 5x5 element grid and the three core
// mechanics: Gravity Shift, Space Collapse and match resolution with cascades.
//
// A cell is either an element id (string) or null (empty hole).
// ============================================================================

import { GRID_SIZE, ELEMENT_IDS, ELEMENTS, MIN_MATCH } from './config.js';

const DIRS = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 },
};

function randElement(rng) {
  return ELEMENT_IDS[Math.floor(rng() * ELEMENT_IDS.length)];
}

export class Grid {
  constructor(size = GRID_SIZE, rng = Math.random) {
    this.size = size;
    this.rng = rng;
    this.cells = [];
    this.fill();
  }

  // --- Helpers ------------------------------------------------------------
  idx(x, y) { return y * this.size + x; }
  get(x, y) { return this.cells[this.idx(x, y)]; }
  set(x, y, v) { this.cells[this.idx(x, y)] = v; }
  clone() {
    const g = new Grid(this.size, this.rng);
    g.cells = this.cells.slice();
    return g;
  }
  snapshot() { return this.cells.slice(); }
  restore(snap) { this.cells = snap.slice(); }

  // Fill the whole board with random elements, avoiding pre-made matches so
  // the opening board is a clean slate the player must work.
  fill() {
    this.cells = new Array(this.size * this.size).fill(null);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let e, guard = 0;
        do {
          e = randElement(this.rng);
          guard++;
        } while (guard < 30 && this._wouldMatch(x, y, e));
        this.set(x, y, e);
      }
    }
  }

  // Would placing `e` at (x,y) create an immediate 3-in-a-row with already
  // placed (left / up) neighbours?
  _wouldMatch(x, y, e) {
    if (x >= 2 && this.get(x - 1, y) === e && this.get(x - 2, y) === e) return true;
    if (y >= 2 && this.get(x, y - 1) === e && this.get(x, y - 2) === e) return true;
    return false;
  }

  // --- Mechanic: Space Collapse ------------------------------------------
  // Slide every tile toward `dir`, compacting out holes. No refill — the
  // board genuinely shrinks, squeezing tiles together to force matches.
  // Returns true if anything moved.
  collapse(dir) {
    const d = DIRS[dir];
    if (!d) throw new Error('bad dir ' + dir);
    let moved = false;
    const lines = this._lines(dir);
    for (const line of lines) {
      const tiles = line.map(([x, y]) => this.get(x, y)).filter(v => v !== null);
      // Pack tiles to the "far" end (the end the line walks toward).
      const packed = new Array(line.length).fill(null);
      for (let i = 0; i < tiles.length; i++) {
        packed[line.length - tiles.length + i] = tiles[i];
      }
      for (let i = 0; i < line.length; i++) {
        const [x, y] = line[i];
        if (this.get(x, y) !== packed[i]) moved = true;
        this.set(x, y, packed[i]);
      }
    }
    return moved;
  }

  // --- Mechanic: Gravity Shift (rigid wrap) ------------------------------
  // Translate the WHOLE board one cell toward `dir`; tiles (and holes) leaving
  // an edge wrap around to the opposite edge. This always repositions tiles —
  // even on a completely full board — so the player can deliberately line up
  // matches. Returns true (it always moves a non-empty board).
  shift(dir) {
    const n = this.size;
    const next = new Array(n * n).fill(null);
    let dx = 0, dy = 0;
    if (dir === 'up') dy = -1;
    else if (dir === 'down') dy = 1;
    else if (dir === 'left') dx = -1;
    else if (dir === 'right') dx = 1;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const nx = (x + dx + n) % n;
        const ny = (y + dy + n) % n;
        next[ny * n + nx] = this.cells[y * n + x];
      }
    }
    const moved = next.some((v, i) => v !== this.cells[i]);
    this.cells = next;
    return moved;
  }

  // --- Mechanic: Gravity Shift (conveyor) --------------------------------
  // Slide every tile one cell toward `dir`. The line of tiles pushed off the
  // far edge is discarded and a fresh line of random tiles feeds in from the
  // near (chosen) edge. This always churns the board with new material — even
  // when full — giving the player a controllable stream to build matches from.
  conveyor(dir) {
    const lines = this._lines(dir);            // index 0 = near (entry) end
    for (const line of lines) {
      const tiles = line.map(([x, y]) => this.get(x, y));
      // drop the far tile, push everything along, inject fresh at the near end
      const moved = [randElement(this.rng), ...tiles.slice(0, line.length - 1)];
      for (let i = 0; i < line.length; i++) {
        const [x, y] = line[i];
        this.set(x, y, moved[i]);
      }
    }
    return true;
  }

  // --- Mechanic: Gravity refill ------------------------------------------
  // Tiles fall toward `dir` (compacting holes) AND new tiles drop in from the
  // opposite edge to refill. This keeps the board fed and is the primary
  // engine of play. Returns true if anything changed.
  gravity(dir) {
    const lines = this._lines(dir);
    let changed = false;
    for (const line of lines) {
      const existing = line.map(([x, y]) => this.get(x, y)).filter(v => v !== null);
      const needed = line.length - existing.length;
      const fresh = [];
      for (let i = 0; i < needed; i++) fresh.push(randElement(this.rng));
      // New tiles enter from the near end, existing tiles settle at the far end.
      const result = [...fresh, ...existing];
      for (let i = 0; i < line.length; i++) {
        const [x, y] = line[i];
        if (this.get(x, y) !== result[i]) changed = true;
        this.set(x, y, result[i]);
      }
    }
    return changed;
  }

  // Produce the ordered list of lines for a direction. Each line is an array
  // of [x,y] ordered so that index 0 is the "near" (entry) end and the last
  // index is the "far" (settle) end that tiles pack toward.
  _lines(dir) {
    const n = this.size;
    const lines = [];
    if (dir === 'down') {
      for (let x = 0; x < n; x++) {
        const line = [];
        for (let y = 0; y < n; y++) line.push([x, y]); // top -> bottom
        lines.push(line);
      }
    } else if (dir === 'up') {
      for (let x = 0; x < n; x++) {
        const line = [];
        for (let y = n - 1; y >= 0; y--) line.push([x, y]); // bottom -> top
        lines.push(line);
      }
    } else if (dir === 'right') {
      for (let y = 0; y < n; y++) {
        const line = [];
        for (let x = 0; x < n; x++) line.push([x, y]); // left -> right
        lines.push(line);
      }
    } else { // left
      for (let y = 0; y < n; y++) {
        const line = [];
        for (let x = n - 1; x >= 0; x--) line.push([x, y]); // right -> left
        lines.push(line);
      }
    }
    return lines;
  }

  // --- Matching -----------------------------------------------------------
  // Find all matched groups (runs of MIN_MATCH+ same element, horizontal or
  // vertical). Overlapping runs that share tiles are merged into one group so
  // that an L / T / cross shape counts once. Returns array of groups:
  //   { element, cells: [[x,y],...] }
  findMatches() {
    const n = this.size;
    const matchedMask = new Array(n * n).fill(false);
    const runs = [];

    // Horizontal runs
    for (let y = 0; y < n; y++) {
      let runStart = 0;
      for (let x = 1; x <= n; x++) {
        const same = x < n && this.get(x, y) !== null && this.get(x, y) === this.get(runStart, y);
        if (!same) {
          const len = x - runStart;
          if (this.get(runStart, y) !== null && len >= MIN_MATCH) {
            const cells = [];
            for (let i = runStart; i < x; i++) cells.push([i, y]);
            runs.push(cells);
          }
          runStart = x;
        }
      }
    }
    // Vertical runs
    for (let x = 0; x < n; x++) {
      let runStart = 0;
      for (let y = 1; y <= n; y++) {
        const same = y < n && this.get(x, y) !== null && this.get(x, y) === this.get(x, runStart);
        if (!same) {
          const len = y - runStart;
          if (this.get(x, runStart) !== null && len >= MIN_MATCH) {
            const cells = [];
            for (let i = runStart; i < y; i++) cells.push([x, i]);
            runs.push(cells);
          }
          runStart = y;
        }
      }
    }

    if (runs.length === 0) return [];

    // Merge runs that share a cell (same element guaranteed by construction).
    for (const run of runs) for (const [x, y] of run) matchedMask[this.idx(x, y)] = true;
    const groups = this._mergeConnected(matchedMask);
    return groups;
  }

  // Flood-fill matched cells into connected groups of identical element.
  _mergeConnected(mask) {
    const n = this.size;
    const seen = new Array(n * n).fill(false);
    const groups = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const id = this.idx(x, y);
        if (!mask[id] || seen[id]) continue;
        const element = this.get(x, y);
        const stack = [[x, y]];
        const cells = [];
        seen[id] = true;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          cells.push([cx, cy]);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
            const nid = this.idx(nx, ny);
            if (mask[nid] && !seen[nid] && this.get(nx, ny) === element) {
              seen[nid] = true;
              stack.push([nx, ny]);
            }
          }
        }
        groups.push({ element, cells });
      }
    }
    return groups;
  }

  // Clear the given groups (set to null).
  clearGroups(groups) {
    for (const g of groups) for (const [x, y] of g.cells) this.set(x, y, null);
  }

  isEmpty() { return this.cells.every(c => c === null); }
  tileCount() { return this.cells.filter(c => c !== null).length; }
}

export { DIRS };
