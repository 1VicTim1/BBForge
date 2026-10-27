//! Package archives: a zip with `manifest.json`, the package files and an optional `signature.json`.
//!
//! The signature covers a canonical listing of every file and its SHA-256, so changing,
//! adding or removing any file breaks it.

use crate::manifest::{MANIFEST_FILE, Manifest};
use crate::signing::{Signature, SignatureStatus, TrustedKey};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Cursor, Read, Seek, Write};

pub const SIGNATURE_FILE: &str = "signature.json";
pub const MAX_FILES: usize = 2000;
pub const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;
pub const MAX_TOTAL_SIZE: u64 = 50 * 1024 * 1024;

/// Package files by path, without `signature.json`.
pub type Files = BTreeMap<String, Vec<u8>>;

#[derive(Debug)]
pub struct Package {
    pub manifest: Manifest,
    pub files: Files,
    pub signature: Option<Signature>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub manifest: Manifest,
    pub signature: SignatureStatus,
    pub digest: String,
    pub files: Vec<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// A path inside a package: relative, forward slashes, no `..`, no hidden or odd characters.
pub fn valid_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 200
        && !path.starts_with('/')
        && !path.ends_with('/')
        && path.split('/').all(|part| {
            !part.is_empty()
                && part != "."
                && part != ".."
                && !part.starts_with('.')
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        })
}

/// The text the signature covers: one `sha256  path` line per file, sorted by path.
pub fn canonical_listing(files: &Files) -> String {
    let mut listing = String::from("bbforge-package-v1\n");
    for (path, bytes) in files {
        listing.push_str(&hex(&Sha256::digest(bytes)));
        listing.push_str("  ");
        listing.push_str(path);
        listing.push('\n');
    }
    listing
}

pub fn digest(files: &Files) -> String {
    hex(&Sha256::digest(canonical_listing(files).as_bytes()))
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Reads a package archive, enforcing size, count and path limits.
pub fn read_archive(bytes: &[u8]) -> Result<Package, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("Не удалось открыть архив: {error}"))?;
    if archive.len() > MAX_FILES {
        return Err(format!("В архиве больше {MAX_FILES} файлов"));
    }
    let mut files = Files::new();
    let mut signature = None;
    let mut total = 0u64;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Повреждённый архив: {error}"))?;
        if entry.is_dir() {
            continue;
        }
        if entry.is_symlink() {
            return Err(format!("Символическая ссылка в архиве: {}", entry.name()));
        }
        let path = entry.name().to_string();
        if !valid_path(&path) {
            return Err(format!("Недопустимый путь в архиве: «{path}»"));
        }
        if entry.size() > MAX_FILE_SIZE {
            return Err(format!("Файл «{path}» больше 10 МБ"));
        }
        let mut content = Vec::new();
        entry
            .by_ref()
            .take(MAX_FILE_SIZE + 1)
            .read_to_end(&mut content)
            .map_err(|error| format!("Не удалось прочитать «{path}»: {error}"))?;
        if content.len() as u64 > MAX_FILE_SIZE {
            return Err(format!("Файл «{path}» больше 10 МБ"));
        }
        total += content.len() as u64;
        if total > MAX_TOTAL_SIZE {
            return Err("Распакованный пакет больше 50 МБ".into());
        }
        if path == SIGNATURE_FILE {
            signature = Some(
                serde_json::from_slice(&content)
                    .map_err(|error| format!("signature.json: {error}"))?,
            );
        } else if files.insert(path.clone(), content).is_some() {
            return Err(format!("Файл «{path}» встречается в архиве дважды"));
        }
    }
    let manifest = Manifest::parse(
        files
            .get(MANIFEST_FILE)
            .ok_or("В архиве нет manifest.json")?,
    )?;
    Ok(Package {
        manifest,
        files,
        signature,
    })
}

impl Package {
    pub fn inspect(&self, trusted: &[TrustedKey<'_>]) -> Inspection {
        let report = self
            .manifest
            .validate(|path| valid_path(path) && self.files.contains_key(path));
        let listing = canonical_listing(&self.files);
        Inspection {
            manifest: self.manifest.clone(),
            signature: crate::signing::verify(self.signature.as_ref(), listing.as_bytes(), trusted),
            digest: digest(&self.files),
            files: self.files.keys().cloned().collect(),
            errors: report.errors,
            warnings: report.warnings,
        }
    }
}

/// Writes files (and the signature, if any) as a zip with fixed timestamps, so the same input
/// gives the same archive.
pub fn write_archive<W: Write + Seek>(
    writer: W,
    files: &Files,
    signature: Option<&Signature>,
) -> Result<W, String> {
    let mut zip = zip::ZipWriter::new(writer);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .last_modified_time(zip::DateTime::default())
        .unix_permissions(0o644);
    let error = |error: zip::result::ZipError| format!("Не удалось записать архив: {error}");
    for (path, bytes) in files {
        zip.start_file(path.as_str(), options).map_err(error)?;
        zip.write_all(bytes)
            .map_err(|io| format!("Не удалось записать архив: {io}"))?;
    }
    if let Some(signature) = signature {
        zip.start_file(SIGNATURE_FILE, options).map_err(error)?;
        let json = serde_json::to_vec_pretty(signature).expect("signature serializes");
        zip.write_all(&json)
            .map_err(|io| format!("Не удалось записать архив: {io}"))?;
    }
    zip.finish().map_err(error)
}
