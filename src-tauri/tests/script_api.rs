use bbforge_app::script_api::{Granted, PluginData, complete_cookies, host_allowed, network_hosts};

#[test]
fn network_permissions_limit_urls() {
    let granted = Granted {
        permissions: vec![
            "scripts".into(),
            "network:4pda.to".into(),
            "network:Bad Host".into(),
        ],
        origins: Vec::new(),
    };
    assert_eq!(
        network_hosts(&granted.permissions),
        vec!["4pda.to".to_string()]
    );
    assert_eq!(granted.url("https://4pda.to/forum/").unwrap(), "4pda.to");
    assert_eq!(granted.url("https://s.4pda.to/x.png").unwrap(), "s.4pda.to");
    for url in [
        "http://4pda.to/",
        "https://evil.example/",
        "https://4pda.to.evil.example/",
        "https://user@4pda.to/",
        "https://4pda.to:444/",
    ] {
        assert!(granted.url(url).is_err(), "{url}");
    }
    assert!(granted.require("windows").is_err());
    assert!(host_allowed("forum.4pda.to", &["4pda.to".into()]));
}

#[test]
fn storage_is_private_and_limited() {
    let temp = tempfile::tempdir().unwrap();
    let data = PluginData::new(temp.path(), "a.plugin").unwrap();
    assert!(PluginData::new(temp.path(), "../escape").is_err());
    data.set("cookies", Some(serde_json::json!({ "member_id": "42" })))
        .unwrap();
    assert_eq!(data.get("cookies")["member_id"], "42");
    assert!(
        data.set("big", Some(serde_json::json!("x".repeat(1_100_000))))
            .is_err()
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(temp.path().join("a.plugin/storage.json"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }
    data.set("cookies", None).unwrap();
    assert!(data.get("cookies").is_null());
    data.clear().unwrap();
    assert!(!temp.path().join("a.plugin").exists());
}

#[test]
fn cookies_count_only_when_all_are_set() {
    let found = vec![
        ("member_id".to_string(), "0".to_string()),
        ("pass_hash".to_string(), "abc".to_string()),
    ];
    let names = vec!["member_id".to_string(), "pass_hash".to_string()];
    assert!(complete_cookies(&found, &names, &["0".into()]).is_none());
    let found = vec![
        ("member_id".to_string(), "42".to_string()),
        ("pass_hash".to_string(), "abc".to_string()),
    ];
    let cookies = complete_cookies(&found, &names, &["0".into()]).unwrap();
    assert_eq!(cookies["member_id"], "42");
}
