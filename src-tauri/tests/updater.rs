/// `cargo test -p bbforge-app --test updater -- --ignored`
#[test]
#[ignore = "needs network access to GitHub"]
fn reads_the_latest_release() {
    // This build is the latest release or newer, so there is nothing to update to.
    let result = bbforge_app::updater::check().unwrap();
    assert!(result.is_none(), "{result:?}");
}
