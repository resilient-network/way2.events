/**
 * WebGL2 background shader — domain-warped BCC noise with Bayer dithering.
 * Outputs premultiplied alpha so the page background shows through.
 */

const VERTEX_SRC = /* glsl */ `#version 300 es
precision mediump float;
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SRC = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec2  uResolution;

// ink-90: hsla(249, 100%, 93%)
const vec3 HUE = vec3(0.859, 0.839, 1.0);
const mat3 BCC_MAT = mat3(
  0.788675134594813, -0.211324865405187, -0.577350269189626,
 -0.211324865405187,  0.788675134594813, -0.577350269189626,
  0.577350269189626,  0.577350269189626,  0.577350269189626
);

vec4 permute(vec4 t) { return t * (t * 34.0 + 133.0); }

vec3 bccGrad(float hash) {
  vec3 cube  = mod(floor(hash / vec3(1.0, 2.0, 4.0)), 2.0) * 2.0 - 1.0;
  vec3 cuboct = cube;
  float i0 = step(0.0, 1.0 - floor(hash / 16.0));
  float i1 = step(0.0, floor(hash / 16.0) - 1.0);
  cuboct.x *= 1.0 - i0;
  cuboct.y *= 1.0 - i1;
  cuboct.z *= 1.0 - (1.0 - i0 - i1);
  float tp = mod(floor(hash / 8.0), 2.0);
  vec3 rhomb = (1.0 - tp) * cube + tp * (cuboct + cross(cube, cuboct));
  vec3 g = cuboct * 1.22474487139 + rhomb;
  g *= (1.0 - 0.042942436724648037 * tp) * 3.5946317686139184;
  return g;
}

vec4 bccPart(vec3 X) {
  vec3 b = floor(X);
  vec4 i4 = vec4(X - b, 2.5);
  vec3 v1 = b + floor(dot(i4, vec4(0.25)));
  vec3 v2 = b + vec3(1,0,0) + vec3(-1,1,1) * floor(dot(i4, vec4(-0.25,0.25,0.25,0.35)));
  vec3 v3 = b + vec3(0,1,0) + vec3(1,-1,1) * floor(dot(i4, vec4(0.25,-0.25,0.25,0.35)));
  vec3 v4 = b + vec3(0,0,1) + vec3(1,1,-1) * floor(dot(i4, vec4(0.25,0.25,-0.25,0.35)));
  vec4 hashes = permute(mod(vec4(v1.x,v2.x,v3.x,v4.x), 289.0));
  hashes = permute(mod(hashes + vec4(v1.y,v2.y,v3.y,v4.y), 289.0));
  hashes = mod(permute(mod(hashes + vec4(v1.z,v2.z,v3.z,v4.z), 289.0)), 48.0);
  vec3 d1=X-v1, d2=X-v2, d3=X-v3, d4=X-v4;
  vec4 a = max(0.75 - vec4(dot(d1,d1),dot(d2,d2),dot(d3,d3),dot(d4,d4)), 0.0);
  vec4 aa = a*a, aaaa = aa*aa;
  vec3 g1=bccGrad(hashes.x), g2=bccGrad(hashes.y), g3=bccGrad(hashes.z), g4=bccGrad(hashes.w);
  vec4 ex = vec4(dot(d1,g1),dot(d2,g2),dot(d3,g3),dot(d4,g4));
  vec3 deriv = -8.0 * mat4x3(d1,d2,d3,d4) * (aa*a*ex) + mat4x3(g1,g2,g3,g4) * aaaa;
  return vec4(deriv, dot(aaaa, ex));
}

vec4 bccNoise(vec3 X) {
  X = BCC_MAT * X;
  vec4 r = bccPart(X) + bccPart(X + 144.5);
  return vec4(r.xyz * BCC_MAT, r.w);
}

float bayer(vec2 px, float scale) {
  float val = 0.0, div = 0.0, mul = 1.0;
  float sz = 8.0 / scale;
  for (int lev = 4; lev >= 1; lev--) {
    vec2 bc = mod(floor(px / sz), 2.0);
    mul *= 4.0;
    val += mix(bc.x * 2.0, 3.0 - bc.x * 2.0, bc.y) / 3.0 * mul;
    div += mul;
    sz *= 0.5;
  }
  return val / div - 0.006;
}

float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  float ar = uResolution.x / uResolution.y;
  vec2 st = (vUv - 0.5) * vec2(ar, 1.0);
  float t = uTime * 0.12;

  // Domain-warped noise: each pass warps the next for a cohesive surface
  vec4 n1 = bccNoise(vec3(st * 0.35, t * 0.3));
  vec2 warp = n1.xy * 0.5;

  vec2 drift = vec2(t * 0.05, t * -0.03);
  vec4 n2 = bccNoise(vec3((st + warp + drift) * 0.55, t * 0.5 + 50.0));
  warp += n2.xy * 0.3;

  vec4 n3 = bccNoise(vec3((st + warp) * 0.9, t * 0.65 + 120.0));

  float raw = n1.w * 0.45 + n2.w * 0.35 + n3.w * 0.2;
  float intensity = smoothstep(-0.15, 0.65, raw) * 0.55;

  // Bayer dither (3 quantization levels)
  float dith = bayer(gl_FragCoord.xy, 0.25);
  intensity = floor(intensity * 3.0 + dith) / 3.0;
  intensity += (rand(vUv) - 0.5) / 255.0;
  intensity = clamp(intensity, 0.0, 1.0);

  // Premultiplied alpha
  fragColor = vec4(HUE * intensity, intensity);
}
`;

interface ShaderInstance {
  destroy: () => void;
}

type IdleCallbackWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

const BACKGROUND_FPS = 24;
const FRAME_INTERVAL_MS = 1000 / BACKGROUND_FPS;

export function initShader(canvas: HTMLCanvasElement): ShaderInstance {
  const idleWin = window as IdleCallbackWindow;
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    powerPreference: 'low-power',
  });

  if (!gl) {
    console.warn('WebGL2 not available — shader background disabled');
    return { destroy: () => {} };
  }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  function compile(type: number, src: string): WebGLShader {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      console.error(gl!.getShaderInfoLog(s));
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPosition');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uRes  = gl.getUniformLocation(prog, 'uResolution');
  const dprCap = Math.min(window.devicePixelRatio || 1, 2);

  // Track last applied size to avoid unnecessary canvas buffer clears.
  // On mobile, the URL bar show/hide changes viewport height by a small
  // amount which triggers ResizeObserver.  Resetting canvas.width/height
  // clears the WebGL buffer, producing a visible blank-frame flicker.
  let lastW = 0;
  let lastH = 0;

  function resize() {
    // Use window dimensions for the fixed-position, full-viewport canvas
    // to avoid layout thrash from getBoundingClientRect during scroll.
    const w = Math.round(window.innerWidth  * dprCap);
    const h = Math.round(window.innerHeight * dprCap);

    // Skip resize when the change is only a small vertical shift
    // (mobile URL bar hide/show is typically < 15% of viewport height).
    const heightDelta = Math.abs(h - lastH);
    const isMinorHeightChange = lastH > 0 && heightDelta > 0 && heightDelta < lastH * 0.15 && w === lastW;

    if (w !== lastW || (h !== lastH && !isMinorHeightChange)) {
      canvas.width  = w;
      canvas.height = h;
      lastW = w;
      lastH = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let visible = true;
  let pageVisible = document.visibilityState === 'visible';
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      syncLoop();
    },
    { threshold: 0 },
  );
  io.observe(canvas);

  let raf = 0;
  let running = false;
  let destroyed = false;
  const t0 = performance.now();
  let lastDraw = 0;

  function draw(now: number) {
    const elapsed = (now - t0) * 0.001;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform1f(uTime, elapsed);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function shouldRun() {
    return visible && pageVisible && !destroyed;
  }

  function stopLoop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function frame(now: number) {
    if (!running) return;
    if (now - lastDraw >= FRAME_INTERVAL_MS) {
      const frameDrift = (now - lastDraw) % FRAME_INTERVAL_MS;
      lastDraw = now - frameDrift;
      draw(now);
    }
    raf = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (running || !shouldRun()) return;
    running = true;
    const now = performance.now();
    lastDraw = now - FRAME_INTERVAL_MS;
    raf = requestAnimationFrame(frame);
  }

  function syncLoop() {
    if (shouldRun()) {
      startLoop();
      return;
    }
    stopLoop();
  }

  function onVisibilityChange() {
    pageVisible = document.visibilityState === 'visible';
    syncLoop();
  }

  function start() {
    resize();
    syncLoop();
  }

  if (idleWin.requestIdleCallback) {
    idleWin.requestIdleCallback(start, { timeout: 2000 });
  } else {
    setTimeout(start, 200);
  }

  document.addEventListener('visibilitychange', onVisibilityChange);

  function destroy() {
    destroyed = true;
    stopLoop();
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    gl!.deleteProgram(prog);
    gl!.deleteShader(vs);
    gl!.deleteShader(fs);
    gl!.deleteBuffer(buf);
    const ext = gl!.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }

  return { destroy };
}
