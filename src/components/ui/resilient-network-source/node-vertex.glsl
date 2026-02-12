    attribute float size;
    attribute float alpha;
    varying float vAlpha;
    varying float vDepth;
    
    void main() {
      vAlpha = alpha;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vDepth = clamp(-mvPosition.z / 600.0, 0.0, 1.0);
      
      gl_PointSize = size * (500.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
