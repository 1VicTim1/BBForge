use bbforge_app::session;

#[test]
fn writes_atomically_and_falls_back_to_last_valid_backup() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("workspace.json");
    let first = r#"{"version":1,"activeId":"a","tabs":[]}"#;
    let second = r#"{"version":1,"activeId":"b","tabs":[]}"#;
    session::write(&path, first).unwrap();
    session::write(&path, second).unwrap();
    std::fs::write(&path, "interrupted").unwrap();
    assert_eq!(session::read(&path).unwrap().as_deref(), Some(first));
}

#[test]
fn rejects_unknown_versions_without_replacing_the_snapshot() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("workspace.json");
    let valid = r#"{"version":1,"activeId":"a","tabs":[]}"#;
    session::write(&path, valid).unwrap();
    assert!(session::write(&path, r#"{"version":2}"#).is_err());
    assert_eq!(session::read(&path).unwrap().as_deref(), Some(valid));
}
