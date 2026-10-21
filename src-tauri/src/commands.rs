use bbcode_core::{Analysis, parse};
use serde::Serialize;

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

#[cfg(feature = "desktop")]
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
