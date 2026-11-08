"use client";

/*
  Hero 3D del sillón: porta src/main.js del archivo que mandó Diego (grasso-web.zip) a un componente
  de React. Mismo comportamiento (Three.js + GSAP ScrollTrigger, el sillón se aleja y gira mientras
  los 12 trabajos reales de @barberia.grasso aparecen orbitando), pero con limpieza completa al
  desmontar (renderer, listeners, ScrollTrigger, timeline) para no dejar nada corriendo si React
  navega fuera de esta página.
*/

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import styles from "./nueva-home.module.css";

gsap.registerPlugin(ScrollTrigger);
// Evita que una simple transición CSS :hover (p. ej. al ampliar una sede) dispare un
// recálculo del ScrollTrigger fijado del hero: con el pin activo, ese recálculo puede
// devolver al usuario arriba del todo si está desplazado. Solo refrescamos a mano cuando
// de verdad cambia la altura de la página (ver toggleSede en NuevaHomeClient).
ScrollTrigger.config({ autoRefreshEvents: "visibilitychange,DOMContentLoaded,load" });

export function HeroChair({ works }: { works: string[] }) {
  const introRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const loaderBarRef = useRef<HTMLElement>(null);
  const loaderPctRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const kickerRef = useRef<HTMLParagraphElement>(null);
  const worksElRef = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLDivElement>(null);
  const giantRef = useRef<HTMLDivElement>(null);
  const [noWebgl, setNoWebgl] = useState(false);

  useEffect(() => {
    const intro = introRef.current, canvas = canvasRef.current, loaderEl = loaderRef.current;
    const loaderBar = loaderBarRef.current, loaderPct = loaderPctRef.current;
    if (!intro || !canvas || !loaderEl || !loaderBar || !loaderPct) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = () => window.innerWidth < 760;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setNoWebgl(true);
    }

    const cleanups: Array<() => void> = [];
    let raf: number | null = null;
    let disposed = false;

    function setProgress(p: number) {
      const v = Math.max(0, Math.min(1, p));
      loaderBar!.style.transform = `scaleX(${v})`;
      loaderPct!.textContent = String(Math.round(v * 100)).padStart(2, "0");
    }

    function finishLoading() {
      setProgress(1);
      gsap.to(loaderEl, {
        yPercent: -100, duration: 1, ease: "power4.inOut", delay: 0.25,
        onComplete: () => { if (!disposed) loaderEl!.style.display = "none"; ScrollTrigger.refresh(); },
      });
      if (titleRef.current) {
        gsap.from(titleRef.current.querySelectorAll(":scope > span > span"), {
          yPercent: 110, duration: 1.2, ease: "power4.out", stagger: 0.08, delay: 0.7,
        });
      }
      gsap.from([kickerRef.current].filter(Boolean), { opacity: 0, y: 20, duration: 1, delay: 1.1, stagger: 0.1 });
    }

    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: intro, start: "top top", end: "+=320%", pin: true, scrub: 1.1, anticipatePin: 1,
      },
    });
    const state = { camZ: 3.1, camY: 0.05, lookY: 0, chairRot: -0.55, chairY: 0, ring: 0, ringRot: 0, ringRadius: 1.6 };
    tl.to(state, { camZ: 7.4, camY: 1.15, lookY: -0.05, duration: 1 }, 0)
      .to(state, { chairRot: Math.PI * 2.4, duration: 2.2, ease: "power1.inOut" }, 0)
      .to(state, { ring: 1, ringRadius: 2.75, duration: 1, ease: "power2.out" }, 0.45)
      .to(state, { ringRot: -Math.PI * 1.6, duration: 1.75 }, 0.45);
    if (titleRef.current) tl.to(titleRef.current, { yPercent: -35, opacity: 0, scale: 0.92, duration: 0.55 }, 0);
    if (kickerRef.current) tl.to(kickerRef.current, { opacity: 0, y: -30, duration: 0.3 }, 0);
    if (scrollHintRef.current) tl.to(scrollHintRef.current, { opacity: 0, y: -30, duration: 0.3 }, 0);
    if (giantRef.current) tl.to(giantRef.current, { yPercent: 18, opacity: 0.08, duration: 1 }, 0);
    if (worksElRef.current) {
      tl.fromTo(worksElRef.current, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.4 }, 0.7)
        .to(worksElRef.current, { opacity: 1, duration: 0.8 }, 1.1);
    }
    tl.to(state, { camZ: 9.2, camY: 2.1, duration: 0.4, ease: "power1.in" }, 1.8);
    if (worksElRef.current) tl.to(worksElRef.current, { opacity: 0, y: -50, duration: 0.3 }, 1.9);
    cleanups.push(() => tl.scrollTrigger?.kill());
    cleanups.push(() => tl.kill());

    if (!renderer) {
      finishLoading();
      return () => cleanups.forEach((fn) => fn());
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.55;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.6));
    const key = new THREE.DirectionalLight(0xffe2bf, 2.6);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc0ff, 2.2);
    rim.position.set(-4, 3, -4);
    scene.add(rim);
    const fill = new THREE.PointLight(0xffffff, 6, 12);
    fill.position.set(0, 1.5, 3);
    scene.add(fill);

    const pivot = new THREE.Group();
    scene.add(pivot);
    const ringTilt = new THREE.Group();
    ringTilt.rotation.x = 0.18;
    ringTilt.rotation.z = -0.06;
    scene.add(ringTilt);
    const ring = new THREE.Group();
    ringTilt.add(ring);

    const shadowTex = makeShadowTexture();
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.0;
    pivot.add(shadow);

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_u, loaded, total) => setProgress(loaded / total);
    manager.onLoad = () => finishLoading();

    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    gltfLoader.load(
      "/nueva-home/chair.glb",
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = 2 / size.y;
        model.scale.setScalar(s);
        model.position.sub(center.multiplyScalar(s));
        model.traverse((o) => {
          if (o instanceof THREE.Mesh && o.material) {
            const mat = o.material as THREE.MeshStandardMaterial;
            mat.envMapIntensity = 0.9;
            if (mat.map) mat.map.anisotropy = renderer!.capabilities.getMaxAnisotropy();
          }
        });
        pivot.add(model);
      },
      (ev) => { if (ev.total) setProgress((ev.loaded / ev.total) * 0.9); },
      (err) => console.warn("nueva-home: fallo al cargar chair.glb", err),
    );

    const texLoader = new THREE.ImageLoader(manager);
    type Card = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> & { userData: { angle: number; bob: number } };
    const cards: Card[] = [];
    const n = works.length;
    works.forEach((src, i) => {
      texLoader.load(src, (img) => {
        if (disposed) return;
        const tex = new THREE.CanvasTexture(framedImage(img));
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.875), mat) as Card;
        mesh.userData.angle = (i / n) * Math.PI * 2;
        mesh.userData.bob = Math.random() * Math.PI * 2;
        ring.add(mesh);
        cards.push(mesh);
      });
    });

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer!.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w < h ? 48 : 35;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    cleanups.push(() => window.removeEventListener("resize", resize));
    resize();

    const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
    function onPointerMove(e: PointerEvent) {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener("pointermove", onPointerMove);
    cleanups.push(() => window.removeEventListener("pointermove", onPointerMove));

    const t0 = performance.now();
    const parentQ = new THREE.Quaternion();
    const wp = new THREE.Vector3();

    renderer.setAnimationLoop(() => {
      const r = intro.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) return;
      const t = (performance.now() - t0) / 1000;
      pointer.sx += (pointer.x - pointer.sx) * 0.05;
      pointer.sy += (pointer.y - pointer.sy) * 0.05;

      const mob = isMobile();
      const zMul = mob ? 1.3 : 1;
      camera.position.set(pointer.sx * 0.35, state.camY - pointer.sy * 0.2, state.camZ * zMul);
      camera.lookAt(0, state.lookY, 0);

      const idle = reduceMotion ? 0 : t * 0.12 * state.ring;
      pivot.rotation.y = state.chairRot + idle;
      pivot.position.y = state.chairY + (reduceMotion ? 0 : Math.sin(t * 0.8) * 0.03);

      const radius = state.ringRadius * (mob ? 0.6 : 1);
      ring.rotation.y = state.ringRot + (reduceMotion ? 0 : t * 0.08);
      ring.updateMatrixWorld();
      ring.getWorldQuaternion(parentQ);
      parentQ.invert();
      for (const c of cards) {
        const a = c.userData.angle;
        c.position.set(Math.sin(a) * radius, Math.sin(t * 0.9 + c.userData.bob) * 0.06, Math.cos(a) * radius);
        c.quaternion.copy(parentQ).multiply(camera.quaternion);
        const kk = THREE.MathUtils.clamp(state.ring * 1.6 - (a / (Math.PI * 2)) * 0.6, 0, 1);
        c.getWorldPosition(wp);
        const depth = THREE.MathUtils.clamp((wp.z + radius) / (radius * 2), 0, 1);
        c.material.color.setScalar(0.38 + 0.62 * depth);
        c.material.opacity = kk;
        c.renderOrder = Math.round(depth * 100);
        c.scale.setScalar(0.6 + 0.4 * kk);
      }
      renderer!.render(scene, camera);
    });

    cleanups.push(() => {
      renderer!.setAnimationLoop(null);
      renderer!.dispose();
      pmrem.dispose();
      envTex.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            const mm = m as THREE.MeshStandardMaterial;
            mm.map?.dispose();
            mm.dispose();
          });
        }
      });
      shadowTex.dispose();
    });

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section ref={introRef} className={`${styles.intro} ${noWebgl ? styles.noWebgl : ""}`} id="intro">
      <div ref={loaderRef} className={styles.loader} aria-hidden="true">
        <GrassoLogo className={styles.loaderLogo} />
        <div className={styles.loaderBar}><i ref={(el) => { loaderBarRef.current = el; }} /></div>
        <span ref={loaderPctRef} className={styles.loaderPct}>00</span>
      </div>

      <canvas ref={canvasRef} className={styles.stage} aria-label="Sillón de barbería en 3D girando rodeado de trabajos de Grasso" />

      <div ref={giantRef} className={styles.introGiant} aria-hidden="true">GRASSO</div>

      <div className={styles.introCopy}>
        <p ref={kickerRef} className={styles.introKicker}>
          <span className={styles.pole} aria-hidden="true" /> Men&apos;s salon · Getafe · Desde 2017
        </p>
        <h1 ref={titleRef} className={styles.introTitle}>
          <span className={styles.line}><span>Cuidamos</span></span>
          <span className={styles.line}><span>de tu <em>imagen</em></span></span>
        </h1>
      </div>

      <div ref={worksElRef} className={styles.introWorks} id="trabajos">
        <p className={styles.eyebrow}>Trabajos reales · @barberia.grasso</p>
        <h2>Cada silla,<br />un estilo.</h2>
      </div>

      <div ref={scrollHintRef} className={styles.introScroll} aria-hidden="true">
        <span>Desliza</span>
        <i />
      </div>
    </section>
  );
}

function framedImage(img: HTMLImageElement) {
  const W = 512, H = 640, pad = 14, r = 28;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  roundRect(ctx, 0, 0, W, H, r);
  ctx.fillStyle = "#f4f1ea";
  ctx.fill();
  ctx.save();
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, r - 8);
  ctx.clip();
  const iw = W - pad * 2, ih = H - pad * 2;
  const s = Math.max(iw / img.width, ih / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, pad + (iw - dw) / 2, pad + (ih - dh) / 2, dw, dh);
  ctx.restore();
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0.75)");
  g.addColorStop(0.5, "rgba(0,0,0,0.3)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
