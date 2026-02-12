import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  BufferGeometry,
  BufferAttribute,
  Points,
  LineSegments,
  ShaderMaterial,
  Color,
  AdditiveBlending,
  NormalBlending
} from 'three';
import { forceSimulation, forceManyBody, forceCenter, forceX, forceY, forceZ, forceLink } from 'd3-force-3d';
import {
  NETWORK_CONFIG,
  buildCenters,
  getCenterIndex,
  mergeConfig,
  randomBetween
} from './network-config.js';
import nodeVertexShader from './node-vertex.glsl?raw';
import nodeFragmentShader from './node-fragment.glsl?raw';
import edgeVertexShader from './edge-vertex.glsl?raw';
import edgeFragmentShader from './edge-fragment.glsl?raw';
import packetVertexShader from './packet-vertex.glsl?raw';
import packetFragmentShader from './packet-fragment.glsl?raw';
import trailVertexShader from './trail-vertex.glsl?raw';
import trailFragmentShader from './trail-fragment.glsl?raw';

/**
 * Resilient Network Visualization
 * A mesmerizing, shader-based force-directed graph with self-healing capabilities.
 * 
 * Two-tier progressive enhancement:
 * - Baseline: Main thread simulation (800 nodes)
 * - Enhanced: Web Worker simulation (1800 nodes) with rich visual effects
 * 
 * Visual Features:
 * - Depth-based fading for 3D feel
 * - Edge flow animation
 * - Packet trails with afterglow
 */

const SHADERS = {
  nodeVertex: nodeVertexShader,
  nodeFragment: nodeFragmentShader,
  edgeVertex: edgeVertexShader,
  edgeFragment: edgeFragmentShader,
  packetVertex: packetVertexShader,
  packetFragment: packetFragmentShader,
  trailVertex: trailVertexShader,
  trailFragment: trailFragmentShader
};

export class ResilientNetwork {
  constructor() {
    this.container = null;
    this.width = 0;
    this.height = 0;
    this.isRunning = false;
    this.isVisible = true;
    this.isPageVisible = true;
    
    // Three.js components
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.nodeMesh = null;
    this.edgeMesh = null;
    this.packetMesh = null;
    this.trailMesh = null;
    
    // Data
    this.nodes = [];
    this.links = [];
    this.linkByKey = new Map();
    this.packets = [];
    this.trails = [];  // Packet trail segments
    this.simulation = null;
    this.lastUtilizationSweep = 0;
    
    // Worker (for enhanced tier)
    this.worker = null;
    this.tier = 'baseline'; // 'baseline' | 'enhanced'
    this.workerReady = false;
    this.pendingFrame = false;
    
    // State
    this.lastSpawnTime = 0;
    this.lastInteractionTime = Date.now();
    this.animationFrameId = null;
    this.handleResize = this.onResize.bind(this);
    
    // Config - will be adjusted based on tier
    this.config = {
      maxNodes: 2000,
      nodeCount: 100,
      targetNodeCount: 500,
      maxLinks: 6000,
      connectionDistance: 100
    };

    this.tuning = mergeConfig(NETWORK_CONFIG);
    this.config.color = this.tuning.colors?.edge;
    this.config.packetColor = this.tuning.colors?.packet;
    this.config.bgColor = this.tuning.colors?.background;
  }

  async init(containerElement) {
    this.container = containerElement;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;

    // Read CSS custom properties
    const styles = getComputedStyle(document.body);
    const color = styles.getPropertyValue('--ink-black').trim();
    const bgColor = styles.getPropertyValue('--bg-paper').trim();
    const packetColor = styles.getPropertyValue('--highlight-accent').trim();

    if (color) this.config.color = color;
    if (bgColor) this.config.bgColor = bgColor;
    if (packetColor) this.config.packetColor = packetColor;
    
    const bgCol = new Color(this.config.bgColor);
    const luminance = bgCol.r * 0.299 + bgCol.g * 0.587 + bgCol.b * 0.114;
    this.isLightMode = luminance > 0.5;

    // Feature detection for tiered enhancement
    this.tier = this.detectTier();
    this.applyTierConfig();
    
    console.log(`🌐 Resilient Network: ${this.tier} tier (${this.config.targetNodeCount} nodes)`);

    // Initialize Three.js
    this.initThree();
    this.initData();
    
    // Initialize based on tier
    if (this.tier === 'enhanced') {
      await this.initEnhancedMode();
    } else {
      this.initBaselineMode();
    }
    
    this.initVisibilityTracking();
    this.isRunning = true;
    this.animate();
    
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Detect which tier to use based on browser capabilities
   */
  detectTier() {
    const hasWorker = typeof Worker !== 'undefined';
    
    // For now, simple detection. Could add performance benchmarking.
    if (hasWorker) {
      return 'enhanced';
    }
    return 'baseline';
  }

  /**
   * Apply configuration based on tier
   */
  applyTierConfig() {
    const tierConfig = this.tuning.tiers?.[this.tier];
    if (tierConfig) {
      Object.assign(this.config, tierConfig);
    }
  }

  /**
   * Initialize Web Worker for physics simulation
   */
  async initEnhancedMode() {
    return new Promise((resolve) => {
      try {
        this.worker = new Worker(
          new URL('./physics-worker.js', import.meta.url),
          { type: 'module' }
        );
        
        this.worker.onmessage = (e) => this.handleWorkerMessage(e);
        this.worker.onerror = (e) => {
          console.warn('Worker error, falling back to baseline:', e);
          this.tier = 'baseline';
          this.applyTierConfig();
          this.initBaselineMode();
          resolve();
        };
        
        // Send initial data to worker
        const nodeData = this.nodes.map(n => ({
          id: n.id,
          x: n.x,
          y: n.y,
          z: n.z,
          vx: n.vx || 0,
          vy: n.vy || 0,
          vz: n.vz || 0,
          size: n.size,
          cluster: n.cluster
        }));
        
        const linkData = this.links.map(l => ({
          source: l.source.id !== undefined ? l.source.id : l.source,
          target: l.target.id !== undefined ? l.target.id : l.target,
          utilizedCount: l.utilizedCount || 0
        }));
        
        this.worker.postMessage({
          type: 'init',
          initialNodes: nodeData,
          initialLinks: linkData,
          config: this.buildWorkerConfig()
        });
        
        // Resolve immediately - worker will signal when ready
        resolve();
      } catch (e) {
        console.warn('Failed to create worker, using baseline:', e);
        this.tier = 'baseline';
        this.applyTierConfig();
        this.initBaselineMode();
        resolve();
      }
    });
  }

  /**
   * Handle messages from physics worker
   */
  handleWorkerMessage(e) {
    switch (e.data.type) {
      case 'ready':
        this.workerReady = true;
        console.log(`✓ Worker ready: ${e.data.nodeCount} nodes, ${e.data.linkCount} links`);
        break;
        
      case 'frame':
        this.handleWorkerFrame(e.data);
        this.pendingFrame = false;
        break;
        
      case 'nodesAdded':
        // Update local count
        break;
    }
  }

  /**
   * Apply frame data from worker to Three.js geometries
   */
  handleWorkerFrame(data) {
    const positions = new Float32Array(data.positions);
    const linkIndices = new Uint32Array(data.linkIndices);
    
    const nodeCount = Math.min(data.nodeCount, this.config.maxNodes);
    const linkCount = Math.min(data.linkCount, this.config.maxLinks);
    
    // Expand nodes array if worker has more nodes
    while (this.nodes.length < nodeCount) {
      this.nodes.push({
        id: this.nodes.length,
        x: 0, y: 0, z: 0,
        size: randomBetween(this.tuning.nodes.sizeMin, this.tuning.nodes.sizeMax)
      });
    }
    
    // Update node positions
    const nodePositions = this.nodeMesh.geometry.attributes.position.array;
    const nodeSizes = this.nodeMesh.geometry.attributes.size.array;
    const nodeAlphas = this.nodeMesh.geometry.attributes.alpha.array;
    
    for (let i = 0; i < nodeCount; i++) {
      const srcOffset = i * 3;
      nodePositions[srcOffset] = positions[srcOffset];
      nodePositions[srcOffset + 1] = positions[srcOffset + 1];
      nodePositions[srcOffset + 2] = positions[srcOffset + 2];
      if (!this.nodes[i].size) {
        this.nodes[i].size = randomBetween(this.tuning.nodes.sizeMin, this.tuning.nodes.sizeMax);
      }
      nodeSizes[i] = this.nodes[i].size;
      nodeAlphas[i] = 1.0;
      
      // Update local node array for interaction and packets
      this.nodes[i].x = positions[srcOffset];
      this.nodes[i].y = positions[srcOffset + 1];
      this.nodes[i].z = positions[srcOffset + 2];
    }
    this.nodeMesh.geometry.attributes.position.needsUpdate = true;
    this.nodeMesh.geometry.attributes.size.needsUpdate = true;
    this.nodeMesh.geometry.attributes.alpha.needsUpdate = true;
    this.nodeMesh.geometry.setDrawRange(0, nodeCount);
    
    // Rebuild local links array for packet routing
    this.links = [];
    for (let i = 0; i < linkCount; i++) {
      const sourceIdx = linkIndices[i * 2];
      const targetIdx = linkIndices[i * 2 + 1];
      
      if (sourceIdx < nodeCount && targetIdx < nodeCount) {
        this.links.push({
          source: this.nodes[sourceIdx],
          target: this.nodes[targetIdx],
          utilizedCount: 0
        });
      }
    }
    
    this.rebuildLinkKeyMap(this.links);
    
    // Update edge geometry
    const edgePositions = this.edgeMesh.geometry.attributes.position.array;
    const edgeOpacities = this.edgeMesh.geometry.attributes.opacity.array;
    const baseOpacity = 0.6;
    
    let edgeIdx = 0;
    let opIdx = 0;
    
    for (let i = 0; i < this.links.length; i++) {
      const link = this.links[i];
      const source = link.source;
      const target = link.target;
      
      edgePositions[edgeIdx++] = source.x;
      edgePositions[edgeIdx++] = source.y;
      edgePositions[edgeIdx++] = source.z;
      edgePositions[edgeIdx++] = target.x;
      edgePositions[edgeIdx++] = target.y;
      edgePositions[edgeIdx++] = target.z;
      
      const opacity = baseOpacity;
      edgeOpacities[opIdx] = opacity;
      opIdx++;
      edgeOpacities[opIdx] = opacity;
      opIdx++;
    }
    
    this.edgeMesh.geometry.attributes.position.needsUpdate = true;
    this.edgeMesh.geometry.attributes.opacity.needsUpdate = true;
    this.edgeMesh.geometry.setDrawRange(0, edgeIdx / 3);
  }

  /**
   * Initialize baseline mode (main thread simulation)
   */
  initBaselineMode() {
    const centers = buildCenters(
      this.tuning.simulation.multiCenterCount,
      this.tuning.simulation.multiCenterRadius
    );
    const useMultiCenter = centers.length > 1;
    
    const simulation = forceSimulation(this.nodes, 3)
      .force("charge", forceManyBody().strength(this.tuning.simulation.chargeStrength));
      
    if (!useMultiCenter) {
      simulation.force("center", forceCenter(0, 0, 0));
    }
    
    simulation
      .force("x", forceX()
        .strength(this.tuning.simulation.centerStrength)
        .x(d => centers[getCenterIndex(d, centers.length)].x))
      .force("y", forceY()
        .strength(this.tuning.simulation.centerStrength)
        .y(d => centers[getCenterIndex(d, centers.length)].y))
      .force("z", forceZ()
        .strength(this.tuning.simulation.centerStrength)
        .z(d => centers[getCenterIndex(d, centers.length)].z))
      .stop();
      
    this.simulation = simulation;
      
    // Create initial links
    const links = [];
    this.nodes.forEach((node, i) => {
      if (i < this.nodes.length - 1) {
        links.push({ source: node.id, target: this.nodes[i+1].id, utilizedCount: 0 });
      }
      if (i < this.nodes.length - 2 && Math.random() > 0.6) {
        links.push({ source: node.id, target: this.nodes[i+2].id, utilizedCount: 0 });
      }
      if (Math.random() < 0.015) {
        const target = Math.floor(Math.random() * this.nodes.length);
        if (target !== i) {
          links.push({ source: node.id, target: this.nodes[target].id, utilizedCount: 0 });
        }
      }
    });
    
    this.simulation.force("link", forceLink(links).id(d => d.id)
      .distance(this.tuning.simulation.linkDistance)
      .strength(this.tuning.simulation.linkStrength));
    this.links = links;
  }

  initVisibilityTracking() {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          this.isVisible = entry.isIntersecting;
          this.handleVisibilityChange();
        });
      }, { threshold: 0.1 });
      observer.observe(this.container);
    }
    
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;
      this.handleVisibilityChange();
    });
  }
  
  handleVisibilityChange() {
    const shouldRun = this.isVisible && this.isPageVisible;
    if (shouldRun && !this.animationFrameId) {
      this.animate();
    }
  }

  initThree() {
    this.scene = new Scene();
    
    this.camera = new PerspectiveCamera(60, this.width / this.height, 1, 1000);
    this.camera.position.z = 400;

    this.renderer = new WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
    
  }

  initData() {
    // Generate initial clusters
    const clusterCount = 10;
    const nodesPerCluster = Math.floor(this.config.nodeCount / clusterCount);
    
    for (let i = 0; i < clusterCount; i++) {
      const cx = (Math.random() - 0.5) * 800;
      const cy = (Math.random() - 0.5) * 400;
      const cz = (Math.random() - 0.5) * 200;
      
      for (let j = 0; j < nodesPerCluster; j++) {
        this.nodes.push({
          id: i * nodesPerCluster + j,
          x: cx + (Math.random() - 0.5) * 120,
          y: cy + (Math.random() - 0.5) * 120,
          z: cz + (Math.random() - 0.5) * 120,
          vx: 0, vy: 0, vz: 0,
          size: randomBetween(this.tuning.nodes.sizeMin, this.tuning.nodes.sizeMax),
          cluster: i
        });
      }
    }

    // Create initial links
    this.links = [];
    this.nodes.forEach((node, i) => {
      if (i < this.nodes.length - 1) {
        this.links.push({ source: node.id, target: this.nodes[i+1].id, utilizedCount: 0 });
      }
      if (i < this.nodes.length - 2 && Math.random() > 0.6) {
        this.links.push({ source: node.id, target: this.nodes[i+2].id, utilizedCount: 0 });
      }
    });

    // Create node geometry with enhanced attributes
    const nodeGeo = new BufferGeometry();
    nodeGeo.setAttribute('position', new BufferAttribute(new Float32Array(this.config.maxNodes * 3), 3));
    nodeGeo.setAttribute('size', new BufferAttribute(new Float32Array(this.config.maxNodes), 1));
    nodeGeo.setAttribute('alpha', new BufferAttribute(new Float32Array(this.config.maxNodes), 1));
    
    this.updateNodeGeometry(nodeGeo);
    
    const blending = this.isLightMode ? NormalBlending : AdditiveBlending;
    
    const nodeMat = new ShaderMaterial({
      uniforms: {
        color: { value: new Color(this.config.color) },
        time: { value: 0 }
      },
      vertexShader: SHADERS.nodeVertex,
      fragmentShader: SHADERS.nodeFragment,
      transparent: true,
      depthWrite: false,
      blending: blending
    });
    
    this.nodeMesh = new Points(nodeGeo, nodeMat);
    this.scene.add(this.nodeMesh);
    
    // Create edge geometry
    const maxEdges = this.config.maxLinks;
    const edgeGeo = new BufferGeometry();
    edgeGeo.setAttribute('position', new BufferAttribute(new Float32Array(maxEdges * 2 * 3), 3));
    edgeGeo.setAttribute('opacity', new BufferAttribute(new Float32Array(maxEdges * 2), 1));
    
    const edgeMat = new ShaderMaterial({
      uniforms: {
        color: { value: new Color(this.config.color) },
        time: { value: 0 }
      },
      vertexShader: SHADERS.edgeVertex,
      fragmentShader: SHADERS.edgeFragment,
      transparent: true,
      depthWrite: false,
      blending: blending
    });
    
    this.edgeMesh = new LineSegments(edgeGeo, edgeMat);
    this.scene.add(this.edgeMesh);

    // Create packet geometry
    this.packetCapacity = Math.max(100, this.tuning.packets.maxPackets);
    const packetGeo = this.createPacketGeometry(this.packetCapacity);
    
    const packetMat = new ShaderMaterial({
      uniforms: {
        color: { value: new Color(this.config.packetColor) }
      },
      vertexShader: SHADERS.packetVertex,
      fragmentShader: SHADERS.packetFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending
    });
    
    this.packetMesh = new Points(packetGeo, packetMat);
    this.scene.add(this.packetMesh);
    
    // Create trail geometry for packet afterglow effect
    const maxTrails = this.tuning.packets.trailMax;  // Max trail points
    const trailGeo = new BufferGeometry();
    trailGeo.setAttribute('position', new BufferAttribute(new Float32Array(maxTrails * 3), 3));
    trailGeo.setAttribute('alpha', new BufferAttribute(new Float32Array(maxTrails), 1));
    trailGeo.setAttribute('size', new BufferAttribute(new Float32Array(maxTrails), 1));
    trailGeo.setAttribute('dir', new BufferAttribute(new Float32Array(maxTrails * 2), 2));
    
    const trailMat = new ShaderMaterial({
      uniforms: {
        color: { value: new Color(this.config.packetColor) }
      },
      vertexShader: SHADERS.trailVertex,
      fragmentShader: SHADERS.trailFragment,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending
    });
    
    this.trailMesh = new Points(trailGeo, trailMat);
    this.scene.add(this.trailMesh);
  }


  spawnCluster(x, y) {
    if (this.nodes.length >= this.config.maxNodes - 30) return;
    
    if (this.tier === 'enhanced' && this.worker) {
      // Delegate to worker
      this.worker.postMessage({ type: 'addCluster', x, y, z: 0 });
      this.lastInteractionTime = Date.now();
      return;
    }
    
    // Baseline: handle locally
    const count = 15 + Math.floor(Math.random() * 15);
    const newNodes = [];
    const clusterId = Math.floor(Math.random() * 10000);
    
    for (let i = 0; i < count; i++) {
      const node = {
        id: Date.now() + i + Math.random(),
        x: x + (Math.random() - 0.5) * 80,
        y: y + (Math.random() - 0.5) * 80,
        z: (Math.random() - 0.5) * 80,
        vx: 0, vy: 0, vz: 0,
        size: randomBetween(this.tuning.nodes.clusterSizeMin, this.tuning.nodes.clusterSizeMax),
        cluster: clusterId
      };
      newNodes.push(node);
      this.nodes.push(node);
    }
    
    const newLinks = [];
    for (let i = 0; i < count - 1; i++) {
      newLinks.push({ source: newNodes[i].id, target: newNodes[i+1].id, utilizedCount: 0 });
      if (Math.random() > 0.6 && i < count - 2) {
        newLinks.push({ source: newNodes[i].id, target: newNodes[i+2].id, utilizedCount: 0 });
      }
    }
    
    this.simulation.nodes(this.nodes);
    const currentLinks = this.simulation.force("link").links();
    this.simulation.force("link").links([...currentLinks, ...newLinks]);
    this.simulation.alpha(0.8).restart();
    
    this.lastInteractionTime = Date.now();
    this.updateNodeGeometry(this.nodeMesh.geometry);
  }

  spawnNode() {
    if (this.tier === 'enhanced' && this.worker) {
      // Worker handles progressive growth
      return;
    }
    
    // Baseline: spawn on main thread
    const angle = Math.random() * Math.PI * 2;
    const r = 250;
    const newNode = {
      id: Date.now() + Math.random(),
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      z: (Math.random() - 0.5) * 80,
      vx: -Math.cos(angle) * 0.5,
      vy: -Math.sin(angle) * 0.5,
      vz: 0,
      size: randomBetween(this.tuning.nodes.spawnSizeMin, this.tuning.nodes.spawnSizeMax)
    };
    
    this.nodes.push(newNode);
    this.simulation.nodes(this.nodes);
    
    // Find nearest for connection
    let nearest = null;
    let minDst = Infinity;
    for (const n of this.nodes) {
      if (n === newNode) continue;
      const dst = (n.x-newNode.x)**2 + (n.y-newNode.y)**2 + (n.z-newNode.z)**2;
      if (dst < minDst) {
        minDst = dst;
        nearest = n;
      }
    }
    
    if (nearest && minDst < 180*180) {
      const links = this.simulation.force("link").links();
      links.push({ source: newNode.id, target: nearest.id, utilizedCount: 0 });
      this.simulation.force("link").links(links);
    }
    
    this.simulation.alphaTarget(0.2).restart();
    this.updateNodeGeometry(this.nodeMesh.geometry);
  }

  updateNodeGeometry(geo) {
    const positions = geo.attributes.position.array;
    const sizes = geo.attributes.size.array;
    const alphas = geo.attributes.alpha.array;
    
    const len = Math.min(this.nodes.length, this.config.maxNodes);
    for (let i = 0; i < len; i++) {
      positions[i * 3] = this.nodes[i].x;
      positions[i * 3 + 1] = this.nodes[i].y;
      positions[i * 3 + 2] = this.nodes[i].z;
      sizes[i] = this.nodes[i].size;
      alphas[i] = 1.0;
    }
    
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.setDrawRange(0, len);
  }

  buildEdgeKey(source, target) {
    const sourceId = source && source.id !== undefined ? source.id : source;
    const targetId = target && target.id !== undefined ? target.id : target;
    if (sourceId === undefined || targetId === undefined) return null;
    return sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
  }

  rebuildLinkKeyMap(links) {
    this.linkByKey = new Map();
    for (const link of links) {
      const key = this.buildEdgeKey(link.source, link.target);
      if (key) {
        this.linkByKey.set(key, link);
      }
    }
  }

  resolveNode(nodeLike) {
    if (nodeLike && nodeLike.x !== undefined) return nodeLike;
    const nodeId = nodeLike && nodeLike.id !== undefined ? nodeLike.id : nodeLike;
    if (nodeId === undefined || nodeId === null) return null;
    return this.nodes.find(n => n.id === nodeId) || null;
  }

  updateEdgeGeometry() {
    const links = this.simulation.force("link").links();
    const positions = this.edgeMesh.geometry.attributes.position.array;
    const opacities = this.edgeMesh.geometry.attributes.opacity.array;
    const baseOpacity = 0.6;
    
    let idx = 0;
    let opIdx = 0;
    
    for (const link of links) {
      const source = link.source;
      const target = link.target;
      
      if (!source || !target || idx > positions.length - 6) break;
      
      positions[idx++] = source.x;
      positions[idx++] = source.y;
      positions[idx++] = source.z;
      positions[idx++] = target.x;
      positions[idx++] = target.y;
      positions[idx++] = target.z;
      
      const opacity = baseOpacity;
      
      opacities[opIdx] = opacity;
      opIdx++;
      opacities[opIdx] = opacity;
      opIdx++;
    }
    
    this.rebuildLinkKeyMap(links);
    this.edgeMesh.geometry.attributes.position.needsUpdate = true;
    this.edgeMesh.geometry.attributes.opacity.needsUpdate = true;
    this.edgeMesh.geometry.setDrawRange(0, idx / 3);
  }


  rebalanceEdgesByUtilization(now) {
    const sweepMs = this.tuning.edges.utilizationSweepMs || 2000;
    if (!this.lastUtilizationSweep) this.lastUtilizationSweep = now;
    if (now - this.lastUtilizationSweep < sweepMs) return;
    this.lastUtilizationSweep = now;
    
    const links = this.simulation.force("link").links();
    if (!links || links.length < 2 || this.nodes.length < 2) return;
    
    const degrees = new Map();
    for (const link of links) {
      const sourceId = link.source?.id ?? link.source;
      const targetId = link.target?.id ?? link.target;
      degrees.set(sourceId, (degrees.get(sourceId) || 0) + 1);
      degrees.set(targetId, (degrees.get(targetId) || 0) + 1);
    }
    
    const sorted = links.slice().sort((a, b) => (a.utilizedCount || 0) - (b.utilizedCount || 0));
    const cutoff = Math.max(1, Math.floor(sorted.length * (this.tuning.edges.utilizationCullPercentile || 0.5)));
    let candidate = null;
    for (let i = 0; i < cutoff; i++) {
      const next = sorted[i];
      const sourceId = next.source?.id ?? next.source;
      const targetId = next.target?.id ?? next.target;
      if ((degrees.get(sourceId) || 0) > 1 && (degrees.get(targetId) || 0) > 1) {
        candidate = next;
        break;
      }
    }
    if (!candidate) return;
    
    const candidateIdx = links.indexOf(candidate);
    if (candidateIdx >= 0) {
      links.splice(candidateIdx, 1);
    }
    
    const addReplacementLink = () => {
      if (this.nodes.length < 2 || links.length >= this.config.maxLinks) return false;
      
      const source = this.nodes[Math.floor(Math.random() * this.nodes.length)];
      let target = null;
      
      if (Math.random() < 0.75) {
        const candidates = this.nodes.filter(n => n.cluster === source.cluster && n !== source);
        if (candidates.length > 0) target = candidates[Math.floor(Math.random() * candidates.length)];
      }
      
      if (!target) target = this.nodes[Math.floor(Math.random() * this.nodes.length)];
      
      if (!source || !target || source === target) return false;
      
      const exists = links.some(l =>
        (l.source === source && l.target === target) ||
        (l.source === target && l.target === source) ||
        (l.source.id === source.id && l.target.id === target.id) ||
        (l.source.id === target.id && l.target.id === source.id)
      );
      
      if (!exists && links.length < this.config.maxLinks) {
        links.push({ source, target, utilizedCount: 0 });
        return true;
      }
      
      return false;
    };
    
    const added = addReplacementLink();
    if (candidateIdx >= 0 || added) {
      this.simulation.force("link").links(links);
      this.simulation.alphaTarget(0.08).restart();
    }
  }

  spawnPacket() {
    if (this.packets.length >= this.tuning.packets.maxPackets) return;
    
    let links;
    if (this.tier === 'enhanced') {
      // Use local links array for packet spawning
      links = this.links;
    } else {
      links = this.simulation.force("link").links();
    }
    
    if (!links || links.length === 0) return;
    
    const link = links[Math.floor(Math.random() * links.length)];
    
    if (!link || !link.source || !link.target) return;

    const sourceNode = this.resolveNode(link.source);
    const targetNode = this.resolveNode(link.target);
    if (!sourceNode || !targetNode) return;
    
    this.packets.push({
      source: sourceNode,
      target: targetNode,
      progress: 0,
      speed: randomBetween(this.tuning.packets.speedMin, this.tuning.packets.speedMax),
      intensity: randomBetween(this.tuning.packets.intensityMin, this.tuning.packets.intensityMax)
    });
  }

  updatePackets() {
    let links;
    if (this.tier === 'enhanced') {
      links = this.links;
    } else if (this.simulation) {
      links = this.simulation.force("link").links();
    }

    const utilizedEdgeKeys = [];
    
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      p.progress += p.speed;
      
      if (p.progress >= 1) {
        const completedEdgeKey = this.buildEdgeKey(p.source, p.target);
        if (completedEdgeKey) {
          utilizedEdgeKeys.push(completedEdgeKey);
          if (this.tier !== 'enhanced') {
            const link = this.linkByKey.get(completedEdgeKey);
            if (link) {
              link.utilizedCount = (link.utilizedCount || 0) + 1;
            }
          }
        }

        if (Math.random() < this.tuning.packets.rerouteChance && links && links.length > 0) {
          const nextLinks = links.filter(l => 
            l.source === p.target || l.target === p.target ||
            (l.source && l.source.id === p.target.id) || 
            (l.target && l.target.id === p.target.id)
          );
          if (nextLinks.length > 0) {
            const nextLink = nextLinks[Math.floor(Math.random() * nextLinks.length)];
            const currentTarget = this.resolveNode(p.target) || p.target;
            const nextSource = this.resolveNode(nextLink.source);
            const nextTarget = this.resolveNode(nextLink.target);
            if (nextSource || nextTarget) {
              const currentId = currentTarget && currentTarget.id !== undefined ? currentTarget.id : currentTarget;
              let chosenTarget = null;
              if (nextSource && nextTarget) {
                chosenTarget = (currentId !== undefined && nextSource.id === currentId) ? nextTarget : nextSource;
              } else {
                chosenTarget = nextSource || nextTarget;
              }
              if (chosenTarget) {
                p.source = currentTarget;
                p.target = chosenTarget;
                p.progress = 0;
                continue;
              }
            }
          }
        }
        
        this.packets.splice(i, 1);
      }
    }
    
    const positions = this.packetMesh.geometry.attributes.position.array;
    const sizes = this.packetMesh.geometry.attributes.size.array;
    const intensities = this.packetMesh.geometry.attributes.intensity.array;
    
    for (let i = 0; i < this.packetCapacity; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = -1000;
      sizes[i] = 0;
      intensities[i] = 0;
    }
    
    this.packets.forEach((p, i) => {
      if (i >= this.packetCapacity) return;
      
      const sourceX = p.source.x !== undefined ? p.source.x : 0;
      const sourceY = p.source.y !== undefined ? p.source.y : 0;
      const sourceZ = p.source.z !== undefined ? p.source.z : 0;
      const targetX = p.target.x !== undefined ? p.target.x : 0;
      const targetY = p.target.y !== undefined ? p.target.y : 0;
      const targetZ = p.target.z !== undefined ? p.target.z : 0;
      
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      const dz = targetZ - sourceZ;
      const x = sourceX + dx * p.progress;
      const y = sourceY + dy * p.progress;
      const z = sourceZ + dz * p.progress;
      
      positions[i*3] = x;
      positions[i*3+1] = y;
      positions[i*3+2] = z;
      sizes[i] = this.tuning.packets.size;
      intensities[i] = p.intensity;
      
      // Add trail point for this packet (every 2nd frame to reduce density)
      if (this.trails.length < this.tuning.packets.trailMax) {
        const dirLen = Math.max(0.0001, Math.hypot(dx, dy));
        this.trails.push({
          x, y, z,
          age: 0,
          maxAge: randomBetween(this.tuning.packets.trailMaxAgeMin, this.tuning.packets.trailMaxAgeMax),
          size: 6.0 + Math.random() * 4.0,
          dirX: dx / dirLen,
          dirY: dy / dirLen
        });
      }
      
    });

    if (this.tier === 'enhanced' && this.workerReady && utilizedEdgeKeys.length > 0) {
      this.worker.postMessage({ type: 'utilized', edgeKeys: utilizedEdgeKeys });
    }
    
    this.packetMesh.geometry.attributes.position.needsUpdate = true;
    this.packetMesh.geometry.attributes.size.needsUpdate = true;
    this.packetMesh.geometry.attributes.intensity.needsUpdate = true;
    this.packetMesh.geometry.setDrawRange(0, Math.min(this.packets.length, this.packetCapacity));
  }

  /**
   * Update packet trails - fading afterglow effect
   */
  updateTrails() {
    // Age and remove old trails
    for (let i = this.trails.length - 1; i >= 0; i--) {
      this.trails[i].age++;
      if (this.trails[i].age > this.trails[i].maxAge) {
        this.trails.splice(i, 1);
      }
    }
    
    // Update trail geometry
    const positions = this.trailMesh.geometry.attributes.position.array;
    const alphas = this.trailMesh.geometry.attributes.alpha.array;
    const sizes = this.trailMesh.geometry.attributes.size.array;
    const dirs = this.trailMesh.geometry.attributes.dir.array;
    
    const maxTrails = this.tuning.packets.trailMax;
    
    // Clear all positions first
    for (let i = 0; i < maxTrails; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = -1000;  // Move off-screen
      alphas[i] = 0;
      sizes[i] = 0;
      dirs[i * 2] = 1;
      dirs[i * 2 + 1] = 0;
    }
    
    // Update active trails
    this.trails.forEach((t, i) => {
      if (i >= maxTrails) return;
      
      positions[i * 3] = t.x;
      positions[i * 3 + 1] = t.y;
      positions[i * 3 + 2] = t.z;
      
      // Fade out based on age
      const life = 1.0 - (t.age / t.maxAge);
      alphas[i] = life * life;  // Quadratic falloff for smoother fade
      sizes[i] = t.size * (0.6 + life * 0.8);  // Keep longer tail as it fades
      dirs[i * 2] = t.dirX ?? 1;
      dirs[i * 2 + 1] = t.dirY ?? 0;
    });
    
    this.trailMesh.geometry.attributes.position.needsUpdate = true;
    this.trailMesh.geometry.attributes.alpha.needsUpdate = true;
    this.trailMesh.geometry.attributes.size.needsUpdate = true;
    this.trailMesh.geometry.attributes.dir.needsUpdate = true;
    this.trailMesh.geometry.setDrawRange(0, Math.min(this.trails.length, maxTrails));
  }

  animate() {
    if (!this.isVisible || !this.isPageVisible || !this.isRunning) {
      this.animationFrameId = null;
      return;
    }
    
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
    
    const now = performance.now();
    const time = now / 1000;
    
    // Update shader uniforms
    this.nodeMesh.material.uniforms.time.value = time;
    this.edgeMesh.material.uniforms.time.value = time;
    
    if (this.tier === 'enhanced' && this.worker && this.workerReady) {
      // Request physics frame from worker
      if (!this.pendingFrame) {
        this.pendingFrame = true;
        this.worker.postMessage({ type: 'tick' });
      }
    } else if (this.simulation) {
      // Baseline: throttle simulation
      if (!this.lastSimulationTime) this.lastSimulationTime = now;
      if (now - this.lastSimulationTime >= 33) {
        this.lastSimulationTime = now;
        
        // Progressive node growth
        if (this.nodes.length < this.config.targetNodeCount) {
          if (now - this.lastSpawnTime > 200) {
            this.spawnNode();
            this.lastSpawnTime = now;
          }
        }
        
        // Auto-spawn clusters
        if (Date.now() - this.lastInteractionTime > 15000 && this.nodes.length < this.config.maxNodes - 100) {
          const x = (Math.random() - 0.5) * 600;
          const y = (Math.random() - 0.5) * 250;
          this.spawnCluster(x, y);
          this.lastInteractionTime = Date.now();
        }
        
        this.simulation.tick();
        this.rebalanceEdgesByUtilization(now);
        
        // Update node geometry
        const nodePos = this.nodeMesh.geometry.attributes.position.array;
        const len = Math.min(this.nodes.length, this.config.maxNodes);
        for (let i = 0; i < len; i++) {
          nodePos[i * 3] = this.nodes[i].x;
          nodePos[i * 3 + 1] = this.nodes[i].y;
          nodePos[i * 3 + 2] = this.nodes[i].z;
        }
        this.nodeMesh.geometry.attributes.position.needsUpdate = true;
        
        this.updateEdgeGeometry();
      }
    }
    
    // Update packets and trails
    const minPackets = this.tuning.packets.minPackets || 0;
    if (this.packets.length < minPackets) {
      const needed = minPackets - this.packets.length;
      for (let i = 0; i < needed; i++) {
        this.spawnPacket();
      }
    }
    if (Math.random() < this.tuning.packets.spawnChance) this.spawnPacket();
    this.updatePackets();
    this.updateTrails();
    
    // Camera orbit
    const camTime = now * 0.00008;
    this.camera.position.x = Math.sin(camTime) * 500;
    this.camera.position.z = Math.cos(camTime) * 500;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  buildWorkerConfig() {
    return {
      maxNodes: this.config.maxNodes,
      maxLinks: this.config.maxLinks,
      nodes: this.tuning.nodes,
      edges: this.tuning.edges,
      packets: this.tuning.packets,
      simulation: this.tuning.simulation
    };
  }

  createPacketGeometry(capacity) {
    const packetGeo = new BufferGeometry();
    packetGeo.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 3), 3));
    packetGeo.setAttribute('size', new BufferAttribute(new Float32Array(capacity), 1));
    packetGeo.setAttribute('intensity', new BufferAttribute(new Float32Array(capacity), 1));
    return packetGeo;
  }

  onResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }
  
  destroy() {
    this.isRunning = false;
    
    window.removeEventListener('resize', this.handleResize);

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    if (this.renderer && this.renderer.domElement && this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
