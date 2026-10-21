import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./editor/Editor";
import { createAnalysisClient, type AnalysisRequest, type AnalysisResponse } from "./analysis/client";
import { createTauriAnalyzer } from "./analysis/tauri";
import { emptyAnalysis, type Analysis, type AnalysisSnapshot } from "./analysis/types";
import { Builder } from "./builder/Builder";
import type { EditorController } from "./editor/controller";
import type { EditCommand, SourceRange } from "./document/commands";
import { createSpoiler, moveNode, sourceRange, type NodeRef } from "./document/structure";
import { identity } from "./document/commands";
import { applyFormat, formatState, type FormatTag } from "./document/formatting";
import { FormattingToolbar } from "./builder/FormattingToolbar";
import { Properties } from "./builder/Properties";
import { combineFixes, suggestFixes, type FixSuggestion } from "./diagnostics/fixes";
import { ChangePreview } from "./components/ChangePreview";
import type { Diagnostic } from "./analysis/types";
import type { VisualRange } from "./builder/selection";
import { createDesktopFiles } from "./document/desktop";
import { completeSave, requestDocumentAction, savedSnapshotIsCurrent, type UnsavedChoice } from "./document/lifecycle";
import { decodeDocument, serializeDocument, updateDocumentText, type LineEnding } from "./document/state";
import { byteToUtf16 } from "./document/positions";
import { Diagnostics } from "./components/Diagnostics";
import { Outline } from "./components/Outline";
import { Preview } from "./components/Preview";
import type { Span } from "./analysis/types";
import type { SelectionRequest } from "./editor/Editor";
import { defaultLayout, loadLayout, saveLayout, type WorkspaceMode } from "./layout/settings";
import { Workspace } from "./layout/Workspace";
import { Splitter } from "./layout/Splitter";
import { StatusBar } from "./layout/StatusBar";
import "./styles.css";

const example = `[size=4][b]Моя новая тема[/b][/size]\nСоздавайте шапки, в которых легко разобраться.\n\n[spoiler=[b][color=#e5b567]Важная информация![/color][/b]]\nТекст шапки\n[/spoiler]\n\n[spoiler=Инструкции]\n[list][*]Первый шаг[*]Второй шаг[/list]\n[/spoiler]`;

export default function App() {
  const [document, setDocument] = useState(() => decodeDocument(new TextEncoder().encode(example)));
  const [analysis, setAnalysis] = useState<Analysis>(emptyAnalysis);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionRequest>();
  const [layout, setLayout] = useState(() => loadLayout(localStorage));
  const [showPreview, setShowPreview] = useState(false);
  const mode = layout.mode;
  const setMode = (mode: WorkspaceMode) => { if (!composition.current) { setLayout((current) => ({ ...current, mode })); setShowPreview(false); } };
  useEffect(() => { saveLayout(localStorage, layout); }, [layout]);
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [controller, setController] = useState<EditorController | null>(null);
  const [selected, setSelected] = useState<NodeRef | null>(null);
  const [activeRange, setActiveRange] = useState<SourceRange>({ from: 0, to: 0 });
  const composition = useRef(false);
  const [spoilerDialog, setSpoilerDialog] = useState(false);
  const [spoilerTitle, setSpoilerTitle] = useState("Новый спойлер");
  const [fix, setFix] = useState<FixSuggestion | null>(null);
  const documentRef = useRef(document);
  documentRef.current = document;
  useEffect(() => { setSelected(null); setActiveRange({ from: 0, to: 0 }); setFix(null); setSpoilerDialog(false); setAnalysis(emptyAnalysis()); }, [document.id]);
  const analyze = useMemo(() => isTauri()
    ? createTauriAnalyzer<Analysis>(invoke)
    : window.__BBFORGE_ANALYZE__ ?? (async (request: AnalysisRequest): Promise<AnalysisResponse<Analysis>> => ({ ...request, analysis: emptyAnalysis() })), []);
  const client = useMemo(() => createAnalysisClient(analyze, (result, response) => { setAnalysis(result); setSnapshot(response); }, 150, (reason) => setError(`Ошибка анализа: ${String(reason)}`)), [analyze]);
  const files = useMemo(() => createDesktopFiles(
    invoke,
    async () => await openDialog({ multiple: false, filters: [{ name: "BBCode", extensions: ["bbcode", "txt"] }] }) as string | null,
    async () => await saveDialog({ defaultPath: "post.bbcode", filters: [{ name: "BBCode", extensions: ["bbcode", "txt"] }] }),
  ), []);
  useEffect(() => {
    client.update({ source: document.text, documentId: document.id, revision: document.revision });
  }, [client, document.id, document.revision, document.text]);
  useEffect(() => () => client.dispose(), [client]);

  const changeSource = (value: string, endings: LineEnding[]) => {
    const next = updateDocumentText(documentRef.current, value, endings);
    documentRef.current = next;
    setDocument(next);
    setSelected(null);
  };
  const execute = (command: EditCommand) => { if (!controller) throw new Error("Редактор загружается"); controller.execute(command); };
  const run = (build: () => EditCommand) => { try { execute(build()); setError(null); } catch (reason) { setError(String(reason)); } };
  const currentSnapshot = snapshot?.documentId === document.id && snapshot.revision === document.revision ? snapshot : null;
  const format = (tag: FormatTag, parameter?: string) => { if (currentSnapshot) {
    const range = { ...identity(documentRef.current), ...activeRange };
    try {
      const command = applyFormat(documentRef.current, currentSnapshot, range, tag, parameter);
      if (formatState(currentSnapshot, range, tag) === "mixed") setFix({ id: "format", title: "Смешанное оформление: применить ко всему выделению", command });
      else run(() => command);
    } catch (reason) { setError(String(reason)); }
  } };
  const showFix = (diagnostic?: Diagnostic) => {
    if (!currentSnapshot) return;
    const item = diagnostic ?? analysis.diagnostics.find((entry) => { const range = sourceRange(document, entry.span); return activeRange.from >= range.from && activeRange.from <= range.to; }) ?? analysis.diagnostics[0];
    const suggestions = item ? suggestFixes(document, currentSnapshot, item) : [];
    if (suggestions.length) setFix(suggestions[0]); else setError("Для этой ошибки нет однозначного исправления. Исправьте её в коде.");
  };
  const showAllFixes = () => { if (!currentSnapshot) return; try {
    const fixes = analysis.diagnostics.flatMap((item) => suggestFixes(document, currentSnapshot, item)).filter((item) => !item.needsParameter);
    if (!fixes.length) { setError("Нет доступных однозначных исправлений"); return; }
    setFix({ id: "all", title: "Исправить однозначные ошибки", command: combineFixes(document, fixes) });
  } catch (reason) { setError(String(reason)); } };
  const visualNavigate = (range: SourceRange) => { setMode("split"); setSelection({ ...range, nonce: Date.now() }); };

  const saveCurrent = async (saveAs = false): Promise<boolean> => {
    if (!isTauri()) return false;
    if (composition.current) { setError("Завершите ввод текста перед сохранением"); return false; }
    const snapshot = documentRef.current;
    try {
      await controller?.finishComposition();
      const path = await files.saveDocument(saveAs ? null : snapshot.path, serializeDocument(snapshot));
      if (!path) return false;
      const current = documentRef.current;
      if (current.id !== snapshot.id) return false;
      setDocument((value) => completeSave(value, snapshot.id, snapshot.revision, path));
      setError(null);
      return savedSnapshotIsCurrent(current, snapshot.id, snapshot.revision);
    } catch (reason) {
      setError(String(reason));
      return false;
    }
  };

  const chooseUnsaved = async (): Promise<UnsavedChoice> => {
    if (!isTauri()) return window.confirm("Отбросить несохранённые изменения?") ? "discard" : "cancel";
    if (await ask("Сохранить изменения перед продолжением?", { title: "BBForge", kind: "warning", okLabel: "Сохранить", cancelLabel: "Другие варианты" })) return "save";
    if (await ask("Отбросить несохранённые изменения?", { title: "BBForge", kind: "warning", okLabel: "Отбросить", cancelLabel: "Отмена" })) return "discard";
    return "cancel";
  };

  const mayReplaceDocument = async () => {
    if (composition.current) { setError("Завершите ввод текста перед сменой документа"); return false; }
    try {
      await controller?.finishComposition();
      return requestDocumentAction(documentRef.current.revision !== documentRef.current.savedRevision, chooseUnsaved, saveCurrent);
    } catch (reason) { setError(String(reason)); return false; }
  };
  const newDocument = async () => { if (await mayReplaceDocument()) setDocument(decodeDocument(new Uint8Array())); };
  const openDocument = async () => {
    if (!isTauri() || !await mayReplaceDocument()) return;
    try {
      const opened = await files.openDocument();
      if (opened) { setDocument(decodeDocument(opened.bytes, opened.path)); setError(null); }
    } catch (reason) { setError(String(reason)); }
  };

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "Enter") { event.preventDefault(); showFix(); return; }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (["b", "i", "u"].includes(event.key.toLowerCase()) && (event.target as HTMLElement).closest(".visual-text") && !composition.current) { event.preventDefault(); format(event.key.toLowerCase() as FormatTag); return; }
      if (event.key.toLowerCase() === "z" && !(event.target as HTMLElement).closest(".cm-editor, input, textarea") && !composition.current) { event.preventDefault(); if (event.shiftKey) controller?.redo(); else controller?.undo(); }
      if (event.key.toLowerCase() === "s") { event.preventDefault(); void saveCurrent(event.shiftKey); }
      if (event.key.toLowerCase() === "o") { event.preventDefault(); void openDocument(); }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  });

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (composition.current || controller?.isComposing()) { event.preventDefault(); setError("Завершите ввод текста перед закрытием"); return; }
      if (documentRef.current.revision === documentRef.current.savedRevision) return;
      event.preventDefault();
      if (await mayReplaceDocument()) {
        try { await getCurrentWindow().destroy(); } catch (reason) { setError(String(reason)); }
      }
    }).then((stop) => { unlisten = stop; });
    return () => unlisten?.();
  });

  const dirty = document.revision !== document.savedRevision;
  const navigate = (span: Span) => { const range = { from: byteToUtf16(document.text, span.start), to: byteToUtf16(document.text, span.end) }; setActiveRange(range); controller?.select(range, mode !== "builder"); };
  return <main className="app">
    <header className="toolbar">
      <div className="brand-icon">B<span>F</span></div><h1>BBForge</h1><span className="project-name">Рабочее пространство <span>⌄</span></span><span className="toolbar-divider" />
      <button onClick={() => void newDocument()} title="Новый документ">＋ Новый</button><button disabled={!isTauri()} onClick={() => void openDocument()}>Открыть</button><button disabled={!isTauri()} onClick={() => void saveCurrent()}>Сохранить</button><button className="quiet-button" disabled={!isTauri()} onClick={() => void saveCurrent(true)}>Сохранить как</button>
      <span className="spacer" /><span className="build-badge">BBCode Studio</span><button title="Восстановить раскладку" aria-label="Восстановить раскладку" onClick={() => { setLayout({ ...defaultLayout }); setShowPreview(false); }}>⚙</button>
    </header>
    <div className="ide-shell"><nav className="tool-rail" aria-label="Панели"><button className={layout.showOutline ? "active" : ""} title="Структура" aria-label="Структура" onClick={() => setLayout({ ...layout, showOutline: !layout.showOutline })}>▤</button><button className={showPreview ? "active" : ""} title="Предпросмотр" aria-label="Предпросмотр" onClick={() => { if (!composition.current) setShowPreview(!showPreview); }}>◉</button><span className="spacer" /><button className={layout.showProblems ? "active" : ""} title="Проблемы" aria-label="Проблемы" onClick={() => setLayout({ ...layout, showProblems: !layout.showProblems })}>⚠</button></nav>
    <div className="ide-main">
      <div className="document-tabs"><div className="document-tab"><span className="file-icon">[ ]</span>{document.path?.split(/[\\/]/).at(-1) ?? "untitled.bbcode"}<span className="dirty-dot">{dirty ? "●" : ""}</span></div><span className="spacer" /><div className="mode-tabs">{(["code", "builder", "split"] as const).map((value) => <button key={value} className={!showPreview && mode === value ? "active" : ""} onClick={() => setMode(value)}>{value === "code" ? "Код" : value === "builder" ? "Конструктор" : "Рядом"}</button>)}</div></div>
      <div className="breadcrumbs"><span>{document.path ?? "Без имени"}{dirty ? " · изменён" : ""}</span><span>›</span><span>{selected ? "Выбранный блок" : "Документ"}</span><span className="spacer" /><span>Профиль 4PDA</span></div>
      <FormattingToolbar disabled={!currentSnapshot} onFormat={format} onSpoiler={() => setSpoilerDialog(true)} onUndo={() => controller?.undo()} onRedo={() => controller?.redo()} />
      <Workspace layout={layout} setLayout={setLayout} showPreview={showPreview}
        outline={<Outline nodes={currentSnapshot?.analysis.nodes ?? []} selected={selected?.span} onNavigate={(span) => { if (currentSnapshot) setSelected({ ...identity(document), span }); navigate(span); }} onMove={(source, target, placement) => { if (currentSnapshot) run(() => moveNode(document, currentSnapshot, { ...identity(document), span: source }, { node: { ...identity(document), span: target }, placement })); }} />}
        editor={<Editor key={document.id} document={document} snapshot={currentSnapshot} value={document.text} endings={document.endings} onChange={changeSource} onReady={setController} onSelection={setActiveRange} selectionRequest={selection} />}
        builder={<Builder key={document.id} document={document} snapshot={snapshot} execute={execute} getDocument={() => documentRef.current} onSelect={setSelected} onRange={(range: VisualRange) => setActiveRange(range)} onNavigate={visualNavigate} onError={setError} onComposition={(active) => { composition.current = active; }} />}
        preview={<Preview source={currentSnapshot?.source ?? document.text} nodes={currentSnapshot?.analysis.nodes ?? []} onNavigate={navigate} openExternal={(url) => { if (isTauri()) void openUrl(url).catch((reason) => setError(String(reason))); }} />}
        properties={selected && currentSnapshot ? <Properties document={document} snapshot={currentSnapshot} selected={selected} execute={execute} onError={setError} onNavigate={() => visualNavigate(sourceRange(document, selected.span))} /> : <div className="selection-hint">Выберите текст для оформления или блок для изменения его свойств <kbd>Alt</kbd> + <kbd>Enter</kbd> — исправления</div>} />
      {layout.showProblems && <><Splitter orientation="horizontal" value={layout.problemsHeight} min={100} max={400} label="Высота панели проблем" onChange={(problemsHeight) => setLayout({ ...layout, problemsHeight })} /><section className="diagnostics" style={{ height: layout.problemsHeight }}><div className="diagnostics-header"><h2>Проблемы <span className="count-badge">{analysis.diagnostics.length}</span></h2><span className="spacer" /><button onClick={showAllFixes}>Исправить однозначные…</button><button aria-label="Скрыть проблемы" onClick={() => setLayout({ ...layout, showProblems: false })}>×</button></div><Diagnostics diagnostics={analysis.diagnostics} onNavigate={navigate} onFix={showFix} /></section></>}
      {error && <div role="alert" className="error-banner"><span>{error}</span><button aria-label="Закрыть сообщение" onClick={() => setError(null)}>×</button></div>}
    </div></div>
    <StatusBar document={document} position={activeRange.from} problems={analysis.diagnostics.length} />
    {fix && <ChangePreview document={document} suggestion={fix} onApply={(command) => { run(() => command); setFix(null); }} onClose={() => setFix(null)} />}
    {spoilerDialog && <div className="modal-backdrop"><form className="dialog" role="dialog" aria-label="Создать спойлер" onSubmit={(event) => { event.preventDefault(); run(() => createSpoiler(documentRef.current, activeRange, spoilerTitle)); setSpoilerDialog(false); }}><h3>Создать спойлер</h3><label>Заголовок <input autoFocus value={spoilerTitle} onChange={(event) => setSpoilerTitle(event.target.value)} /></label><p>Выделенный текст станет содержимым спойлера.</p><button type="submit">Создать</button><button type="button" onClick={() => setSpoilerDialog(false)}>Отмена</button></form></div>}
  </main>;
}
