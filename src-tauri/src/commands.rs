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
    Ok(crate::plugins::Store::new(
        app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("plugins"),
    ))
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
    plugin_store(&app)?.remove(&id)
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
    tauri::async_runtime::spawn_blocking(move || {
        crate::catalog::download(&dir, &entry, |downloaded, total| {
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
