import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Editor } from "./editor/Editor";
import { createAnalysisClient, type AnalysisRequest, type AnalysisResponse } from "./analysis/client";
import { createTauriAnalyzer } from "./analysis/tauri";
import { emptyAnalysis, type Analysis, type AnalysisSnapshot } from "./analysis/types";
import { Builder } from "./builder/Builder";
import type { EditorController } from "./editor/controller";
import type { EditCommand, SourceRange } from "./document/commands";
import { createSpoiler, moveNode, nestedSpoilerRange, sourceRange, unwrapNode, type NodeRef } from "./document/structure";
import { identity } from "./document/commands";
import { applyFormat, formatState, formattingActionState, type FormatTag } from "./document/formatting";
import { FormattingToolbar } from "./builder/FormattingToolbar";
import { Properties } from "./builder/Properties";
import { combineFixes, suggestFixes, type FixSuggestion } from "./diagnostics/fixes";
import { ChangePreview } from "./components/ChangePreview";
import type { Diagnostic } from "./analysis/types";
import type { VisualRange } from "./builder/selection";
import { createDesktopFiles } from "./document/desktop";
import { completeSave, requestDocumentAction, requestWorkspaceClose, savedSnapshotIsCurrent, type UnsavedChoice } from "./document/lifecycle";
import { decodeDocument, serializeDocument, updateDocumentText, type LineEnding } from "./document/state";
import { byteToUtf16 } from "./document/positions";
import { Diagnostics } from "./components/Diagnostics";
import { Outline } from "./components/Outline";
import { Preview } from "./components/Preview";
import { Icon } from "./components/Icon";
import { TooltipButton } from "./components/TooltipButton";
import type { Span } from "./analysis/types";
import type { SelectionRequest } from "./editor/Editor";
import { defaultLayout, loadLayout, saveLayout, type WorkspaceMode } from "./layout/settings";
import { Workspace } from "./layout/Workspace";
import { Splitter } from "./layout/Splitter";
import { StatusBar } from "./layout/StatusBar";
import { TabStrip } from "./workspace/TabStrip";
import { createWorkspace, workspaceReducer } from "./workspace/session";
import { createWorkspaceStore } from "./workspace/persistence";
import { resolveActiveSelection } from "./commands/activeSelection";
import { buildContextCommands, type MenuSurface } from "./context/commands";
import { ContextMenu } from "./context/ContextMenu";
import { useContextMenu } from "./context/useContextMenu";
import { extractPreviewBbcode, readPreviewSelection, type PreviewSelection } from "./components/previewSelection";
import "./styles.css";
import "./workspace-polish.css";

const example = `[size=4][b]Моя новая тема[/b][/size]\nСоздавайте шапки, в которых легко разобраться.\n\n[spoiler=[b][color=#e5b567]Важная информация![/color][/b]]\nТекст шапки\n[/spoiler]\n\n[spoiler=Инструкции]\n[list][*]Первый шаг[*]Второй шаг[/list]\n[/spoiler]`;

export default function App() {
  const [workspace, dispatchWorkspace] = useReducer(workspaceReducer, decodeDocument(new TextEncoder().encode(example)), createWorkspace);
  const activeSession = workspace.tabs.find((tab) => tab.document.id === workspace.activeId) ?? workspace.tabs[0];
  const document = activeSession.document;
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const analysis = analyses[document.id] ?? emptyAnalysis();
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionRequest>();
  const [layout, setLayout] = useState(() => loadLayout(localStorage));
  const [showPreview, setShowPreview] = useState(activeSession.ui.showPreview);
  const mode = layout.mode;
  const setMode = (mode: WorkspaceMode) => { if (!composition.current && !controller?.isComposing()) { setLayout((current) => ({ ...current, mode })); setShowPreview(false); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { mode, showPreview: false } }); } };
  useEffect(() => { saveLayout(localStorage, layout); }, [layout]);
  const [snapshots, setSnapshots] = useState<Record<string, AnalysisSnapshot>>({});
  const snapshot = snapshots[document.id] ?? null;
  const [controller, setController] = useState<EditorController | null>(null);
  const [selected, setSelected] = useState<NodeRef | null>(null);
  const [activeRange, setActiveRange] = useState<SourceRange>({ from: 0, to: 0 });
  const composition = useRef(false);
  const [spoilerDialog, setSpoilerDialog] = useState(false);
  const spoilerOrigin = useRef<VisualRange | null>(null);
  const [spoilerTitle, setSpoilerTitle] = useState("Новый спойлер");
  const [fix, setFix] = useState<FixSuggestion | null>(null), [fixOptions, setFixOptions] = useState<FixSuggestion[] | undefined>();
  const documentRef = useRef(document);
  documentRef.current = document;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const workspaceStore = useMemo(() => createWorkspaceStore(isTauri() ? invoke : null, localStorage), []);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [previewRange, setPreviewRange] = useState<PreviewSelection | null>(null);
  const contextMenu = useContextMenu();
  useEffect(() => { contextMenu.close(); }, [workspace.activeId, contextMenu.close]);
  useEffect(() => { setSelected(activeSession.ui.selected); setActiveRange(activeSession.ui.codeSelection); setLayout((current) => ({ ...current, mode: activeSession.ui.mode })); setShowPreview(activeSession.ui.showPreview); setPreviewRange(null); setFix(null); setSpoilerDialog(false); }, [document.id]);
  useEffect(() => {
    let active = true;
    void workspaceStore.load().then((restored) => {
      if (active && restored) dispatchWorkspace({ type: "restore", workspace: restored });
    }).catch((reason) => setError(`Не удалось восстановить сеанс: ${String(reason)}`)).finally(() => { if (active) setWorkspaceReady(true); });
    return () => { active = false; };
  }, [workspaceStore]);
  useEffect(() => { if (workspaceReady) workspaceStore.schedule(workspace); }, [workspace, workspaceReady, workspaceStore]);
  const analyze = useMemo(() => isTauri()
    ? createTauriAnalyzer<Analysis>(invoke)
    : window.__BBFORGE_ANALYZE__ ?? (async (request: AnalysisRequest): Promise<AnalysisResponse<Analysis>> => ({ ...request, analysis: emptyAnalysis() })), []);
  const client = useMemo(() => createAnalysisClient(analyze, (result, response) => {
    setAnalyses((current) => ({ ...current, [response.documentId]: result }));
    setSnapshots((current) => ({ ...current, [response.documentId]: response }));
  }, 150, (reason) => setError(`Ошибка анализа: ${String(reason)}`)), [analyze]);
  const files = useMemo(() => createDesktopFiles(
    invoke,
    async () => await openDialog({ multiple: false, filters: [{ name: "BBCode", extensions: ["bbcode", "txt"] }] }) as string | null,
    async () => await saveDialog({ defaultPath: "post.bbcode", filters: [{ name: "BBCode", extensions: ["bbcode", "txt"] }] }),
  ), []);
  useEffect(() => {
    client.update({ source: document.text, documentId: document.id, revision: document.revision });
  }, [client, document.id, document.revision, document.text]);
  useEffect(() => () => client.dispose(), [client]);

  const changeSource = (documentId: string, value: string, endings: LineEnding[]) => {
    const session = workspaceRef.current.tabs.find((tab) => tab.document.id === documentId);
    if (!session) return;
    const next = updateDocumentText(session.document, value, endings);
    if (documentId === workspaceRef.current.activeId) documentRef.current = next;
    dispatchWorkspace({ type: "updateDocument", documentId, document: next });
    dispatchWorkspace({ type: "updateUi", documentId, ui: { selected: null } });
    if (documentId === workspaceRef.current.activeId) setSelected(null);
  };
  const execute = (command: EditCommand) => { if (composition.current || controller?.isComposing()) throw new Error("Завершите ввод текста перед изменением документа"); if (!controller) throw new Error("Редактор загружается"); controller.execute(command); };
  const historyAction = (redo: boolean) => { if (composition.current || controller?.isComposing()) return; if (redo) controller?.redo(); else controller?.undo(); };
  const run = (build: () => EditCommand) => { try { execute(build()); setError(null); } catch (reason) { setError(String(reason)); } };
  const currentSnapshot = snapshot?.documentId === document.id && snapshot.revision === document.revision ? snapshot : null;
  const commandSelection = () => resolveActiveSelection(activeSession, controller);
  const spoilerSelection = () => currentSnapshot ? nestedSpoilerRange(documentRef.current, currentSnapshot, commandSelection(), selected) : commandSelection();
  const format = (tag: FormatTag, parameter?: string) => { if (composition.current || controller?.isComposing()) return; if (currentSnapshot) {
    const range = commandSelection();
    try {
      const command = applyFormat(documentRef.current, currentSnapshot, range, tag, parameter);
      if (formatState(currentSnapshot, range, tag) === "mixed") setFix({ id: "format", title: "Смешанное оформление: применить ко всему выделению", command });
      else run(() => command);
    } catch (reason) { setError(String(reason)); }
  } };
  const formattingStates = Object.fromEntries((["b", "i", "u", "s", "color", "background", "url", "quote", "code", "list"] as FormatTag[]).map((tag) => [tag, formattingActionState(document, currentSnapshot, commandSelection(), tag)]));
  const showFix = (diagnostic?: Diagnostic) => {
    if (!currentSnapshot) return;
    const item = diagnostic ?? analysis.diagnostics.find((entry) => { const range = sourceRange(document, entry.span); return activeRange.from >= range.from && activeRange.from <= range.to; }) ?? analysis.diagnostics[0];
    const suggestions = item ? suggestFixes(document, currentSnapshot, item) : [];
    if (suggestions.length) { setFixOptions(suggestions); setFix(suggestions[0]); } else setError("Для этой ошибки нет автоматического исправления. Исправьте её в коде.");
  };
  const showAllFixes = () => { if (!currentSnapshot) return; try {
    const fixes = [...new Map(analysis.diagnostics.filter((item) => item.severity !== "info").map((item) => suggestFixes(document, currentSnapshot, item)[0]).filter((item): item is FixSuggestion => !!item && !item.needsParameter).map((item) => [item.id, item])).values()];
    if (!fixes.length) { setError("Нет доступных однозначных исправлений"); return; }
    setFixOptions(undefined); setFix({ id: "all", title: "Исправить однозначные ошибки", command: combineFixes(document, fixes) });
  } catch (reason) { setError(String(reason)); } };
  const visualNavigate = (range: SourceRange) => { setMode("split"); setSelection({ ...range, nonce: Date.now() }); };
  const copyText = async (value: string) => { try { await navigator.clipboard.writeText(value); } catch { setError("Не удалось скопировать текст"); } };
  const contextEdit = (captured: VisualRange, insert: string) => run(() => ({ ...captured, label: "Контекстное редактирование", changes: [{ from: captured.from, to: captured.to, insert }] }));
  const openContextMenu = (event: React.MouseEvent) => {
    event.preventDefault(); contextMenu.close();
    const target = event.target as HTMLElement;
    let surface: MenuSurface | null = null;
    if (target.closest("input,textarea,select")) surface = "field";
    else if (target.closest(".cm-editor")) surface = "code";
    else if (target.closest(".rendered-post [data-context-surface='link']")) surface = "link";
    else if (target.closest(".rendered-post [data-context-surface='media']")) surface = "media";
    else if (target.closest(".rendered-post")) surface = "preview";
    else if (target.closest(".builder")) surface = "builder";
    if (!surface) return;
    if (surface === "field") {
      const field = target.closest<HTMLInputElement | HTMLTextAreaElement>("input,textarea");
      if (!field) return;
      const from = field.selectionStart ?? 0, to = field.selectionEnd ?? from;
      const replace = (value: string) => { field.focus(); field.setSelectionRange(from, to); field.setRangeText(value, from, to, "end"); field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: value ? "insertFromPaste" : "deleteContent" })); };
      const selectedValue = field.value.slice(from, to);
      const history = (command: string) => () => { field.focus(); globalThis.document.execCommand(command); };
      const commands = buildContextCommands({ surface, editable: true, hasSelection: from !== to }, { undo: history("undo"), redo: history("redo"), cut: () => { void copyText(selectedValue); replace(""); }, copy: () => void copyText(selectedValue), paste: () => void navigator.clipboard.readText().then(replace).catch(() => setError("Не удалось прочитать буфер обмена")), delete: () => replace(""), selectAll: () => { field.focus(); field.select(); } });
      contextMenu.open({ x: event.clientX, y: event.clientY, commands }); return;
    }
    const previewRoot = target.closest<HTMLElement>(".rendered-post");
    const livePreviewRange = previewRoot ? readPreviewSelection(previewRoot, documentRef.current) : null;
    const domSelection = previewRoot && window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : null;
    const sourceNode = target.closest<HTMLElement>("[data-source-from][data-source-to]");
    const nodeRange = sourceNode ? { ...identity(documentRef.current), from: Number(sourceNode.dataset.sourceFrom), to: Number(sourceNode.dataset.sourceTo) } : null;
    const captured = surface === "preview" || surface === "link" || surface === "media" ? livePreviewRange ?? previewRange ?? nodeRange ?? commandSelection() : commandSelection();
    const selectedText = documentRef.current.text.slice(captured.from, captured.to);
    const previewInner = currentSnapshot ? extractPreviewBbcode(documentRef.current, currentSnapshot, captured, false) : null;
    const previewWrapped = currentSnapshot ? extractPreviewBbcode(documentRef.current, currentSnapshot, captured, true) : null;
    const checked = (action: () => void) => () => { const current = documentRef.current; if (current.id !== captured.documentId || current.revision !== captured.revision) { setError("Документ изменился. Откройте меню заново."); return; } action(); };
    const formatCaptured = (tag: FormatTag) => checked(() => { if (currentSnapshot) run(() => applyFormat(documentRef.current, currentSnapshot, captured, tag)); });
    const handlers: Partial<Record<string, () => void>> = {
      undo: () => historyAction(false), redo: () => historyAction(true), copy: () => void copyText(selectedText),
      cut: checked(() => { void copyText(selectedText); contextEdit(captured, ""); }), delete: checked(() => contextEdit(captured, "")),
      paste: checked(() => { void navigator.clipboard.readText().then((text) => contextEdit(captured, text)).catch(() => setError("Не удалось прочитать буфер обмена")); }),
      selectAll: () => { const range = { from: 0, to: documentRef.current.text.length }; controller?.select(range, surface === "code"); dispatchWorkspace({ type: "updateUi", documentId: documentRef.current.id, ui: surface === "builder" ? { visualSelection: range, activeSurface: "builder" } : { codeSelection: range, activeSurface: "code" } }); },
      bold: formatCaptured("b"), italic: formatCaptured("i"), underline: formatCaptured("u"), strike: formatCaptured("s"),
      spoiler: checked(() => { spoilerOrigin.current = currentSnapshot ? { ...captured, ...nestedSpoilerRange(documentRef.current, currentSnapshot, captured, selected) } : captured; setSpoilerDialog(true); }), fix: () => showFix(),
      unwrap: checked(() => { if (selected && currentSnapshot) run(() => unwrapNode(documentRef.current, currentSnapshot, selected)); }),
      source: () => visualNavigate(captured), copyText: () => void copyText(window.getSelection()?.toString() || selectedText),
      copyInner: previewInner === null ? undefined : () => void copyText(previewInner),
      copyWrapped: previewWrapped === null ? undefined : () => void copyText(previewWrapped),
      copyBlock: () => void copyText(nodeRange ? documentRef.current.text.slice(nodeRange.from, nodeRange.to) : selectedText),
      openLink: () => (target.closest("a") as HTMLAnchorElement | null)?.click(), copyLink: () => void copyText((target.closest("a") as HTMLAnchorElement | null)?.href ?? ""),
      copyMedia: () => void copyText(target.closest("[data-source-value]")?.getAttribute("data-source-value") ?? ""),
    };
    const commands = buildContextCommands({ surface, editable: surface === "code" || surface === "builder", hasSelection: captured.from !== captured.to || Boolean(window.getSelection()?.toString()), hasBlock: Boolean(selected) || Boolean(target.closest("details,[data-source-span]")), hasDiagnostic: analysis.diagnostics.length > 0 }, handlers);
    if (commands.length) {
      contextMenu.open({ x: event.clientX, y: event.clientY, commands });
      if (domSelection && previewRoot?.contains(domSelection.commonAncestorContainer)) requestAnimationFrame(() => {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(domSelection);
      });
    }
  };

  const saveTab = async (documentId: string, saveAs = false): Promise<boolean> => {
    if (!isTauri()) return false;
    if (composition.current) { setError("Завершите ввод текста перед сохранением"); return false; }
    const tab = workspaceRef.current.tabs.find((item) => item.document.id === documentId);
    if (!tab) return false;
    const snapshot = tab.document;
    try {
      if (documentId === workspaceRef.current.activeId) await controller?.finishComposition();
      const saved = await files.saveDocument(saveAs ? null : snapshot.path, serializeDocument(snapshot), saveAs ? null : tab.diskFingerprint);
      if (!saved) return false;
      const current = workspaceRef.current.tabs.find((item) => item.document.id === documentId)?.document;
      if (!current) return false;
      dispatchWorkspace({ type: "updateDocument", documentId, document: completeSave(current, snapshot.id, snapshot.revision, saved.path) });
      dispatchWorkspace({ type: "updateFingerprint", documentId: snapshot.id, fingerprint: saved.fingerprint });
      setError(null);
      return savedSnapshotIsCurrent(current, snapshot.id, snapshot.revision);
    } catch (reason) {
      setError(String(reason));
      return false;
    }
  };
  const saveCurrent = async (saveAs = false): Promise<boolean> => saveTab(workspaceRef.current.activeId, saveAs);

  const chooseUnsaved = async (): Promise<UnsavedChoice> => {
    if (!isTauri()) return window.confirm("Отбросить несохранённые изменения?") ? "discard" : "cancel";
    if (await ask("Сохранить изменения перед продолжением?", { title: "BBForge", kind: "warning", okLabel: "Сохранить", cancelLabel: "Другие варианты" })) return "save";
    if (await ask("Отбросить несохранённые изменения?", { title: "BBForge", kind: "warning", okLabel: "Отбросить", cancelLabel: "Отмена" })) return "discard";
    return "cancel";
  };

  const newDocument = async () => {
    if (composition.current || controller?.isComposing()) { setError("Завершите ввод текста перед сменой вкладки"); return; }
    dispatchWorkspace({ type: "open", session: { document: decodeDocument(new Uint8Array()) } });
  };
  const openDocument = async () => {
    if (!isTauri()) return;
    if (composition.current || controller?.isComposing()) { setError("Завершите ввод текста перед сменой вкладки"); return; }
    try {
      const opened = await files.openDocument();
      if (opened) { dispatchWorkspace({ type: "open", session: { document: decodeDocument(opened.bytes, opened.path), diskFingerprint: opened.fingerprint } }); setError(null); }
    } catch (reason) { setError(String(reason)); }
  };

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "Enter") { event.preventDefault(); showFix(); return; }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (["b", "i", "u"].includes(event.key.toLowerCase()) && (event.target as HTMLElement).closest(".visual-text") && !composition.current) { event.preventDefault(); format(event.key.toLowerCase() as FormatTag); return; }
      if ((event.code === "KeyZ" || event.key.toLowerCase() === "z") && !(event.target as HTMLElement).closest(".cm-editor, input, textarea") && !composition.current) { event.preventDefault(); historyAction(event.shiftKey); }
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
      event.preventDefault();
      if (composition.current || controller?.isComposing()) { setError("Завершите ввод текста перед закрытием"); return; }
      const dirtyTabs = workspaceRef.current.tabs.filter((tab) => tab.document.revision !== tab.document.savedRevision).map((tab) => tab.document.id);
      if (!await requestWorkspaceClose(dirtyTabs, async (documentId) => requestDocumentAction(true, chooseUnsaved, () => saveTab(documentId)))) return;
      try {
        workspaceStore.schedule(workspaceRef.current);
        await workspaceStore.flush();
        await getCurrentWindow().destroy();
      } catch (reason) { setError(String(reason)); }
    }).then((stop) => { unlisten = stop; });
    return () => unlisten?.();
  }, [controller, workspaceStore]);

  const dirty = document.revision !== document.savedRevision;
  const closeDocument = async (documentId: string) => {
    const tab = workspaceRef.current.tabs.find((item) => item.document.id === documentId);
    if (!tab) return;
    if (!await requestDocumentAction(tab.document.revision !== tab.document.savedRevision, chooseUnsaved, () => saveTab(documentId))) return;
    controller?.discard(documentId);
    dispatchWorkspace({ type: "close", documentId });
    if (workspaceRef.current.tabs.length === 1) dispatchWorkspace({ type: "open", session: { document: decodeDocument(new Uint8Array()) } });
  };
  const navigate = (span: Span) => { const range = { from: byteToUtf16(document.text, span.start), to: byteToUtf16(document.text, span.end) }; setActiveRange(range); visualNavigate(range); };
  const closeAppMenu = (event: React.MouseEvent<HTMLElement>) => event.currentTarget.closest("details")?.removeAttribute("open");
  const focusSearch = () => { setMode("code"); requestAnimationFrame(() => { controller?.select(activeRange); globalThis.document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "f", code: "KeyF", ctrlKey: true, bubbles: true })); }); };
  return <main className="app" onContextMenu={openContextMenu}>
    <header className="toolbar">
      <div className="brand-icon">BF</div><h1>BBForge</h1>
      <nav className="app-menus" aria-label="Главное меню">
        <details className="app-menu"><summary>Файл</summary><div className="app-menu-popup"><button onClick={(event) => { closeAppMenu(event); void newDocument(); }}>Новый документ <kbd>Ctrl+N</kbd></button><button disabled={!isTauri()} onClick={(event) => { closeAppMenu(event); void openDocument(); }}>Открыть… <kbd>Ctrl+O</kbd></button><button disabled={!isTauri()} onClick={(event) => { closeAppMenu(event); void saveCurrent(); }}>Сохранить <kbd>Ctrl+S</kbd></button><button disabled={!isTauri()} onClick={(event) => { closeAppMenu(event); void saveCurrent(true); }}>Сохранить как…</button></div></details>
        <details className="app-menu"><summary>Правка</summary><div className="app-menu-popup"><button onClick={(event) => { closeAppMenu(event); historyAction(false); }}>Отменить <kbd>Ctrl+Z</kbd></button><button onClick={(event) => { closeAppMenu(event); historyAction(true); }}>Повторить <kbd>Ctrl+Shift+Z</kbd></button><button onClick={(event) => { closeAppMenu(event); showFix(); }}>Исправить в позиции… <kbd>Alt+Enter</kbd></button></div></details>
        <details className="app-menu"><summary>Вид</summary><div className="app-menu-popup"><button onClick={(event) => { closeAppMenu(event); setLayout({ ...layout, showOutline: !layout.showOutline }); }}>{layout.showOutline ? "Скрыть" : "Показать"} структуру</button><button onClick={(event) => { closeAppMenu(event); setLayout({ ...layout, showProblems: !layout.showProblems }); }}>{layout.showProblems ? "Скрыть" : "Показать"} проблемы</button><button onClick={(event) => { closeAppMenu(event); const value = !showPreview; setShowPreview(value); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { showPreview: value } }); }}>{showPreview ? "Закрыть" : "Открыть"} предпросмотр</button></div></details>
        <details className="app-menu"><summary>Инструменты</summary><div className="app-menu-popup"><button onClick={(event) => { closeAppMenu(event); setLayout({ ...defaultLayout }); setShowPreview(false); }}>Восстановить раскладку</button><button onClick={(event) => { closeAppMenu(event); showAllFixes(); }}>Исправить однозначные ошибки</button></div></details>
      </nav>
      <span className="spacer" /><span className="top-document"><Icon name="file" />{document.path?.split(/[\\/]/).at(-1) ?? "Без имени"}<span>/ Рабочее пространство</span></span><span className="spacer" />
      <TooltipButton className="top-tooltip" label="Поиск в коде" description="Найти текст в исходном BBCode" shortcut="Ctrl+F" onClick={focusSearch}><Icon name="search" /></TooltipButton><button className="export-button" disabled={!isTauri()} onClick={() => void saveCurrent(true)}>Экспорт</button><TooltipButton className="top-tooltip" label="Восстановить раскладку" description="Вернуть стандартные панели и размеры" onClick={() => { setLayout({ ...defaultLayout }); setShowPreview(false); }}><Icon name="settings" /></TooltipButton>
    </header>
    <div className="ide-shell"><nav className="tool-rail" aria-label="Панели"><TooltipButton className={layout.showOutline ? "active" : ""} label="Структура" description="Показать или скрыть структуру документа" onClick={() => setLayout({ ...layout, showOutline: !layout.showOutline })}><Icon name="outline" /></TooltipButton><TooltipButton className={showPreview ? "active" : ""} label="Предпросмотр" description="Открыть результат разметки" onClick={() => { if (!composition.current) { const value = !showPreview; setShowPreview(value); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { showPreview: value } }); } }}><Icon name="preview" /></TooltipButton><span className="spacer" /><TooltipButton className={layout.showProblems ? "active" : ""} label="Проблемы" description="Показать найденные ошибки и предупреждения" onClick={() => setLayout({ ...layout, showProblems: !layout.showProblems })}><Icon name="warning" /></TooltipButton></nav>
    <div className="ide-main">
      <div className="document-tabs-row"><TabStrip tabs={workspace.tabs} activeId={workspace.activeId} onActivate={(documentId) => { if (!composition.current && !controller?.isComposing()) dispatchWorkspace({ type: "activate", documentId }); }} onClose={(documentId) => void closeDocument(documentId)} onReorder={(documentId, to) => dispatchWorkspace({ type: "reorder", documentId, to })} /><button className="new-tab-button" aria-label="Новый документ" title="Новый документ" onClick={() => void newDocument()}>＋</button><div className="mode-tabs">{(["code", "builder", "split"] as const).map((value) => <button key={value} className={!showPreview && mode === value ? "active" : ""} onClick={() => setMode(value)}>{value === "code" ? "Код" : value === "builder" ? "Конструктор" : "Рядом"}</button>)}</div></div>
      <div className="breadcrumbs"><span>{document.path ?? "Без имени"}{dirty ? " · изменён" : ""}</span><span>›</span><span>{selected ? "Выбранный блок" : "Документ"}</span><span className="spacer" /><span>Профиль 4PDA</span></div>
      <FormattingToolbar disabled={!currentSnapshot} states={formattingStates} onFormat={format} onSpoiler={() => { if (composition.current || controller?.isComposing()) return; spoilerOrigin.current = { ...identity(documentRef.current), ...spoilerSelection() }; setSpoilerDialog(true); }} onUndo={() => historyAction(false)} onRedo={() => historyAction(true)} />
      <Workspace layout={layout} setLayout={setLayout} showPreview={showPreview} onClosePreview={() => { setShowPreview(false); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { showPreview: false } }); }}
        outline={<Outline identity={identity(document)} nodes={currentSnapshot?.analysis.nodes ?? []} selected={selected?.span} onNavigate={(span) => { if (currentSnapshot) { const reference = { ...identity(document), span }; setSelected(reference); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { selected: reference } }); } navigate(span); }} onMove={(source, target, placement) => { if (currentSnapshot) run(() => moveNode(document, currentSnapshot, source, { node: { ...identity(document), span: target }, placement })); }} />}
        editor={<Editor document={document} snapshot={currentSnapshot} value={document.text} endings={document.endings} storedSelection={activeSession.ui.codeSelection} scroll={activeSession.ui.codeScroll} onScrollPosition={(codeScroll) => dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { codeScroll } })} onChange={changeSource} onReady={setController} onSelection={(range) => { setActiveRange(range); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { codeSelection: range, activeSurface: "code" } }); }} selectionRequest={selection} />}
        builder={<Builder key={document.id} document={document} snapshot={snapshot} scroll={activeSession.ui.builderScroll} storedSelection={activeSession.ui.visualSelection} restoreFocus={activeSession.ui.activeSurface === "builder"} onScrollPosition={(builderScroll) => dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { builderScroll } })} execute={execute} getDocument={() => documentRef.current} onSelect={(reference) => { setSelected(reference); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { selected: reference } }); }} onRange={(range: VisualRange) => { setActiveRange(range); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { visualSelection: range, activeSurface: "builder" } }); }} onNavigate={visualNavigate} onError={setError} onComposition={(active) => { composition.current = active; }} />}
        preview={<Preview document={document} source={currentSnapshot?.source ?? document.text} nodes={currentSnapshot?.analysis.nodes ?? []} scroll={activeSession.ui.previewScroll} onScrollPosition={(previewScroll) => dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { previewScroll } })} onSelection={setPreviewRange} onNavigate={navigate} openExternal={(url) => { if (isTauri()) void openUrl(url).catch((reason) => setError(String(reason))); }} />}
        properties={selected && currentSnapshot ? <Properties document={document} snapshot={currentSnapshot} selected={selected} execute={execute} onError={setError} onNavigate={() => visualNavigate(sourceRange(document, selected.span))} /> : <div className="selection-hint">Выберите текст для оформления или блок для изменения его свойств <kbd>Alt</kbd> + <kbd>Enter</kbd> — исправления</div>} />
      {layout.showProblems ? <><Splitter orientation="horizontal" value={layout.problemsHeight} min={100} max={400} label="Высота панели проблем" onChange={(problemsHeight) => setLayout({ ...layout, problemsHeight })} /><section className="diagnostics" style={{ height: layout.problemsHeight }}><div className="diagnostics-header"><h2>Проблемы <span className="count-badge">{analysis.diagnostics.length}</span></h2><span className="spacer" /><button onClick={showAllFixes}>Исправить однозначные…</button><button aria-label="Скрыть проблемы" onClick={() => setLayout({ ...layout, showProblems: false })}>×</button></div><Diagnostics diagnostics={analysis.diagnostics} onNavigate={navigate} onFix={showFix} canFix={(item) => !!currentSnapshot && suggestFixes(document, currentSnapshot, item).length > 0} /></section></> : <button className="collapsed-problems" onClick={() => setLayout({ ...layout, showProblems: true })}><span>›</span> Проблемы <span className="count-badge">{analysis.diagnostics.length}</span><span className="spacer" /><span className={analysis.diagnostics.length ? "status-warning" : "status-ok"}>{analysis.diagnostics.length ? `${analysis.diagnostics.length} проблем` : "✓ Ошибок не найдено"}</span></button>}
      {error && <div role="alert" className="error-banner"><span>{error}</span><button aria-label="Закрыть сообщение" onClick={() => setError(null)}>×</button></div>}
    </div></div>
    <StatusBar document={document} position={activeRange.from} problems={analysis.diagnostics.filter((item) => item.severity !== "info").length} />
    {fix && <ChangePreview key={fix.id} document={document} suggestion={fix} options={fixOptions} onApply={(command) => { run(() => command); setFix(null); setFixOptions(undefined); }} onClose={() => { setFix(null); setFixOptions(undefined); }} />}
    {spoilerDialog && <div className="modal-backdrop"><form className="dialog" role="dialog" aria-label="Создать спойлер" onSubmit={(event) => { event.preventDefault(); run(() => { const origin = spoilerOrigin.current; if (!origin || !currentSnapshot || origin.documentId !== documentRef.current.id || origin.revision !== documentRef.current.revision) throw new Error("Документ изменился. Выделите текст заново."); return createSpoiler(documentRef.current, origin, spoilerTitle, currentSnapshot); }); setSpoilerDialog(false); }}><h3>Создать спойлер</h3><label>Заголовок <input autoFocus value={spoilerTitle} onChange={(event) => setSpoilerTitle(event.target.value)} /></label><p>Выделенный текст станет содержимым спойлера.</p><button type="submit">Создать</button><button type="button" onClick={() => setSpoilerDialog(false)}>Отмена</button></form></div>}
    {contextMenu.menu && <ContextMenu {...contextMenu.menu} onClose={contextMenu.close} />}
  </main>;
}
