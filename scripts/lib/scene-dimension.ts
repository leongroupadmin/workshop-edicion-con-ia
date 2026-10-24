import type { EditStyle } from "../../src/pipeline/types";

export type GraphicsDimension = NonNullable<EditStyle["graphicsDimension"]>;

export const DIMENSION_BRIEF: Record<GraphicsDimension, string> = {
  "2d": "2D: gráficos planos como hasta ahora. Usar posición, escala y rotación en el plano; sin perspectiva, rotaciones X/Y ni WebGL.",
  "2.5d": "3D SIMULADO: usar capas HTML/CSS con perspective, transform-style: preserve-3d, translateZ y rotaciones X/Y moderadas. Animar con la misma timeline GSAP pausada. Mantener el texto legible y respetar el layout; sin WebGL ni modelos 3D.",
  "3d": "3D REAL SENCILLO: usar Three.js local (assets/three/three.module.js), geometría tridimensional, materiales, luz principal + relleno y cámara. Conservar el importmap. Renderizar desde el tiempo absoluto de HyperFrames (hf-seek) y la timeline GSAP; nunca requestAnimationFrame, setAnimationLoop, Date.now ni estado acumulativo. Mantener data-duration y alfa en overlays. Diseñar geometría pertinente al contenido; la geometría inicial es solo una base. Evitar modelos remotos, postprocesado pesado y sombras costosas. Mantener textos HTML legibles sobre el canvas. Verificar canvas visible y render; no reemplazar silenciosamente por 2D si WebGL falla.",
};

/** Complementa la plantilla 2D sin modificar su composición cuando no hay profundidad. */
export const dimensionParts = (dimension: GraphicsDimension, w: number, h: number, durS: number) => {
  if (dimension === "2d") return { head: "", css: "", markup: "", timeline: "", script: "" };
  if (dimension === "2.5d") return {
    head: "",
    css: `#scene { perspective: 1200px; }
      #stage { transform-style: preserve-3d; }
      #card { box-shadow: 14px 20px 0 color-mix(in srgb, var(--brand-primary) 25%, transparent); }
      #title { text-shadow: 2px 3px 0 color-mix(in srgb, var(--brand-primary) 35%, transparent); }`,
    markup: "",
    timeline: `tl.fromTo("#stage", { rotationX: 7, rotationY: -10, z: -35 }, { rotationX: -3, rotationY: 7, z: 20, duration: ${durS}, ease: "sine.inOut" }, 0);`,
    script: "",
  };
  return {
    head: '<script type="importmap">{"imports":{"three":"./assets/three/three.module.js"}}</script>',
    css: "#three-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }",
    markup: '<canvas id="three-layer" aria-hidden="true"></canvas>',
    timeline: "",
    script: `<script type="module">
      import * as THREE from "three";
      const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("three-layer"), alpha: true, antialias: true });
      renderer.setPixelRatio(1);
      renderer.setSize(${w}, ${h}, false);
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, ${w / h}, 0.1, 100);
      camera.position.set(0, 0, 7);
      const color = getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim();
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.35, transparent: true });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.24, 16, 64), material);
      scene.add(mesh);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2));
      const key = new THREE.DirectionalLight(0xffffff, 3);
      key.position.set(3, 4, 5);
      scene.add(key);
      const timeline = window.__timelines["main"];
      function renderAt(time) {
        const t = Math.max(0, Math.min(${durS}, time));
        const visibility = Math.min(1, t / 0.5, Math.max(0, (${durS} - 0.2 - t) / 0.4));
        material.opacity = visibility;
        mesh.rotation.set(0.35 + Math.sin(t * 0.5) * 0.15, t * 0.45, 0.15);
        mesh.scale.setScalar(Math.min(1, ${w / h}) * (0.8 + visibility * 0.2));
        camera.position.x = Math.sin(t * 0.3) * 0.25;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      }
      window.addEventListener("hf-seek", (event) => renderAt(event.detail.time));
      timeline.eventCallback("onUpdate", () => renderAt(timeline.time()));
      renderAt(timeline.time());
    </script>`,
  };
};
