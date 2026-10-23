use bbcode_core::{Analysis, parse};
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

pub fn analyze_document(source: String, document_id: String, revision: u64) -> AnalysisResponse {
    AnalysisResponse {
        document_id,
        revision,
        analysis: parse(&source),
    }
}

#[cfg(feature = "desktop-runtime")]
#[tauri::command]
pub async fn analyze(
    source: String,
    document_id: String,
    revision: u64,
) -> Result<AnalysisResponse, String> {
    tauri::async_runtime::spawn_blocking(move || analyze_document(source, document_id, revision))
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
