export const NETWORK_CONFIG = {
  tiers: {
    enhanced: {
      maxNodes: 800,
      nodeCount: 300,
      targetNodeCount: 350,
      maxLinks: 500
    },
    baseline: {
      maxNodes: 200,
      nodeCount: 150,
      targetNodeCount: 175,
      maxLinks: 420
    }
  },
  nodes: {
    sizeMin: 3.0,
    sizeMax: 5.5,
    clusterSizeMin: 3.0,
    clusterSizeMax: 6.0,
    spawnSizeMin: 4.0,
    spawnSizeMax: 3.0
  },
  edges: {
    utilizationSweepMs: 2000,
    utilizationCullPercentile: 0.5
  },
  packets: {
    maxPackets: 250,
    minPackets: 150,
    spawnChance: 0.25,
    speedMin: 0.02,
    speedMax: 0.05,
    rerouteChance: 0.9,
    trailMax: 500,
    trailMaxAgeMin: 90,
    trailMaxAgeMax: 200,
    size: 3.2,
    intensityMin: 1.0,
    intensityMax: 3.0
  },
  colors: {
    edge: 0x7B7FCC,
    packet: 0x7B7FCC,
    background: 0x242232
  },
  simulation: {
    chargeStrength: -25,
    linkDistance: 35,
    linkStrength: 0.8,
    centerStrength: 0.015,
    multiCenterCount: 2,
    multiCenterRadius: 40
  },
};

export function lerp(min, max, t) {
  return min + (max - min) * t;
}

export function randomBetween(min, max) {
  return lerp(min, max, Math.random());
}

export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildCenters(count, radius) {
  const centerCount = Math.max(1, Math.round(count || 1));
  const centerRadius = radius || 0;
  if (centerCount === 1 || centerRadius <= 0) {
    return [{ x: 0, y: 0, z: 0 }];
  }
  const centers = [];
  for (let i = 0; i < centerCount; i++) {
    const angle = (i / centerCount) * Math.PI * 2;
    centers.push({
      x: Math.cos(angle) * centerRadius,
      y: Math.sin(angle) * centerRadius,
      z: 0
    });
  }
  return centers;
}

export function getCenterIndex(node, centersLength) {
  if (!centersLength) return 0;
  const raw = node?.cluster ?? node?.id ?? 0;
  const numeric = typeof raw === 'number' && Number.isFinite(raw)
    ? Math.abs(Math.floor(raw))
    : hashString(String(raw));
  return numeric % centersLength;
}

export function mergeConfig(baseConfig, updates = {}) {
  const merged = { ...baseConfig };
  for (const [section, value] of Object.entries(updates)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[section] = { ...(baseConfig[section] || {}), ...value };
    } else {
      merged[section] = value;
    }
  }
  return merged;
}
