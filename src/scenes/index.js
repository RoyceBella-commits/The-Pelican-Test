// Explicit scene manifest (never glob the folder: exFAT leaves ._*.js files around).
// Titles/years/frames live here so placeholders and the preview UI always know them.
// Each scene file default-exports an object; its fields override the manifest's.
import { placeholderRender } from '../kit/placeholder.js';

export const MANIFEST = [
  { file: '01-sahara.js', id: 'sahara', frame: 'stone', color: '#a8643a',
    title: { zh: '撒哈拉岩画', en: 'Saharan Rock Art' }, year: { zh: '约公元前 4000 年', en: 'c. 4000 BCE' } },
  { file: '02-egypt.js', id: 'egypt', frame: 'stone', color: '#c49a52',
    title: { zh: '埃及壁画', en: 'Egyptian Tomb Painting' }, year: { zh: '约公元前 1300 年', en: 'c. 1300 BCE' } },
  { file: '03-han.js', id: 'han', frame: 'mount', color: '#2b2a2a',
    title: { zh: '汉画像石拓片', en: 'Han Stone-Relief Rubbing' }, year: { zh: '约公元 100 年', en: 'c. 100 CE' } },
  { file: '04-tang.js', id: 'tang', frame: 'mount', color: '#b9ab8c',
    title: { zh: '唐代白描', en: 'Tang Baimiao Line Drawing' }, year: { zh: '约 750 年', en: 'c. 750' } },
  { file: '05-song.js', id: 'song', frame: 'mount', color: '#8a8270',
    title: { zh: '宋代山水', en: 'Song Landscape' }, year: { zh: '约 1000 年', en: 'c. 1000' } },
  { file: '06-qingming.js', id: 'qingming', frame: 'mount', color: '#a69472',
    title: { zh: '清明上河图', en: 'Along the River at Qingming' }, year: { zh: '约 1100 年', en: 'c. 1100' } },
  { file: '07-maya.js', id: 'maya', frame: 'wood', color: '#c9b48a',
    title: { zh: '玛雅抄本', en: 'Maya Codex' }, year: { zh: '约 1200 年', en: 'c. 1200' } },
  { file: '08-mughal.js', id: 'mughal', frame: 'gilt', color: '#3e6b4f',
    title: { zh: '莫卧儿细密画', en: 'Mughal Miniature' }, year: { zh: '约 1600 年', en: 'c. 1600' } },
  { file: '09-bada.js', id: 'bada', frame: 'mount', color: '#d8d0bf',
    title: { zh: '八大山人写意', en: 'Bada Shanren' }, year: { zh: '约 1690 年', en: 'c. 1690' } },
  { file: '10-wayang.js', id: 'wayang', frame: 'darkwood', color: '#d9a441',
    title: { zh: '爪哇皮影戏', en: 'Wayang Kulit' }, year: { zh: '约 1800 年', en: 'c. 1800' } },
  { file: '11-ukiyoe.js', id: 'ukiyoe', frame: 'wood', color: '#3f6f8f',
    title: { zh: '浮世绘', en: 'Ukiyo-e' }, year: { zh: '1830 年代', en: '1830s' } },
  { file: '12-muybridge.js', id: 'muybridge', frame: 'darkwood', color: '#5a5048',
    title: { zh: '迈布里奇连拍', en: 'Muybridge Motion Study' }, year: { zh: '1878 年', en: '1878' } },
  { file: '13-starry.js', id: 'starry', frame: 'gilt', color: '#1f3d78',
    title: { zh: '星月夜', en: 'The Starry Night' }, year: { zh: '1889 年', en: '1889' } },
  { file: '14-scream.js', id: 'scream', frame: 'gilt', color: '#c8602d',
    title: { zh: '呐喊', en: 'The Scream' }, year: { zh: '1893 年', en: '1893' } },
  { file: '15-moon.js', id: 'moon', frame: 'film', color: '#6b6b6b',
    title: { zh: '月球旅行记', en: 'A Trip to the Moon' }, year: { zh: '1902 年', en: '1902' } },
  { file: '16-nosferatu.js', id: 'nosferatu', frame: 'film', color: '#3a3f38',
    title: { zh: '诺斯费拉图', en: 'Nosferatu' }, year: { zh: '1922 年', en: '1922' } },
  { file: '17-chat.js', id: 'chat', frame: 'monitor', color: '#3a6ea5',
    title: { zh: '早期聊天窗口', en: 'Early Chat Window' }, year: { zh: '2000 年代', en: '2000s' } },
  { file: '18-vapor.js', id: 'vapor', frame: 'monitor', color: '#b45fb3',
    title: { zh: '蒸汽波', en: 'Vaporwave' }, year: { zh: '2010 年代', en: '2010s' } },
  { file: '19-shorts.js', id: 'shorts', frame: 'phone', color: '#e0465f',
    title: { zh: '竖屏短视频', en: 'Vertical Short Video' }, year: { zh: '2020 年代', en: '2020s' } },
  { file: '20-code.js', id: 'code', frame: 'monitor', color: '#1e2433',
    title: { zh: '代码美学', en: 'Code Aesthetics' }, year: { zh: '2020 年代 · 大模型时代', en: '2020s · the LLM era' } },
];

const DEFAULTS = { freezeU: 3, ride: {}, cues: [] };

/**
 * Load all scenes. A file that fails to import becomes a placeholder showing the error,
 * so a half-edited scene never breaks its neighbours.
 */
export async function loadScenes() {
  return Promise.all(MANIFEST.map(async (m, index) => {
    const meta = { ...m, index };
    let mod = null, error = null;
    try {
      mod = (await import(`./${m.file}`)).default;
    } catch (e) {
      error = e;
      console.error(`[scenes] ${m.file} failed to load:`, e);
    }
    const scene = { ...DEFAULTS, ...meta, ...(mod || {}) };
    scene.index = index;
    scene.title = { ...meta.title, ...(mod?.title || {}) };
    scene.year = { ...meta.year, ...(mod?.year || {}) };
    scene.fallback = placeholderRender(scene);
    if (!scene.render || mod?.placeholder) scene.render = scene.fallback;
    scene.loadError = error ? String(error.message || error) : null;
    // the last panel is the end of the road: the rider comes to rest in it
    if (index === MANIFEST.length - 1 && !scene.ride?.stopAt) scene.ride = { stopAt: 500, ...scene.ride };
    return scene;
  }));
}
