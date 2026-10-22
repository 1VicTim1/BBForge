use bbforge_app::session;

#[test]
fn writes_atomically_and_falls_back_to_last_valid_backup() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("workspace.json");
    let first =
        r#"{"version":1,"activeId":"a","tabs":[{"document":{"id":"a","text":"one"},"ui":{}}]}"#;
    let second =
        r#"{"version":1,"activeId":"b","tabs":[{"document":{"id":"b","text":"two"},"ui":{}}]}"#;
    session::write(&path, first).unwrap();
    session::write(&path, second).unwrap();
    std::fs::write(&path, "interrupted").unwrap();
    assert_eq!(session::read(&path).unwrap().as_deref(), Some(first));
}

#[test]
fn rejects_unknown_versions_without_replacing_the_snapshot() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("workspace.json");
    let valid =
        r#"{"version":1,"activeId":"a","tabs":[{"document":{"id":"a","text":"ok"},"ui":{}}]}"#;
    session::write(&path, valid).unwrap();
    session::write(&path, valid).unwrap();
    assert!(session::write(&path, r#"{"version":2}"#).is_err());
    assert_eq!(session::read(&path).unwrap().as_deref(), Some(valid));
}

#[test]
fn skips_a_schema_invalid_primary_and_preserves_the_valid_backup() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("workspace.json");
    let valid =
        r#"{"version":1,"activeId":"a","tabs":[{"document":{"id":"a","text":"ok"},"ui":{}}]}"#;
    session::write(&path, valid).unwrap();
    session::write(&path, valid).unwrap();
    std::fs::write(&path, r#"{"version":1,"activeId":"a","tabs":[]}"#).unwrap();
    assert_eq!(session::read(&path).unwrap().as_deref(), Some(valid));
}
