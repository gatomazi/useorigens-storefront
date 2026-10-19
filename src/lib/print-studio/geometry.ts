import type { PrintProject } from "./model";
export type Box = { id: string; x: number; y: number; width: number; height: number };
export type Alignment = "horizontal" | "vertical" | "both";

export function expandSelection(project: PrintProject, ids: string[]): string[] {
  const valid = ids.filter((id) => project.layers.some((l) => l.id === id));
  const groups = new Set(project.layers.filter((l) => valid.includes(l.id) && l.groupId).map((l) => l.groupId));
  return [...new Set([...valid, ...project.layers.filter((l) => l.groupId && groups.has(l.groupId)).map((l) => l.id)])];
}
export function unionBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)); const y = Math.min(...boxes.map((b) => b.y));
  return { id: "selection", x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}
export function moveSelection(project: PrintProject, ids: string[], dx: number, dy: number): PrintProject {
  const selected = new Set(expandSelection(project, ids));
  const layers = project.layers.filter((l) => selected.has(l.id));
  if (!layers.length) return project;
  // Clamp the delta for the whole selection; relative positions within a group never change.
  dx = Math.max(...layers.map((l) => -10000 - l.x), Math.min(dx, ...layers.map((l) => 10000 - l.x)));
  dy = Math.max(...layers.map((l) => -10000 - l.y), Math.min(dy, ...layers.map((l) => 10000 - l.y)));
  return { ...project, layers: project.layers.map((l) => selected.has(l.id) ? { ...l, x: l.x + dx, y: l.y + dy } : l) };
}
export function alignSelection(project: PrintProject, ids: string[], boxes: Box[], axis: Alignment): PrintProject {
  const selected = expandSelection(project, ids);
  const box = unionBoxes(boxes.filter((b) => selected.includes(b.id)));
  if (!box) return project;
  return moveSelection(project, selected, axis === "vertical" ? 0 : (project.width - box.width) / 2 - box.x, axis === "horizontal" ? 0 : (project.height - box.height) / 2 - box.y);
}
export function groupSelection(project: PrintProject, ids: string[], groupId: string): PrintProject {
  const selected = new Set(expandSelection(project, ids));
  if (selected.size < 2) return project;
  return { ...project, layers: project.layers.map((l) => selected.has(l.id) ? { ...l, groupId } : l) };
}
export function ungroupSelection(project: PrintProject, ids: string[]): PrintProject {
  const selected = new Set(expandSelection(project, ids));
  return { ...project, layers: project.layers.map((l) => {
    if (!selected.has(l.id)) return l;
    const { groupId: _group, ...rest } = l;
    void _group;
    return rest;
  }) };
}

/** Snap the moving selection's edges and midpoint to the artboard and other visible layers. */
export function snapMovement(box: Box, dx: number, dy: number, width: number, height: number, other: Box[], toleranceX: number, toleranceY = toleranceX) {
  const snapAxis = (start: number, size: number, delta: number, targets: number[], tolerance: number) => {
    let best = tolerance + .00001;
    let offset = 0;
    let guide: number | null = null;
    for (const target of targets) for (const point of [start + size / 2, start, start + size]) {
      const gap = target - (point + delta);
      if (Math.abs(gap) < best) { best = Math.abs(gap); offset = gap; guide = target; }
    }
    return { delta: delta + offset, guide };
  };
  const x = snapAxis(box.x, box.width, dx, [width / 2, 0, width, ...other.flatMap((b) => [b.x + b.width / 2, b.x, b.x + b.width])], toleranceX);
  const y = snapAxis(box.y, box.height, dy, [height / 2, 0, height, ...other.flatMap((b) => [b.y + b.height / 2, b.y, b.y + b.height])], toleranceY);
  return { dx: x.delta, dy: y.delta, guideX: x.guide, guideY: y.guide };
}
