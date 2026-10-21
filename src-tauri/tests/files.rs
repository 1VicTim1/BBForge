use std::fs;

use bbforge_app::files::{FileError, read_document, write_document};

#[test]
fn reads_valid_utf8_with_bom_unchanged() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("post.bbcode");
    let bytes = [vec![0xef, 0xbb, 0xbf], "текст\r\n".as_bytes().to_vec()].concat();
    fs::write(&path, &bytes).unwrap();

    assert_eq!(read_document(&path).unwrap(), bytes);
}

#[test]
fn rejects_invalid_utf8() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("broken.bbcode");
    fs::write(&path, [0xc3, 0x28]).unwrap();

    assert!(matches!(read_document(&path), Err(FileError::InvalidUtf8)));
}

#[test]
fn atomically_replaces_existing_document() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("post.bbcode");
    fs::write(&path, b"old").unwrap();

    write_document(&path, b"new").unwrap();

    assert_eq!(fs::read(&path).unwrap(), b"new");
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
}
