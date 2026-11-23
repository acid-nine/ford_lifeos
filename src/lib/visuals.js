import { Hexagon, Box, Triangle, Orbit, Circle, Sparkles } from 'lucide-react'

export const AGENT_SHAPES = ['icosahedron', 'dodecahedron', 'octahedron', 'torusKnot', 'sphere', 'helix', 'nebula']
export const SHAPE_ICONS = {
  icosahedron: Hexagon,
  dodecahedron: Box,
  octahedron: Triangle,
  torusKnot: Orbit,
  sphere: Circle,
  helix: Sparkles,
  nebula: Sparkles,
}
export const AGENT_COLORS = [190, 38, 280, 150, 330, 55, 210]

export function defaultVisual(name = '') {
  let hash = 0
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return {
    shape: AGENT_SHAPES[hash % AGENT_SHAPES.length],
    hue: AGENT_COLORS[hash % AGENT_COLORS.length],
    rings: 3 + (hash % 3),
    speed: 0.8 + ((hash >>> 4) % 8) / 10,
  }
}

export function agentVisual(agent) {
  return { ...defaultVisual(agent?.name || ''), ...(agent?.visual || {}) }
}
