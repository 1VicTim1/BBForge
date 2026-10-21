use crate::{
    Analysis, Diagnostic, DiagnosticCode, Node, NodeKind, Severity, Span, Token, TokenKind,
    lexer::lex,
};

const MAX_DEPTH: usize = 256;

pub fn parse(source: &str) -> Analysis {
    let tokens = lex(source);
    let mut roots = Vec::new();
    let mut stack: Vec<Node> = Vec::new();
    let mut diagnostics = Vec::new();
    for token in &tokens {
        match token.kind {
            TokenKind::Text => append(&mut roots, &mut stack, text_node(token.span)),
            TokenKind::LeafTag => append(&mut roots, &mut stack, element_node(token)),
            TokenKind::OpeningTag if token.name.as_deref() == Some("*") => {
                if stack.last().and_then(|node| node.name.as_deref()) == Some("*") {
                    finish_top(&mut roots, &mut stack, token.span.start);
                }
                stack.push(element_node(token));
            }
            TokenKind::OpeningTag => {
                if stack.len() >= MAX_DEPTH {
                    diagnostics.push(Diagnostic {
                        code: DiagnosticCode::DepthLimit,
                        severity: Severity::Error,
                        message: format!("Максимальная глубина BBCode — {MAX_DEPTH}"),
                        span: token.span,
                    });
                    append(&mut roots, &mut stack, text_node(token.span));
                } else {
                    stack.push(element_node(token));
                }
            }
            TokenKind::ClosingTag => close_tag(token, &mut roots, &mut stack, &mut diagnostics),
        }
    }
    while let Some(node) = stack.pop() {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::UnclosedTag,
            severity: Severity::Error,
            message: format!("Тег [{}] не закрыт", node.name.as_deref().unwrap_or("")),
            span: node.span,
        });
        append(&mut roots, &mut stack, node);
    }
    Analysis {
        tokens,
        nodes: roots,
        diagnostics,
    }
}

fn close_tag(
    token: &Token,
    roots: &mut Vec<Node>,
    stack: &mut Vec<Node>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let name = token.name.as_deref().unwrap_or_default();
    if name == "list" && stack.last().and_then(|node| node.name.as_deref()) == Some("*") {
        finish_top(roots, stack, token.span.start);
    }
    let Some(index) = stack
        .iter()
        .rposition(|node| node.name.as_deref() == Some(name))
    else {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::UnexpectedClosingTag,
            severity: Severity::Error,
            message: format!("Закрывающий тег [/{name}] не имеет открывающего"),
            span: token.span,
        });
        append(roots, stack, text_node(token.span));
        return;
    };
    if index + 1 != stack.len() {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::CrossedClosingTag,
            severity: Severity::Error,
            message: format!("Тег [/{name}] пересекает вложенные теги"),
            span: token.span,
        });
    }
    while stack.len() > index + 1 {
        finish_top(roots, stack, token.span.start);
    }
    let mut node = stack.pop().expect("matching stack entry exists");
    node.span.end = token.span.end;
    append(roots, stack, node);
}

fn finish_top(roots: &mut Vec<Node>, stack: &mut Vec<Node>, end: usize) {
    if let Some(mut node) = stack.pop() {
        node.span.end = end;
        append(roots, stack, node);
    }
}

fn append(roots: &mut Vec<Node>, stack: &mut [Node], node: Node) {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(node);
    } else {
        roots.push(node);
    }
}

fn text_node(span: Span) -> Node {
    Node {
        kind: NodeKind::Text,
        span,
        name: None,
        parameter: None,
        children: Vec::new(),
    }
}

fn element_node(token: &Token) -> Node {
    Node {
        kind: NodeKind::Element,
        span: token.span,
        name: token.name.clone(),
        parameter: token.parameter.clone(),
        children: Vec::new(),
    }
}
