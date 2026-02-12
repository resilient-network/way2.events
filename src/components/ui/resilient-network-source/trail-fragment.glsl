    uniform vec3 color;
    varying float vAlpha;
    varying vec2 vDir;
    
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
      vec2 dir = normalize(vDir);
      if (dir.x == 0.0 && dir.y == 0.0) {
        dir = vec2(1.0, 0.0);
      }
      float angle = atan(dir.y, dir.x);
      float c = cos(angle);
      float s = sin(angle);
      mat2 rot = mat2(c, -s, s, c);
      vec2 r = rot * coord;
      
      float tail = smoothstep(0.5, -0.5, r.x);
      float width = 1.0 - smoothstep(0.0, 0.45, abs(r.y) * 2.4);
      float strength = tail * width;
      if (strength <= 0.0) discard;
      
      float threshold = dither4x4(gl_FragCoord.xy);
      float mask = step(threshold, vAlpha * strength);
      
      gl_FragColor = vec4(color, mask);
    }
