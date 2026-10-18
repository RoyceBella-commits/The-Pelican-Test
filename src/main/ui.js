// Preview page controller: transport, scrub bar with panel segments, scene label,
// and two picture modes — live render (exact) and draft video (smooth).
// Until the score exists (stage 4) the clock is performance.now(); afterwards
// the audio clock drives it (see audio/).
import * as TL from '../beat/timeline.js';
import { MANIFEST } from '../scenes/index.js';

const $ = (id) => document.getElementById(id);
const frameEl = $('frame'), scrub = $('scrub'), head = scrub.querySelector('.head');
const video = $('draft');
let t = 0, playing = false, startWall = 0, startT = 0, rendering = false, mode = 'live';
let lastRenderAt = 0, fpsAvg = 0;
const DUR = TL.DURATION;

// ------------------------------------------------------------------ scrub bar
const segs = [{ t0: 0, t1: TL.INTRO, color: '#d8c9a6', zh: '序', en: 'Preface', year: '' }];
MANIFEST.forEach((m, i) => segs.push({ t0: TL.sceneStart(i), t1: TL.sceneStart(i) + TL.SCENE_DUR, color: m.color, zh: m.title.zh, en: m.title.en, year: m.year.zh, n: i + 1 }));
segs.push({ t0: TL.OUTRO_START, t1: DUR, color: '#8a7a62', zh: '尾声 · 展墙', en: 'Outro', year: '' });
for (const s of segs) {
  const d = document.createElement('div');
  d.className = 'seg';
  d.style.left = (s.t0 / DUR) * 100 + '%';
  d.style.width = ((s.t1 - s.t0) / DUR) * 100 + '%';
  d.style.background = s.color;
  d.title = `${s.n ? s.n + ' · ' : ''}${s.zh} ${s.en}`;
  scrub.insertBefore(d, head);
}
const segAt = (tt) => segs.find((s) => tt >= s.t0 && tt < s.t1) || segs[segs.length - 1];

function fmt(tt) {
  const m = Math.floor(tt / 60), s = tt - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function updateUI() {
  head.style.left = `calc(${(t / DUR) * 100}% - 1px)`;
  $('time').textContent = `${fmt(t)} · 帧 ${Math.round(t * TL.FPS)}`;
  const s = segAt(t);
  $('scene').innerHTML = `<b>${s.n ? String(s.n).padStart(2, '0') + ' ' : ''}${s.zh}</b><span>${s.en}${s.year ? ' · ' + s.year : ''}</span>`;
  $('play').textContent = playing ? '❚❚' : '▶';
}

// ------------------------------------------------------------------ clock
const now = () => performance.now() / 1000;
function clockTime() { return playing ? Math.min(DUR, startT + (now() - startWall)) : t; }
function play() {
  if (t >= DUR - 0.05) t = 0;
  playing = true; startWall = now(); startT = t;
  if (mode === 'draft' && video.src) { video.currentTime = t; video.play().catch(() => {}); }
  updateUI();
}
function pause() { t = clockTime(); playing = false; video.pause(); requestRender(); updateUI(); }
function seek(tt) {
  t = Math.max(0, Math.min(DUR - 1 / TL.FPS, tt));
  if (playing) { startWall = now(); startT = t; }
  if (mode === 'draft' && video.src) video.currentTime = t;
  requestRender();
  updateUI();
}

// ------------------------------------------------------------------ rendering
let pending = false;
async function requestRender() {
  if (mode !== 'live') return;
  if (rendering) { pending = true; return; }
  rendering = true;
  const t0 = performance.now();
  await window.renderAt(t, { debug: $('beat').checked });
  const dt = performance.now() - t0;
  fpsAvg = fpsAvg ? fpsAvg * 0.85 + (1000 / Math.max(1, dt)) * 0.15 : 1000 / dt;
  rendering = false;
  if (pending) { pending = false; requestRender(); }
}

function loop() {
  if (playing) {
    t = clockTime();
    if (t >= DUR - 1 / TL.FPS) { t = DUR - 1 / TL.FPS; playing = false; video.pause(); }
    if (mode === 'live' && !rendering) requestRender();
    updateUI();
  }
  $('fps').textContent = mode === 'live' ? `${fpsAvg.toFixed(1)} fps` : 'video';
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ inputs
let dragging = false;
const scrubTo = (e) => { const r = scrub.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * DUR); };
scrub.addEventListener('pointerdown', (e) => { dragging = true; scrub.setPointerCapture(e.pointerId); scrubTo(e); });
scrub.addEventListener('pointermove', (e) => { if (dragging) scrubTo(e); });
scrub.addEventListener('pointerup', () => { dragging = false; });
$('play').onclick = () => (playing ? pause() : play());
$('prev').onclick = (e) => seek(t - (e.shiftKey ? 1 : 1 / TL.FPS));
$('next').onclick = (e) => seek(t + (e.shiftKey ? 1 : 1 / TL.FPS));
$('beat').onchange = () => requestRender();
$('mode').onchange = async (e) => {
  mode = e.target.value;
  if (mode === 'draft') {
    const ok = await fetch('/out/draft.mp4', { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
    if (!ok) { alert('还没有草稿视频：先运行 node tools/render.mjs --draft 和 node tools/encode.mjs --draft'); e.target.value = mode = 'live'; return; }
    video.src = '/out/draft.mp4';
    video.style.display = 'block';
    video.currentTime = t;
    if (playing) video.play().catch(() => {});
  } else {
    video.pause();
    video.style.display = 'none';
    requestRender();
  }
};
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
  if (e.code === 'ArrowLeft') seek(t - (e.shiftKey ? 1 : 1 / TL.FPS));
  if (e.code === 'ArrowRight') seek(t + (e.shiftKey ? 1 : 1 / TL.FPS));
  if (e.code === 'Home') seek(0);
});

// ------------------------------------------------------------------ boot
function boot() {
  const c = document.querySelector('canvas');
  if (c) frameEl.appendChild(c);
  $('loading').remove();
  const q = new URLSearchParams(location.search);
  if (q.has('t')) t = +q.get('t');
  updateUI();
  requestRender();
  loop();
}
if (window.__ready) boot(); else document.addEventListener('film-ready', boot, { once: true });

// expose for tools / debugging
window.preview = { seek, play, pause, get t() { return t; } };
