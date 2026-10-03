// Renderer, scene, camera and the post-processing chain:
// RenderPass (HalfFloat + depth texture) → UnrealBloomPass → FinalPass (to screen).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FinalPass } from './finalpass.js';

export function createCore(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.setClearColor(0x0b3a6e, 1);
  renderer.toneMapping = THREE.NoToneMapping; // FinalPass tone maps
  renderer.info.autoReset = false; // reset once per frame so all passes are counted

  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.5, 500);

  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.depthTexture = new THREE.DepthTexture(width, height);
  const composer = new EffectComposer(renderer, target);
  // EffectComposer clones the target; make sure both ping-pong targets own a depth texture.
  if (!composer.renderTarget2.depthTexture) composer.renderTarget2.depthTexture = new THREE.DepthTexture(width, height);

  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.5, 1.0);
  const finalPass = new FinalPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(finalPass);

  // Bloom resolution relative to the render size (UnrealBloomPass halves internally).
  let bloomScale = 0.5;
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSetSize(Math.max(4, Math.round(w * bloomScale * 2)), Math.max(4, Math.round(h * bloomScale * 2)));

  // Count draw calls of the scene itself (not the post passes).
  const stats = { sceneCalls: 0, sceneTriangles: 0, scenePoints: 0 };
  const renderPassRender = renderPass.render.bind(renderPass);
  renderPass.render = (...args) => {
    const calls = renderer.info.render.calls;
    const tris = renderer.info.render.triangles;
    const pts = renderer.info.render.points;
    renderPassRender(...args);
    stats.sceneCalls = renderer.info.render.calls - calls;
    stats.sceneTriangles = renderer.info.render.triangles - tris;
    stats.scenePoints = renderer.info.render.points - pts;
  };

  const size = { width, height, dpr: 1 };

  function setSize(w, h, dpr) {
    size.width = w;
    size.height = h;
    size.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function setBloom(scale) {
    bloomScale = scale > 0 ? scale : 0.5;
    bloom.enabled = scale > 0;
    composer.setSize(size.width, size.height);
  }

  function setScene(s, cam) {
    renderPass.scene = s;
    renderPass.camera = cam;
    finalPass.uniforms.uNear.value = cam.near;
    finalPass.uniforms.uFar.value = cam.far;
  }

  finalPass.uniforms.uNear.value = camera.near;
  finalPass.uniforms.uFar.value = camera.far;

  return { renderer, scene, camera, composer, renderPass, bloom, finalPass, stats, size, setSize, setBloom, setScene };
}
