import type { Node, Span } from "../analysis/types";

export function Outline({ nodes, onNavigate }: { nodes: Node[]; onNavigate(span: Span): void }) {
  return <div className="outline-tree">{nodes.map((node, index) => <OutlineNode key={`${node.span.start}-${index}`} node={node} onNavigate={onNavigate} />)}</div>;
}

function OutlineNode({ node, onNavigate }: { node: Node; onNavigate(span: Span): void }) {
  if (node.kind === "text") return null;
  const title = node.name === "spoiler" && node.parameter ? stripTags(node.parameter) : node.name;
  return <div className="outline-node">
    <button className="tree-item" onClick={() => onNavigate(node.span)}>▾ {title}</button>
    {node.children.length > 0 && <div className="outline-children">{node.children.map((child, index) => <OutlineNode key={`${child.span.start}-${index}`} node={child} onNavigate={onNavigate} />)}</div>}
  </div>;
}

function stripTags(value: string): string { return value.replace(/\[[^\]]+\]/g, "").trim(); }
