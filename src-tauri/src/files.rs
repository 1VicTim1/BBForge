
use std::{fmt, fs, io::Write, path::Path};

#[derive(Debug)]
pub enum FileError {
    Io(std::io::Error),
    InvalidUtf8,
}

impl fmt::Display for FileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "{error}"),
            Self::InvalidUtf8 => formatter.write_str("Файл не является корректным UTF-8"),
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
