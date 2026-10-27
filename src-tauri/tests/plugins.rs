use bbforge_app::plugins::{Listed, Store};
use bbforge_plugin::package::canonical_listing;
use bbforge_plugin::{Files, KeyFile, SignatureStatus, write_archive};
use std::io::Cursor;
use std::path::Path;

fn package(dir: &Path, name: &str, engine: &str, key: Option<&KeyFile>) -> std::path::PathBuf {
    let manifest = format!(
        r#"{{ "manifestVersion": 1, "type": "theme", "id": "test.night", "name": "Ночь", "version": "1.2.0",
             "engine": "{engine}", "permissions": ["themes"],
             "contributes": {{ "themes": ["night.json"] }} }}"#
    );
    let files = Files::from([
        ("manifest.json".to_string(), manifest.into_bytes()),
        (
            "night.json".to_string(),
            br#"{"id":"night","base":"dark"}"#.to_vec(),
        ),
        ("icon.svg".to_string(), b"<svg/>".to_vec()),
    ]);
    let signature = key.map(|key| key.sign(canonical_listing(&files).as_bytes()).unwrap());
    let bytes = write_archive(Cursor::new(Vec::new()), &files, signature.as_ref())
        .unwrap()
        .into_inner();
    let path = dir.join(name);
    std::fs::write(&path, bytes).unwrap();
    path
}

fn only(store: &Store) -> bbforge_app::plugins::InstalledPackage {
    match store.list().pop().expect("one package") {
        Listed::Ok(package) => *package,
        Listed::Broken { error, .. } => panic!("{error}"),
    }
}

#[test]
fn installs_lists_disables_and_removes_a_package() {
    let temp = tempfile::tempdir().unwrap();
    let store = Store::new(temp.path().join("plugins"));
    let key = KeyFile::generate("Чужой автор").unwrap();
    let path = package(temp.path(), "night.zip", ">=0.1.0", Some(&key));

    let preview = store.preview(&path).unwrap();
    assert!(preview.needs_confirmation, "unknown keys need confirmation");
    assert!(matches!(
        preview.inspection.signature,
        SignatureStatus::Untrusted { .. }
    ));
    assert_eq!(preview.installed_version, None);

    let installed = store.install(&path, &preview.inspection.digest).unwrap();
    assert!(installed.enabled && !installed.tampered);
    assert_eq!(
        installed.files.get("night.json").map(String::as_str),
        Some(r#"{"id":"night","base":"dark"}"#)
    );
    assert!(installed.assets["icon.svg"].starts_with("data:image/svg+xml;base64,"));
    assert_eq!(
        store.preview(&path).unwrap().installed_version.as_deref(),
        Some("1.2.0")
    );

    store.set_enabled("test.night", false).unwrap();
    assert!(!only(&store).enabled);
    store.remove("test.night").unwrap();
    assert!(store.list().is_empty());
}

#[test]
fn refuses_a_package_that_changed_after_the_preview() {
    let temp = tempfile::tempdir().unwrap();
    let store = Store::new(temp.path().join("plugins"));
    let path = package(temp.path(), "night.zip", ">=0.1.0", None);
    let preview = store.preview(&path).unwrap();
    package(temp.path(), "night.zip", ">=0.1.1", None);
    assert!(
        store
            .install(&path, &preview.inspection.digest)
            .unwrap_err()
            .contains("изменился")
    );
}

#[test]
fn refuses_packages_for_another_bbforge_version() {
    let temp = tempfile::tempdir().unwrap();
    let store = Store::new(temp.path().join("plugins"));
    let path = package(temp.path(), "night.zip", ">=99.0.0", None);
    let preview = store.preview(&path).unwrap();
    assert!(
        preview
            .inspection
            .errors
            .iter()
            .any(|item| item.contains("99.0.0"))
    );
    assert!(store.install(&path, &preview.inspection.digest).is_err());
}

#[test]
fn notices_an_installed_archive_replaced_on_disk() {
    let temp = tempfile::tempdir().unwrap();
    let store = Store::new(temp.path().join("plugins"));
    let path = package(temp.path(), "night.zip", ">=0.1.0", None);
    let preview = store.preview(&path).unwrap();
    store.install(&path, &preview.inspection.digest).unwrap();

    package(
        &temp.path().join("plugins"),
        "test.night.zip",
        ">=0.1.1",
        None,
    );
    assert!(only(&store).tampered);
    store.accept_changes("test.night").unwrap();
    assert!(!only(&store).tampered);
}
