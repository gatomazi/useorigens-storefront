import { describe, expect, it } from "vitest";
import { createPreset, parseProjectFile, type PrintProject } from "@/lib/print-studio/model";
import { alignSelection, expandSelection, groupSelection, moveSelection, snapMovement, ungroupSelection, type Box } from "@/lib/print-studio/geometry";

function fixture() {
  const project: PrintProject = { ...createPreset("peleia"), width: 4270, height: 4900 };
  const boxes: Box[] = [{ id: project.layers[0].id, x: 600, y: 550, width: 1000, height: 400 }, { id: project.layers[1].id, x: 600, y: 1010, width: 1800, height: 510 }];
  return { project, boxes, ids: project.layers.map((l) => l.id) };
}
describe("alinhamento e grupos de estampas", () => {
  it("centraliza a seleção como bloco mantendo distância entre os itens", () => {
    const { project, boxes, ids } = fixture();
    const aligned = alignSelection(project, ids, boxes, "both");
    expect(aligned.layers[0].x).toBe((4270 - 1800) / 2);
    expect(aligned.layers[0].y).toBe((4900 - 970) / 2);
    expect(aligned.layers[1].y - aligned.layers[0].y).toBe(460);
    const horizontal = alignSelection(project, [ids[1]], boxes, "horizontal");
    expect(horizontal.layers[0]).toEqual(project.layers[0]);
    expect(horizontal.layers[1].x).toBe(1235);
    expect(horizontal.layers[1].y).toBe(1010);
  });
  it("arrasta o grupo por qualquer membro e preserva a associação ao salvar", () => {
    const { project, ids } = fixture();
    const grouped = parseProjectFile(JSON.stringify(groupSelection(project, ids, "group-frase")));
    expect(expandSelection(grouped, [ids[1]])).toEqual([ids[1], ids[0]]);
    const moved = moveSelection(grouped, [ids[1]], 100, 200);
    expect(moved.layers.map((l) => [l.x, l.y])).toEqual([[700, 750], [700, 1210]]);
    const ungrouped = ungroupSelection(moved, [ids[0]]);
    const independent = moveSelection(ungrouped, [ids[0]], 20, -30);
    expect(independent.layers[1]).toEqual(ungrouped.layers[1]);
    expect(independent.layers[0].groupId).toBeUndefined();
  });
  it("combina grupos existentes sem deixar um membro para trás e limita o movimento como conjunto", () => {
    const { project, ids } = fixture();
    const extra = { ...project.layers[0], id: "logo-test", x: 9800 };
    const p = { ...project, layers: [...project.layers, extra] };
    const grouped = groupSelection(groupSelection(p, ids, "first"), [ids[0], extra.id], "combined");
    expect(grouped.layers.every((l) => l.groupId === "combined")).toBe(true);
    const moved = moveSelection(grouped, [ids[1]], 1000, 0);
    expect(moved.layers[2].x).toBe(10000);
    expect(moved.layers[0].x).toBe(800);
  });
  it("encaixa exatamente no centro e mostra a coordenada da guia, sem prender o drag longe dela", () => {
    const box: Box = { id: "text", x: 500, y: 700, width: 1000, height: 200 };
    const snap = snapMovement(box, 1120, 0, 4270, 4900, [], 20);
    expect(snap.dx).toBe(1135);
    expect(snap.guideX).toBe(2135);
    const free = snapMovement(box, 100, 100, 4270, 4900, [], 20);
    expect([free.dx, free.dy, free.guideX, free.guideY]).toEqual([100, 100, null, null]);
  });
  it("encaixa com as bordas de outros elementos", () => {
    const box: Box = { id: "text", x: 500, y: 700, width: 1000, height: 200 };
    const snap = snapMovement(box, 90, 90, 4270, 4900, [{ id: "other", x: 600, y: 800, width: 300, height: 50 }], 15);
    expect([snap.dx, snap.dy, snap.guideX, snap.guideY]).toEqual([100, 100, 600, 800]);
  });
});
