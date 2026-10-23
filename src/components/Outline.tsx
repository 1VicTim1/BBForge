import { useState } from "react";
import type { Node, Span } from "../analysis/types";
import type { NodeRef } from "../document/structure";
import type { DocumentIdentity } from "../document/commands";
export interface OutlineProps {
  nodes: Node[]; onNavigate(span: Span): void;
  identity?: DocumentIdentity;
  selected?: Span; onMove?(source: NodeRef, target: Span, placement: "before" | "inside" | "after"): void;
}
export function Outline(props: OutlineProps) {
  return <div className="outline-tree" role="tree" aria-label="Структура документа">{props.nodes.map((node, index) => <OutlineNode key={`${node.span.start}-${index}`} {...props} node={node} depth={0} />)}</div>;
}
function OutlineNode({ node, depth, ...props }: OutlineProps & { node: Node; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [drop, setDrop] = useState<string | null>(null);
  if (node.kind === "text") return null;
  const children = node.children.filter((child) => child.kind !== "text");
  const title = node.name === "spoiler" && node.parameter ? node.parameter.replace(/\[[^\]]+\]/g, "").trim() : node.name;
  const selected = props.selected?.start === node.span.start && props.selected?.end === node.span.end;
  return <div className={`outline-node ${selected ? "selected" : ""}`}>
    <div className={`tree-row ${drop ? `drop-${drop}` : ""}`} draggable={!!props.onMove && node.wellFormed} onDragStart={(event) => event.dataTransfer.setData("application/bbforge-node", JSON.stringify({ ...props.identity, span: node.span }))} onDragOver={(event) => {
      if (!props.onMove) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect();
      setDrop(event.clientY < rect.top + rect.height / 3 ? "before" : event.clientY > rect.bottom - rect.height / 3 ? "after" : node.name === "spoiler" ? "inside" : "after");
    }} onDragLeave={() => setDrop(null)} onDrop={(event) => {
      event.preventDefault(); event.stopPropagation();
      try { const reference = JSON.parse(event.dataTransfer.getData("application/bbforge-node")) as NodeRef; props.onMove?.(reference, node.span, (drop ?? "after") as "before" | "inside" | "after"); } catch { /* foreign drag */ }
      setDrop(null);
    }}>
      <button className="tree-toggle" aria-label={`${expanded ? "Свернуть" : "Развернуть"} ${title}`} disabled={!children.length} onClick={() => setExpanded(!expanded)}>{children.length ? expanded ? "▾" : "▸" : "·"}</button>
      <button role="treeitem" aria-selected={selected} className="tree-item" onClick={() => props.onNavigate(node.span)}>{node.name !== "spoiler" && <span className="node-icon">◇</span>}{title}<small>{!node.wellFormed ? "!" : node.name === "spoiler" ? "spoiler" : ""}</small></button>
    </div>
    {expanded && children.length > 0 && <div role="group" className="outline-children">{children.map((child, index) => <OutlineNode {...props} key={`${child.span.start}-${index}`} node={child} depth={depth + 1} />)}</div>}
  </div>;
}
