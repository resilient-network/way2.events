    attribute float alpha;
    attribute float size;
    attribute vec2 dir;
    varying float vAlpha;
    varying vec2 vDir;
    
    void main() {
      vAlpha = alpha;
      vDir = dir;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (400.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
