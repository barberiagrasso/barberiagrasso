/*
  hero-orbit.js - mounts the one-off hero moment: the clipper's own product-render turning on itself as
  the page scrolls (ctrl.set({angle}), the same cheap per-frame path print.js uses for the dealt object
  scenes — not product-render's public set(), which tears the context down on every call), the ring of
  the shop's own photographs turning with it (CSS: a custom property driven straight by scroll progress).
  Built on the shared held-stage engine (scenes/lib.js): phone and reduced motion rest on the finished
  composition (the clipper's own poster, scenes.css/hero-orbit.css), same as every other big scene.
*/
import { scene } from './scenes/lib.js';
import { loadProduct } from './objects/product-render/build.js';

const REST_ANGLE = -28;
const TURNS = 1;

async function run(root) {
  const productHost = root.querySelector('.orbit__product');
  const ring = root.querySelector('.orbit__turntable');
  if (!productHost || !ring) return;

  let product = null, variant = null, ctrl = null;
  try {
    product = await loadProduct('assets/objects/product-render/specs/clipper.json');
    variant = product.variant({ view: 'three-quarter' });
  } catch (e) { console.warn('hero-orbit: no product', e); return; }

  function mountLive() {
    if (ctrl || !variant) return;
    try {
      ctrl = variant.mount0(productHost, {
        params: { transparent: 1, size: 0.82, x: 0, y: -0.04, turn: 0, interactive: 0, shadow: 0.5, step: 1, angle: REST_ANGLE },
      });
    } catch (e) { console.warn('hero-orbit: mount failed', e); ctrl = null; }
  }
  function unmountLive() {
    if (ctrl) { try { ctrl.destroy(); } catch (_) { /* gone */ } ctrl = null; }
  }

  scene(root, {
    hold: 1,
    phone: 'rest',
    enter() { mountLive(); },
    near(_, isNear) { if (isNear) mountLive(); else unmountLive(); },
    update(p) {
      const angle = REST_ANGLE + p * 360 * TURNS;
      if (ctrl) { try { ctrl.set({ angle }); } catch (_) { /* a resize mid-turn: next frame corrects it */ } }
      ring.style.setProperty('--ring-angle', (p * 360 * TURNS).toFixed(2) + 'deg');
    },
    rest() { unmountLive(); ring.style.removeProperty('--ring-angle'); },
  });
}

const root = document.querySelector('[data-big-scene="clipper-orbit"]');
if (root) run(root);
