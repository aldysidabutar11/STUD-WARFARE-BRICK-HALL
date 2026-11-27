// src/world/NavGraph.ts — node & edge (template {H}/{X} seperti GDD §11.6) + A* + validator runtime.
// Template per map ada di MapDef.nav (Brick Hall: world/maps/brickhall.ts) — graf dibangun ulang tiap ganti map.
import { XCFG } from '../config/extraConfig';
import type { NavTemplate } from './maps/types';

export type EdgeKind = 'walk' | 'door' | 'stair' | 'drop';
/** level = Y lantai node (0 = lantai dasar, 10 = lantai 2 Brick Hall). */
export interface NavNode { id: string; x: number; y: number; z: number; level: number; cover: boolean; side: 'S' | 'N' | 'C' }
export interface NavEdge { a: number; b: number; kind: EdgeKind; cost: number; oneWay: boolean;
  /** Gerbang (opsional): edge hanya dilalui saat gerbang terbuka (kaca pecah Boston). */
  gate?: string }

function expandName(t: string, h: 'S' | 'N', x: 'W' | 'E') { return t.replace('{H}', h).replace('{X}', x); }

export class NavGraph {
  readonly nodes: NavNode[] = [];
  readonly edges: NavEdge[] = [];
  readonly adj: { to: number; edge: NavEdge }[][] = [];
  readonly byId = new Map<string, number>();
  /** Info drop: takeoff node → landing shelf id. */
  readonly dropInfo = new Map<NavEdge, string>();
  /** Gerbang yang sedang terbuka (edge bergerbang hanya dilalui bila gerbangnya ada di sini). */
  private readonly openGates = new Set<string>();
  /** Toleransi lantai `nearest` (NavTemplate.levelTol); undefined = aturan lama lantai 0 / 10. */
  private readonly levelTol: number | undefined;

  /** {H} = S (Biru, Z negatif) / N (Merah); {X} = W (X negatif) / E; C_ = garis tengah Z = 0. Koordinat template untuk H=S, X=W. */
  constructor(tpl: NavTemplate) {
    const { nodes: NODE_T, edges: EDGE_T, drops: DROP_T = [], cover: COVER_T } = tpl;
    this.levelTol = tpl.levelTol;
    if (tpl.asym) { this.buildAsym(tpl); return; }
    for (const [t, x0, z0, lvl] of NODE_T) {
      const hs: ('S' | 'N')[] = t.includes('{H}') ? ['S', 'N'] : ['S'];
      const xs: ('W' | 'E')[] = t.includes('{X}') ? ['W', 'E'] : ['W'];
      for (const h of hs) for (const xx of xs) {
        const id = expandName(t, h, xx);
        if (this.byId.has(id)) continue;
        const x = xx === 'E' ? -x0 : x0, z = h === 'N' ? -z0 : z0;
        const side: 'S' | 'N' | 'C' = t.startsWith('C_') ? 'C' : h;
        this.byId.set(id, this.nodes.length);
        this.nodes.push({ id, x: x === 0 ? 0 : x, y: lvl, z: z === 0 ? 0 : z, level: lvl, cover: false, side });
        this.adj.push([]);
      }
    }
    for (const t of COVER_T) for (const h of ['S', 'N'] as const) for (const xx of ['W', 'E'] as const) {
      const i = this.byId.get(expandName(t, h, xx));
      if (i !== undefined) this.nodes[i].cover = true;
    }
    const seen = new Set<string>();
    for (const [ta, tb, kind] of EDGE_T) for (const h of ['S', 'N'] as const) for (const xx of ['W', 'E'] as const) {
      const a = this.byId.get(expandName(ta, h, xx)), b = this.byId.get(expandName(tb, h, xx));
      if (a === undefined || b === undefined) throw new Error(`NavGraph: edge ${ta}-${tb}`);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      this.addEdge(a, b, kind, false);
    }
    for (const [ta, tb, shelf] of DROP_T) for (const h of ['S', 'N'] as const) for (const xx of ['W', 'E'] as const) {
      const a = this.byId.get(expandName(ta, h, xx))!, b = this.byId.get(expandName(tb, h, xx))!;
      const e = this.addEdge(a, b, 'drop', true);
      this.dropInfo.set(e, `${shelf}_${h}${xx}`);
    }
  }

  /** Map asimetris: node & edge apa adanya, sisi node dari tpl.asym.side, drop = [takeoff, landing, id balok pendaratan]. */
  private buildAsym(tpl: NavTemplate) {
    for (const [id, x, z, lvl] of tpl.nodes) {
      if (this.byId.has(id)) throw new Error(`NavGraph: node ganda ${id}`);
      this.byId.set(id, this.nodes.length);
      this.nodes.push({ id, x, y: lvl, z, level: lvl, cover: false, side: tpl.asym!.side(x, z, lvl) });
      this.adj.push([]);
    }
    for (const id of tpl.cover) { const i = this.byId.get(id); if (i !== undefined) this.nodes[i].cover = true; }
    for (const [ta, tb, kind, gate] of tpl.edges) {
      const a = this.byId.get(ta), b = this.byId.get(tb);
      if (a === undefined || b === undefined) throw new Error(`NavGraph: edge ${ta}-${tb}`);
      const e = this.addEdge(a, b, kind, false);
      if (gate) e.gate = gate;
    }
    for (const [ta, tb, box] of tpl.drops ?? []) {
      const a = this.byId.get(ta), b = this.byId.get(tb);
      if (a === undefined || b === undefined) throw new Error(`NavGraph: drop ${ta}-${tb}`);
      this.dropInfo.set(this.addEdge(a, b, 'drop', true), box);
    }
  }

  /** Buka/tutup gerbang (mis. panel kaca pecah → edge lewat panel itu bisa dilalui). */
  setGate(gate: string, open: boolean) { if (open) this.openGates.add(gate); else this.openGates.delete(gate); }
  gateOpen(gate: string) { return this.openGates.has(gate); }

  private addEdge(a: number, b: number, kind: EdgeKind, oneWay: boolean): NavEdge {
    const A = this.nodes[a], B = this.nodes[b];
    let cost = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
    if (kind === 'stair') cost *= XCFG.bots.stairCost;
    const e: NavEdge = { a, b, kind, cost, oneWay };
    this.edges.push(e);
    this.adj[a].push({ to: b, edge: e });
    if (!oneWay) this.adj[b].push({ to: a, edge: e });
    return e;
  }

  get walkEdgeCount() { return this.edges.filter(e => !e.oneWay).length; }
  get dropCount() { return this.edges.filter(e => e.oneWay).length; }

  id(name: string) { const i = this.byId.get(name); if (i === undefined) throw new Error('node ' + name); return i; }

  /** Node terdekat (lebih suka level yang sama dengan posisi Y). */
  nearest(x: number, y: number, z: number): number {
    // jarak kuadrat (tanpa Math.hypot — terukur ±1.3 MB/s sampah dari panggilan bot); penalti lantai lain 1e6 > (diagonal map)²
    // sehingga urutan hasil identik dengan jarak + 1000
    let best = 0, bd = Infinity;
    const lvl = y > 5 ? 10 : 0, tol = this.levelTol;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i], dx = n.x - x, dz = n.z - z;
      const same = tol === undefined ? n.level === lvl : Math.abs(n.level - y) <= tol;
      const d = dx * dx + dz * dz + (same ? 0 : 1e6);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // A* — heuristik jarak Euclid 3D; biaya = panjang edge (tangga × 1.2)
  private gScore: Float64Array = new Float64Array(0);
  private fScore: Float64Array = new Float64Array(0);
  private came: Int32Array = new Int32Array(0);
  private cameEdge: (NavEdge | null)[] = [];
  private open: number[] = [];
  private inOpen: Uint8Array = new Uint8Array(0);

  findPath(from: number, to: number, allowDrops: boolean, out: number[], outEdges?: (NavEdge | null)[]): boolean {
    const n = this.nodes.length;
    if (this.gScore.length !== n) {
      this.gScore = new Float64Array(n); this.fScore = new Float64Array(n); this.came = new Int32Array(n);
      this.inOpen = new Uint8Array(n); this.cameEdge = new Array(n).fill(null);
    }
    this.gScore.fill(Infinity); this.fScore.fill(Infinity); this.came.fill(-1); this.inOpen.fill(0); this.cameEdge.fill(null);
    const T = this.nodes[to];
    const h = (i: number) => { const N = this.nodes[i]; return Math.hypot(N.x - T.x, N.y - T.y, N.z - T.z); };
    this.open.length = 0;
    this.gScore[from] = 0; this.fScore[from] = h(from); this.open.push(from); this.inOpen[from] = 1;
    while (this.open.length) {
      let bi = 0;
      for (let i = 1; i < this.open.length; i++) if (this.fScore[this.open[i]] < this.fScore[this.open[bi]]) bi = i;
      const cur = this.open[bi];
      this.open[bi] = this.open[this.open.length - 1]; this.open.pop(); this.inOpen[cur] = 0;
      if (cur === to) {
        out.length = 0; if (outEdges) outEdges.length = 0;
        let c = to;
        while (c !== -1) { out.push(c); if (outEdges) outEdges.push(this.cameEdge[c]); c = this.came[c]; }
        out.reverse(); if (outEdges) outEdges.reverse();
        return true;
      }
      for (const { to: nb, edge } of this.adj[cur]) {
        if (edge.kind === 'drop' && !allowDrops) continue;
        if (edge.gate && !this.openGates.has(edge.gate)) continue;
        const g = this.gScore[cur] + edge.cost;
        if (g < this.gScore[nb]) {
          this.came[nb] = cur; this.cameEdge[nb] = edge; this.gScore[nb] = g; this.fScore[nb] = g + h(nb);
          if (!this.inOpen[nb]) { this.open.push(nb); this.inOpen[nb] = 1; }
        }
      }
    }
    return false;
  }

  /** Validasi runtime: raycast antar-node (tinggi dada +2.5). `blocked` = true bila ada STATIC di antaranya. */
  validate(blocked: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => boolean): string[] {
    const warn: string[] = [];
    for (const e of this.edges) {
      if (e.kind === 'drop' || e.gate) continue;   // edge bergerbang (kaca utuh) memang terhalang sampai gerbangnya terbuka
      const A = this.nodes[e.a], B = this.nodes[e.b];
      if (blocked(A.x, A.y + 2.5, A.z, B.x, B.y + 2.5, B.z)) warn.push(`edge ${A.id} ↔ ${B.id} terhalang`);
    }
    return warn;
  }
}
