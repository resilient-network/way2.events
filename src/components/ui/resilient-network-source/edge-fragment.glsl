    uniform vec3 color;
    uniform float time;
    varying float vOpacity;
    varying float vPosition;
    
    void main() {
      float flow = sin(time * 4.0 - vPosition * 0.03) * 0.5 + 0.5;
      
      vec3 edgeColor = color;
      
      float pulse = 0.7 + 0.3 * flow;
      gl_FragColor = vec4(edgeColor, vOpacity * pulse);
    }
