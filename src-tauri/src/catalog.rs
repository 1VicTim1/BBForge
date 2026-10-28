//! Package catalogs: `index.json` files in the BBForge-plugins and BBForge-themes repositories,
//! made by `bbforge-pack index`. Downloads are checked against the catalog's SHA-256 and then go
//! through the same preview and installation as a package opened from disk.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};

/// Catalogs BBForge reads: (name, base URL with a trailing slash).
pub const CATALOGS: &[(&str, &str)] = &[
    (
        "Плагины",
        "https://raw.githubusercontent.com/1VicTim1/BBForge-plugins/main/",
    ),
    (
        "Темы",
        "https://raw.githubusercontent.com/1VicTim1/BBForge-themes/main/",
    ),
];
const MAX_INDEX: u64 = 2 * 1024 * 1024;
const MAX_PACKAGE: u64 = 60 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub signer: Option<String>,
    pub file: String,
    pub sha256: String,
    #[serde(default)]
    pub size: u64,
    /// Which catalog the entry came from (index into CATALOGS); filled in by BBForge.
    #[serde(default)]
    pub catalog: usize,
}

#[derive(Debug, Deserialize)]
struct Index {
    version: u32,
    packages: Vec<CatalogEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogResult {
    pub packages: Vec<CatalogEntry>,
    /// Catalogs that could not be read, with the reason.
    pub errors: Vec<String>,
}

fn get(url: &str, limit: u64) -> Result<Vec<u8>, String> {
    get_with_progress(url, limit, |_, _| {})
}

/// Downloads `url`, reporting (downloaded, total) about ten times a second and once at the end.
fn get_with_progress(
    url: &str,
    limit: u64,
    mut progress: impl FnMut(u64, Option<u64>),
) -> Result<Vec<u8>, String> {
    let response = ureq::get(url)
        .timeout(std::time::Duration::from_secs(120))
        .call()
        .map_err(|error| format!("{url}: {error}"))?;
    let total = response
        .header("Content-Length")
        .and_then(|value| value.parse::<u64>().ok());
    if total.is_some_and(|total| total > limit) {
        return Err(format!("{url}: файл слишком большой"));
    }
    let mut reader = response.into_reader().take(limit + 1);
    let mut bytes = Vec::with_capacity(total.unwrap_or(0) as usize);
    let mut buffer = [0u8; 64 * 1024];
    let mut reported = std::time::Instant::now();
    progress(0, total);
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("{url}: {error}"))?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read]);
        if bytes.len() as u64 > limit {
            return Err(format!("{url}: файл слишком большой"));
        }
        if reported.elapsed() >= std::time::Duration::from_millis(100) {
            progress(bytes.len() as u64, total);
            reported = std::time::Instant::now();
        }
    }
    progress(bytes.len() as u64, total.or(Some(bytes.len() as u64)));
    Ok(bytes)
}

/// A catalog path to a package: relative, inside the repository, a .zip.
fn valid_file(file: &str) -> bool {
    bbforge_plugin::package::valid_path(file) && file.ends_with(".zip")
}

pub fn parse_index(bytes: &[u8], catalog: usize) -> Result<Vec<CatalogEntry>, String> {
    let index: Index =
        serde_json::from_slice(bytes).map_err(|error| format!("index.json: {error}"))?;
    if index.version != 1 {
        return Err(format!(
            "index.json: неизвестная версия каталога {}",
            index.version
        ));
    }
    Ok(index
        .packages
        .into_iter()
        .filter(|entry| {
            valid_file(&entry.file)
                && bbforge_plugin::valid_id(&entry.id)
                && entry.sha256.len() == 64
                && entry.sha256.chars().all(|c| c.is_ascii_hexdigit())
        })
        .map(|entry| CatalogEntry { catalog, ..entry })
        .collect())
}

pub fn fetch() -> CatalogResult {
    let mut result = CatalogResult {
        packages: Vec::new(),
        errors: Vec::new(),
    };
    for (index, (name, base)) in CATALOGS.iter().enumerate() {
        match get(&format!("{base}index.json"), MAX_INDEX)
            .and_then(|bytes| parse_index(&bytes, index))
        {
            Ok(entries) => result.packages.extend(entries),
            Err(error) => result.errors.push(format!("{name}: {error}")),
        }
    }
    result
}

/// Downloads a catalog package into `dir` and returns its path once the checksum matches and the
/// package is signed with a trusted key: catalog packages are never installed without one.
pub fn download(
    dir: &Path,
    entry: &CatalogEntry,
    trusted: &[bbforge_plugin::TrustedKey<'_>],
    progress: impl FnMut(u64, Option<u64>),
) -> Result<PathBuf, String> {
    let (_, base) = CATALOGS.get(entry.catalog).ok_or("Неизвестный каталог")?;
    if !valid_file(&entry.file) {
        return Err(format!("Недопустимый путь пакета: {}", entry.file));
    }
    let bytes = get_with_progress(&format!("{base}{}", entry.file), MAX_PACKAGE, progress)?;
    let digest = bbforge_plugin::package::hex(&Sha256::digest(&bytes));
    if !digest.eq_ignore_ascii_case(&entry.sha256) {
        return Err(format!(
            "Контрольная сумма {} не совпадает с каталогом: файл повреждён или подменён",
            entry.file
        ));
    }
    let package = bbforge_plugin::read_archive(&bytes)?;
    let signature = package.inspect(trusted).signature;
    if !signature.is_trusted() {
        let reason = match signature {
            bbforge_plugin::SignatureStatus::Unsigned => "пакет не подписан".to_string(),
            bbforge_plugin::SignatureStatus::Untrusted { signer, .. } => {
                format!("подпись ключом, которому BBForge не доверяет ({signer})")
            }
            bbforge_plugin::SignatureStatus::Invalid { reason } => {
                format!("подпись недействительна: {reason}")
            }
            bbforge_plugin::SignatureStatus::Trusted { .. } => unreachable!(),
        };
        return Err(format!(
            "Пакет «{}» из каталога не установлен: {reason}. Пакеты каталога должны быть подписаны доверенным ключом.",
            entry.name
        ));
    }
    std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let path = dir.join(format!("{}.zip", digest));
    std::fs::write(&path, bytes).map_err(|error| format!("{}: {error}", path.display()))?;
    Ok(path)
}
