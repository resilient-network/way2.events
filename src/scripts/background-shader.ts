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

const float PI = 3.14159265359;

// ink-90: hsla(249, 100%, 93%)
const vec3 HUE = vec3(0.859, 0.839, 1.0);

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
  mat3 m = mat3(
    0.788675134594813, -0.211324865405187, -0.577350269189626,
   -0.211324865405187,  0.788675134594813, -0.577350269189626,
    0.577350269189626,  0.577350269189626,  0.577350269189626);
  X = m * X;
  vec4 r = bccPart(X) + bccPart(X + 144.5);
  return vec4(r.xyz * m, r.w);
}

float bayer(vec2 px, float scale) {
  float val = 0.0, div = 0.0, mul = 1.0;
  for (int lev = 4; lev >= 1; lev--) {
    float sz = exp2(float(lev)) * 0.5 / scale;
    vec2 bc = mod(floor(px / sz), 2.0);
    mul *= 4.0;
    val += mix(bc.x * 2.0, 3.0 - bc.x * 2.0, bc.y) / 3.0 * mul;
    div += mul;
  }
  return val / div - 0.006;
}

float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  float ar = uResolution.x / uResolution.y;
  vec2 fragCoord = vUv * uResolution;
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
  float dith = bayer(fragCoord, 0.25);
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

export function initShader(canvas: HTMLCanvasElement): ShaderInstance {
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

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width  * dprCap);
    const h = Math.round(rect.height * dprCap);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let visible = true;
  const io = new IntersectionObserver(
    (entries) => { visible = entries[0]?.isIntersecting ?? true; },
    { threshold: 0 },
  );
  io.observe(canvas);

  let raf = 0;
  const t0 = performance.now();

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!visible) return;

    const elapsed = (performance.now() - t0) * 0.001;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.uniform1f(uTime, elapsed);
    gl!.uniform2f(uRes, canvas.width, canvas.height);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function start() {
    resize();
    frame();
  }

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(start, { timeout: 2000 });
  } else {
    setTimeout(start, 200);
  }

  function destroy() {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    gl!.deleteProgram(prog);
    gl!.deleteShader(vs);
    gl!.deleteShader(fs);
    gl!.deleteBuffer(buf);
    const ext = gl!.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }

  return { destroy };
}
