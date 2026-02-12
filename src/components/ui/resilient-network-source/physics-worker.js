/**
 * Physics Worker for Resilient Network Visualization
 * 
 * Offloads d3-force simulation and edge management to a background thread.
 * Communicates with main thread via transferable ArrayBuffers for efficiency.
 */

import { forceSimulation, forceManyBody, forceCenter, forceX, forceY, forceZ, forceLink } from 'd3-force-3d';
import {
  NETWORK_CONFIG,
  buildCenters,
  getCenterIndex,
  mergeConfig,
  randomBetween
} from './network-config.js';

// State
let simulation = null;
let nodes = [];
let links = [];
let config = mergeConfig(NETWORK_CONFIG, {
  maxNodes: 2000,
  maxLinks: 6000
});
let centers = [{ x: 0, y: 0, z: 0 }];
let linkKeyMap = new Map();

// Reusable typed arrays for efficient transfer
let positionBuffer = null;
let linkIndicesBuffer = null;

let lastUtilizationSweep = 0;

/**
 * Handle messages from main thread
 */
self.onmessage = function(e) {
  switch(e.data.type) {
    case 'init':
      initSimulation(e.data);
      break;
    case 'tick':
      tickSimulation();
      break;
    case 'utilized':
      registerUtilization(e.data.edgeKeys || []);
      break;
    case 'addNodes':
      addNodes(e.data.nodes, e.data.links);
      break;
    case 'addCluster':
      addCluster(e.data.x, e.data.y, e.data.z);
      break;
    case 'setConfig':
      config = mergeConfig(config, e.data.config);
      applyConfigToSimulation();
      break;
  }
};

/**
 * Initialize the d3-force simulation
 */
function initSimulation(data) {
  nodes = data.initialNodes || [];
  links = data.initialLinks || [];
  
  if (data.config) {
    config = mergeConfig(config, data.config);
  }
  
  // Allocate buffers based on max capacity
  positionBuffer = new Float32Array(config.maxNodes * 3);    // x, y, z
  linkIndicesBuffer = new Uint32Array(config.maxLinks * 2);  // source, target indices
  
  // Initialize link utilization
  links.forEach((l, i) => {
    if (l.utilizedCount === undefined) l.utilizedCount = 0;
  });
  rebuildLinkKeyMap();
  
  centers = buildCenters(
    config.simulation.multiCenterCount,
    config.simulation.multiCenterRadius
  );
  const useMultiCenter = centers.length > 1;
  
  // Create simulation
  const nextSimulation = forceSimulation(nodes, 3)
    .force("charge", forceManyBody().strength(config.simulation.chargeStrength));
    
  if (!useMultiCenter) {
    nextSimulation.force("center", forceCenter(0, 0, 0));
  }
  
  nextSimulation
    .force("x", forceX()
      .strength(config.simulation.centerStrength)
      .x(d => centers[getCenterIndex(d, centers.length)].x))
    .force("y", forceY()
      .strength(config.simulation.centerStrength)
      .y(d => centers[getCenterIndex(d, centers.length)].y))
    .force("z", forceZ()
      .strength(config.simulation.centerStrength)
      .z(d => centers[getCenterIndex(d, centers.length)].z))
    .force("link", forceLink(links)
      .id(d => d.id)
      .distance(config.simulation.linkDistance)
      .strength(config.simulation.linkStrength))
    .stop();
    
  simulation = nextSimulation;
  
  // Signal ready
  self.postMessage({ type: 'ready', nodeCount: nodes.length, linkCount: links.length });
}

/**
 * Apply config changes to running simulation
 */
function applyConfigToSimulation() {
  if (!simulation) return;
  
  centers = buildCenters(
    config.simulation.multiCenterCount,
    config.simulation.multiCenterRadius
  );
  simulation.force("charge").strength(config.simulation.chargeStrength);
  const useMultiCenter = centers.length > 1;
  if (useMultiCenter) {
    simulation.force("center", null);
  } else if (!simulation.force("center")) {
    simulation.force("center", forceCenter(0, 0, 0));
  }
  simulation.force("x")
    .strength(config.simulation.centerStrength)
    .x(d => centers[getCenterIndex(d, centers.length)].x);
  simulation.force("y")
    .strength(config.simulation.centerStrength)
    .y(d => centers[getCenterIndex(d, centers.length)].y);
  simulation.force("z")
    .strength(config.simulation.centerStrength)
    .z(d => centers[getCenterIndex(d, centers.length)].z);
  simulation.force("link")
    .distance(config.simulation.linkDistance)
    .strength(config.simulation.linkStrength);
}

/**
 * Run one simulation tick and send results
 */
function tickSimulation() {
  if (!simulation) return;
  
  // Run physics
  simulation.tick();
  
  // Cull low-utilization edges (offloaded from main thread)
  processEdgeUtilization();
  
  // Pack node positions into typed array
  const nodeCount = Math.min(nodes.length, config.maxNodes);
  for (let i = 0; i < nodeCount; i++) {
    const offset = i * 3;
    positionBuffer[offset] = nodes[i].x;
    positionBuffer[offset + 1] = nodes[i].y;
    positionBuffer[offset + 2] = nodes[i].z;
  }
  
  // Pack link data
  const linkCount = Math.min(links.length, config.maxLinks);
  for (let i = 0; i < linkCount; i++) {
    const link = links[i];
    linkIndicesBuffer[i * 2] = typeof link.source === 'object' ? link.source.index : link.source;
    linkIndicesBuffer[i * 2 + 1] = typeof link.target === 'object' ? link.target.index : link.target;
  }
  
  // Create transferable copies
  const positionCopy = positionBuffer.slice(0, nodeCount * 3);
  const indicesCopy = linkIndicesBuffer.slice(0, linkCount * 2);
  
  // Send frame data with transferable buffers
  self.postMessage({
    type: 'frame',
    positions: positionCopy.buffer,
    linkIndices: indicesCopy.buffer,
    nodeCount: nodeCount,
    linkCount: linkCount,
    alpha: simulation.alpha()
  }, [
    positionCopy.buffer,
    indicesCopy.buffer
  ]);
}

/**
 * Track utilization counts from main thread packets
 */
function registerUtilization(edgeKeys) {
  if (!edgeKeys || edgeKeys.length === 0) return;
  for (const key of edgeKeys) {
    const link = linkKeyMap.get(key);
    if (link) {
      link.utilizedCount = (link.utilizedCount || 0) + 1;
    }
  }
}

function getEdgeKey(source, target) {
  const sourceId = source && source.id !== undefined ? source.id : source;
  const targetId = target && target.id !== undefined ? target.id : target;
  if (sourceId === undefined || targetId === undefined) return null;
  return sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
}

function rebuildLinkKeyMap() {
  linkKeyMap = new Map();
  for (const link of links) {
    const key = getEdgeKey(link.source, link.target);
    if (key) {
      linkKeyMap.set(key, link);
    }
  }
}

/**
 * Cull low-utilization edges and replace with new ones
 */
function processEdgeUtilization() {
  const now = Date.now();
  const sweepMs = config.edges.utilizationSweepMs || 2000;
  if (now - lastUtilizationSweep < sweepMs) return;
  lastUtilizationSweep = now;
  
  if (links.length < 2 || nodes.length < 2) return;
  
  const degrees = new Map();
  for (const link of links) {
    const sourceId = link.source?.id ?? link.source;
    const targetId = link.target?.id ?? link.target;
    degrees.set(sourceId, (degrees.get(sourceId) || 0) + 1);
    degrees.set(targetId, (degrees.get(targetId) || 0) + 1);
  }
  
  const sorted = links.slice().sort((a, b) => (a.utilizedCount || 0) - (b.utilizedCount || 0));
  const cutoff = Math.max(1, Math.floor(sorted.length * (config.edges.utilizationCullPercentile || 0.5)));
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
    if (nodes.length < 2 || links.length >= config.maxLinks) return false;
    
    const sourceIdx = Math.floor(Math.random() * nodes.length);
    const source = nodes[sourceIdx];
    let target = null;
    
    // 75% chance to connect within same cluster
    if (Math.random() < 0.75 && source.cluster !== undefined) {
      const candidates = nodes.filter(n => n.cluster === source.cluster && n !== source);
      if (candidates.length > 0) {
        target = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    
    // Otherwise random target
    if (!target) {
      let targetIdx = Math.floor(Math.random() * nodes.length);
      if (targetIdx === sourceIdx) targetIdx = (targetIdx + 1) % nodes.length;
      target = nodes[targetIdx];
    }
    
    if (!source || !target || source === target) return false;
    
    const exists = links.some(l => 
      (l.source === source && l.target === target) ||
      (l.source === target && l.target === source) ||
      (l.source.id === source.id && l.target.id === target.id) ||
      (l.source.id === target.id && l.target.id === source.id)
    );
    
    if (!exists && links.length < config.maxLinks) {
      links.push({ source: source, target: target, utilizedCount: 0 });
      return true;
    }
    
    return false;
  };
  
  const added = addReplacementLink();
  if (candidateIdx >= 0 || added) {
    rebuildLinkKeyMap();
    simulation.force("link").links(links);
    simulation.alphaTarget(0.08).restart();
    setTimeout(() => simulation.alphaTarget(0), 100);
  }
}

/**
 * Add new nodes to the simulation
 */
function addNodes(newNodes, newLinks = []) {
  if (!simulation) return;
  
  // Add nodes
  for (const node of newNodes) {
    if (nodes.length < config.maxNodes) {
      nodes.push(node);
    }
  }
  
  // Add links
  for (const link of newLinks) {
    if (links.length < config.maxLinks) {
      link.utilizedCount = link.utilizedCount || 0;
      links.push(link);
    }
  }
  
  rebuildLinkKeyMap();
  
  // Update simulation
  simulation.nodes(nodes);
  simulation.force("link").links(links);
  simulation.alpha(0.5).restart();
  
  self.postMessage({ type: 'nodesAdded', nodeCount: nodes.length, linkCount: links.length });
}

/**
 * Add a cluster of nodes at a position
 */
function addCluster(x, y, z = 0) {
  if (nodes.length >= config.maxNodes - 30) return;
  
  const count = 15 + Math.floor(Math.random() * 15);
  const clusterId = Date.now();
  const newNodes = [];
  const newLinks = [];
  
  // Create cluster nodes
  for (let i = 0; i < count; i++) {
    const node = {
      id: clusterId + i + Math.random(),
      x: x + (Math.random() - 0.5) * 80,
      y: y + (Math.random() - 0.5) * 80,
      z: z + (Math.random() - 0.5) * 80,
      vx: 0, vy: 0, vz: 0,
      size: randomBetween(config.nodes.clusterSizeMin, config.nodes.clusterSizeMax),
      cluster: clusterId
    };
    newNodes.push(node);
  }
  
  // Create cluster links
  for (let i = 0; i < count - 1; i++) {
    newLinks.push({ 
      source: newNodes[i].id, 
      target: newNodes[i + 1].id, 
      utilizedCount: 0 
    });
    
    if (Math.random() > 0.6 && i < count - 2) {
      newLinks.push({ 
        source: newNodes[i].id, 
        target: newNodes[i + 2].id, 
        utilizedCount: 0 
      });
    }
  }
  
  // Connect to nearest existing node
  if (nodes.length > 0) {
    let nearest = null;
    let minDist = Infinity;
    
    for (const n of nodes) {
      const dx = n.x - x;
      const dy = n.y - y;
      const dz = n.z - z;
      const dist = dx*dx + dy*dy + dz*dz;
      if (dist < minDist) {
        minDist = dist;
        nearest = n;
      }
    }
    
    if (nearest && minDist < 200*200) {
      newLinks.push({
        source: newNodes[0].id,
        target: nearest.id,
        utilizedCount: 0
      });
    }
  }
  
  addNodes(newNodes, newLinks);
}

