use std::fs;

use bbforge_app::files::{
    FileError, read_document, read_document_info, write_document, write_document_checked,
};

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

#[test]
fn detects_an_external_change_without_overwriting_it() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("post.bbcode");
    fs::write(&path, b"original").unwrap();
    let opened = read_document_info(&path).unwrap();
    fs::write(&path, b"external").unwrap();

    assert!(matches!(
        write_document_checked(&path, b"ours", Some(&opened.fingerprint)),
        Err(FileError::Conflict)
    ));
    assert_eq!(fs::read(&path).unwrap(), b"external");
}

#[test]
fn returns_a_new_fingerprint_after_a_checked_write() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("post.bbcode");
    fs::write(&path, b"old").unwrap();
    let opened = read_document_info(&path).unwrap();
    let fingerprint = write_document_checked(&path, b"new", Some(&opened.fingerprint)).unwrap();
    assert_eq!(
        fingerprint.digest,
        read_document_info(&path).unwrap().fingerprint.digest
    );
}
