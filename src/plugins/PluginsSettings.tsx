import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import type { PackageState } from "./host";
import { compareVersions, permissionInfo, signatureLabel, type CatalogEntry, type CatalogResult, type InstallPreview, type SignatureStatus } from "./types";

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
      <span className="settings-label"><span>Установка пакетов</span><small>Архив .zip с manifest.json. Пакеты без доверенной подписи устанавливаются только после подтверждения.</small></span>
      <div className="settings-control"><button className="secondary-button" disabled={!props.desktop || props.busy} title={props.desktop ? undefined : "Доступно в настольном приложении"} onClick={props.onInstall}><Icon name="package" />Установить из файла…</button></div>
    </div>
    <h5 className="plugins-heading">Установленные</h5>
    {props.packages.length === 0 && props.broken.length === 0 && <p className="settings-empty">Плагины и темы не установлены.</p>}
    <ul className="package-list">
      {props.packages.map(({ id, package: item, active, warnings }) => {
        const { manifest } = item, expanded = open === id;
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
          {warnings.length > 0 && <ul className="package-warnings">{warnings.map((warning) => <li key={warning}><Icon name="warning" />{warning}</li>)}</ul>}
          <div className="package-actions">
            <button className="text-button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : id)}><Icon name={expanded ? "chevronDown" : "chevronRight"} />Разрешения ({manifest.permissions.length})</button>
            <span className="spacer" />
            <button className="text-button danger-action" disabled={!props.desktop || props.busy} onClick={() => props.onRemove(id)}><Icon name="trash" />Удалить</button>
          </div>
          {expanded && <PermissionList permissions={manifest.permissions} />}
        </li>;
      })}
      {props.broken.map((item) => <li key={item.id} className="package-card broken"><div className="package-head"><Icon name="error" /><div className="package-title"><strong>{item.id}</strong><small>{item.error}</small></div>
        <button className="text-button danger-action" disabled={!props.desktop || props.busy} onClick={() => props.onRemove(item.id)}><Icon name="trash" />Удалить</button></div></li>)}
    </ul>
    {props.desktop && <Catalog {...props} />}
  </div>;
}

/** Packages from the BBForge-plugins and BBForge-themes repositories. */
function Catalog(props: Props) {
  const { catalog, catalogLoading, onLoadCatalog } = props;
  useEffect(() => { if (!catalog && !catalogLoading) onLoadCatalog(); }, []);
  const installed = new Map(props.packages.map((item) => [item.id, item.package.manifest.version]));
  return <section className="plugin-catalog" aria-label="Каталог">
    <div className="catalog-head"><h5 className="plugins-heading">Каталог</h5><button className="text-button" disabled={catalogLoading} onClick={onLoadCatalog}>{catalogLoading ? "Загрузка…" : "Обновить"}</button></div>
    {catalog?.errors.map((error) => <div key={error} className="package-alert" role="alert"><Icon name="warning" />Не удалось загрузить каталог: {error}</div>)}
    {catalog && catalog.packages.length === 0 && !catalog.errors.length && <p className="settings-empty">Каталог пуст.</p>}
    <ul className="package-list">{catalog?.packages.map((entry) => {
      const current = installed.get(entry.id), order = current ? compareVersions(current, entry.version) : -1;
      return <li key={`${entry.catalog}-${entry.id}`} className="package-card catalog-card" data-catalog-id={entry.id}>
        <div className="package-head">
          <Icon name={entry.type === "theme" ? "palette" : "puzzle"} />
          <div className="package-title"><strong>{entry.name}</strong><small>{entry.id} · {entry.version}{entry.author ? ` · ${entry.author}` : ""}{entry.signer ? ` · подпись ${entry.signer}` : " · без подписи"}</small></div>
          {order >= 0 ? <span className="catalog-state">{order === 0 ? "Установлен" : `Установлена ${current}`}</span>
            : !entry.signer ? <span className="catalog-state" title="Пакеты каталога устанавливаются только с подписью">Без подписи — недоступен</span>
            : <button className="secondary-button" disabled={props.busy} onClick={() => props.onInstallFromCatalog(entry)}><Icon name="package" />{current ? `Обновить до ${entry.version}` : "Установить"}</button>}
        </div>
        {entry.description && <p className="package-description">{entry.description}</p>}
      </li>;
    })}</ul>
  </section>;
}

/** Shown before installing a package that is not signed with a trusted key (or has problems). */
export function InstallDialog({ preview, busy, onInstall, onCancel }: { preview: InstallPreview; busy: boolean; onInstall(): void; onCancel(): void }) {
  const { manifest, signature } = preview, blocked = preview.errors.length > 0;
  const warning = signature.state === "invalid" ? "Подпись пакета недействительна: файлы изменены после подписи или подпись подделана. Устанавливайте, только если доверяете источнику."
    : signature.state === "untrusted" ? "Пакет подписан ключом, которого нет в списке доверенных BBForge. Автор не проверен."
    : signature.state === "unsigned" ? "Пакет не подписан. Его автор не проверен." : null;
  return <div className="modal-backdrop"><section className="dialog install-dialog" role="dialog" aria-label="Установка пакета">
    <header><h3>{preview.installedVersion ? "Обновить" : "Установить"} {manifest.type === "theme" ? "тему" : "плагин"} «{manifest.name}»?</h3></header>
    <p className="install-meta">{manifest.id} · версия {manifest.version}{preview.installedVersion ? ` (установлена ${preview.installedVersion})` : ""}{manifest.author ? ` · ${manifest.author}` : ""}</p>
    {manifest.description && <p>{manifest.description}</p>}
    <SignatureBadge signature={signature} />
    {warning && <div className={`package-alert ${signature.state === "invalid" ? "danger" : ""}`} role="alert"><Icon name="warning" />{warning}</div>}
    <h4>Пакет получит доступ:</h4>
    <PermissionList permissions={manifest.permissions} />
    {preview.warnings.length > 0 && <ul className="package-warnings">{preview.warnings.map((item) => <li key={item}><Icon name="warning" />{item}</li>)}</ul>}
    {preview.errors.map((error) => <div key={error} className="package-alert danger" role="alert"><Icon name="error" />{error}</div>)}
    <footer><button type="button" onClick={onCancel}>Отмена</button><button type="button" className={signature.state === "invalid" ? "danger-action" : "primary"} disabled={blocked || busy} onClick={onInstall}>{signature.state === "trusted" ? "Установить" : "Всё равно установить"}</button></footer>
  </section></div>;
}
