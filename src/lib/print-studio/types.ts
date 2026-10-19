export type SavedPrint = {
  id: string;
  name: string;
  kind: "art" | "template";
  createdAt: string;
  createdBy: string;
  width: number;
  height: number;
};

export const PRINT_WIDTH = 4270;
export const PRINT_HEIGHT = 4900;
