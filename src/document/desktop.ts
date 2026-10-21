type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;
type OpenDialog = () => Promise<string | null>;
type SaveDialog = () => Promise<string | null>;

export function createDesktopFiles(invoke: Invoke, openDialog: OpenDialog, saveDialog: SaveDialog) {
  return {
    async openDocument() {
      const path = await openDialog();
      if (!path) return null;
      const result = await invoke("read_document", { path });
      return { path, bytes: new Uint8Array(result as number[]) };
    },
    async saveDocument(currentPath: string | null, bytes: Uint8Array) {
      const path = currentPath ?? await saveDialog();
      if (!path) return null;
      await invoke("write_document", { path, bytes: Array.from(bytes) });
      return path;
    },
  };
}
