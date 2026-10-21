import type { DiskFingerprint } from "../workspace/session";

type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;
type OpenDialog = () => Promise<string | null>;
type SaveDialog = () => Promise<string | null>;

export function createDesktopFiles(invoke: Invoke, openDialog: OpenDialog, saveDialog: SaveDialog) {
  return {
    async openDocument() {
      const path = await openDialog();
      if (!path) return null;
      const result = await invoke("read_document", { path }) as { bytes: number[]; canonicalPath: string; fingerprint: DiskFingerprint };
      return { path: result.canonicalPath, bytes: new Uint8Array(result.bytes), fingerprint: result.fingerprint };
    },
    async saveDocument(currentPath: string | null, bytes: Uint8Array, expectedFingerprint: DiskFingerprint | null = null) {
      const path = currentPath ?? await saveDialog();
      if (!path) return null;
      try {
        const saved = await invoke("write_document", { path, bytes: Array.from(bytes), expectedFingerprint }) as { canonicalPath: string; fingerprint: DiskFingerprint };
        return { path: saved.canonicalPath, fingerprint: saved.fingerprint };
      } catch (reason) {
        if (String(reason).includes("FILE_CONFLICT")) throw new FileConflictError(path);
        throw reason;
      }
    },
  };
}

export class FileConflictError extends Error {
  constructor(public readonly path: string) { super("Файл был изменён вне BBForge. Сохранение отменено."); }
}
