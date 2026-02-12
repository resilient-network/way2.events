    uniform vec3 color;
    varying float vIntensity;
    
    float dither4x4(vec2 coord) {
      int x = int(mod(coord.x, 4.0));
      int y = int(mod(coord.y, 4.0));
      int index = x + y * 4;
      float thresholds[16];
      thresholds[0] = 0.0;  thresholds[1] = 0.5;  thresholds[2] = 0.125; thresholds[3] = 0.625;
      thresholds[4] = 0.75; thresholds[5] = 0.25; thresholds[6] = 0.875; thresholds[7] = 0.375;
      thresholds[8] = 0.1875; thresholds[9] = 0.6875; thresholds[10] = 0.0625; thresholds[11] = 0.5625;
      thresholds[12] = 0.9375; thresholds[13] = 0.4375; thresholds[14] = 0.8125; thresholds[15] = 0.3125;
      return thresholds[index];
    }
    
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      if (abs(coord.x) > 0.5 || abs(coord.y) > 0.5) discard;
      
      float edge = smoothstep(0.45, 0.5, max(abs(coord.x), abs(coord.y)));
      float shade = 0.85 + 0.15 * (coord.x + coord.y);
      shade *= (1.0 - edge * 0.5);
      
      float coverage = clamp(vIntensity, 0.0, 1.0);
      float threshold = dither4x4(gl_FragCoord.xy);
      float mask = step(threshold, coverage);
      
      gl_FragColor = vec4(color * shade, mask);
    }
