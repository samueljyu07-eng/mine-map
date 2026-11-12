// Terrain height grid: loading, height lookup and mesh building.
// World axes: x = east, y = up (elevation in metres), z = south. Origin = centre of the terrain box at sea level.
import * as THREE from 'three';

export interface TerrainMeta {
  grid: { nx: number; ny: number; cell_m: number; west: number; east: number; south: number; north: number };
  elevation_min_m: number;
  elevation_max_m: number;
  source: string;
  retrieved: string;
  datum_source_horizontal: string;
  lidar_1m_fraction: number;
  verified: boolean;
}

export class Terrain {
  readonly cx: number;
  readonly cn: number;
  constructor(readonly meta: TerrainMeta, readonly heights: Uint16Array) {
    const g = meta.grid;
    this.cx = (g.west + g.east) / 2;
    this.cn = (g.south + g.north) / 2;
  }

  /** UTM easting/northing -> world x/z. */
  toWorld(e: number, n: number): [number, number] {
    return [e - this.cx, this.cn - n];
  }
  toUtm(x: number, z: number): [number, number] {
    return [x + this.cx, this.cn - z];
  }
  inside(e: number, n: number): boolean {
    const g = this.meta.grid;
    return e >= g.west && e <= g.east && n >= g.south && n <= g.north;
  }

  /** Elevation in metres above sea level (bilinear between cell centres). */
  heightAt(e: number, n: number): number {
    const g = this.meta.grid;
    const fx = (e - g.west) / g.cell_m - 0.5;
    const fy = (g.north - n) / g.cell_m - 0.5;
    const x0 = Math.min(Math.max(Math.floor(fx), 0), g.nx - 2);
    const y0 = Math.min(Math.max(Math.floor(fy), 0), g.ny - 2);
    const tx = Math.min(Math.max(fx - x0, 0), 1);
    const ty = Math.min(Math.max(fy - y0, 0), 1);
    const h = this.heights;
    const i = y0 * g.nx + x0;
    const top = h[i] * (1 - tx) + h[i + 1] * tx;
    const bot = h[i + g.nx] * (1 - tx) + h[i + g.nx + 1] * tx;
    return (top * (1 - ty) + bot * ty) / 10;
  }

  /**
   * Geometry for one quarter of the terrain (row 0 = north half, col 0 = west half).
   * step = 1 uses every 10 m cell, step = 2 every second one (for phones and tablets).
   */
  buildQuadrant(row: number, col: number, step: number): THREE.BufferGeometry {
    const g = this.meta.grid;
    const range = (from: number, to: number) => {
      const out: number[] = [];
      for (let i = from; i < to; i += step) out.push(i);
      out.push(to);
      return out;
    };
    const halfX = Math.floor(g.nx / 2);
    const halfY = Math.floor(g.ny / 2);
    const xs = col === 0 ? range(0, halfX) : range(halfX, g.nx - 1);
    const ys = row === 0 ? range(0, halfY) : range(halfY, g.ny - 1);
    const pos = new Float32Array(xs.length * ys.length * 3);
    const uv = new Float32Array(xs.length * ys.length * 2);
    let p = 0;
    let q = 0;
    for (const iy of ys) {
      for (const ix of xs) {
        const e = g.west + (ix + 0.5) * g.cell_m;
        const n = g.north - (iy + 0.5) * g.cell_m;
        pos[p++] = e - this.cx;
        pos[p++] = this.heights[iy * g.nx + ix] / 10;
        pos[p++] = this.cn - n;
        // Texture tiles are 2 x 2 over the whole box; v = 1 is the north edge of each tile.
        uv[q++] = ((e - g.west) / (g.east - g.west)) * 2 - col;
        uv[q++] = ((n - g.south) / (g.north - g.south)) * 2 - (1 - row);
      }
    }
    const idx = new Uint32Array((xs.length - 1) * (ys.length - 1) * 6);
    let k = 0;
    for (let j = 0; j < ys.length - 1; j++) {
      for (let i = 0; i < xs.length - 1; i++) {
        const a = j * xs.length + i;
        const b = a + 1;
        const c = a + xs.length;
        const d = c + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return geo;
  }

  /** Where a view ray hits the terrain (world coordinates), or null. */
  raycast(ray: THREE.Ray, exaggeration: number): THREE.Vector3 | null {
    const p = new THREE.Vector3();
    const below = (t: number): boolean | null => {
      ray.at(t, p);
      const [e, n] = this.toUtm(p.x, p.z);
      if (!this.inside(e, n)) return null;
      return p.y <= this.heightAt(e, n) * exaggeration;
    };
    const stepLen = 8;
    let prev = 0;
    for (let t = 0; t < 45000; t += stepLen) {
      const b = below(t);
      if (b === true) {
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (below(mid) === true) hi = mid;
          else lo = mid;
        }
        return ray.at(hi, new THREE.Vector3());
      }
      prev = t;
    }
    return null;
  }
}

export async function loadTerrain(base: string): Promise<Terrain> {
  const meta: TerrainMeta = await (await fetch(`${base}terrain.json`)).json();
  const buf = await (await fetch(`${base}terrain_10m_u16.bin`)).arrayBuffer();
  const heights = new Uint16Array(buf);
  if (heights.length !== meta.grid.nx * meta.grid.ny) throw new Error('terrain file size does not match its metadata');
  return new Terrain(meta, heights);
}
