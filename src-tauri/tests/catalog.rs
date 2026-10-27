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
