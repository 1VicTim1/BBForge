import { Icon } from "../components/Icon";
import { DownloadBar, type DownloadProgress } from "../plugins/PluginsSettings";

export type InstallKind = "arch" | "deb" | "appImage" | "windowsSetup" | "windowsPortable" | "manual";
export interface UpdateInfo {
  version: string; current: string; notes: string; page: string; kind: InstallKind;
  asset: { name: string; url: string; size: number } | null; sums: { name: string; url: string; size: number } | null;
}

const how: Record<InstallKind, string> = {
  arch: "Пакет для Arch установится через pacman — система попросит пароль.",
  deb: "Пакет .deb установится через apt — система попросит пароль.",
  appImage: "Файл AppImage будет заменён новой версией.",
  windowsSetup: "Запустится установщик новой версии.",
  windowsPortable: "Файл программы будет заменён новой версией.",
  manual: "Эта копия установлена вручную (архив или сборка из исходников): скачайте новую версию со страницы релиза.",
};

/** Release notes are Markdown; shown as plain text without heading marks and link syntax. */
const plainNotes = (notes: string) => notes.replace(/\r\n/g, "\n").replace(/^#+\s*/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();

export function UpdateDialog({ info, busy, progress, error, onUpdate, onOpenPage, onLater, onSkip }: { info: UpdateInfo; busy: boolean; progress: DownloadProgress | null; error: string | null; onUpdate(): void; onOpenPage(): void; onLater(): void; onSkip(): void }) {
  const notes = plainNotes(info.notes);
  return <div className="modal-backdrop"><section className="dialog update-dialog" role="dialog" aria-label="Обновление BBForge" onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.stopPropagation(); onLater(); } }}>
    <header><h3>Доступна BBForge {info.version}</h3></header>
    <p className="install-meta">Сейчас установлена {info.current}</p>
    {notes && <><h4>Что нового</h4><pre className="update-notes">{notes}</pre></>}
    <p className="update-how"><Icon name="info" />{how[info.kind]}</p>
    {progress && <DownloadBar progress={progress} />}
    {error && <div className="package-alert danger" role="alert"><Icon name="error" />{error}</div>}
    <footer>
      <button type="button" className="text-button" disabled={busy} onClick={onSkip}>Пропустить версию</button>
      <span className="spacer" />
      <button type="button" disabled={busy} onClick={onLater}>Позже</button>
      {info.kind === "manual" || !info.asset
        ? <button type="button" className="primary" onClick={onOpenPage}><Icon name="external" />Страница релиза</button>
        : <button type="button" className="primary" disabled={busy} onClick={onUpdate}>{busy ? "Обновление…" : "Обновить"}</button>}
    </footer>
  </section></div>;
}
