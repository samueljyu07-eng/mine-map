import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { loadTerrain, type Terrain } from './terrain';
import './style.css';

const BASE = import.meta.env.BASE_URL;
const SAMPLE_SOURCE = 'Source: Prismo Metals website, historical/vendor data, not verified by QP';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (v: number) => Math.round(v).toLocaleString('en-US');

interface Sample {
  id: string; type: string; sampler: string; width_m: string | null;
  easting: number; northing: number; cu_pct: number | null; au_gpt: number | null;
  terrain_elevation_m: number;
}
interface SamplesFile { retrieved: string; datum: string; crs_assumed: string; verified: boolean; samples: Sample[] }
interface ClaimsFile {
  metadata: { placeholder: boolean; source: string; datum: string; verified: boolean };
  features: { properties: { name?: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[];
}
interface ImageryFile { acquisition_dates: string[]; acquisition_year: number; datum_source_horizontal: string; verified: boolean; source: string }

// ---------- Disclaimer (shown before the model) ----------
// In development only, adding ?shot=1 to the address skips it so automated screenshots can be taken.
const skipDisclaimer = import.meta.env.DEV && new URLSearchParams(location.search).has('shot');
if (skipDisclaimer) $('disclaimer').remove();
else $('disc-ok').addEventListener('click', () => $('disclaimer').remove());

// ---------- Scene ----------
const lowPower = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 800;
const canvas = $<HTMLCanvasElement>('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const labelRenderer = new CSS2DRenderer({ element: $('labels') });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12161b);
const camera = new THREE.PerspectiveCamera(45, 1, 10, 80000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 150;
controls.maxDistance = 26000;
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
      const mesh = new THREE.Mesh(terrain.buildQuadrant(row, col, lowPower ? 2 : 1), hillMaterial);
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

// ---------- Samples ----------
const samplesGroup = new THREE.Group();
world.add(samplesGroup);
let activePin: HTMLElement | null = null;

function showSample(s: Sample, pin: HTMLElement) {
  activePin?.classList.remove('active');
  activePin = pin;
  pin.classList.add('active');
  const row = (k: string, v: string) => `<dt>${k}</dt><dd>${v}</dd>`;
  $('info-body').innerHTML = `
    <h3>Sample ${s.id}</h3>
    <dl>
      ${row('Type', s.type)}
      ${row('Sampler', s.sampler)}
      ${row('Width', s.width_m ? `${s.width_m} m` : 'not reported')}
      ${row('Cu %', s.cu_pct === null ? 'not reported' : String(s.cu_pct))}
      ${row('Au g/t', s.au_gpt === null ? 'not reported' : String(s.au_gpt))}
      ${row('Easting', `${fmt(s.easting)} m`)}
      ${row('Northing', `${fmt(s.northing)} m`)}
    </dl>
    <p class="src">${SAMPLE_SOURCE}</p>
    <p>Values are shown exactly as published. Selected and grab samples are not representative.</p>
    <p>Coordinates: WGS84 as published; UTM Zone 12N is assumed.</p>`;
  $('info').hidden = false;
}

function buildSamples(file: SamplesFile) {
  for (const s of file.samples) {
    const pin = document.createElement('button');
    pin.className = 'pin';
    pin.type = 'button';
    pin.setAttribute('aria-label', `Sample ${s.id}`);
    pin.innerHTML = `<span class="pin-label">${s.id}</span><span class="pin-dot"></span>`;
    pin.addEventListener('click', () => showSample(s, pin));
    const obj = new CSS2DObject(pin);
    obj.center.set(0.5, 1); // bottom of the pin touches the ground point
    const [x, z] = terrain.toWorld(s.easting, s.northing);
    obj.position.set(x, terrain.heightAt(s.easting, s.northing), z);
    samplesGroup.add(obj);
  }
  $('m-samples').textContent = `${file.samples.length} points · Prismo Metals website, read ${file.retrieved} · ${file.datum}, UTM 12N assumed · historical/vendor, not verified by QP`;
}
$('info-close').addEventListener('click', () => {
  $('info').hidden = true;
  activePin?.classList.remove('active');
});

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
          const north = ring.reduce((a, b) => (b[1] > a[1] ? b : a));
          const east = Math.max(...ring.map((c) => c[0]));
          const west = Math.min(...ring.map((c) => c[0]));
          const el = document.createElement('div');
          el.className = 'claims-label';
          el.textContent = 'PLACEHOLDER: not the claim boundary';
          const label = new CSS2DObject(el);
          label.center.set(0.5, 1);
          const e = (east + west) / 2;
          const [x, z] = terrain.toWorld(e, north[1]);
          label.position.set(x, terrain.heightAt(e, north[1]) + 4, z);
          claimsGroup.add(label);
        }
      }
    }
  }
  $('l-claims').firstChild!.textContent = placeholder ? 'Claims (PLACEHOLDER)' : 'Claims';
  $('m-claims').textContent = placeholder
    ? 'No claims file yet. Dashed box drawn 250 m outside the samples. Not the claim boundary.'
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
$<HTMLInputElement>('t-imagery').addEventListener('change', (e) => { imageryOn = (e.target as HTMLInputElement).checked; applyImagery(); });
$<HTMLInputElement>('t-samples').addEventListener('change', (e) => { samplesGroup.visible = (e.target as HTMLInputElement).checked; requestRender(); });
$<HTMLInputElement>('t-claims').addEventListener('change', (e) => { claimsGroup.visible = (e.target as HTMLInputElement).checked; requestRender(); });
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
  // Labels are hidden when zoomed far out so the pins do not pile up.
  $('labels').classList.toggle('far', dist > 7000);
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
  const [samples, claims, imagery] = await Promise.all([
    getJson<SamplesFile>('samples.json'), getJson<ClaimsFile>('claims.json'), getJson<ImageryFile>('imagery.json'),
  ]);
  buildTerrain();
  buildSamples(samples);
  buildClaims(claims);

  const t = terrain.meta;
  $('m-imagery').textContent = `${imagery.source.replace('National Agriculture Imagery Program ', '')} · flown ${imagery.acquisition_dates.join(', ')} · ${imagery.datum_source_horizontal} · unverified`;
  $('m-terrain').textContent = `Terrain: ${t.source}, read ${t.retrieved} · ${t.datum_source_horizontal} · ${Math.round(t.lidar_1m_fraction * 100)}% from 1 m lidar, rest coarser · unverified`;
  $('credits').textContent = `Terrain: USGS 3DEP. Imagery: USDA NAIP ${imagery.acquisition_year}. Samples: Prismo Metals website, historical/vendor data, not verified by QP. Claims outline is a placeholder.`;

  // Home view: from the south-west, looking at the middle of the sample points.
  const es = samples.samples.map((s) => s.easting);
  const ns = samples.samples.map((s) => s.northing);
  const ce = (Math.min(...es) + Math.max(...es)) / 2;
  const cn = (Math.min(...ns) + Math.max(...ns)) / 2;
  const [x, z] = terrain.toWorld(ce, cn);
  home.target.set(x, terrain.heightAt(ce, cn), z);
  home.position.set(x - 2600, home.target.y + 3200, z + 4600);
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
