import { useState } from "react";
import type { AnalysisSnapshot, Node } from "../analysis/types";
import type { DocumentState } from "../document/state";
import { identity, type EditCommand } from "../document/commands";
import { extractNode, moveNode, nodeRef, renameSpoiler, resolveNode, sourceRange, unwrapNode, type NodeRef } from "../document/structure";
interface Props { document: DocumentState; snapshot: AnalysisSnapshot; selected: NodeRef; execute(command: EditCommand): void; onError(message: string): void; onNavigate(): void }
export function Properties(props: Props) {
  let node: Node, parent: Node | null, siblings: Node[];
  try { ({ node, parent, siblings } = resolveNode(props.document, props.snapshot, props.selected)); }
  catch { return <div className="properties muted">Обновление выбранного блока… <button onClick={props.onNavigate}>К исходнику</button></div>; }
  return <PropertyForm key={`${node.span.start}-${props.document.revision}`} {...props} node={node} parent={parent} siblings={siblings} />;
}
function PropertyForm({ node, parent, siblings, ...props }: Props & { node: Node; parent: Node | null; siblings: Node[] }) {
  const [parameter, setParameter] = useState(node.parameter ?? ""), [title, setTitle] = useState(node.parameter ?? "");
  const run = (build: () => EditCommand) => { try { props.execute(build()); } catch (error) { props.onError(String(error)); } };
  const peers = siblings.filter((item) => item.kind !== "text"), at = peers.indexOf(node);
  const move = (direction: -1 | 1) => { const target = peers[at + direction]; if (target) run(() => moveNode(props.document, props.snapshot, props.selected, { node: nodeRef(props.snapshot, target), placement: direction < 0 ? "before" : "after" })); };
  return <section className="properties" aria-label="Свойства блока"><div className="properties-title"><span className="node-icon">◇</span><strong>{node.name}</strong><small>{parent ? `${parent.name} / ${node.name}` : "Корневой уровень"}</small><button onClick={props.onNavigate}>К коду ↗</button></div>
    {node.name === "spoiler" && <form onSubmit={(event) => { event.preventDefault(); run(() => renameSpoiler(props.document, props.snapshot, props.selected, title)); }}><label>Заголовок <input aria-label="Заголовок спойлера" value={title} onChange={(event) => setTitle(event.target.value)} /></label><button type="submit">Применить</button></form>}
    {["attachment", "img", "url", "color", "background", "size", "font"].includes(node.name ?? "") && <form onSubmit={(event) => { event.preventDefault(); run(() => {
      if (/[\]\r\n]/.test(parameter)) throw new Error("Параметр содержит недопустимые символы");
      const span = node.name === "img" ? node.contentSpan : node.openingSpan!;
      return { ...identity(props.document), label: "Изменить свойства", changes: [{ ...sourceRange(props.document, span), insert: node.name === "img" ? parameter : `[${node.name}=${parameter}]` }] };
    }); }}><label>Параметр <input aria-label="Параметр блока" value={parameter} onChange={(event) => setParameter(event.target.value)} /></label><button type="submit">Применить</button></form>}
    <div className="block-actions"><button disabled={at <= 0} onClick={() => move(-1)}>↑ Выше</button><button disabled={at >= peers.length - 1} onClick={() => move(1)}>↓ Ниже</button><button disabled={parent?.name !== "spoiler"} onClick={() => run(() => extractNode(props.document, props.snapshot, props.selected))}>↰ Вынести наружу</button><button disabled={!node.closingSpan} onClick={() => run(() => unwrapNode(props.document, props.snapshot, props.selected))}>Убрать оболочку</button><button className="danger-action" onClick={() => run(() => ({ ...identity(props.document), label: "Удалить блок", changes: [{ ...sourceRange(props.document, node.span), insert: "" }] }))}>Удалить блок</button></div>
  </section>;
}
