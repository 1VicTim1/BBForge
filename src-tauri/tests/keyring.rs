use bbforge_app::keyring::{ROOT_KEY, cached, store, trusted_keys};

#[test]
fn only_the_root_is_trusted_without_a_list_and_bad_lists_are_refused() {
    let temp = tempfile::tempdir().unwrap();
    assert!(cached(temp.path()).is_none());
    assert_eq!(
        trusted_keys(temp.path()),
        vec![("1VicTim1".to_string(), ROOT_KEY.to_string())]
    );
    // Not signed by the root key: refused, nothing is written.
    let list = br#"{ "version": 1, "serial": 1, "keys": [] }"#;
    assert!(store(temp.path(), list, "AAAA").is_err());
    assert!(cached(temp.path()).is_none());
}

/// `cargo test -p bbforge-app --test keyring -- --ignored`
#[test]
#[ignore = "needs network access to GitHub"]
fn downloads_and_verifies_the_published_list() {
    let temp = tempfile::tempdir().unwrap();
    let keyring = bbforge_app::keyring::refresh(temp.path()).unwrap();
    assert!(keyring.serial >= 1);
    assert!(cached(temp.path()).is_some());
    assert_eq!(trusted_keys(temp.path())[0].1, ROOT_KEY);
}
