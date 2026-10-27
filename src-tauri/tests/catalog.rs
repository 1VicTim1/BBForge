use bbforge_app::catalog::parse_index;

#[test]
fn reads_a_catalog_and_drops_unsafe_entries() {
    let entry = |id: &str, file: &str, sha: &str| {
        format!(
            r#"{{ "id": "{id}", "type": "plugin", "name": "n", "version": "1.0.0", "file": "{file}", "sha256": "{sha}" }}"#
        )
    };
    let good = "a".repeat(64);
    let index = format!(
        r#"{{ "version": 1, "packages": [{}, {}, {}, {}] }}"#,
        entry("bbforge.ok", "dist/bbforge.ok-1.0.0.zip", &good),
        entry("bbforge.escape", "../secret.zip", &good),
        entry("bbforge.short", "dist/x.zip", "abc"),
        entry("Bad Id", "dist/y.zip", &good),
    );
    let entries = parse_index(index.as_bytes(), 1).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].id, "bbforge.ok");
    assert_eq!(entries[0].catalog, 1);
    assert!(parse_index(br#"{ "version": 2, "packages": [] }"#, 0).is_err());
}

/// Reads the published catalogs and installs one package: `cargo test -p bbforge-app --test catalog -- --ignored`.
#[test]
#[ignore = "needs network access to GitHub"]
fn installs_a_package_from_the_published_catalog() {
    let result = bbforge_app::catalog::fetch();
    assert!(result.errors.is_empty(), "{:?}", result.errors);
    let entry = result
        .packages
        .iter()
        .find(|entry| entry.id == "bbforge.profile-selector")
        .expect("the selector is in the catalog");
    let temp = tempfile::tempdir().unwrap();
    let path =
        bbforge_app::catalog::download(&temp.path().join("downloads"), entry, |_, _| {}).unwrap();
    let store = bbforge_app::plugins::Store::new(temp.path().join("plugins"));
    let preview = store.preview(&path).unwrap();
    assert!(
        preview.inspection.signature.is_trusted(),
        "{:?}",
        preview.inspection.signature
    );
    assert!(!preview.needs_confirmation);
    store.install(&path, &preview.inspection.digest).unwrap();
}
