use bbcode_core::{DiagnosticCode, NodeKind, Profile, TagProfile, default_tag_profile, parse_with};

fn profile(json: &str) -> Profile {
    Profile::new(&serde_json::from_str::<TagProfile>(json).unwrap())
}

#[test]
fn default_profile_is_loaded_from_json() {
    let profile = default_tag_profile();
    assert_eq!(profile.id, "4pda");
    assert!(profile.tags.iter().any(|tag| tag.name == "spoiler"));
}

#[test]
fn tags_follow_the_profile() {
    let forum = profile(
        r#"{ "id": "x", "tags": [
            { "name": "hide", "as": "spoiler" },
            { "name": "mono", "raw": true },
            { "name": "poll", "leaf": true },
            { "name": "ul", "as": "list" },
            { "name": "li", "as": "*" },
            { "name": "c", "as": "color", "value": "required" }
        ] }"#,
    );
    let analysis = parse_with(
        "[hide=a]x[/hide][mono][b][/mono][poll=1][ul][li]a[li]b[/ul][c=zz1]q[/c][b]x[/b]",
        &forum,
    );
    let unknown: Vec<_> = analysis
        .diagnostics
        .iter()
        .filter(|item| item.code == DiagnosticCode::UnknownTag)
        .collect();
    assert_eq!(unknown.len(), 1, "only [b] is unknown: {unknown:?}");
    assert!(
        analysis
            .diagnostics
            .iter()
            .any(|item| item.code == DiagnosticCode::InvalidColor)
    );
    let mono = &analysis.nodes[1];
    assert_eq!(mono.children.len(), 1);
    assert_eq!(mono.children[0].kind, NodeKind::Text);
    assert!(analysis.nodes[2].well_formed, "leaf tag needs no closing");
    let list = &analysis.nodes[3];
    assert_eq!(list.children.len(), 2);
    assert!(list.well_formed);
}
