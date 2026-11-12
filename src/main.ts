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
interface ClaimsFile {
  metadata: { placeholder: boolean; source: string; datum: string; verified: boolean };
  features: { properties: { name?: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[];
}
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
const camera = new THREE.PerspectiveCamera(45, 1, 10, 100000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 150;
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

// ---------- Claims ----------
const claimsGroup = new THREE.Group();
world.add(claimsGroup);

function buildClaims(file: ClaimsFile) {
  const placeholder = file.metadata.placeholder;
  const material = new LineMaterial({
    color: placeholder ? 0xff4d9a : 0x4dd2ff, linewidth: 3, dashed: placeholder, dashSize: 60, gapSize: 40, depthTest: false,
  });
  let labelDone = false;
  for (const f of file.features) {
    const polys = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]) as number[][][][];
    for (const poly of polys) {
      for (const ring of poly) {
        // Drape the outline on the terrain: one point about every 10 m.
        const pts: number[] = [];
        for (let i = 0; i < ring.length - 1; i++) {
          const [e0, n0] = ring[i];
          const [e1, n1] = ring[i + 1];
          const steps = Math.max(1, Math.ceil(Math.hypot(e1 - e0, n1 - n0) / 10));
          for (let k = 0; k <= steps; k++) {
            const e = e0 + ((e1 - e0) * k) / steps;
            const n = n0 + ((n1 - n0) * k) / steps;
            if (!terrain.inside(e, n)) continue;
            const [x, z] = terrain.toWorld(e, n);
            pts.push(x, terrain.heightAt(e, n) + 4, z);
          }
        }
        if (pts.length < 6) continue;
        const line = new Line2(new LineGeometry().setPositions(pts), material);
        line.computeLineDistances();
        line.renderOrder = 2;
        claimsGroup.add(line);
        if (placeholder && !labelDone) {
          labelDone = true;
          const north = Math.max(...ring.map((c) => c[1]));
          const e = (Math.max(...ring.map((c) => c[0])) + Math.min(...ring.map((c) => c[0]))) / 2;
          const el = document.createElement('div');
          el.className = 'claims-label';
          el.textContent = 'PLACEHOLDER: not the property boundary';
          const label = new CSS2DObject(el);
          label.center.set(0.5, 1);
          const [x, z] = terrain.toWorld(e, north);
          label.position.set(x, terrain.heightAt(e, north) + 4, z);
          claimsGroup.add(label);
        }
      }
    }
  }
  $('l-claims').firstChild!.textContent = placeholder ? 'Property boundary (PLACEHOLDER)' : 'Property boundary';
  $('m-claims').textContent = placeholder
    ? 'Not traced yet. Dashed box drawn 250 m outside the plotted points. Not the property boundary.'
    : `${file.metadata.source} · ${file.metadata.datum} · ${file.metadata.verified ? 'verified' : 'unverified'}`;
}

// ---------- Camera ----------
const home = { target: new THREE.Vector3(), position: new THREE.Vector3() };
function resetView() {
  controls.target.copy(home.target).setY(home.target.y * exaggeration);
  camera.position.copy(home.position);
  controls.update();
  requestRender();
}

// ---------- UI: toggles, exaggeration, scale bar, north arrow, readout ----------
const toggle = (id: string, fn: (on: boolean) => void) =>
  $<HTMLInputElement>(id).addEventListener('change', (e) => { fn((e.target as HTMLInputElement).checked); requestRender(); });
toggle('t-imagery', (on) => { imageryOn = on; applyImagery(); });
toggle('t-collars', (on) => { collarsGroup.visible = on; });
toggle('t-report', (on) => { reportGroup.visible = on; });
toggle('t-website', (on) => { websiteGroup.visible = on; });
toggle('t-claims', (on) => { claimsGroup.visible = on; });
$('reset').addEventListener('click', resetView);
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
  const [collars, report, website, claims, imagery] = await Promise.all([
    getJson<CollarsFile>('collars.json'), getJson<SamplesFile>('samples_report.json'), getJson<SamplesFile>('samples_website.json'),
    getJson<ClaimsFile>('claims.json'), getJson<ImageryFile>('imagery.json'),
  ]);
  buildTerrain();
  buildCollars(collars);
  buildSamples(report, reportGroup, 'm-report');
  buildSamples(website, websiteGroup, 'm-website');
  buildSampleLegend([report, website]);
  buildClaims(claims);

  const t = terrain.meta;
  $('m-imagery').textContent = `${imagery.source.replace('National Agriculture Imagery Program ', '')} · flown ${imagery.acquisition_dates.join(', ')} · ${imagery.datum_source_horizontal} · unverified`;
  $('m-terrain').textContent = `Terrain: ${t.source}, read ${t.retrieved} · ${t.datum_source_horizontal} · ${Math.round(t.lidar_1m_fraction * 100)}% from 1 m lidar, rest coarser · unverified`;
  $('credits').textContent = `Terrain: USGS 3DEP. Imagery: USDA NAIP ${imagery.acquisition_year}. Drill holes and samples: historical and third-party data from the NI 43-101 report (effective 2026-06-30) and the Prismo Metals website, not verified by the QP unless marked as the QP check sample.`;

  // Home view: from the south-west, looking at the middle of the drill holes.
  const ce = collars.collars.reduce((a, c) => a + c.easting, 0) / collars.collars.length;
  const cn = collars.collars.reduce((a, c) => a + c.northing, 0) / collars.collars.length;
  const [x, z] = terrain.toWorld(ce, cn);
  home.target.set(x, terrain.heightAt(ce, cn), z);
  home.position.set(x - 2400, home.target.y + 2600, z + 4200);
  resetView();
  $('loading').remove();
  frame();
  // Handy for checks in the browser console during development.
  if (import.meta.env.DEV) Object.assign(window, { __viewer: { terrain, camera, controls, renderer, scene, requestRender } });
}
start().catch((err) => {
  console.error(err);
  $('loading').textContent = `Could not load the model: ${err.message}`;
});
