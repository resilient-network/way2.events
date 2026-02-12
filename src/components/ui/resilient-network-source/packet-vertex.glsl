    attribute float size;
    attribute float intensity;
    varying float vIntensity;
    
    void main() {
      vIntensity = intensity;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (500.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
