use bbcode_core::{Analysis, Profile, TagProfile, parse, parse_with};
use serde::Serialize;
#[cfg(feature = "desktop-runtime")]
use std::path::PathBuf;
#[cfg(feature = "desktop-runtime")]
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResponse {
    pub document_id: String,
    pub revision: u64,
    pub analysis: Analysis,
}

pub fn analyze_document(
    source: String,
    document_id: String,
    revision: u64,
    profile: Option<TagProfile>,
) -> AnalysisResponse {
    let analysis = match profile {
        Some(profile) => parse_with(&source, &Profile::new(&profile)),
        None => parse(&source),
    };
    AnalysisResponse {
        document_id,
        revision,
        analysis,
    }
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn analyze(
    source: String,
    document_id: String,
    revision: u64,
    profile: Option<TagProfile>,
) -> Result<AnalysisResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        analyze_document(source, document_id, revision, profile)
    })
    .await
    .map_err(|error| format!("Не удалось проанализировать документ: {error}"))
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn read_document(path: String) -> Result<crate::files::OpenedDocument, String> {
    crate::files::read_document_info(&PathBuf::from(path)).map_err(|error| error.to_string())
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn write_document(
    path: String,
    bytes: Vec<u8>,
    expected_fingerprint: Option<crate::files::DiskFingerprint>,
) -> Result<crate::files::SavedDocument, String> {
    crate::files::save_document_info(&PathBuf::from(path), &bytes, expected_fingerprint.as_ref())
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn read_workspace_session(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("workspace-v1.json");
    crate::session::read(&path)
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn write_workspace_session(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("workspace-v1.json");
    crate::session::write(&path, &payload)
}

#[cfg(feature = "desktop-runtime")]
fn plugin_store(app: &tauri::AppHandle) -> Result<crate::plugins::Store, String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(crate::plugins::Store::with_trusted(
        data.join("plugins"),
        crate::keyring::trusted_keys(&data),
    ))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyringStatus {
    pub serial: u64,
    pub developers: Vec<String>,
}

/// Downloads the signed list of trusted developers; the cached one stays when that fails.
#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn keyring_refresh(app: tauri::AppHandle) -> Result<KeyringStatus, String> {
    let data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let keyring = crate::keyring::refresh(&data)?;
        Ok(KeyringStatus {
            serial: keyring.serial,
            developers: keyring
                .trusted(crate::keyring::ROOT_NAME, crate::keyring::ROOT_KEY)
                .into_iter()
                .map(|(name, _)| name)
                .collect(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn plugin_preview(
    app: tauri::AppHandle,
    path: String,
) -> Result<crate::plugins::InstallPreview, String> {
    plugin_store(&app)?.preview(&PathBuf::from(path))
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn plugin_install(
    app: tauri::AppHandle,
    path: String,
    digest: String,
) -> Result<crate::plugins::InstalledPackage, String> {
    plugin_store(&app)?.install(&PathBuf::from(path), &digest)
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn plugin_list(app: tauri::AppHandle) -> Result<Vec<crate::plugins::Listed>, String> {
    Ok(plugin_store(&app)?.list())
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn plugin_remove(app: tauri::AppHandle, id: String) -> Result<(), String> {
    plugin_store(&app)?.remove(&id)?;
    // The package's storage and window data (sessions) go with it.
    plugin_data(&app, &id)?.clear()
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn plugin_set_enabled(app: tauri::AppHandle, id: String, enabled: bool) -> Result<(), String> {
    plugin_store(&app)?.set_enabled(&id, enabled)
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn plugin_accept_changes(app: tauri::AppHandle, id: String) -> Result<(), String> {
    plugin_store(&app)?.accept_changes(&id)
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn catalog_list() -> Result<crate::catalog::CatalogResult, String> {
    tauri::async_runtime::spawn_blocking(crate::catalog::fetch)
        .await
        .map_err(|error| error.to_string())
}

/// Downloads a catalog package and returns the local path to preview and install.
#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn catalog_download(
    app: tauri::AppHandle,
    entry: crate::catalog::CatalogEntry,
) -> Result<String, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("downloads");
    use tauri::Emitter;
    let id = entry.id.clone();
    let store = plugin_store(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::catalog::download(&dir, &entry, &store.trusted(), |downloaded, total| {
            let _ = app.emit(
                "catalog-download",
                serde_json::json!({ "id": id, "downloaded": downloaded, "total": total }),
            );
        })
    })
    .await
    .map_err(|error| error.to_string())?
    .map(|path| path.to_string_lossy().into_owned())
}

#[cfg(feature = "desktop-runtime")]
fn plugin_data(app: &tauri::AppHandle, id: &str) -> Result<crate::script_api::PluginData, String> {
    crate::script_api::PluginData::new(
        &app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("plugin-data"),
        id,
    )
}

#[cfg(feature = "desktop-runtime")]
fn granted(app: &tauri::AppHandle, plugin: &str) -> Result<crate::script_api::Granted, String> {
    crate::script_api::granted(&plugin_store(app)?, plugin)
}

/// Window labels of a plugin: "plugin-<hex of the id>-<n>", so a label tells its owner.
#[cfg(feature = "desktop-runtime")]
fn window_prefix(plugin: &str) -> String {
    format!(
        "plugin-{}-",
        bbforge_plugin::package::hex(plugin.as_bytes())
    )
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn script_http_get(
    app: tauri::AppHandle,
    plugin: String,
    url: String,
    cookies: Option<std::collections::BTreeMap<String, String>>,
) -> Result<crate::script_api::HttpResponse, String> {
    granted(&app, &plugin)?.url(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::script_api::http_get(&url, &cookies.unwrap_or_default())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Opens a page of the plugin's domains in its own window (no BBForge commands, browser storage
/// per plugin, navigation only within the plugin's domains); returns the window's label.
#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn script_window_open(
    app: tauri::AppHandle,
    plugin: String,
    url: String,
    title: Option<String>,
) -> Result<String, String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    let permissions = granted(&app, &plugin)?;
    permissions.require("windows")?;
    permissions.url(&url)?;
    let hosts = crate::script_api::network_hosts(&permissions.permissions);
    let prefix = window_prefix(&plugin);
    let label = (1..)
        .map(|n| format!("{prefix}{n}"))
        .find(|label| app.get_webview_window(label).is_none())
        .expect("a free label exists");
    let parsed: tauri::Url = url.parse().map_err(|error| format!("{error}"))?;
    let title: String = title
        .unwrap_or_else(|| plugin.clone())
        .chars()
        .take(80)
        .collect();
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(title)
        .inner_size(980.0, 760.0)
        .data_directory(plugin_data(&app, &plugin)?.webview_dir())
        .on_navigation(move |target| {
            target.scheme() == "https"
                && target
                    .host_str()
                    .is_some_and(|host| crate::script_api::host_allowed(host, &hosts))
        })
        .build()
        .map_err(|error| error.to_string())?;
    Ok(label)
}

/// Waits until the window has all `names` cookies for the plugin's domains (values in `ignore`
/// do not count) and returns them; fails when the window is closed or the time runs out.
#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn script_window_cookies(
    app: tauri::AppHandle,
    plugin: String,
    label: String,
    names: Vec<String>,
    ignore: Option<Vec<String>>,
    timeout_ms: Option<u64>,
) -> Result<std::collections::BTreeMap<String, String>, String> {
    let permissions = granted(&app, &plugin)?;
    permissions.require("windows")?;
    if !label.starts_with(&window_prefix(&plugin)) {
        return Err("Это окно другого плагина".into());
    }
    let hosts = crate::script_api::network_hosts(&permissions.permissions);
    let ignore = ignore.unwrap_or_default();
    let deadline = std::time::Instant::now()
        + std::time::Duration::from_millis(timeout_ms.unwrap_or(600_000).min(3_600_000));
    tauri::async_runtime::spawn_blocking(move || {
        loop {
            let window = app.get_webview_window(&label).ok_or("Окно закрыто")?;
            let mut found = Vec::new();
            for host in &hosts {
                if let Ok(url) = format!("https://{host}/").parse::<tauri::Url>()
                    && let Ok(cookies) = window.cookies_for_url(url)
                {
                    found.extend(
                        cookies
                            .into_iter()
                            .map(|cookie| (cookie.name().to_string(), cookie.value().to_string())),
                    );
                }
            }
            if let Some(result) = crate::script_api::complete_cookies(&found, &names, &ignore) {
                return Ok(result);
            }
            if std::time::Instant::now() >= deadline {
                return Err("Время ожидания истекло".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn script_window_close(
    app: tauri::AppHandle,
    plugin: String,
    label: String,
) -> Result<(), String> {
    if !label.starts_with(&window_prefix(&plugin)) {
        return Err("Это окно другого плагина".into());
    }
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Forgets everything the plugin's windows stored (cookies, cache); closes them first.
#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn script_window_clear_data(app: tauri::AppHandle, plugin: String) -> Result<(), String> {
    granted(&app, &plugin)?.require("windows")?;
    let prefix = window_prefix(&plugin);
    for (label, window) in app.webview_windows() {
        if label.starts_with(&prefix) {
            let _ = window.destroy();
        }
    }
    plugin_data(&app, &plugin)?.clear_webview()
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn script_storage_get(
    app: tauri::AppHandle,
    plugin: String,
    key: String,
) -> Result<serde_json::Value, String> {
    granted(&app, &plugin)?.require("storage")?;
    Ok(plugin_data(&app, &plugin)?.get(&key))
}

/// Stores a value; `null` removes the key.
#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub fn script_storage_set(
    app: tauri::AppHandle,
    plugin: String,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    granted(&app, &plugin)?.require("storage")?;
    plugin_data(&app, &plugin)?.set(&key, (!value.is_null()).then_some(value))
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn update_check() -> Result<Option<crate::updater::UpdateInfo>, String> {
    tauri::async_runtime::spawn_blocking(crate::updater::check)
        .await
        .map_err(|error| error.to_string())?
}

/// Downloads and installs the update, then restarts BBForge (or leaves it to the installer).
#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn update_install(
    app: tauri::AppHandle,
    info: crate::updater::UpdateInfo,
) -> Result<(), String> {
    use tauri::Emitter;
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("update");
    let progress_app = app.clone();
    let restart = tauri::async_runtime::spawn_blocking(move || {
        let file = crate::updater::download(&dir, &info, |downloaded, total| {
            let _ = progress_app.emit(
                "update-download",
                serde_json::json!({ "downloaded": downloaded, "total": total }),
            );
        })?;
        crate::updater::install(info.kind, &file)
    })
    .await
    .map_err(|error| error.to_string())??;
    if restart {
        app.restart();
    } else {
        app.exit(0);
    }
    Ok(())
}
