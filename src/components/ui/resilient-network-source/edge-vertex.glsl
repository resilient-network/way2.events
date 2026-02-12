    attribute float opacity;
    varying float vOpacity;
    varying float vPosition;
    
    void main() {
      vOpacity = opacity;
      vPosition = position.x + position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
