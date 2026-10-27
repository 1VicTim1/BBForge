use std::collections::HashSet;

use crate::{
    Diagnostic, DiagnosticCode, Node, NodeKind, Severity, ValueFormat, ValueRule, profile::Profile,
};

pub(crate) fn lint(
    source: &str,
    nodes: &[Node],
    profile: &Profile,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let mut links = HashSet::new();
    visit(source, nodes, profile, diagnostics, &mut links);
    escaped_tags(source, diagnostics);
}

fn escaped_tags(source: &str, diagnostics: &mut Vec<Diagnostic>) {
    let mut cursor = 0;
    while let Some(relative_start) = source[cursor..].find("&#91;") {
        let start = cursor + relative_start;
        let content_start = start + "&#91;".len();
        let Some(relative_end) = source[content_start..].find("&#93;") else {
            break;
        };
        let end = content_start + relative_end + "&#93;".len();
        let content = &source[content_start..content_start + relative_end];
        let name = content
            .strip_prefix('/')
            .unwrap_or(content)
            .split(['=', ' '])
            .next()
            .unwrap_or_default();
        if !name.is_empty()
            && name.chars().all(|character| {
                character.is_ascii_alphanumeric() || character == '*' || character == '-'
            })
        {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::EscapedBbcodeTag,
                severity: Severity::Info,
                message: format!(
                    "Форум преобразовал BBCode в текст: [{content}]. Такой тег отображается буквально"
                ),
                span: crate::Span { start, end },
                line: 0,
                column: 0,
            });
        }
        cursor = end;
    }
}

fn visit(
    source: &str,
    nodes: &[Node],
    profile: &Profile,
    diagnostics: &mut Vec<Diagnostic>,
    links: &mut HashSet<String>,
) {
    for node in nodes {
        if node.kind != NodeKind::Element {
            continue;
        }
        let name = node.name.as_deref().unwrap_or_default();
        let spec = profile.tag(name);
        if spec.is_none() {
            warning(
                diagnostics,
                DiagnosticCode::UnknownTag,
                format!("Неизвестный тег [{name}]"),
                node,
            );
        }
        if spec
            .is_some_and(|spec| spec.value == ValueRule::Required && spec.builtin() != Some("url"))
            && node.parameter.as_deref().is_none_or(str::is_empty)
        {
            warning(
                diagnostics,
                DiagnosticCode::MissingParameter,
                format!("Тег [{name}] требует значение"),
                node,
            );
        }
        if spec.is_some_and(|spec| spec.value_format == Some(ValueFormat::Color))
            && let Some(value) = node
                .parameter
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            && let Some(problem) = color_problem(value)
        {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::InvalidColor,
                severity: Severity::Warning,
                message: format!("{problem}: [{name}={value}]"),
                span: node.opening_span.unwrap_or(node.span),
                line: 0,
                column: 0,
            });
        }
        if profile.blank_checked(name)
            && node.well_formed
            && node.closing_span.is_some()
            && is_blank(source, node, profile)
        {
            warning(
                diagnostics,
                DiagnosticCode::EmptyTag,
                format!("Пустой тег [{name}] ничего не оформляет"),
                node,
            );
            continue;
        }
        if profile.builtin(name) == Some("url") {
            let address = node
                .parameter
                .clone()
                .unwrap_or_else(|| text_content(source, &node.children));
            let address = address.trim();
            if address.is_empty() {
                warning(
                    diagnostics,
                    DiagnosticCode::MissingParameter,
                    "Ссылка не содержит адрес".into(),
                    node,
                );
            } else if !links.insert(address.to_owned()) {
                warning(
                    diagnostics,
                    DiagnosticCode::DuplicateLink,
                    format!("Ссылка {address} повторяется"),
                    node,
                );
            }
        }
        visit(source, &node.children, profile, diagnostics, links);
    }
}

/// A formatting tag whose content is only whitespace (possibly inside other such tags).
fn is_blank(source: &str, node: &Node, profile: &Profile) -> bool {
    node.children.iter().all(|child| match child.kind {
        NodeKind::Text => source[child.span.start..child.span.end].trim().is_empty(),
        _ => {
            profile.blank_checked(child.name.as_deref().unwrap_or_default())
                && is_blank(source, child, profile)
        }
    })
}

/// 4PDA accepts #RGB, #RRGGBB and colour names.
fn color_problem(value: &str) -> Option<&'static str> {
    let is_hex = |text: &str| {
        !text.is_empty() && text.chars().all(|character| character.is_ascii_hexdigit())
    };
    if let Some(hex) = value.strip_prefix('#') {
        if !is_hex(hex) {
            return Some("Цвет содержит недопустимые символы");
        }
        return (hex.len() != 3 && hex.len() != 6)
            .then_some("Цвет должен быть в формате #RGB или #RRGGBB");
    }
    if is_hex(value)
        && (value.len() == 3 || value.len() == 6)
        && value
            .chars()
            .any(|character| character.is_ascii_digit() || value.len() == 6)
    {
        return Some("Цвет записан без «#»");
    }
    if value
        .chars()
        .all(|character| character.is_ascii_alphabetic())
    {
        return None;
    }
    Some("Неверный формат цвета")
}

fn text_content(source: &str, nodes: &[Node]) -> String {
    let mut result = String::new();
    for node in nodes {
        if node.kind == NodeKind::Text {
            result.push_str(&source[node.span.start..node.span.end]);
        } else {
            result.push_str(&text_content(source, &node.children));
        }
    }
    result
}

fn warning(diagnostics: &mut Vec<Diagnostic>, code: DiagnosticCode, message: String, node: &Node) {
    diagnostics.push(Diagnostic {
        code,
        severity: Severity::Warning,
        message,
        span: node.span,
        line: 0,
        column: 0,
    });
}
