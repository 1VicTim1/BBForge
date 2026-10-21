import { useCallback, useState } from "react";
import type { ContextCommand } from "./commands";
export interface OpenContextMenu { x: number; y: number; commands: ContextCommand[] }
export function useContextMenu() {
  const [menu, setMenu] = useState<OpenContextMenu | null>(null);
  return { menu, open: useCallback((value: OpenContextMenu) => setMenu(value), []), close: useCallback(() => setMenu(null), []) };
}
