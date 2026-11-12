import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { loadTerrain, type Terrain } from './terrain';
import disclaimerText from '../docs/disclaimer.md?raw';
import './style.css';

const BASE = import.meta.env.BASE_URL;
const TRACE_NOTE = 'assumed vertical, no downhole surveys exist';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (v: number) => Math.round(v).toLocaleString('en-US');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const shown = (v: string | null) => (v === null || v === '' ? 'not reported' : esc(v));

interface Sample {
  id: string; type: string; kind: 'prismo' | 'qp_check' | 'website'; source: string; status: string;
  easting: number; northing: number; width_m: string | null;
  cu_pct: string | null; au_gpt: string | null; ag_gpt?: string | null; flag?: string | null; sampler?: string;
}
interface SamplesFile { source: string; date: string; datum: string; samples: Sample[] }
interface Collar {
  id: string; easting: number; northing: number; elevation_m: number; depth_m: number; year: string | null;
  logged_to_m: number; verification_state: 'unitemized' | 'not_visited' | 'suspected_pad'; verification_text: string;
}
interface CollarsFile { source: string; datum: string; status: string; collars: Collar[] }
type Geometry = { type: string; coordinates?: unknown; geometries?: Geometry[] };
interface TracedFile {
  metadata: { georeferencing_error_m: number; independent_check: Record<string, { median_m: number; p90_m: number }> };
  features: { properties: { kind: string; name: string; label: string; source: string; traced_area_km2?: number }; geometry: Geometry }[];
}
interface ZtemFile extends Omit<TracedFile, 'metadata'> {
  metadata: { georeferencing_error_m: number; footprint_area_km2: number; report_stated_area_km2: number };
}
interface GeorefFile { source: string; rms_m: number; pixel_size_m: number; georeferencing_error_m: number }
interface ImageryFile { acquisition_dates: string[]; acquisition_year: number; datum_source_horizontal: string; source: string }

// Colour = sample TYPE only (never a value). Colour-blind-safe palette.
const TYPE_COLOURS: Record<string, string> = {
  Chip: '#56B4E9', Channel: '#0072B2', 'Chip-channel': '#009E73', Selected: '#E69F00',
  'Selected grab (clast)': '#D55E00', Dump: '#9aa0a6', 'Subcrop grab': '#F0E442', 'Rock (clast in dyke)': '#ffffff',
};
const typeColour = (t: string) => TYPE_COLOURS[t] ?? '#cccccc';

// ---------- Disclaimer (shown before the model). Text comes from docs/disclaimer.md ----------
// In development only, adding ?shot=1 to the address skips it so automated screenshots can be taken.
const skipDisclaimer = import.meta.env.DEV && new URLSearchParams(location.search).has('shot');
if (skipDisclaimer) $('disclaimer').remove();
else {
  $('disc-text').textContent = disclaimerText.trim();
  $('disc-ok').addEventListener('click', () => $('disclaimer').remove());
}

// ---------- Scene ----------
const lowPower = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 800;
if (lowPower || (window.innerWidth > 0 && window.innerWidth < 700)) $<HTMLDetailsElement>('panel').open = false;
const canvas = $<HTMLCanvasElement>('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const labelRenderer = new CSS2DRenderer({ element: $('labels') });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12161b);
const camera = new THREE.PerspectiveCamera(45, 1, 4, 100000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 100;
controls.maxDistance = 34000;
scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-1, 1.2, -1); // light from the north-west, the usual map convention
scene.add(sun);

// Everything with an elevation sits in this group, so vertical exaggeration is one scale factor.
const world = new THREE.Group();
scene.add(world);
let exaggeration = 1;
let terrain: Terrain;
let dirty = true;
const requestRender = () => { dirty = true; };

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}
window.addEventListener('resize', resize);
// Keep the bottom-left readouts just above the footer, whatever its height.
new ResizeObserver(() => document.documentElement.style.setProperty('--footer-h', `${$('footer').offsetHeight}px`)).observe($('footer'));
controls.addEventListener('change', requestRender);

// ---------- Terrain + imagery ----------
const hillMaterial = new THREE.MeshLambertMaterial({ color: 0xb8ab97 });
const quadrants: { mesh: THREE.Mesh; imagery: THREE.MeshBasicMaterial }[] = [];
let imageryOn = true;
// Report Fig 2 draped on the terrain so its georeferencing can be checked by eye. Not a final layer.
const fig2Group = new THREE.Group();
fig2Group.visible = false;
const fig2Materials: { mat: THREE.MeshBasicMaterial; lines: THREE.Texture | null; full: THREE.Texture | null }[] = [];
function applyFig2() {
  const linesOnly = $<HTMLInputElement>('t-fig2-lines').checked;
  for (const f of fig2Materials) {
    const tex = linesOnly ? f.lines : f.full;
    f.mat.map = tex;
    f.mat.visible = tex !== null;
    f.mat.needsUpdate = true;
  }
  requestRender();
}

function applyImagery() {
  for (const q of quadrants) q.mesh.material = imageryOn && q.imagery.map ? q.imagery : hillMaterial;
  requestRender();
}

function buildTerrain() {
  const loader = new THREE.TextureLoader();
  const maxTex = renderer.capabilities.maxTextureSize;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const imagery = new THREE.MeshBasicMaterial();
      // Every 10 m cell on laptops; every third cell on phones and tablets.
      const mesh = new THREE.Mesh(terrain.buildQuadrant(row, col, lowPower ? 3 : 1), hillMaterial);
      world.add(mesh);
      quadrants.push({ mesh, imagery });
      loader.load(`${BASE}fig2_zones_r${row}c${col}.webp`, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const fill = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        }));
        fill.renderOrder = 1;
        zonesGroup.add(fill);
        requestRender();
      });
      // Two versions of the Fig 2 check overlay: recoloured main lines, and the whole figure.
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, opacity: Number($<HTMLInputElement>('fig2-opacity').value), depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, visible: false,
      });
      const overlay = new THREE.Mesh(mesh.geometry, mat);
      overlay.renderOrder = 1;
      fig2Group.add(overlay);
      const entry = { mat, lines: null as THREE.Texture | null, full: null as THREE.Texture | null };
      fig2Materials.push(entry);
      for (const kind of ['lines', 'full'] as const) {
        loader.load(`${BASE}fig2_${kind === 'lines' ? 'lines' : 'overlay'}_r${row}c${col}.webp`, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          entry[kind] = tex;
          applyFig2();
        });
      }
      const setMap = (tex: THREE.Texture) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        imagery.map?.dispose();
        imagery.map = tex;
        imagery.needsUpdate = true;
        applyImagery();
      };
      // Quick 2048 px tile first; sharper 4096 px tile afterwards on laptops and desktops.
      loader.load(`${BASE}imagery_r${row}c${col}_2048.webp`, (tex) => {
        setMap(tex);
        if (!lowPower && maxTex >= 4096) loader.load(`${BASE}imagery_r${row}c${col}_4096.webp`, setMap);
      });
    }
  }
}

// ---------- Info panel ----------
let activePin: HTMLElement | null = null;
function openInfo(html: string, pin: HTMLElement) {
  activePin?.classList.remove('active');
  activePin = pin;
  pin.classList.add('active');
  $('info-body').innerHTML = html;
  $('info').hidden = false;
  $('info').scrollTop = 0;
}
$('info-close').addEventListener('click', () => {
  $('info').hidden = true;
  activePin?.classList.remove('active');
});
const row = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;

function makePin(cls: string, label: string, marker: string, e: number, n: number, elevation: number, onClick: (pin: HTMLElement) => void) {
  const pin = document.createElement('button');
  pin.className = `pin ${cls}`;
  pin.type = 'button';
  pin.innerHTML = `<span class="pin-label">${esc(label)}</span>${marker}`;
  pin.addEventListener('click', () => onClick(pin));
  const obj = new CSS2DObject(pin);
  obj.center.set(0.5, 1); // bottom of the pin touches the point
  const [x, z] = terrain.toWorld(e, n);
  obj.position.set(x, elevation, z);
  return obj;
}

// ---------- Historical drill holes ----------
const collarsGroup = new THREE.Group();
world.add(collarsGroup);
const COLLAR_LEGEND: Record<Collar['verification_state'], string> = {
  unitemized: 'Site status not itemized in report',
  not_visited: 'Not visited by QP (Feb 2026)',
  suspected_pad: 'Only a suspected drill pad found',
};

function buildCollars(file: CollarsFile) {
  const material = new LineMaterial({ color: 0xffffff, linewidth: 3, depthTest: false, transparent: true, opacity: 0.9 });
  for (const c of file.collars) {
    const [x, z] = terrain.toWorld(c.easting, c.northing);
    // Straight down from the stated collar elevation to the stated depth (depth is positive down).
    const line = new Line2(new LineGeometry().setPositions([x, c.elevation_m, z, x, c.elevation_m - c.depth_m, z]), material);
    line.renderOrder = 3;
    collarsGroup.add(line);
    const pin = makePin('collar', c.id, `<i class="mk collar ${c.verification_state}"></i>`, c.easting, c.northing, c.elevation_m, (el) =>
      openInfo(`
        <h3>Drill hole ${esc(c.id)}</h3>
        <dl>
          ${row('Year', c.year ?? 'unknown')}
          ${row('Depth', `${c.depth_m} m`)}
          ${row('Depth logged', `${c.logged_to_m} m`)}
          ${row('Trace', TRACE_NOTE)}
          ${row('Easting', `${fmt(c.easting)} m`)}
          ${row('Northing', `${fmt(c.northing)} m`)}
          ${row('Collar elevation', `${c.elevation_m} m (as tabulated)`)}
        </dl>
        <p class="src">Site verification: ${esc(c.verification_text)}</p>
        <p>Historical drilling, not verified by the QP. ${esc(file.source)}.</p>`, el));
    pin.element.title = `${c.id}: ${TRACE_NOTE}`;
    collarsGroup.add(pin);
  }
  $('m-collars').textContent = `${file.collars.length} holes · lines are ${TRACE_NOTE} · report Table 3 · WGS84 UTM 12N · historical, not verified by the QP`;
  $('g-collars').innerHTML = (Object.keys(COLLAR_LEGEND) as Collar['verification_state'][])
    .map((k) => `<span><i class="mk collar ${k}"></i>${COLLAR_LEGEND[k]}</span>`).join('');
}

// ---------- Samples ----------
const reportGroup = new THREE.Group();
const websiteGroup = new THREE.Group();
websiteGroup.visible = false;
world.add(reportGroup, websiteGroup);
const PAIR = ['256644', 'HBLR-01']; // selected grab and the QP's check sample about 11 m away

function sampleDetails(s: Sample) {
  return `
    <dl>
      ${row('Type', esc(s.type))}
      ${row('Width', s.width_m ? `${esc(s.width_m)} m` : 'not reported')}
      ${row('Cu %', shown(s.cu_pct))}
      ${row('Au g/t', shown(s.au_gpt))}
      ${s.kind === 'website' ? row('Sampler', esc(s.sampler ?? '')) : row('Ag g/t', shown(s.ag_gpt ?? null))}
      ${row('Easting', `${fmt(s.easting)} m`)}
      ${row('Northing', `${fmt(s.northing)} m`)}
      ${row('Source', esc(s.source))}
    </dl>
    ${s.flag ? `<p class="flag">Flag: ${esc(s.flag)}</p>` : ''}
    <p class="src">${esc(s.status)}</p>`;
}

function pairTable(a: Sample, b: Sample) {
  const cell = (s: Sample, v: string | null | undefined) => `<td>${shown(v ?? null)}<small>${esc(s.type)}</small></td>`;
  const dist = Math.hypot(a.easting - b.easting, a.northing - b.northing);
  return `
    <h3>Samples ${esc(a.id)} and ${esc(b.id)}</h3>
    <p>These two samples are about ${dist.toFixed(0)} m apart. Sample type is shown under every value.</p>
    <table>
      <tr><th></th><th>${esc(a.id)}</th><th>${esc(b.id)}</th></tr>
      <tr><th>Type</th><td>${esc(a.type)}</td><td>${esc(b.type)}</td></tr>
      <tr><th>Cu %</th>${cell(a, a.cu_pct)}${cell(b, b.cu_pct)}</tr>
      <tr><th>Au g/t</th>${cell(a, a.au_gpt)}${cell(b, b.au_gpt)}</tr>
      <tr><th>Ag g/t</th>${cell(a, a.ag_gpt)}${cell(b, b.ag_gpt)}</tr>
      <tr><th>Width</th><td>${a.width_m ? `${esc(a.width_m)} m` : 'not reported'}</td><td>${b.width_m ? `${esc(b.width_m)} m` : 'not reported'}</td></tr>
      <tr><th>Source</th><td>${esc(a.source)}<small>${esc(a.status)}</small></td><td>${esc(b.source)}<small>${esc(b.status)}</small></td></tr>
    </table>
    ${[a, b].filter((s) => s.flag).map((s) => `<p class="flag">${esc(s.id)} flag: ${esc(s.flag!)}</p>`).join('')}`;
}

function buildSamples(file: SamplesFile, group: THREE.Group, metaId: string) {
  const byId = new Map(file.samples.map((s) => [s.id, s]));
  for (const s of file.samples) {
    const marker = `<i class="mk ${s.kind === 'qp_check' ? 'qp' : s.kind === 'website' ? 'website' : 'report'}" style="--c:${typeColour(s.type)}"></i>`;
    const label = s.kind === 'qp_check' ? `${s.id} (QP check)` : s.id;
    group.add(makePin(s.kind, label, marker, s.easting, s.northing, terrain.heightAt(s.easting, s.northing), (el) => {
      const other = PAIR.includes(s.id) ? byId.get(PAIR.find((id) => id !== s.id)!) : undefined;
      if (other) {
        const [a, b] = s.id === PAIR[0] ? [s, other] : [other, s];
        openInfo(pairTable(a, b), el);
      } else {
        openInfo(`<h3>Sample ${esc(s.id)}</h3>${sampleDetails(s)}<p>Values are shown exactly as in the source. Selected, grab and dump samples are not representative.</p>`, el);
      }
    }));
  }
  $(metaId).textContent = `${file.samples.length} points · ${file.source} · ${file.datum} · colour = sample type, never a value`;
}

function buildSampleLegend(files: SamplesFile[]) {
  const types = [...new Set(files.flatMap((f) => f.samples.filter((s) => s.kind !== 'qp_check').map((s) => s.type)))];
  $('g-report').innerHTML = types.map((t) => `<span><i class="mk report" style="--c:${typeColour(t)}"></i>${esc(t)}</span>`).join('')
    + '<span><i class="mk qp"></i>QP check sample</span><span><i class="mk website" style="--c:#ccc"></i>square = website table</span>';
}

// ---------- Context layers: traced from report Fig 2, plus public reference lines ----------
const boundaryGroup = new THREE.Group();
const zonesGroup = new THREE.Group();
const contextGroup = new THREE.Group();
const resvGroup = new THREE.Group();
const ztemGroup = new THREE.Group();
ztemGroup.visible = false;
world.add(zonesGroup, contextGroup, resvGroup, ztemGroup, boundaryGroup);

const STYLE: Record<string, { colour: number; width: number; dashed?: boolean; group: THREE.Group; short: string; labelled?: boolean }> = {
  property_boundary: { colour: 0xff3df2, width: 3.5, group: boundaryGroup, short: 'Property boundary', labelled: true },
  zone_state_private: { colour: 0xff69b4, width: 1.5, group: zonesGroup, short: 'Overlapping State or Private lands' },
  zone_legacy_placer_tunnel: { colour: 0x82d25a, width: 1.5, group: zonesGroup, short: 'Overlapping legacy Placer or Tunnel claims' },
  pit_outline: { colour: 0xc38bff, width: 2.5, group: contextGroup, short: 'Christmas Mine pit extent', labelled: true },
  access_trail: { colour: 0xff8a00, width: 2.5, group: contextGroup, short: 'Access trail', labelled: true },
  gila_river: { colour: 0x29b6ff, width: 2.5, group: contextGroup, short: 'Gila River', labelled: true },
  highway_77: { colour: 0xffe14d, width: 2.5, group: contextGroup, short: 'State Route 77', labelled: true },
  ztem_footprint: { colour: 0x00e5ff, width: 2.5, dashed: true, group: ztemGroup, short: 'Approximate ZTEM survey footprint (report Fig 8)', labelled: true },
  ztem_flight_line: { colour: 0x9be7ff, width: 1.5, group: ztemGroup, short: 'Flight line', labelled: true },
  san_carlos_reservation_boundary: { colour: 0xffffff, width: 2, dashed: true, group: resvGroup, short: 'San Carlos Reservation boundary', labelled: true },
};
const lineMaterials: Record<string, LineMaterial[]> = {};
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Every line or ring in a GeoJSON geometry, as lists of [easting, northing]. */
function lineParts(g: Geometry): number[][][] {
  const c = g.coordinates as never;
  switch (g.type) {
    case 'LineString': return [c];
    case 'MultiLineString': case 'Polygon': return c;
    case 'MultiPolygon': return (c as number[][][][]).flat();
    case 'GeometryCollection': return (g.geometries ?? []).flatMap(lineParts);
    default: return [];
  }
}

/** Drape a line on the terrain: one point about every 10 m, lifted slightly so it stays visible. */
function drape(part: number[][], lift: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < part.length - 1; i++) {
    const [e0, n0] = part[i];
    const [e1, n1] = part[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(e1 - e0, n1 - n0) / 10));
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
      const e = e0 + ((e1 - e0) * k) / steps;
      const n = n0 + ((n1 - n0) * k) / steps;
      if (!terrain.inside(e, n)) continue;
      const [x, z] = terrain.toWorld(e, n);
      pts.push(x, terrain.heightAt(e, n) + lift, z);
    }
  }
  return pts;
}

function mapLabel(text: string, colour: number, e: number, n: number, group: THREE.Group, minor = true) {
  const el = document.createElement('div');
  el.className = `map-label${minor ? ' minor' : ''}`;
  el.style.setProperty('--c', hex(colour));
  el.textContent = text;
  const label = new CSS2DObject(el);
  label.center.set(0.5, 1.2);
  const [x, z] = terrain.toWorld(e, n);
  label.position.set(x, terrain.heightAt(e, n) + 6, z);
  group.add(label);
}

function buildTraced(file: TracedFile | ZtemFile) {
  for (const f of file.features) {
    const { kind, name } = f.properties;
    if (kind === 'hayden_smelter_symbol') {
      const [e, n] = f.geometry.coordinates as number[];
      mapLabel('Hayden Smelter (symbol position on report Fig 2, approximate)', 0xffffff, e, n, contextGroup);
      continue;
    }
    const st = STYLE[kind];
    if (!st) continue;
    const material = new LineMaterial({ color: st.colour, linewidth: st.width, dashed: !!st.dashed, dashSize: 60, gapSize: 40, depthTest: false });
    (lineMaterials[kind] ??= []).push(material);
    let longest: number[][] = [];
    for (const part of lineParts(f.geometry)) {
      const pts = drape(part, 4);
      if (pts.length < 6) continue;
      const line = new Line2(new LineGeometry().setPositions(pts), material);
      line.computeLineDistances();
      line.renderOrder = 2;
      st.group.add(line);
      const inside = part.filter(([e, n]) => terrain.inside(e, n));
      if (inside.length > longest.length) longest = inside;
    }
    if (st.labelled && longest.length) {
      // Property label at the northern tip; other labels half-way along their longest piece.
      const at = kind === 'property_boundary' ? longest.reduce((a, b) => (b[1] > a[1] ? b : a))
        : kind === 'ztem_flight_line' ? longest.reduce((a, b) => (b[1] < a[1] ? b : a))
        : longest[Math.floor(longest.length / 2)];
      const text = kind === 'property_boundary' ? `${name} (approximate, traced from report Fig 2)` : kind === 'ztem_flight_line' ? name : st.short;
      mapLabel(text, st.colour, at[0], at[1], st.group, kind !== 'property_boundary');
    }
  }
}

function describeTraced(file: TracedFile) {
  const err = file.metadata.georeferencing_error_m;
  const area = file.features.find((f) => f.properties.kind === 'property_boundary')?.properties.traced_area_km2;
  const chk = file.metadata.independent_check;
  $('m-boundary').textContent = `approximate, traced from report Fig 2 · georeferencing error about ${err} m · traced area ${area} km² · WGS84 UTM 12N · unverified`;
  $('m-zones').textContent = `approximate, traced from report Fig 2 (hatched areas) · georeferencing error about ${err} m · unverified`;
  $('m-context').textContent = `River: USGS NHD. Highway: US Census TIGER. Pit outline, access trail and smelter symbol: approximate, traced from report Fig 2 (about ${err} m). The figure's highway sits a median ${chk.highway_vs_tiger.median_m} m from the TIGER line.`;
  $('m-resv').textContent = 'US Census TIGER American Indian areas · public source, not traced from the figure · unverified';
  const sw = (k: string, cls = '') => `<span><i class="sw ${cls}" style="--c:${hex(STYLE[k].colour)}"></i>${STYLE[k].short}</span>`;
  $('g-zones').innerHTML = ['zone_state_private', 'zone_legacy_placer_tunnel'].map((k) => `<span><i class="fill" style="--c:${hex(STYLE[k].colour)}"></i>${STYLE[k].short}</span>`).join('');
  $('g-context').innerHTML = ['gila_river', 'highway_77', 'access_trail', 'pit_outline'].map((k) => sw(k)).join('');
}

// ---------- Camera ----------
const home = { target: new THREE.Vector3(), position: new THREE.Vector3() };
function resetView() {
  controls.target.copy(home.target).setY(home.target.y * exaggeration);
  camera.position.copy(home.position);
  controls.update();
  requestRender();
}

// ---------- Camera moves ----------
let fly: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t0: number; ms: number } | null = null;
function flyTo(position: THREE.Vector3, target: THREE.Vector3, ms = 1400) {
  fly = { from: [camera.position.clone(), controls.target.clone()], to: [position, target], t0: performance.now(), ms };
}
function stepFly() {
  if (!fly) return;
  const k = Math.min(1, (performance.now() - fly.t0) / fly.ms);
  const s = k * k * (3 - 2 * k); // ease in and out
  camera.position.lerpVectors(fly.from[0], fly.to[0], s);
  controls.target.lerpVectors(fly.from[1], fly.to[1], s);
  if (k === 1) fly = null;
  requestRender();
}
canvas.addEventListener('pointerdown', () => { fly = null; });
/** Camera looking at a ground point from a compass direction (bearing the camera sits at), distance and height angle. */
function lookAt(e: number, n: number, fromBearingDeg: number, dist: number, elevDeg: number): [THREE.Vector3, THREE.Vector3] {
  const [x, z] = terrain.toWorld(e, n);
  const target = new THREE.Vector3(x, terrain.heightAt(e, n) * exaggeration, z);
  const b = THREE.MathUtils.degToRad(fromBearingDeg);
  const el = THREE.MathUtils.degToRad(elevDeg);
  const pos = new THREE.Vector3(x + Math.sin(b) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, z - Math.cos(b) * Math.cos(el) * dist);
  return [pos, target];
}

// ---------- Plate 2 photo view (approximate viewpoint, adjustable) ----------
interface Plate2File { viewpoint: Viewpoint; photo: string; estimated_horizontal_field_of_view_deg: number; estimate_uncertainty_m: number }
interface Viewpoint { easting: number; northing: number; eye_height_m: number; heading_deg: number; pitch_deg: number }
let plate2Start: Viewpoint;
let plate2: Viewpoint;
let plate2Hfov = 70;
let plate2Spread = 0;
/** Match the 3D camera's width of view to the estimated lens of the photo (or go back to the normal 45 degrees). */
function setLens(photo: boolean) {
  camera.fov = photo ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(plate2Hfov / 2)) / camera.aspect)) : 45;
  camera.updateProjectionMatrix();
  requestRender();
}
function plate2Camera(): [THREE.Vector3, THREE.Vector3] {
  const [x, z] = terrain.toWorld(plate2.easting, plate2.northing);
  const pos = new THREE.Vector3(x, (terrain.heightAt(plate2.easting, plate2.northing) + plate2.eye_height_m) * exaggeration, z);
  const h = THREE.MathUtils.degToRad(plate2.heading_deg);
  const p = THREE.MathUtils.degToRad(plate2.pitch_deg);
  const dir = new THREE.Vector3(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p));
  return [pos, pos.clone().addScaledVector(dir, 700)];
}
function showPlate2(animate: boolean) {
  $('plate2').hidden = false;
  $('info').hidden = true;
  setLens(true);
  const [pos, target] = plate2Camera();
  if (animate) flyTo(pos, target);
  else { fly = null; camera.position.copy(pos); controls.target.copy(target); controls.update(); requestRender(); }
  $('plate2-readout').textContent = `Approximate viewpoint: E ${fmt(plate2.easting)}, N ${fmt(plate2.northing)}, ${plate2.eye_height_m} m above the ground, looking ${plate2.heading_deg}° (90° is east, 112° is east-southeast), tilt ${plate2.pitch_deg}°. Estimated from the terrain, not surveyed; other spots within about ${plate2Spread} m fit equally well. The far peaks in the photo lie outside the terrain model.`;
}
function setupPlate2(file: Plate2File) {
  plate2Start = file.viewpoint;
  plate2Hfov = file.estimated_horizontal_field_of_view_deg;
  plate2Spread = file.estimate_uncertainty_m;
  plate2 = { ...plate2Start };
  $<HTMLImageElement>('plate2-img').src = `${BASE}${file.photo}`;
  $('plate2-open').addEventListener('click', () => showPlate2(true));
  $('plate2-close').addEventListener('click', () => { $('plate2').hidden = true; setLens(false); });
  document.querySelectorAll<HTMLButtonElement>('.nudge button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.n;
    if (k === 'w') plate2.easting -= 25; else if (k === 'e') plate2.easting += 25;
    else if (k === 'n') plate2.northing += 25; else if (k === 's') plate2.northing -= 25;
    else if (k === 'l') plate2.heading_deg -= 3; else if (k === 'r') plate2.heading_deg += 3;
    else if (k === 'u') plate2.pitch_deg += 1; else if (k === 'd') plate2.pitch_deg -= 1;
    else if (k === 'hi') plate2.eye_height_m += 2; else if (k === 'lo') plate2.eye_height_m = Math.max(1, plate2.eye_height_m - 2);
    else plate2 = { ...plate2Start };
    showPlate2(false);
  }));
}

// ---------- History timeline ----------
interface TimelineEvent { when: string; text: string; sections: string; view: string; highlight?: 'boundary' | 'collars' | 'ztem' | 'report' }
let events: TimelineEvent[] = [];
let stop = -1;
let undoHighlight: (() => void) | null = null;

function highlight(key: TimelineEvent['highlight']) {
  undoHighlight?.();
  undoHighlight = null;
  if (!key) return;
  const box = { boundary: 't-boundary', collars: 't-collars', ztem: 't-ztem', report: 't-report' }[key];
  const input = $<HTMLInputElement>(box);
  const wasOn = input.checked;
  if (!wasOn) input.click();
  const kinds = { boundary: ['property_boundary'], ztem: ['ztem_footprint', 'ztem_flight_line'], collars: [], report: [] }[key];
  const mats = kinds.flatMap((k) => lineMaterials[k] ?? []);
  const widths = mats.map((m) => m.linewidth);
  mats.forEach((m) => { m.linewidth *= 1.8; });
  const pins = key === 'collars' ? '.pin.collar' : key === 'report' ? '.pin.prismo, .pin.qp_check' : null;
  const mark = (on: boolean) => { if (pins) document.querySelectorAll(pins).forEach((el) => el.classList.toggle('hl', on)); };
  let active = true;
  // Mark the pins once they are on screen; do nothing if this stop has already been left.
  setTimeout(() => { if (active) mark(true); }, 150);
  undoHighlight = () => {
    active = false;
    mats.forEach((m, i) => { m.linewidth = widths[i]; });
    mark(false);
    if (!wasOn && input.checked) input.click();
  };
}

function viewFor(name: string): [THREE.Vector3, THREE.Vector3] {
  switch (name) {
    case 'regional': return lookAt(524500, 3654800, 180, 17000, 62);
    case 'property': return lookAt(525300, 3654000, 190, 9000, 48);
    case 'property_west': return lookAt(524300, 3654300, 250, 7000, 40);
    case 'holes': return lookAt(526650, 3653800, 215, 3200, 34);
    case 'holes_close': return lookAt(526850, 3653700, 300, 1500, 28);
    case 'survey': return lookAt(525600, 3655600, 180, 15000, 58);
    case 'samples': return lookAt(526600, 3653600, 150, 5200, 44);
    case 'trail': return lookAt(526700, 3652600, 170, 5200, 36);
    case 'plate2': return plate2Camera();
    default: return [home.position.clone(), home.target.clone().setY(home.target.y * exaggeration)];
  }
}

function goToStop(i: number) {
  stop = (i + events.length) % events.length;
  const ev = events[stop];
  $('tl-when').textContent = `${stop + 1} of ${events.length} · ${ev.when}`;
  $('tl-text').textContent = ev.text;
  $('tl-src').textContent = `Source: NI 43-101 report, section ${ev.sections}. Historical information, not verified by the QP.`;
  document.querySelectorAll('#tl-dots button').forEach((d, k) => d.classList.toggle('on', k === stop));
  highlight(ev.highlight);
  if (ev.view === 'plate2') showPlate2(true);
  else { $('plate2').hidden = true; setLens(false); flyTo(...viewFor(ev.view)); }
}

function setupTimeline(list: TimelineEvent[]) {
  events = list;
  $('tl-dots').innerHTML = list.map((e, i) => `<button type="button" aria-label="Event ${i + 1}: ${esc(e.when)}"></button>`).join('');
  document.querySelectorAll<HTMLButtonElement>('#tl-dots button').forEach((d, i) => d.addEventListener('click', () => goToStop(i)));
  $('tl-prev').addEventListener('click', () => goToStop(stop - 1));
  $('tl-next').addEventListener('click', () => goToStop(stop + 1));
  $<HTMLDetailsElement>('timeline').addEventListener('toggle', (e) => {
    if ((e.target as HTMLDetailsElement).open) { if (stop < 0) goToStop(0); } else { highlight(undefined); }
  });
}

// ---------- UI: toggles, exaggeration, scale bar, north arrow, readout ----------
const toggle = (id: string, fn: (on: boolean) => void) =>
  $<HTMLInputElement>(id).addEventListener('change', (e) => { fn((e.target as HTMLInputElement).checked); requestRender(); });
toggle('t-imagery', (on) => { imageryOn = on; applyImagery(); });
toggle('t-collars', (on) => { collarsGroup.visible = on; });
toggle('t-report', (on) => { reportGroup.visible = on; });
toggle('t-website', (on) => { websiteGroup.visible = on; });
toggle('t-boundary', (on) => { boundaryGroup.visible = on; });
toggle('t-zones', (on) => { zonesGroup.visible = on; });
toggle('t-context', (on) => { contextGroup.visible = on; });
toggle('t-resv', (on) => { resvGroup.visible = on; });
toggle('t-ztem', (on) => { ztemGroup.visible = on; });
toggle('t-fig2', (on) => { fig2Group.visible = on; });
$<HTMLInputElement>('fig2-opacity').addEventListener('input', (e) => {
  for (const f of fig2Materials) f.mat.opacity = Number((e.target as HTMLInputElement).value);
  requestRender();
});
$('reset').addEventListener('click', () => { $('plate2').hidden = true; setLens(false); fly = null; resetView(); });
$<HTMLInputElement>('t-fig2-lines').addEventListener('change', applyFig2);
// Straight down with north at the top, like a paper map. Keeps the current centre and zoom.
$('topdown').addEventListener('click', () => {
  const dist = camera.position.distanceTo(controls.target);
  camera.position.set(controls.target.x, controls.target.y + dist, controls.target.z + 0.01);
  controls.update();
  requestRender();
});
$<HTMLInputElement>('exag').addEventListener('input', (e) => {
  const next = Number((e.target as HTMLInputElement).value);
  controls.target.y = (controls.target.y / exaggeration) * next;
  exaggeration = next;
  world.scale.y = exaggeration;
  $('exag-val').textContent = `${exaggeration}×`;
  const badge = $('exag-badge');
  badge.hidden = exaggeration === 1;
  badge.textContent = `Vertical exaggeration ${exaggeration}× (heights are stretched)`;
  controls.update();
  requestRender();
});

function updateOverlays() {
  // North arrow: turn it by the camera's compass rotation.
  $('north-arrow').style.transform = `rotate(${controls.getAzimuthalAngle()}rad)`;
  // Scale bar: true at the centre of the view (perspective makes nearer ground look bigger).
  const dist = camera.position.distanceTo(controls.target);
  const metresPerPixel = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / window.innerHeight;
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const length = [...nice].reverse().find((m) => m / metresPerPixel <= 140) ?? nice[0];
  $('scale-bar').style.width = `${length / metresPerPixel}px`;
  $('scale-label').textContent = `${length >= 1000 ? `${length / 1000} km` : `${length} m`} at view centre`;
  // Labels thin out when zoomed far out so the pins do not pile up.
  $('labels').classList.toggle('far', dist > 3200);
  $('labels').classList.toggle('vfar', dist > 12000);
}

const raycaster = new THREE.Raycaster();
let pointer: { x: number; y: number } | null = null;
function updateReadout() {
  if (!pointer || !terrain) return;
  const ndc = new THREE.Vector2((pointer.x / window.innerWidth) * 2 - 1, -(pointer.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = terrain.raycast(raycaster.ray, exaggeration);
  pointer = null;
  if (!hit) { $('readout').textContent = 'Off the terrain'; return; }
  const [e, n] = terrain.toUtm(hit.x, hit.z);
  $('readout').textContent = `E ${fmt(e)}  N ${fmt(n)}  Elev ${fmt(terrain.heightAt(e, n))} m  (UTM 12N, WGS84)`;
}
canvas.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerdown', (e) => { pointer = { x: e.clientX, y: e.clientY }; });

function frame() {
  requestAnimationFrame(frame);
  stepFly();
  controls.update();
  updateReadout();
  if (!dirty) return;
  dirty = false;
  updateOverlays();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// ---------- Start ----------
async function start() {
  resize();
  terrain = await loadTerrain(BASE);
  const getJson = async <T>(name: string): Promise<T> => (await fetch(`${BASE}${name}`)).json();
  const [collars, report, website, traced, imagery] = await Promise.all([
    getJson<CollarsFile>('collars.json'), getJson<SamplesFile>('samples_report.json'), getJson<SamplesFile>('samples_website.json'),
    getJson<TracedFile>('fig2_traced.geojson'), getJson<ImageryFile>('imagery.json'),
  ]);
  buildTerrain();
  world.add(fig2Group);
  const fig2 = await getJson<GeorefFile>('fig2_georef.json');
  $('m-fig2').textContent = `approximate · report Figure 2 placed using its printed UTM grid · grid fit RMS ${fig2.rms_m} m · 1 figure pixel = ${fig2.pixel_size_m} m · magenta = boundary and pit, blue = river, yellow = highway, orange = trail and other dark lines`;
  buildCollars(collars);
  buildSamples(report, reportGroup, 'm-report');
  buildSamples(website, websiteGroup, 'm-website');
  buildSampleLegend([report, website]);
  buildTraced(traced);
  describeTraced(traced);
  const ztem = await getJson<ZtemFile>('fig8_traced.geojson');
  buildTraced(ztem);
  $('m-ztem').textContent = `approximate, traced from report Fig 8 · georeferencing error about ${ztem.metadata.georeferencing_error_m} m · grid extent visible on the figure ${ztem.metadata.footprint_area_km2} km² (report states ${ztem.metadata.report_stated_area_km2} km² surveyed) · lines are the select lines shown in report Fig 8 · no survey results shown · unverified`;

  const t = terrain.meta;
  $('m-imagery').textContent = `${imagery.source.replace('National Agriculture Imagery Program ', '')} · flown ${imagery.acquisition_dates.join(', ')} · ${imagery.datum_source_horizontal} · unverified`;
  $('m-terrain').textContent = `Terrain: ${t.source}, read ${t.retrieved} · ${t.datum_source_horizontal} · ${Math.round(t.lidar_1m_fraction * 100)}% from 1 m lidar, rest coarser · unverified`;
  $('credits').textContent = `Terrain: USGS 3DEP. Imagery: USDA NAIP ${imagery.acquisition_year}. Drill holes and samples: historical and third-party data from the NI 43-101 report (effective 2026-06-30) and the Prismo Metals website, not verified by the QP unless marked as the QP check sample. Boundary, zones, pit outline and trail: approximate, traced from report Fig 2. River: USGS NHD. Highway and reservation boundary: US Census TIGER.`;

  // Home view: from the south-west, looking at the middle of the drill holes.
  const ce = collars.collars.reduce((a, c) => a + c.easting, 0) / collars.collars.length;
  const cn = collars.collars.reduce((a, c) => a + c.northing, 0) / collars.collars.length;
  const [x, z] = terrain.toWorld(ce, cn);
  home.target.set(x, terrain.heightAt(ce, cn), z);
  home.position.set(x - 2400, home.target.y + 2600, z + 4200);
  setupPlate2(await getJson<Plate2File>('plate2.json'));
  setupTimeline((await getJson<{ events: TimelineEvent[] }>('timeline.json')).events);
  resetView();
  $('loading').remove();
  frame();
  // Development only: ?stop=4 opens the timeline at stop 4, ?plate2=1 opens the photo view (used for screenshots).
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    if (q.has('stop')) { $<HTMLDetailsElement>('timeline').open = true; goToStop(Number(q.get('stop')) - 1); }
    if (q.has('plate2')) showPlate2(false);
  }
  // Handy for checks in the browser console during development.
  if (import.meta.env.DEV) Object.assign(window, { __viewer: { terrain, camera, controls, renderer, scene, requestRender, goToStop } });
}
start().catch((err) => {
  console.error(err);
  $('loading').textContent = `Could not load the model: ${err.message}`;
});
