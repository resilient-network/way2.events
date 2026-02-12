    uniform vec3 color;
    uniform float time;
    varying float vAlpha;
    varying float vDepth;
    
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if (dist > 0.5) discard;
      
      float strength = 1.0 - smoothstep(0.3, 0.5, dist);
      
      float depthFade = 1.0 - vDepth * 0.5;
      gl_FragColor = vec4(color, vAlpha * strength * depthFade);
    }
