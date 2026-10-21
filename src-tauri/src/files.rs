use serde::{Deserialize, Serialize};
use std::{fmt, fs, io::Write, path::Path, time::UNIX_EPOCH};

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskFingerprint { pub modified_ms: u64, pub size: u64, pub digest: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDocument { pub bytes: Vec<u8>, pub canonical_path: String, pub fingerprint: DiskFingerprint }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDocument { pub canonical_path: String, pub fingerprint: DiskFingerprint }

#[derive(Debug)]
pub enum FileError {
    Io(std::io::Error),
    InvalidUtf8,
    Conflict,
}

impl fmt::Display for FileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "{error}"),
            Self::InvalidUtf8 => formatter.write_str("Файл не является корректным UTF-8"),
            Self::Conflict => formatter.write_str("FILE_CONFLICT: файл был изменён вне BBForge"),
        }
    }
}

impl std::error::Error for FileError {}

impl From<std::io::Error> for FileError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

pub fn read_document(path: &Path) -> Result<Vec<u8>, FileError> {
    let bytes = fs::read(path)?;
    let content = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    std::str::from_utf8(content).map_err(|_| FileError::InvalidUtf8)?;
    Ok(bytes)
}

pub fn write_document(path: &Path, bytes: &[u8]) -> Result<(), FileError> {
    let mut file = atomic_write_file::AtomicWriteFile::open(path)?;
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    file.commit()?;
    Ok(())
}

fn digest(bytes: &[u8]) -> String {
    let mut value = 0xcbf29ce484222325_u64;
    for byte in bytes { value ^= u64::from(*byte); value = value.wrapping_mul(0x100000001b3); }
    format!("{value:016x}")
}

fn fingerprint(path: &Path, bytes: &[u8]) -> Result<DiskFingerprint, FileError> {
    let metadata = fs::metadata(path)?;
    let modified_ms = metadata.modified()?.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
    Ok(DiskFingerprint { modified_ms, size: metadata.len(), digest: digest(bytes) })
}

pub fn read_document_info(path: &Path) -> Result<OpenedDocument, FileError> {
    let bytes = read_document(path)?;
    let canonical = fs::canonicalize(path)?;
    Ok(OpenedDocument { fingerprint: fingerprint(&canonical, &bytes)?, bytes, canonical_path: canonical.to_string_lossy().into_owned() })
}

pub fn write_document_checked(path: &Path, bytes: &[u8], expected: Option<&DiskFingerprint>) -> Result<DiskFingerprint, FileError> {
    if let Some(expected) = expected {
        let current = read_document(path)?;
        if &fingerprint(path, &current)? != expected { return Err(FileError::Conflict); }
    }
    write_document(path, bytes)?;
    fingerprint(path, bytes)
}

pub fn save_document_info(path: &Path, bytes: &[u8], expected: Option<&DiskFingerprint>) -> Result<SavedDocument, FileError> {
    let fingerprint = write_document_checked(path, bytes, expected)?;
    let canonical_path = fs::canonicalize(path)?.to_string_lossy().into_owned();
    Ok(SavedDocument { canonical_path, fingerprint })
}
