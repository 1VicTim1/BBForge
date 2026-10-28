import { useEffect, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { plural } from "../bbcode/tags";
import type { DependencyIssue, PackageState } from "./host";
import { planBlocks, type DependencyItem, type DependencyPlan } from "./dependencies";
import { compareVersions, permissionInfo, signatureLabel, type CatalogEntry, type CatalogResult, type InstallPreview, type SignatureStatus } from "./types";

/** A catalog download in progress (bytes; speed in bytes per second). */
export interface DownloadProgress { id: string; downloaded: number; total: number | null; speed: number }
const size = (bytes: number) => bytes < 1024 ? `${bytes} Б` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
export function DownloadBar({ progress }: { progress: DownloadProgress }) {
  const share = progress.total ? Math.min(1, progress.downloaded / progress.total) : null;
  return <div className="download-progress" role="progressbar" aria-label="Загрузка пакета" aria-valuemin={0} aria-valuemax={progress.total ?? undefined} aria-valuenow={progress.downloaded}>
    <div className="download-track"><div className={`download-fill ${share === null ? "indeterminate" : ""}`} style={share === null ? undefined : { width: `${share * 100}%` }} /></div>
    <small>{size(progress.downloaded)}{progress.total ? ` / ${size(progress.total)}` : ""}{progress.speed > 0 ? ` · ${size(progress.speed)}/с` : ""}</small>
  </div>;
}

interface Props {
  packages: PackageState[];
  broken: Array<{ id: string; error: string }>;
  desktop: boolean;
  busy: boolean;
  onInstall(): void;
  onToggle(id: string, enabled: boolean): void;
  onRemove(id: string): void;
  onAcceptChanges(id: string): void;
  catalog: CatalogResult | null;
  catalogLoading: boolean;
  onLoadCatalog(): void;
  onInstallFromCatalog(entry: CatalogEntry): void;
  download: DownloadProgress | null;
  /** Addresses the user allowed a plugin to reach ("network.custom"), by plugin id. */
  origins?: Record<string, string[]>;
  onForgetOrigin?(id: string, origin: string): void;
}

const issueText = (issue: DependencyIssue) => issue.state === "missing" ? "не установлен"
  : issue.state === "disabled" ? "выключен"
  : issue.state === "version" ? `нужна версия ${issue.requirement}, установлена ${issue.installed}`
  : "сам не загружен";

function DependencyIssues({ issues }: { issues: DependencyIssue[] }) {
  return <div className="package-alert dependency-alert" role="alert"><Icon name="warning" /><div>
    <strong>Не загружен: не выполнены зависимости</strong>
    <ul>{issues.map((issue) => <li key={issue.id}><span>{issue.name ?? issue.id}</span> <code>{issue.id} {issue.requirement}</code> — {issueText(issue)}</li>)}</ul>
  </div></div>;
}

const signatureClass = (signature: SignatureStatus) => signature.state === "trusted" ? "trusted" : signature.state === "invalid" ? "invalid" : "unsigned";

export function SignatureBadge({ signature }: { signature: SignatureStatus }) {
  return <span className={`signature-badge ${signatureClass(signature)}`} title={signature.state === "invalid" ? signature.reason : "publicKey" in signature ? `Ключ ${signature.publicKey}` : undefined}>
    <Icon name={signature.state === "trusted" ? "shieldCheck" : "shieldAlert"} />{signatureLabel(signature)}
  </span>;
}

export function PermissionList({ permissions }: { permissions: string[] }) {
  if (!permissions.length) return <p className="muted">Пакет не запрашивает разрешений.</p>;
  return <ul className="permission-list">{permissions.map((id) => { const info = permissionInfo(id); return <li key={id} className={`risk-${info?.risk ?? "unknown"}`}>
    <strong>{info?.title ?? id}</strong><small>{info ? info.description : "Неизвестное разрешение — BBForge его не предоставит"}</small><code>{id}</code>
  </li>; })}</ul>;
}

/** Settings → "Плагины и темы": installed packages, their state and permissions. */
export function PluginsSettings(props: Props) {
  const [open, setOpen] = useState<string | null>(null);
  return <div className="plugins-settings">
    <div className="settings-row">
      <span className="settings-label"><span>Установка из файла</span><small>Архив .zip от автора плагина или темы. Перед установкой BBForge покажет, к чему пакет получит доступ.</small></span>
      <div className="settings-control"><button className="secondary-button" disabled={!props.desktop || props.busy} title={props.desktop ? undefined : "Доступно в настольном приложении"} onClick={props.onInstall}><Icon name="package" />Установить из файла…</button></div>
    </div>
    <p className="trusted-developers"><Icon name="shieldCheck" />Значок у пакета — подпись доверенного разработчика.</p>
    <h5 className="plugins-heading">Установленные</h5>
    {props.packages.length === 0 && props.broken.length === 0 && <p className="settings-empty">Плагины и темы не установлены.</p>}
    <ul className="package-list">
      {props.packages.map(({ id, package: item, active, warnings, dependencyIssues }) => {
        const { manifest } = item, expanded = open === id;
        // A newer signed version in the catalog: offered right next to "Удалить".
        const update = props.catalog?.packages.find((entry) => entry.id === id && entry.signer && compareVersions(manifest.version, entry.version) < 0);
        return <li key={id} className={`package-card ${active ? "active" : ""}`} data-package-id={id}>
          <div className="package-head">
            <Icon name={manifest.type === "theme" ? "palette" : "puzzle"} />
            <div className="package-title"><strong>{manifest.name}</strong><small>{manifest.id} · {manifest.version}{manifest.author ? ` · ${manifest.author}` : ""}</small></div>
            <SignatureBadge signature={item.signature} />
            <label className="package-toggle" title={item.enabled ? "Выключить" : "Включить"}><input type="checkbox" aria-label={`Включить ${manifest.name}`} checked={item.enabled} disabled={!props.desktop || props.busy} onChange={(event) => props.onToggle(id, event.target.checked)} /></label>
          </div>
          {manifest.description && <p className="package-description">{manifest.description}</p>}
          {item.tampered && <div className="package-alert" role="alert"><Icon name="warning" />Архив пакета изменился после установки, пакет не загружен.<button className="secondary-button" disabled={props.busy} onClick={() => props.onAcceptChanges(id)}>Доверять новой версии</button></div>}
          {item.errors.map((error) => <div key={error} className="package-alert" role="alert"><Icon name="error" />{error}</div>)}
          {item.enabled && dependencyIssues.length > 0 && <DependencyIssues issues={dependencyIssues} />}
          {warnings.length > 0 && <ul className="package-warnings">{warnings.map((warning) => <li key={warning}><Icon name="warning" />{warning}</li>)}</ul>}
          <div className="package-actions">
            <button className="text-button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : id)}><Icon name={expanded ? "chevronDown" : "chevronRight"} />Разрешения ({manifest.permissions.length})</button>
            <span className="spacer" />
            {update && <button className="text-button update-action" disabled={!props.desktop || props.busy} onClick={() => props.onInstallFromCatalog(update)}><Icon name="upload" />Обновить до {update.version}</button>}
            <button className="text-button danger-action" disabled={!props.desktop || props.busy} onClick={() => props.onRemove(id)}><Icon name="trash" />Удалить</button>
          </div>
          {props.download?.id === id && <DownloadBar progress={props.download} />}
          {expanded && <PermissionList permissions={manifest.permissions} />}
          {(props.origins?.[id] ?? []).length > 0 && <div className="package-origins"><strong>Разрешённые адреса</strong><ul>{props.origins![id].map((origin) => <li key={origin}><code>{origin}</code><button className="text-button" onClick={() => props.onForgetOrigin?.(id, origin)}>Забыть</button></li>)}</ul></div>}
        </li>;
      })}
      {props.broken.map((item) => <li key={item.id} className="package-card broken"><div className="package-head"><Icon name="error" /><div className="package-title"><strong>{item.id}</strong><small>{item.error}</small></div>
        <button className="text-button danger-action" disabled={!props.desktop || props.busy} onClick={() => props.onRemove(item.id)}><Icon name="trash" />Удалить</button></div></li>)}
    </ul>
    {props.desktop && <Catalog {...props} />}
  </div>;
}

/** Packages from the BBForge-plugins and BBForge-themes repositories that are not installed yet (or have updates). */
function Catalog(props: Props) {
  const { catalog, catalogLoading, onLoadCatalog } = props;
  useEffect(() => { if (!catalog && !catalogLoading) onLoadCatalog(); }, []);
  const installed = new Map(props.packages.map((item) => [item.id, item.package.manifest.version]));
  // Installed packages live in the list above (with their update button), not here.
  const offered = catalog?.packages.filter((entry) => !installed.has(entry.id)) ?? [];
  return <section className="plugin-catalog" aria-label="Каталог">
    <div className="catalog-head"><h5 className="plugins-heading">Каталог</h5><button className="text-button" disabled={catalogLoading} onClick={onLoadCatalog}>{catalogLoading ? "Загрузка…" : "Обновить"}</button></div>
    {catalog?.errors.map((error) => <div key={error} className="package-alert" role="alert"><Icon name="warning" />Не удалось загрузить каталог: {error}</div>)}
    {catalog && !offered.length && !catalog.errors.length && <p className="settings-empty">{catalog.packages.length ? "Все пакеты каталога уже установлены; обновления — у пакетов выше." : "Каталог пуст."}</p>}
    <ul className="package-list">{offered.map((entry) => {
      const current = installed.get(entry.id), downloading = props.download?.id === entry.id ? props.download : null;
      return <li key={`${entry.catalog}-${entry.id}`} className="package-card catalog-card" data-catalog-id={entry.id}>
        <div className="package-head">
          <Icon name={entry.type === "theme" ? "palette" : "puzzle"} />
          <div className="package-title"><strong>{entry.name}</strong><small>{entry.id} · {current ? `${current} → ${entry.version}` : entry.version}{entry.author ? ` · ${entry.author}` : ""}{entry.size ? ` · ${size(entry.size)}` : ""}</small></div>
          {!entry.signer ? <span className="catalog-state" title="Пакеты каталога устанавливаются только с подписью">Без подписи — недоступен</span>
            : <button className="secondary-button" disabled={props.busy} onClick={() => props.onInstallFromCatalog(entry)}><Icon name="package" />{current ? "Обновить" : "Установить"}</button>}
        </div>
        {downloading && <DownloadBar progress={downloading} />}
        {entry.description && <p className="package-description">{entry.description}</p>}
      </li>;
    })}</ul>
  </section>;
}

const groups: Array<{ key: keyof DependencyPlan; title: string; icon: IconName; tone: string; detail(item: DependencyItem): string }> = [
  { key: "missing", title: "Не установлены", icon: "error", tone: "danger", detail: (item) => `нужна ${item.requirement}${item.available ? ` · в каталоге ${item.available}` : ""}` },
  { key: "update", title: "Нужно обновить", icon: "warning", tone: "warning", detail: (item) => `установлена ${item.installed}, нужна ${item.requirement}${item.available ? ` · в каталоге ${item.available}` : ""}` },
  { key: "downgrade", title: "Нужно понизить версию", icon: "warning", tone: "warning", detail: (item) => `установлена ${item.installed}, нужна ${item.requirement}${item.available ? ` · в каталоге ${item.available}` : ""}` },
  { key: "disabled", title: "Выключены", icon: "warning", tone: "warning", detail: (item) => `установлена ${item.installed}, будет нужно включить` },
  { key: "ready", title: "Уже установлены", icon: "check", tone: "ok", detail: (item) => `${item.installed} подходит под ${item.requirement}` },
  { key: "breaks", title: "Перестанут работать", icon: "error", tone: "danger", detail: (item) => `требует ${item.requirement} этого пакета` },
];

/** Dependencies of the package in groups; only groups with something in them are shown. */
function DependencySection({ plan, fromCatalog, busy, onFetch }: { plan: DependencyPlan; fromCatalog: number; busy: boolean; onFetch(): void }) {
  const shown = groups.filter((group) => plan[group.key].length > 0);
  if (!shown.length) return null;
  return <>
    <h4>Зависимости</h4>
    <div className="dependency-groups">{shown.map((group) => <section key={group.key} className={`dependency-group tone-${group.tone}`}>
      <header><Icon name={group.icon} />{group.title}<span className="count">{plan[group.key].length}</span></header>
      <ul>{plan[group.key].map((item) => <li key={item.id}><strong>{item.name ?? item.id}</strong><code>{item.id}</code><small>{group.detail(item)}</small></li>)}</ul>
    </section>)}</div>
    {fromCatalog > 0 && <div className="package-alert catalog-offer"><Icon name="package" /><span>{fromCatalog === 1 ? "Одна зависимость найдена" : `${plural(fromCatalog, ["зависимость найдена", "зависимости найдены", "зависимостей найдено"])}`} в каталоге BBForge{plan.disabled.length ? ", выключенные можно включить" : ""}.</span><button type="button" className="secondary-button" disabled={busy} onClick={onFetch}>Подтянуть зависимости</button></div>}
    {fromCatalog === 0 && plan.disabled.length > 0 && <div className="package-alert catalog-offer"><Icon name="warning" /><span>Выключенные зависимости нужно включить.</span><button type="button" className="secondary-button" disabled={busy} onClick={onFetch}>Включить</button></div>}
    {planBlocks(plan) && <p className="muted">Пакет установится, но не загрузится, пока зависимости не будут выполнены.</p>}
  </>;
}
/** Dependencies BBForge can resolve itself: catalog versions that fit, and installed but disabled ones. */
export const fetchableDependencies = (plan: DependencyPlan) => [...plan.missing, ...plan.update, ...plan.downgrade].filter((item) => item.available);

/**
 * Every installation is confirmed here. A package without a trusted signature needs a second,
 * explicit confirmation that names the risk.
 */
export function InstallDialog({ preview, plan, busy, download, onInstall, onFetchDependencies, onCancel }: { preview: InstallPreview; plan: DependencyPlan; busy: boolean; download: DownloadProgress | null; onInstall(): void; onFetchDependencies(): void; onCancel(): void }) {
  const { manifest, signature } = preview, blocked = preview.errors.length > 0, trusted = signature.state === "trusted";
  const [step, setStep] = useState<"review" | "confirm">("review");
  const kind = manifest.type === "theme" ? "тему" : "плагин", action = preview.installedVersion ? "Обновить" : "Установить";
  const warning = signature.state === "invalid" ? "Подпись пакета недействительна: файлы изменены после подписи или подпись подделана."
    : signature.state === "untrusted" ? "Пакет подписан ключом, которого нет в списке доверенных BBForge. Автор не проверен."
    : signature.state === "unsigned" ? "Пакет не подписан. Его автор не проверен." : null;
  if (step === "confirm") return <div className="modal-backdrop"><section className="dialog install-dialog install-confirm" role="alertdialog" aria-label="Подтверждение установки">
    <header><h3><Icon name="shieldAlert" />Пакет без доверенной подписи</h3></header>
    <p className="confirm-text">{warning} BBForge не может подтвердить, что «{manifest.name}» сделал тот, за кого он себя выдаёт, и что пакет не изменён.</p>
    <p className="confirm-text">Пакет получит {plural(manifest.permissions.length, ["разрешение", "разрешения", "разрешений"])}, которые вы видели на предыдущем шаге. Устанавливайте, только если получили его из источника, которому доверяете.</p>
    <footer><button type="button" onClick={() => setStep("review")}>Назад</button><button type="button" className="danger-action" disabled={busy} onClick={onInstall}>Да, {action.toLowerCase()} без проверки</button></footer>
  </section></div>;
  return <div className="modal-backdrop"><section className="dialog install-dialog" role="dialog" aria-label="Установка пакета">
    <header><h3>{action} {kind} «{manifest.name}»?</h3></header>
    <p className="install-meta">{manifest.id} · версия {manifest.version}{preview.installedVersion ? ` (установлена ${preview.installedVersion})` : ""}{manifest.author ? ` · ${manifest.author}` : ""}</p>
    {manifest.description && <p>{manifest.description}</p>}
    <SignatureBadge signature={signature} />
    {warning && <div className={`package-alert ${signature.state === "invalid" ? "danger" : ""}`} role="alert"><Icon name="warning" />{warning}</div>}
    <h4>Пакет получит доступ:</h4>
    <PermissionList permissions={manifest.permissions} />
    <DependencySection plan={plan} fromCatalog={fetchableDependencies(plan).length} busy={busy} onFetch={onFetchDependencies} />
    {download && <DownloadBar progress={download} />}
    {preview.warnings.length > 0 && <ul className="package-warnings">{preview.warnings.map((item) => <li key={item}><Icon name="warning" />{item}</li>)}</ul>}
    {preview.errors.map((error) => <div key={error} className="package-alert danger" role="alert"><Icon name="error" />{error}</div>)}
    <footer><button type="button" onClick={onCancel}>Отмена</button><button type="button" className={trusted ? "primary" : "danger-action"} disabled={blocked || busy} onClick={() => trusted ? onInstall() : setStep("confirm")}>{trusted ? action : "Продолжить…"}</button></footer>
  </section></div>;
}
