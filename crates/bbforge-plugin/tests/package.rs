use bbforge_plugin::package::{canonical_listing, valid_path};
use bbforge_plugin::{
    Files, KeyFile, Manifest, SignatureStatus, TrustedKey, read_archive, write_archive,
};
use std::io::{Cursor, Write};

const MANIFEST: &str = r#"{
  "manifestVersion": 1, "type": "plugin", "id": "test.profiles", "name": "Профили",
  "version": "1.0.0", "permissions": ["profiles"],
  "contributes": { "profiles": ["profiles/forum.json"] }
}"#;

fn files() -> Files {
    Files::from([
        ("manifest.json".to_string(), MANIFEST.as_bytes().to_vec()),
        (
            "profiles/forum.json".to_string(),
            br#"{"id":"forum","tags":[]}"#.to_vec(),
        ),
    ])
}

fn archive(files: &Files, key: Option<&KeyFile>) -> Vec<u8> {
    let signature = key.map(|key| key.sign(canonical_listing(files).as_bytes()).unwrap());
    write_archive(Cursor::new(Vec::new()), files, signature.as_ref())
        .unwrap()
        .into_inner()
}

#[test]
fn signed_package_round_trips_and_is_trusted_by_key() {
    let key = KeyFile::generate("Автор").unwrap();
    let bytes = archive(&files(), Some(&key));
    let package = read_archive(&bytes).unwrap();
    assert_eq!(package.manifest.id, "test.profiles");

    let untrusted = package.inspect(&[]);
    assert!(untrusted.errors.is_empty(), "{:?}", untrusted.errors);
    assert!(matches!(
        untrusted.signature,
        SignatureStatus::Untrusted { ref signer, .. } if signer == "Автор"
    ));

    let trusted = package.inspect(&[TrustedKey {
        name: "BBForge",
        public_key: &key.public_key,
    }]);
    assert!(trusted.signature.is_trusted());
}

#[test]
fn archives_are_reproducible() {
    let key = KeyFile::generate("Автор").unwrap();
    assert_eq!(archive(&files(), Some(&key)), archive(&files(), Some(&key)));
}

#[test]
fn unsigned_package_is_reported_as_such() {
    let package = read_archive(&archive(&files(), None)).unwrap();
    assert_eq!(package.inspect(&[]).signature, SignatureStatus::Unsigned);
}

#[test]
fn changed_added_or_removed_files_break_the_signature() {
    let key = KeyFile::generate("Автор").unwrap();
    let signature = key.sign(canonical_listing(&files()).as_bytes()).unwrap();
    let mut changed = files();
    changed.insert("profiles/forum.json".into(), b"{}".to_vec());
    let mut added = files();
    added.insert("extra.css".into(), b"body{}".to_vec());
    let mut removed = files();
    removed.remove("profiles/forum.json");
    for tampered in [changed, added, removed] {
        let bytes = write_archive(Cursor::new(Vec::new()), &tampered, Some(&signature))
            .unwrap()
            .into_inner();
        let status = read_archive(&bytes).unwrap().inspect(&[]).signature;
        assert!(
            matches!(status, SignatureStatus::Invalid { .. }),
            "{status:?}"
        );
    }
}

#[test]
fn rejects_dangerous_paths() {
    for path in [
        "../evil.json",
        "/etc/passwd",
        "a/../../b",
        ".hidden",
        "a\\b",
        "dir/",
        "x y.css",
    ] {
        assert!(!valid_path(path), "{path}");
    }
    assert!(valid_path("styles/selector.css"));

    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("manifest.json", options).unwrap();
    zip.write_all(MANIFEST.as_bytes()).unwrap();
    zip.start_file("../outside.txt", options).unwrap();
    zip.write_all(b"x").unwrap();
    let bytes = zip.finish().unwrap().into_inner();
    assert!(
        read_archive(&bytes)
            .unwrap_err()
            .contains("Недопустимый путь")
    );
}

#[test]
fn manifest_validation_reports_problems() {
    let manifest = Manifest::parse(
        br#"{ "manifestVersion": 1, "type": "plugin", "id": "Bad Id", "name": "x", "version": "one",
              "permissions": ["profiles", "network"],
              "contributes": { "profiles": ["missing.json"], "styles": ["a.css"],
                               "ui": [{ "op": "remove", "target": "toolbar.bold" }] } }"#,
    )
    .unwrap();
    let report = manifest.validate(|path| path == "a.css");
    let errors = report.errors.join("\n");
    assert!(errors.contains("id «Bad Id»"), "{errors}");
    assert!(errors.contains("version «one»"), "{errors}");
    assert!(errors.contains("missing.json"), "{errors}");
    let warnings = report.warnings.join("\n");
    assert!(warnings.contains("«network»"), "{warnings}");
    assert!(warnings.contains("«styles»"), "{warnings}");
    assert!(warnings.contains("«ui.remove»"), "{warnings}");
}
