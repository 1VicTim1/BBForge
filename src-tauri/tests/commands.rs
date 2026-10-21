use bbforge_app::commands::analyze_document;

#[test]
fn analysis_response_preserves_document_identity_and_revision() {
    let response = analyze_document("[b]текст".into(), "doc-1".into(), 7);

    assert_eq!(response.document_id, "doc-1");
    assert_eq!(response.revision, 7);
    assert!(
        response
            .analysis
            .diagnostics
            .iter()
            .any(|item| item.message.contains("не закрыт"))
    );
}
