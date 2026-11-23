// src/world/NavGraph.ts — node & edge (template {H}/{X} seperti GDD §11.6) + A* + validator runtime.
import { XCFG } from '../config/extraConfig';

export type EdgeKind = 'walk' | 'door' | 'stair' | 'drop';
export interface NavNode { id: string; x: number; y: number; z: number; level: 0 | 10; cover: boolean; side: 'S' | 'N' | 'C' }
export interface NavEdge { a: number; b: number; kind: EdgeKind; cost: number; oneWay: boolean }

// {H} = S (Biru, Z negatif) / N (Merah); {X} = W (X negatif) / E; C_ = garis tengah Z = 0. Koordinat untuk H=S, X=W.
const NODE_T: [string, number, number, 0 | 10][] = [
  ['{H}_SPAWN', 0, -47, 10], ['{H}_DOORIN_{X}', -7, -44.6, 10], ['{H}_DOOR_{X}', -7, -42, 10],
  ['{H}_FRONT', 0, -40.5, 10], ['{H}_LOOK', 0, -36.5, 10], ['{H}_BRMOUTH_{X}', -8, -37, 10],
  ['{H}_BR0_{X}', -8, -33, 10], ['{H}_BR1_{X}', -8, -25, 10], ['{H}_BR2_{X}', -8, -12, 10],
  ['{H}_ROT_{X}', -8, -5, 10], ['C_ROT_{X}', -6.5, 0, 10], ['{H}_ROTC', 0, -4, 10],
  ['{H}_DOOROUT_{X}', -10.8, -42, 10], ['{H}_YARD_{X}', -12, -38.5, 10], ['{H}_WING_{X}', -24, -45, 10],
  ['{H}_LANDIN_{X}', -19.5, -36.3, 10], ['{H}_CORNER_{X}', -24, -37.5, 10], ['{H}_INNER_{X}', -28.1, -37.5, 10],
  ['{H}_LAND_{X}', -19.5, -33.9, 10], ['{H}_WALK_{X}', -24.05, -20, 10], ['{H}_HALL_{X}', -28.1, -20, 10],
  ['{H}_WALKB_{X}', -24.05, -10, 10], ['C_WALK_{X}', -24.05, 0, 10], ['C_HALL_{X}', -28.1, 0, 10],
  ['{H}_F_STAIR_{X}', -19.5, -17, 0], ['{H}_F_SIDE_{X}', -19.5, -7, 0], ['C_F_SIDE_{X}', -19.5, 0, 0],
  ['{H}_F_TABLE_{X}', -9.5, -6, 0], ['C_F_TABLE_{X}', -11, 0, 0], ['{H}_F_MID_{X}', -10.5, -16, 0],
  ['{H}_F_SHELFA_{X}', -10.5, -25, 0], ['{H}_F_END_{X}', -10.5, -31.5, 0], ['{H}_F_END', 0, -31.5, 0],
  ['{H}_F_VOID', 0, -20, 0], ['{H}_F_PILLAR_{X}', -4.5, -21.5, 0], ['{H}_F_CEN_{X}', -4, -10, 0],
  ['{H}_F_DESK', 0, -5, 0], ['C_F_GAP_{X}', -4, 0, 0],
];

const EDGE_T: [string, string, EdgeKind][] = [
  ['{H}_SPAWN', '{H}_DOORIN_{X}', 'walk'], ['{H}_DOORIN_{X}', '{H}_DOOR_{X}', 'door'],
  ['{H}_DOOR_{X}', '{H}_FRONT', 'walk'], ['{H}_DOOR_{X}', '{H}_DOOROUT_{X}', 'walk'],
  ['{H}_DOOROUT_{X}', '{H}_YARD_{X}', 'walk'], ['{H}_DOOROUT_{X}', '{H}_WING_{X}', 'walk'],
  ['{H}_FRONT', '{H}_LOOK', 'walk'], ['{H}_YARD_{X}', '{H}_BRMOUTH_{X}', 'walk'], ['{H}_LOOK', '{H}_BRMOUTH_{X}', 'walk'],
  ['{H}_BRMOUTH_{X}', '{H}_BR0_{X}', 'walk'], ['{H}_BR0_{X}', '{H}_BR1_{X}', 'walk'], ['{H}_BR1_{X}', '{H}_BR2_{X}', 'walk'],
  ['{H}_BR2_{X}', '{H}_ROT_{X}', 'walk'], ['{H}_ROT_{X}', 'C_ROT_{X}', 'walk'], ['{H}_ROT_{X}', '{H}_ROTC', 'walk'],
  ['{H}_YARD_{X}', '{H}_LANDIN_{X}', 'walk'], ['{H}_LANDIN_{X}', '{H}_LAND_{X}', 'walk'], ['{H}_YARD_{X}', '{H}_CORNER_{X}', 'walk'],
  ['{H}_WING_{X}', '{H}_INNER_{X}', 'walk'], ['{H}_WING_{X}', '{H}_CORNER_{X}', 'walk'], ['{H}_CORNER_{X}', '{H}_INNER_{X}', 'walk'],
  ['{H}_CORNER_{X}', '{H}_LAND_{X}', 'walk'], ['{H}_CORNER_{X}', '{H}_WALK_{X}', 'walk'], ['{H}_INNER_{X}', '{H}_HALL_{X}', 'walk'],
  ['{H}_WALK_{X}', '{H}_HALL_{X}', 'door'], ['{H}_WALK_{X}', '{H}_WALKB_{X}', 'walk'], ['{H}_WALKB_{X}', 'C_WALK_{X}', 'walk'],
  ['{H}_HALL_{X}', 'C_HALL_{X}', 'walk'], ['C_WALK_{X}', 'C_HALL_{X}', 'door'],
  ['{H}_LAND_{X}', '{H}_F_STAIR_{X}', 'stair'],
  ['{H}_F_STAIR_{X}', '{H}_F_SIDE_{X}', 'walk'], ['{H}_F_STAIR_{X}', '{H}_F_MID_{X}', 'walk'],
  ['{H}_F_SIDE_{X}', 'C_F_SIDE_{X}', 'walk'], ['{H}_F_SIDE_{X}', '{H}_F_TABLE_{X}', 'walk'],
  ['{H}_F_MID_{X}', '{H}_F_TABLE_{X}', 'walk'], ['{H}_F_MID_{X}', '{H}_F_SHELFA_{X}', 'walk'],
  ['{H}_F_SHELFA_{X}', '{H}_F_END_{X}', 'walk'], ['{H}_F_END_{X}', '{H}_F_END', 'walk'], ['{H}_F_END', '{H}_F_VOID', 'walk'],
  ['{H}_F_VOID', '{H}_F_PILLAR_{X}', 'walk'], ['{H}_F_PILLAR_{X}', '{H}_F_CEN_{X}', 'walk'],
  ['{H}_F_CEN_{X}', '{H}_F_DESK', 'walk'], ['{H}_F_CEN_{X}', 'C_F_GAP_{X}', 'walk'],
  ['{H}_F_TABLE_{X}', 'C_F_TABLE_{X}', 'walk'], ['C_F_TABLE_{X}', 'C_F_GAP_{X}', 'walk'],
];

// Drop-down satu arah (opsional, bot Sulit): lompat pagar → atas rak (Y 4.0) → lantai.
const DROP_T: [string, string, string][] = [
  ['{H}_BR1_{X}', '{H}_F_SHELFA_{X}', 'SHELF_A'],
  ['{H}_WALKB_{X}', '{H}_F_MID_{X}', 'SHELF_B'],
];

const COVER_T = ['{H}_F_SHELFA_{X}', '{H}_F_PILLAR_{X}', '{H}_F_MID_{X}', '{H}_F_TABLE_{X}', 'C_F_GAP_{X}', 'C_F_TABLE_{X}',
  '{H}_F_END_{X}', '{H}_YARD_{X}', '{H}_DOOR_{X}', '{H}_HALL_{X}', 'C_HALL_{X}', '{H}_WING_{X}', '{H}_ROTC', 'C_ROT_{X}', '{H}_BRMOUTH_{X}'];

function expandName(t: string, h: 'S' | 'N', x: 'W' | 'E') { return t.replace('{H}', h).replace('{X}', x); }

export class NavGraph {
  readonly nodes: NavNode[] = [];
  readonly edges: NavEdge[] = [];
  readonly adj: { to: number; edge: NavEdge }[][] = [];
  readonly byId = new Map<string, number>();
  /** Info drop: takeoff node → landing shelf id. */
  readonly dropInfo = new Map<NavEdge, string>();

  constructor() {
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
    let best = 0, bd = Infinity;
    const lvl = y > 5 ? 10 : 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = Math.hypot(n.x - x, n.z - z) + (n.level === lvl ? 0 : 1000);
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
      if (e.kind === 'drop') continue;
      const A = this.nodes[e.a], B = this.nodes[e.b];
      if (blocked(A.x, A.y + 2.5, A.z, B.x, B.y + 2.5, B.z)) warn.push(`edge ${A.id} ↔ ${B.id} terhalang`);
    }
    return warn;
  }
}
