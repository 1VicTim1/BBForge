import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Editor } from "./editor/Editor";
import { createAnalysisClient, type AnalysisRequest, type AnalysisResponse } from "./analysis/client";
import { createTauriAnalyzer } from "./analysis/tauri";
import { emptyAnalysis, type Analysis, type AnalysisSnapshot, type Diagnostic, type Node, type Span } from "./analysis/types";
import { Builder } from "./builder/Builder";
import type { EditorController } from "./editor/controller";
import { identity, type EditCommand, type SourceRange } from "./document/commands";
import { createSpoiler, moveNode, nestedSpoilerRange, nodeRef, sourceRange, tidyBlankLines, tidyDocumentBlankLines, unwrapNode, type NodeRef } from "./document/structure";
import { allNodes, applyFormat, formatState, formattingActionState, type FormatTag } from "./document/formatting";
import { FormattingToolbar } from "./builder/FormattingToolbar";
import { Properties } from "./builder/Properties";
import { suggestFixes, type FixSuggestion } from "./diagnostics/fixes";
import { QuickFixPopover } from "./diagnostics/QuickFixPopover";
import { BatchPreview, type BatchItem } from "./components/BatchPreview";
import type { VisualRange } from "./builder/selection";
import { createDesktopFiles } from "./document/desktop";
import { completeSave, requestDocumentAction, requestWorkspaceClose, savedSnapshotIsCurrent, type UnsavedChoice } from "./document/lifecycle";
import { decodeDocument, serializeDocument, updateDocumentText, type LineEnding, type DocumentState } from "./document/state";
import { byteToUtf16, createPositionIndex } from "./document/positions";
import { mergeCommands, restrictCommand } from "./document/merge";
import { ProblemsPanel, type JournalEntry } from "./components/ProblemsPanel";
import { StructureTree } from "./components/StructureTree";
import { Preview } from "./components/Preview";
import { Icon } from "./components/Icon";
import type { SelectionRequest } from "./editor/Editor";
import { defaultLayout, loadLayout, saveLayout, type SidebarView, type WorkspaceMode } from "./layout/settings";
import { Workspace } from "./layout/Workspace";
import { StatusBar } from "./layout/StatusBar";
import { TitleBar, type MenuDefinition } from "./layout/TitleBar";
import { ActivityBar } from "./layout/ActivityBar";
import { EditorBar, type Crumb, type EditorView } from "./layout/EditorBar";
import { BlocksPanel, SearchPanel } from "./layout/SidebarPanels";
import { SettingsPage } from "./settings/SettingsPage";
import { buildKeymap, chordFromEvent, keysFor, formatChord, shortcutLabel, type ActionId } from "./keymap/keymap";
import { CommandPalette, type PaletteTag } from "./keymap/CommandPalette";
import { lowercaseTagNames, mergeAdjacentTags, removeEmptyTags, removeEscapedTags, removeRedundantNesting, trimTrailingWhitespace } from "./document/refactor";
import { loadPreferences, preferenceStyle, PreferencesContext, resolvedTheme, savePreferences } from "./settings/preferences";
import { TabStrip } from "./workspace/TabStrip";
import { createWorkspace, workspaceReducer } from "./workspace/session";
import { createWorkspaceStore } from "./workspace/persistence";
import { resolveActiveSelection } from "./commands/activeSelection";
import { menuItems, resolveCommands, type Command, type RefactorScope } from "./commands/registry";
import { buildContextCommands, type MenuSurface } from "./context/commands";
import { ContextMenu } from "./context/ContextMenu";
import { useContextMenu } from "./context/useContextMenu";
import { extractPreviewBbcode, readPreviewSelection, type PreviewSelection } from "./components/previewSelection";
import { nodeLabel } from "./bbcode/labels";
import { activeProfile, builtinOf, profileVersion, subscribeProfiles, tagFor, tagSpec } from "./bbcode/profile";
import "./ide.css";

const example = `[size=4][b]Моя новая тема[/b][/size]\nСоздавайте шапки, в которых легко разобраться.\n\n[spoiler=[b][color=#e5b567]Важная информация![/color][/b]]\nТекст шапки\n[/spoiler]\n\n[spoiler=Инструкции]\n[list][*]Первый шаг[*]Второй шаг[/list]\n[/spoiler]`;

interface ScopeTarget { kind: RefactorScope; range: SourceRange | null; spoiler: NodeRef | null }
interface Refactoring { id: string; action?: ActionId; title: string; hint: string; build(document: DocumentState, snapshot: AnalysisSnapshot, scope: ScopeTarget): EditCommand | null }
const scoped = (build: (document: DocumentState, snapshot: AnalysisSnapshot) => EditCommand | null) => (document: DocumentState, snapshot: AnalysisSnapshot, scope: ScopeTarget) => restrictCommand(build(document, snapshot), scope.kind === "document" ? null : scope.range);
const refactorings: Array<Refactoring | null> = [
  // One command for blank lines: in a spoiler it tidies that spoiler, otherwise the whole document (or the selection).
  { id: "refactor.tidyDocument", action: "refactor.tidyDocument", title: "Убрать пустые строки", hint: "Между спойлерами ([/spoiler][spoiler]) и в начале/конце спойлеров; повторы схлопываются", build: (document, snapshot, scope) => scope.kind === "spoiler" ? scope.spoiler ? tidyBlankLines(document, snapshot, scope.spoiler) : null : restrictCommand(tidyDocumentBlankLines(document, snapshot), scope.kind === "selection" ? scope.range : null) },
  { id: "refactor.trimTrailing", action: "refactor.trimTrailing", title: "Убрать пробелы в конце строк", hint: "Кроме содержимого [code]", build: scoped(trimTrailingWhitespace) },
  null,
  { id: "refactor.removeEmpty", action: "refactor.removeEmpty", title: "Удалить пустые теги", hint: "[b][/b], [color=…] [/color] и подобные; пробелы сохраняются", build: scoped(removeEmptyTags) },
  { id: "refactor.merge", action: "refactor.merge", title: "Склеить соседние одинаковые теги", hint: "[b]a[/b][b]b[/b] → [b]ab[/b]", build: scoped(mergeAdjacentTags) },
  { id: "refactor.redundant", title: "Убрать повторное оформление", hint: "[b]x [b]y[/b][/b] → [b]x y[/b]", build: scoped(removeRedundantNesting) },
  { id: "refactor.lowercase", title: "Привести теги к нижнему регистру", hint: "[B], [SPOILER=…] → [b], [spoiler=…]; параметры не меняются", build: scoped(lowercaseTagNames) },
  null,
  { id: "refactor.escaped", title: "Удалить теги, преобразованные форумом", hint: "Все фрагменты вида &#91;…&#93;", build: scoped(removeEscapedTags) },
];
const OUTLINE_BUILTINS = new Set<string>(["spoiler", "quote", "code", "list", "*", "url", "img", "attachment", "size"]);
const isOutlineTag = (name: string | null) => { const spec = tagSpec(name); return !!spec && (spec.builtin ? OUTLINE_BUILTINS.has(spec.builtin) : spec.role !== "inline"); };
let journalId = 0;

export default function App() {
  const [workspace, dispatchWorkspace] = useReducer(workspaceReducer, decodeDocument(new TextEncoder().encode(example)), createWorkspace);
  const activeSession = workspace.tabs.find((tab) => tab.document.id === workspace.activeId) ?? workspace.tabs[0];
  const document = activeSession.document;
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const analysis = analyses[document.id] ?? emptyAnalysis();
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const log = useCallback((text: string, kind: JournalEntry["kind"]) => setJournal((current) => [...current.slice(-199), { id: ++journalId, time: Date.now(), text, kind }]), []);
  const [error, setErrorState] = useState<string | null>(null);
  const setError = useCallback((message: string | null) => { setErrorState(message); if (message) log(message.replace(/^Error: /, ""), "error"); }, [log]);
  const [selection, setSelection] = useState<SelectionRequest>();
  const [layout, setLayout] = useState(() => loadLayout(localStorage));
  const [showPreview, setShowPreview] = useState(activeSession.ui.showPreview);
  const composition = useRef(false);
  const [controller, setController] = useState<EditorController | null>(null);
  const composing = () => composition.current || !!controller?.isComposing();
  // "mode" + "showPreview" are stored per tab; the UI shows them as a view switch plus the "side by side" toggle.
  const split = layout.mode === "split";
  const view: EditorView = showPreview ? "preview" : layout.mode === "code" ? "code" : "builder";
  const applyView = (mode: WorkspaceMode, preview: boolean) => { if (composing()) return; setLayout((current) => ({ ...current, mode })); setShowPreview(preview); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { mode, showPreview: preview } }); };
  const setView = (next: EditorView) => next === "code" ? applyView("code", false) : applyView(split ? "split" : "builder", next === "preview");
  const toggleSplit = () => split ? applyView("builder", showPreview) : applyView("split", showPreview);
  useEffect(() => { saveLayout(localStorage, layout); }, [layout]);
  const actionsRef = useRef<Partial<Record<ActionId, () => void>>>({}), keyRecording = useRef(false);
  const [palette, setPalette] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(() => loadPreferences(localStorage));
  const [settingsTab, setSettingsTab] = useState<{ open: boolean; active: boolean }>({ open: false, active: false });
  useEffect(() => { savePreferences(localStorage, preferences); }, [preferences]);
  const [prefersDark, setPrefersDark] = useState(() => typeof matchMedia === "undefined" || matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => { if (typeof matchMedia === "undefined") return; const query = matchMedia("(prefers-color-scheme: dark)"), change = () => setPrefersDark(query.matches); query.addEventListener?.("change", change); return () => query.removeEventListener?.("change", change); }, []);
  const theme = resolvedTheme(preferences.theme, prefersDark);
  useEffect(() => { const root = globalThis.document.documentElement; root.dataset.theme = theme; root.dataset.density = preferences.density; }, [theme, preferences.density]);
  useEffect(() => { if (isTauri()) void getCurrentWindow().setDecorations(preferences.systemFrame).catch(() => undefined); }, [preferences.systemFrame]);
  const keyMap = useMemo(() => buildKeymap(preferences.keymap), [preferences.keymap]);
  const restoreSession = useRef(preferences.restoreSession);
  const [snapshots, setSnapshots] = useState<Record<string, AnalysisSnapshot>>({});
  const snapshot = snapshots[document.id] ?? null;
  const [selected, setSelected] = useState<NodeRef | null>(null);
  const [activeRange, setActiveRange] = useState<SourceRange>({ from: 0, to: 0 });
  const [spoilerDialog, setSpoilerDialog] = useState(false);
  const spoilerOrigin = useRef<VisualRange | null>(null);
  const [spoilerTitle, setSpoilerTitle] = useState("Новый спойлер");
  const [quickFix, setQuickFix] = useState<{ diagnostic: Diagnostic | null; title?: string; fixes: FixSuggestion[]; anchor: { x: number; y: number } } | null>(null);
  const [batch, setBatch] = useState<{ title: string; label: string; items: BatchItem[] } | null>(null);
  const [dragHint, setDragHint] = useState<string | null>(null);
  const documentRef = useRef(document);
  documentRef.current = document;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const workspaceStore = useMemo(() => createWorkspaceStore(isTauri() ? invoke : null, localStorage), []);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [previewRange, setPreviewRange] = useState<PreviewSelection | null>(null);
  const contextMenu = useContextMenu();
  useEffect(() => { contextMenu.close(); }, [workspace.activeId, contextMenu.close]);
  useEffect(() => { setSelected(activeSession.ui.selected); setActiveRange(activeSession.ui.codeSelection); setLayout((current) => ({ ...current, mode: activeSession.ui.mode })); setShowPreview(activeSession.ui.showPreview); setPreviewRange(null); setQuickFix(null); setBatch(null); setSpoilerDialog(false); }, [document.id]);
  useEffect(() => { if (!error) return; const timer = setTimeout(() => setErrorState(null), 8000); return () => clearTimeout(timer); }, [error]);
  useEffect(() => {
    let active = true;
    if (!restoreSession.current) { setWorkspaceReady(true); return; }
    void workspaceStore.load().then((restored) => {
      if (active && restored) dispatchWorkspace({ type: "restore", workspace: restored });
    }).catch((reason) => setError(`Не удалось восстановить сеанс: ${String(reason)}`)).finally(() => { if (active) setWorkspaceReady(true); });
    return () => { active = false; };
  }, [workspaceStore]);
  useEffect(() => { if (workspaceReady) workspaceStore.schedule(workspace); }, [workspace, workspaceReady, workspaceStore]);
  const profileRevision = useSyncExternalStore(subscribeProfiles, profileVersion);
  const analyze = useMemo(() => isTauri()
    ? createTauriAnalyzer<Analysis>(invoke, () => activeProfile().analyzer)
    : window.__BBFORGE_ANALYZE__ ?? (async (request: AnalysisRequest): Promise<AnalysisResponse<Analysis>> => ({ ...request, analysis: emptyAnalysis() })), []);
  const client = useMemo(() => createAnalysisClient(analyze, (result, response) => {
    setAnalyses((current) => ({ ...current, [response.documentId]: result }));
    setSnapshots((current) => ({ ...current, [response.documentId]: response }));
  }, preferences.analysisDelay, (reason) => setError(`Ошибка анализа: ${String(reason)}`)), [analyze, preferences.analysisDelay]);
  const files = useMemo(() => createDesktopFiles(
    invoke,
    async () => await openDialog({ multiple: false, filters: [{ name: "BBCode", extensions: ["bbcode", "txt"] }] }) as string | null,
    async () => await saveDialog({ defaultPath: "post.bbcode", filters: [{ name: "BBCode", extensions: ["bbcode", "txt"] }] }),
  ), []);
  useEffect(() => {
    client.update({ source: document.text, documentId: document.id, revision: document.revision });
  }, [client, document.id, document.revision, document.text, profileRevision]);
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
  const execute = (command: EditCommand) => { if (composing()) throw new Error("Завершите ввод текста перед изменением документа"); if (!controller) throw new Error("Редактор загружается"); controller.execute(command); };
  const historyAction = (redo: boolean) => { if (composing()) return; if (redo) controller?.redo(); else controller?.undo(); };
  const run = (build: () => EditCommand, journaled = false) => { try { const command = build(); execute(command); setError(null); if (journaled) log(command.label, "change"); } catch (reason) { setError(String(reason)); } };
  const currentSnapshot = snapshot?.documentId === document.id && snapshot.revision === document.revision ? snapshot : null;
  const commandSelection = () => resolveActiveSelection(activeSession, controller);
  const spoilerSelection = () => currentSnapshot ? nestedSpoilerRange(documentRef.current, currentSnapshot, commandSelection(), selected) : commandSelection();
  /** Anchor for popovers: the code cursor when the code is visible, otherwise the centre of the editor. */
  const anchorAt = (position: number) => {
    const coords = view === "code" || split ? controller?.view.coordsAtPos(Math.min(position, controller.view.state.doc.length)) : null;
    if (coords && coords.bottom > 0) return { x: coords.left, y: coords.bottom };
    const box = globalThis.document.querySelector(".editing-area")?.getBoundingClientRect();
    return box ? { x: box.left + box.width / 2 - 260, y: box.top + 60 } : { x: 200, y: 160 };
  };
  const format = (tag: FormatTag, parameter?: string) => { if (composing()) return; if (currentSnapshot) {
    const range = commandSelection();
    try {
      const command = applyFormat(documentRef.current, currentSnapshot, range, tag, parameter);
      if (formatState(currentSnapshot, range, tag) === "mixed") setQuickFix({ diagnostic: null, title: "Смешанное оформление в выделении", fixes: [{ id: "format", title: "Применить ко всему выделению", command }], anchor: anchorAt(range.from) });
      else run(() => command);
    } catch (reason) { setError(String(reason)); }
  } };
  const formattingStates = Object.fromEntries((["b", "i", "u", "s", "color", "background", "url", "quote", "code", "list"] as FormatTag[]).map((tag) => [tag, formattingActionState(document, currentSnapshot, commandSelection(), tag)]));
  const fixesFor = (item: Diagnostic) => currentSnapshot ? suggestFixes(document, currentSnapshot, item) : [];
  const showFix = (diagnostic?: Diagnostic, anchor?: { x: number; y: number }) => {
    if (!currentSnapshot) return;
    const at = activeRange.from;
    const item = diagnostic ?? analysis.diagnostics.find((entry) => { const range = sourceRange(document, entry.span); return at >= range.from && at <= range.to; }) ?? analysis.diagnostics[0];
    const suggestions = item ? fixesFor(item) : [];
    if (suggestions.length) setQuickFix({ diagnostic: item, fixes: suggestions, anchor: anchor ?? anchorAt(sourceRange(document, item.span).from) });
    else setError(item ? "Для этой ошибки нет автоматического исправления. Исправьте её в коде." : "В этом месте нет проблем");
  };
  const showFixAt = (position: number) => {
    const item = analysis.diagnostics.find((entry) => { const range = sourceRange(document, entry.span); return position >= range.from && position <= Math.max(range.to, range.from + 1); });
    if (item) showFix(item); else setError("В этом месте нет проблем");
  };
  // "Fix the same everywhere": the preferred fix of every problem of this rule whose fix is of the same kind.
  const sameEverywhere = (diagnostic: Diagnostic | null) => (fix: FixSuggestion) => {
    if (!diagnostic || !currentSnapshot || fix.needsParameter) return null;
    const kind = fix.id.replace(/-\d.*$/, "");
    const fixes = analysis.diagnostics.filter((item) => item.code === diagnostic.code).map((item) => fixesFor(item).find((candidate) => candidate.id.replace(/-\d.*$/, "") === kind && !candidate.needsParameter)).filter((item): item is FixSuggestion => !!item);
    const unique = [...new Map(fixes.map((item) => [item.id, item])).values()];
    const { command } = mergeCommands(document, unique.map((item) => item.command), `${fix.title}: везде`);
    return command ? { count: unique.length, apply: () => { setQuickFix(null); run(() => command, true); } } : null;
  };
  const unambiguousFixes = useMemo(() => {
    if (!currentSnapshot) return [] as Array<{ fix: FixSuggestion; diagnostic: Diagnostic }>;
    const seen = new Set<string>(), result: Array<{ fix: FixSuggestion; diagnostic: Diagnostic }> = [];
    for (const diagnostic of analysis.diagnostics) {
      if (diagnostic.severity === "info") continue;
      const fix = suggestFixes(document, currentSnapshot, diagnostic)[0];
      if (fix && !fix.needsParameter && !seen.has(fix.id)) { seen.add(fix.id); result.push({ fix, diagnostic }); }
    }
    return result;
  }, [currentSnapshot, analysis.diagnostics, document]);
  const showAllFixes = () => {
    if (!currentSnapshot) return;
    if (!unambiguousFixes.length) { setError("Нет доступных однозначных исправлений"); return; }
    setBatch({ title: "Исправить однозначные ошибки", label: "Исправить однозначные ошибки", items: unambiguousFixes.map(({ fix, diagnostic }) => ({ id: fix.id, title: fix.title, detail: `${diagnostic.line}:${diagnostic.column} · ${diagnostic.message}`, command: fix.command })) });
  };
  const navigateRange = (range: SourceRange) => { if (!split && view !== "code") applyView("split", showPreview); setSelection({ ...range, nonce: Date.now() }); };
  const visualNavigate = (range: SourceRange) => { if (!split) applyView("split", false); setSelection({ ...range, nonce: Date.now() }); };
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
    // Quick fixes for the problem under the pointer (code) or at the captured position (builder).
    const at = surface === "code" ? controller?.positionAt(event.clientX, event.clientY) ?? captured.from : captured.from;
    const here = currentSnapshot ? analysis.diagnostics.filter((item) => { const range = sourceRange(documentRef.current, item.span); return at >= range.from && at <= Math.max(range.to, range.from + 1); }) : [];
    const anchor = { x: event.clientX, y: event.clientY };
    const quickFixes = here.flatMap((item) => suggestFixes(documentRef.current, currentSnapshot!, item).slice(0, 3).map((fix) => ({
      id: `fix-${fix.id}`, label: `Исправить: ${fix.title}${fix.impact ? ` (${fix.impact})` : ""}`, run: checked(() => { if (fix.needsParameter) setQuickFix({ diagnostic: item, fixes: [fix], anchor }); else run(() => fix.command, true); }),
    })));
    const commands = buildContextCommands({ surface, editable: surface === "code" || surface === "builder", hasSelection: captured.from !== captured.to || Boolean(window.getSelection()?.toString()), hasBlock: Boolean(selected) || Boolean(target.closest("details,[data-source-span]")), hasDiagnostic: analysis.diagnostics.length > 0 }, handlers, quickFixes);
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
      log(`Сохранено: ${saved.path.split(/[\\/]/).at(-1)}`, "info");
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

  const showDocuments = () => setSettingsTab((current) => ({ ...current, active: false }));
  const newDocument = async () => {
    if (composing()) { setError("Завершите ввод текста перед сменой вкладки"); return; }
    showDocuments();
    dispatchWorkspace({ type: "open", session: { document: decodeDocument(new Uint8Array()) } });
  };
  const openDocument = async () => {
    if (!isTauri()) return;
    if (composing()) { setError("Завершите ввод текста перед сменой вкладки"); return; }
    try {
      const opened = await files.openDocument();
      if (opened) { showDocuments(); dispatchWorkspace({ type: "open", session: { document: decodeDocument(opened.bytes, opened.path), diskFingerprint: opened.fingerprint } }); setError(null); }
    } catch (reason) { setError(String(reason)); }
  };

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || keyRecording.current || (event as KeyboardEvent & { bbforgeInternal?: boolean }).bbforgeInternal) return;
      const chord = chordFromEvent(event), id = chord ? keyMap.get(chord) : undefined;
      if (!id) return;
      const target = event.target as HTMLElement, inCode = !!target.closest(".cm-editor"), inField = !!target.closest("input, textarea, select") && !inCode;
      const editing = id.startsWith("edit.") || id.startsWith("format.");
      if (inField && (editing || id === "tab.next" || id === "tab.previous")) return;
      // CodeMirror owns undo/redo inside the code editor (including the Russian-layout physical keys).
      if (inCode && (id === "edit.undo" || id === "edit.redo")) return;
      if (composing()) return;
      event.preventDefault(); event.stopPropagation();
      actionsRef.current[id]?.();
    };
    window.addEventListener("keydown", shortcuts, true);
    return () => window.removeEventListener("keydown", shortcuts, true);
  });

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      if (composing()) { setError("Завершите ввод текста перед закрытием"); return; }
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

  const closeDocument = async (documentId: string) => {
    const tab = workspaceRef.current.tabs.find((item) => item.document.id === documentId);
    if (!tab) return;
    if (!await requestDocumentAction(tab.document.revision !== tab.document.savedRevision, chooseUnsaved, () => saveTab(documentId))) return;
    controller?.discard(documentId);
    dispatchWorkspace({ type: "close", documentId });
    if (workspaceRef.current.tabs.length === 1) dispatchWorkspace({ type: "open", session: { document: decodeDocument(new Uint8Array()) } });
  };
  const navigate = (span: Span) => { const range = { from: byteToUtf16(document.text, span.start), to: byteToUtf16(document.text, span.end) }; setActiveRange(range); visualNavigate(range); };
  const selectNode = (span: Span) => { if (currentSnapshot) { const reference = { ...identity(document), span }; setSelected(reference); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { selected: reference } }); } navigate(span); };
  const focusSearch = () => { if (view !== "code" && !split) setView("code"); requestAnimationFrame(() => { controller?.select(activeRange); const search = Object.assign(new KeyboardEvent("keydown", { key: "f", code: "KeyF", ctrlKey: true, bubbles: true }), { bbforgeInternal: true }); globalThis.document.activeElement?.dispatchEvent(search); }); };
  // The scope a refactoring would use: the selection, the spoiler around the cursor (or the selected one), or the document.
  const currentSpoiler = (): NodeRef | null => {
    if (!currentSnapshot) return null;
    if (selected) { try { const node = allNodes(currentSnapshot.analysis.nodes).find((item) => item.span.start === selected.span.start && item.span.end === selected.span.end); if (builtinOf(node?.name) === "spoiler") return selected; } catch { /* stale */ } }
    const index = createPositionIndex(document.text), at = index.utf16ToByte(activeRange.from);
    const spoiler = allNodes(currentSnapshot.analysis.nodes).filter((node) => builtinOf(node.name) === "spoiler" && node.wellFormed && node.span.start <= at && at < node.span.end).at(-1);
    return spoiler ? nodeRef(currentSnapshot, spoiler) : null;
  };
  const scopeTarget = (kind: RefactorScope): ScopeTarget => {
    const spoiler = kind === "spoiler" ? currentSpoiler() : null;
    const range = kind === "selection" ? commandSelection() : spoiler ? sourceRange(document, spoiler.span) : null;
    return { kind, range: range && range.from < range.to ? range : null, spoiler };
  };
  const availableScopes: RefactorScope[] = ["document", ...(commandSelection().from < commandSelection().to ? ["selection" as const] : []), ...(currentSpoiler() ? ["spoiler" as const] : [])];
  const refactorCommand = (item: Refactoring, scope: RefactorScope = "document") => {
    if (!currentSnapshot) return null;
    const target = scopeTarget(scope);
    if (scope !== "document" && !target.range && !target.spoiler) return null;
    try { return item.build(documentRef.current, currentSnapshot, target); } catch { return null; }
  };
  const refactor = (item: Refactoring, scope: RefactorScope = "document") => { if (!currentSnapshot) return; run(() => { const command = refactorCommand(item, scope); if (!command) throw new Error(`${item.title}: изменять нечего`); return command; }, true); };
  const cleanup = () => {
    if (!currentSnapshot) return;
    const items = refactorings.filter((item): item is Refactoring => item !== null).map((item) => ({ item, command: refactorCommand(item) })).filter((entry): entry is { item: Refactoring; command: EditCommand } => !!entry.command).map(({ item, command }) => ({ id: item.id, title: item.title, detail: item.hint, command }));
    if (!items.length) { setError("Очистка документа: изменять нечего"); return; }
    setBatch({ title: "Очистка документа", label: "Очистка документа", items });
  };
  // Scrolling must not re-render the app on every frame: remember the position and store it once scrolling settles.
  const pendingScroll = useRef<{ documentId: string; ui: Record<string, unknown> } | null>(null), scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushScroll = useCallback(() => {
    if (scrollTimer.current) { clearTimeout(scrollTimer.current); scrollTimer.current = null; }
    const pending = pendingScroll.current; pendingScroll.current = null;
    if (pending) dispatchWorkspace({ type: "updateUi", documentId: pending.documentId, ui: pending.ui });
  }, []);
  const deferScroll = useCallback((documentId: string, ui: Record<string, unknown>) => {
    if (pendingScroll.current && pendingScroll.current.documentId !== documentId) flushScroll();
    pendingScroll.current = { documentId, ui: { ...pendingScroll.current?.ui, ...ui } };
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(flushScroll, 250);
  }, [flushScroll]);
  useEffect(() => () => flushScroll(), [document.id, flushScroll]);
  const openSpoilerDialog = () => { if (composing()) return; spoilerOrigin.current = { ...identity(documentRef.current), ...spoilerSelection() }; setSpoilerDialog(true); };
  const switchTab = (step: number) => { const tabs = workspaceRef.current.tabs, at = tabs.findIndex((tab) => tab.document.id === workspaceRef.current.activeId); const next = tabs[(at + step + tabs.length) % tabs.length]; if (next) { showDocuments(); dispatchWorkspace({ type: "activate", documentId: next.document.id }); } };
  const openSettings = () => setSettingsTab({ open: true, active: true });
  const toggleSidebar = (sidebarView: SidebarView) => setLayout((current) => current.showOutline && current.sidebarView === sidebarView ? { ...current, showOutline: false } : { ...current, showOutline: true, sidebarView });
  const insertAtCursor = (text: string, label: string) => { const range = commandSelection(); run(() => ({ ...identity(documentRef.current), label, changes: [{ from: range.from, to: range.to, insert: text.replace("$", documentRef.current.text.slice(range.from, range.to)) }] })); };
  const actions: Record<ActionId, () => void> = {
    "file.new": () => void newDocument(), "file.open": () => void openDocument(), "file.save": () => void saveCurrent(), "file.saveAs": () => void saveCurrent(true),
    "file.close": () => { if (settingsTab.active) setSettingsTab({ open: false, active: false }); else void closeDocument(workspaceRef.current.activeId); },
    "file.closeAll": () => void (async () => { for (const tab of [...workspaceRef.current.tabs]) await closeDocument(tab.document.id); })(),
    "tab.next": () => switchTab(1), "tab.previous": () => switchTab(-1),
    "edit.undo": () => historyAction(false), "edit.redo": () => historyAction(true), "edit.find": focusSearch, "edit.fix": () => showFix(), "edit.fixAll": showAllFixes,
    "format.bold": () => format("b"), "format.italic": () => format("i"), "format.underline": () => format("u"), "format.strike": () => format("s"),
    "format.link": () => window.dispatchEvent(new Event("bbforge:link")), "format.quote": () => format("quote"), "format.code": () => format("code"), "format.list": () => format("list"), "format.spoiler": openSpoilerDialog,
    "view.code": () => setView("code"), "view.split": toggleSplit, "view.builder": () => setView("builder"), "view.preview": () => setView(view === "preview" ? "builder" : "preview"),
    "view.structure": () => toggleSidebar("outline"), "view.search": () => setLayout((current) => ({ ...current, showOutline: true, sidebarView: "search" })),
    "view.problems": () => setLayout((current) => ({ ...current, showProblems: !current.showProblems })), "view.inspector": () => setLayout((current) => ({ ...current, showInspector: !current.showInspector })),
    "refactor.tidyDocument": () => refactor(refactorings[0]!), "refactor.trimTrailing": () => refactor(refactorings[1]!),
    "refactor.removeEmpty": () => refactor(refactorings[3]!), "refactor.merge": () => refactor(refactorings[4]!), "refactor.cleanup": cleanup,
    "app.settings": openSettings, "app.findAction": () => setPalette(">"), "app.commandPalette": () => setPalette(">"), "app.quickOpen": () => setPalette(""), "app.goToLine": () => setPalette(":"),
  };
  actionsRef.current = actions;
  const key = (id: ActionId) => shortcutLabel(id, preferences.keymap);
  const enabled = !!currentSnapshot;
  const refactorCount = (item: Refactoring) => (scope?: RefactorScope) => refactorCommand(item, scope)?.changes.length ?? (currentSnapshot ? 0 : null);
  const registry: Command[] = resolveCommands([
    { id: "file.new", action: "file.new", title: "Новый документ", category: "Файл", icon: "plus", run: actions["file.new"] },
    { id: "file.open", action: "file.open", title: "Открыть…", category: "Файл", enabled: isTauri(), run: actions["file.open"] },
    { id: "file.save", action: "file.save", title: "Сохранить", category: "Файл", enabled: isTauri(), run: actions["file.save"] },
    { id: "file.saveAs", action: "file.saveAs", title: "Сохранить как…", category: "Файл", enabled: isTauri(), run: actions["file.saveAs"] },
    { id: "export.copy", title: "Копировать BBCode документа", category: "Файл", icon: "copy", run: () => void copyText(documentRef.current.text).then(() => log("BBCode скопирован в буфер обмена", "info")) },
    { id: "file.close", action: "file.close", title: "Закрыть вкладку", category: "Файл", run: actions["file.close"] },
    { id: "file.closeAll", action: "file.closeAll", title: "Закрыть все документы", category: "Файл", run: actions["file.closeAll"] },
    { id: "app.settings", action: "app.settings", title: "Настройки…", category: "Приложение", icon: "settings", run: openSettings },
    { id: "edit.undo", action: "edit.undo", title: "Отменить", category: "Правка", icon: "undo", run: actions["edit.undo"] },
    { id: "edit.redo", action: "edit.redo", title: "Повторить", category: "Правка", icon: "redo", run: actions["edit.redo"] },
    { id: "edit.find", action: "edit.find", title: "Найти в коде", category: "Правка", icon: "search", run: focusSearch },
    { id: "edit.fix", action: "edit.fix", title: "Исправить в позиции…", category: "Правка", icon: "lightbulb", enabled, run: actions["edit.fix"] },
    { id: "edit.fixAll", action: "edit.fixAll", title: "Исправить однозначные ошибки…", category: "Правка", icon: "wand", enabled: enabled && unambiguousFixes.length > 0, count: () => currentSnapshot ? unambiguousFixes.length : null, run: showAllFixes },
    { id: "app.commandPalette", action: "app.commandPalette", title: "Палитра команд…", category: "Приложение", hidden: true, run: () => setPalette(">") },
    { id: "app.quickOpen", action: "app.quickOpen", title: "Перейти к файлу…", category: "Приложение", run: () => setPalette("") },
    { id: "app.goToLine", action: "app.goToLine", title: "Перейти к строке…", category: "Приложение", run: () => setPalette(":") },
    { id: "view.code", action: "view.code", title: "Вид «Код»", category: "Вид", icon: "code", run: actions["view.code"] },
    { id: "view.builder", action: "view.builder", title: "Вид «Конструктор»", category: "Вид", icon: "builder", run: actions["view.builder"] },
    { id: "view.preview", action: "view.preview", title: "Вид «Предпросмотр»", category: "Вид", icon: "preview", run: () => setView("preview") },
    { id: "view.split", action: "view.split", title: split ? "Убрать код сбоку" : "Рядом с кодом", category: "Вид", icon: "columns", run: toggleSplit },
    { id: "view.structure", action: "view.structure", title: layout.showOutline && layout.sidebarView === "outline" ? "Скрыть структуру" : "Показать структуру", category: "Вид", icon: "outline", run: actions["view.structure"] },
    { id: "view.search", action: "view.search", title: "Поиск по документу", category: "Вид", icon: "search", run: actions["view.search"] },
    { id: "view.blocks", title: "Панель «Блоки»", category: "Вид", icon: "blocks", run: () => toggleSidebar("blocks") },
    { id: "view.problems", action: "view.problems", title: layout.showProblems ? "Скрыть проблемы" : "Показать проблемы", category: "Вид", icon: "warning", run: actions["view.problems"] },
    { id: "view.inspector", action: "view.inspector", title: layout.showInspector ? "Скрыть свойства" : "Показать свойства", category: "Вид", icon: "panelRight", run: actions["view.inspector"] },
    { id: "view.theme", title: theme === "dark" ? "Светлая тема" : "Тёмная тема", category: "Вид", icon: theme === "dark" ? "sun" : "moon", run: () => setPreferences((current) => ({ ...current, theme: theme === "dark" ? "light" : "dark" })) },
    { id: "view.density", title: preferences.density === "compact" ? "Обычная плотность" : "Компактный режим", category: "Вид", run: () => setPreferences((current) => ({ ...current, density: current.density === "compact" ? "comfortable" : "compact" })) },
    ...refactorings.filter((item): item is Refactoring => item !== null).map((item): Command => ({ id: item.id, action: item.action, title: item.title, category: "Рефакторинг", hint: item.hint, scoped: true, enabled, count: refactorCount(item), run: (scope) => refactor(item, scope) })),
    { id: "refactor.cleanup", action: "refactor.cleanup", title: "Очистка документа…", category: "Очистка", icon: "wand", enabled, hint: "Все операции рефакторинга с общим превью", run: cleanup },
    { id: "app.resetLayout", title: "Восстановить раскладку", category: "Инструменты", run: () => { setLayout({ ...defaultLayout }); setShowPreview(false); } },
  ], (id) => keysFor(id, preferences.keymap).map(formatChord));
  const menus: MenuDefinition[] = [
    { title: "Файл", items: menuItems(registry, ["file.new", "file.open", null, "file.save", "file.saveAs", "export.copy", null, "file.close", "file.closeAll", null, "app.settings"]) },
    { title: "Правка", items: menuItems(registry, ["edit.undo", "edit.redo", null, "edit.find", "app.goToLine", null, "edit.fix", "edit.fixAll", null, "app.commandPalette"]).map((item) => item?.id === "app.commandPalette" ? { ...item, title: "Найти действие…" } : item) },
    { title: "Вид", items: menuItems(registry, ["view.code", "view.builder", "view.preview", "view.split", null, "view.structure", "view.search", "view.blocks", "view.problems", "view.inspector", null, "view.theme", "view.density"]) },
    { title: "Рефакторинг", items: [...refactorings.map((item) => item === null ? null : registry.find((command) => command.id === item.id)!), null, registry.find((command) => command.id === "refactor.cleanup")!] },
    { title: "Инструменты", items: menuItems(registry, ["app.resetLayout", null, "edit.fixAll", "refactor.cleanup"]) },
  ];
  const appearance = preferenceStyle(preferences);
  const counts = { errors: analysis.diagnostics.filter((item) => item.severity === "error").length, warnings: analysis.diagnostics.filter((item) => item.severity === "warning").length };
  const synced = !!snapshot && snapshot.documentId === document.id && snapshot.revision === document.revision;
  const documentName = document.path?.split(/[\\/]/).at(-1) ?? "untitled.bbcode";
  // Breadcrumbs: the structural blocks around the cursor.
  const crumbs: Crumb[] = useMemo(() => {
    if (!currentSnapshot) return [];
    const index = createPositionIndex(currentSnapshot.source), at = index.utf16ToByte(Math.min(activeRange.from, currentSnapshot.source.length)), path: Node[] = [];
    let level = currentSnapshot.analysis.nodes;
    for (let found = true; found;) { found = false; for (const node of level) if (node.kind === "element" && node.span.start <= at && at < node.span.end) { if (isOutlineTag(node.name)) path.push(node); level = node.children; found = true; break; } }
    return path.slice(-4).map((node) => ({ tag: node.name ?? "", label: ["spoiler", "url", "img"].includes(builtinOf(node.name) ?? "") ? nodeLabel(node, currentSnapshot.source, index) : "", onClick: () => selectNode(node.span) }));
  }, [currentSnapshot, activeRange.from]);
  const paletteTags: PaletteTag[] = useMemo(() => {
    if (!currentSnapshot || palette === null) return [];
    const index = createPositionIndex(currentSnapshot.source);
    return allNodes(currentSnapshot.analysis.nodes).filter((node) => node.kind === "element").map((node) => { const from = index.byteToUtf16(node.span.start); return { key: String(node.span.start) + node.name, tag: node.name ?? "", label: nodeLabel(node, currentSnapshot.source, index) || node.name || "", line: (currentSnapshot.source.slice(0, from).match(/\n/g)?.length ?? 0) + 1, span: node.span }; });
  }, [currentSnapshot, palette]);
  const blockActions = [
    { id: "spoiler", title: "Спойлер", description: "Сворачиваемый блок с заголовком; оборачивает выделение", icon: "spoiler" as const, tag: `[${tagFor("spoiler")}=…]`, run: openSpoilerDialog, disabled: !enabled },
    { id: "quote", title: "Цитата", description: "Оформить выделение как цитату", icon: "quote" as const, tag: `[${tagFor("quote")}]`, run: () => format("quote"), disabled: !enabled },
    { id: "code", title: "Блок кода", description: "Моноширинный текст без разметки", icon: "code" as const, tag: `[${tagFor("code")}]`, run: () => format("code"), disabled: !enabled },
    { id: "list", title: "Список", description: "Каждая строка выделения станет пунктом", icon: "list" as const, tag: `[${tagFor("list")}][${tagFor("*")}]`, run: () => format("list"), disabled: !enabled },
    { id: "url", title: "Ссылка", description: "Сделать выделенный текст ссылкой", icon: "link" as const, tag: `[${tagFor("url")}=…]`, run: () => window.dispatchEvent(new Event("bbforge:link")), disabled: !enabled },
    { id: "img", title: "Изображение", description: "Вставить картинку по адресу в позицию курсора", icon: "image" as const, tag: `[${tagFor("img")}]…[/${tagFor("img")}]`, run: () => insertAtCursor(`[${tagFor("img")}]https://$[/${tagFor("img")}]`, "Вставить изображение"), disabled: !enabled },
  ];
  const sidebar = !layout.showOutline ? null
    : layout.sidebarView === "search" ? { title: "Поиск", content: <SearchPanel text={document.text} onNavigate={(range) => { setActiveRange(range); navigateRange(range); }} /> }
    : layout.sidebarView === "blocks" ? { title: "Блоки", content: <BlocksPanel actions={blockActions} /> }
    : { title: "Структура", content: <StructureTree busy={!currentSnapshot} identity={identity(document)} nodes={currentSnapshot?.analysis.nodes ?? snapshot?.analysis.nodes ?? []} source={currentSnapshot?.source ?? snapshot?.source ?? document.text} diagnostics={currentSnapshot ? analysis.diagnostics : []} selected={selected?.span} cursor={activeRange.from} onDragHint={setDragHint} onNavigate={selectNode} onMove={(source, target, placement) => { if (currentSnapshot) run(() => moveNode(document, currentSnapshot, source, { node: { ...identity(document), span: target }, placement })); }} /> };
  const windowControls = isTauri() && !preferences.systemFrame ? { minimize: () => void getCurrentWindow().minimize(), toggleMaximize: () => void getCurrentWindow().toggleMaximize(), close: () => void getCurrentWindow().close() } : null;
  return <PreferencesContext.Provider value={preferences}><main className={`app ${appearance.className}`} style={appearance.style as React.CSSProperties} onContextMenu={openContextMenu}>
    <TitleBar menus={menus} documentName={documentName} onCommandCenter={() => setPalette("")} commandCenterKey={key("app.quickOpen")} onSettings={openSettings} settingsKey={key("app.settings")} windowControls={windowControls}
      exportPanel={{ diagnostics: analysis.diagnostics, onNavigate: (item) => navigate(item.span), actions: [
        { id: "copy", title: "Копировать BBCode", hint: "Весь документ в буфер обмена — для вставки в редактор форума", icon: "copy", run: () => void copyText(documentRef.current.text).then(() => log("BBCode скопирован в буфер обмена", "info")) },
        { id: "save", title: "Сохранить как .bbcode…", hint: isTauri() ? "Текстовый файл с исходной разметкой" : "Доступно в настольном приложении", icon: "file", disabled: !isTauri(), run: () => void saveCurrent(true) },
      ] }} />
    <div className="ide-shell">
      <ActivityBar sidebar={layout.showOutline ? layout.sidebarView : null} onSidebar={toggleSidebar} problems={{ ...counts, open: layout.showProblems, onToggle: () => setLayout((current) => ({ ...current, showProblems: !current.showProblems })) }} onSettings={openSettings} settingsActive={settingsTab.active} />
      <Workspace layout={layout} setLayout={setLayout} view={view} split={split} sidebar={sidebar}
        tabs={<div className="document-tabs-row"><TabStrip tabs={workspace.tabs} activeId={settingsTab.active ? "settings" : workspace.activeId} onActivate={(documentId) => { if (!composing()) { showDocuments(); dispatchWorkspace({ type: "activate", documentId }); } }} onClose={(documentId) => void closeDocument(documentId)} onReorder={(documentId, to) => dispatchWorkspace({ type: "reorder", documentId, to })}
          extra={settingsTab.open ? [{ id: "settings", title: "Настройки", icon: "settings", active: settingsTab.active, onActivate: openSettings, onClose: () => setSettingsTab({ open: false, active: false }) }] : []} />
          <button className="new-tab-button" aria-label="Новый документ" title={`Новый документ${key("file.new") ? ` (${key("file.new")})` : ""}`} onClick={() => void newDocument()}><Icon name="plus" /></button></div>}
        editorBar={<EditorBar crumbs={crumbs} view={view} split={split} onView={setView} onSplit={toggleSplit} keys={{ code: key("view.code"), builder: key("view.builder"), preview: key("view.preview"), split: key("view.split") }} />}
        toolbar={<FormattingToolbar synced={synced} disabled={!currentSnapshot} states={formattingStates} onFormat={format} onSpoiler={openSpoilerDialog} onUndo={() => historyAction(false)} onRedo={() => historyAction(true)} />}
        page={settingsTab.active ? <SettingsPage value={preferences} onChange={setPreferences} desktop={isTauri()} onRecording={(active) => { keyRecording.current = active; }} onResetLayout={() => { setLayout({ ...defaultLayout }); setShowPreview(false); }} /> : undefined}
        editor={<Editor dark={theme === "dark"} document={document} snapshot={currentSnapshot} value={document.text} endings={document.endings} storedSelection={activeSession.ui.codeSelection} scroll={activeSession.ui.codeScroll} onScrollPosition={(codeScroll) => deferScroll(document.id, { codeScroll })} onChange={changeSource} onReady={setController} onQuickFix={showFixAt} onSelection={(range) => { setActiveRange(range); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { codeSelection: range, activeSurface: "code" } }); }} selectionRequest={selection} />}
        builder={<Builder key={document.id} document={document} snapshot={snapshot} selectedSpan={selected?.span} scroll={activeSession.ui.builderScroll} storedSelection={activeSession.ui.visualSelection} restoreFocus={activeSession.ui.activeSurface === "builder"} onScrollPosition={(builderScroll) => deferScroll(document.id, { builderScroll })} execute={execute} getDocument={() => documentRef.current} onSelect={(reference) => { setSelected(reference); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { selected: reference } }); }} onRange={(range: VisualRange) => { setActiveRange(range); dispatchWorkspace({ type: "updateUi", documentId: document.id, ui: { visualSelection: range, activeSurface: "builder" } }); }} onNavigate={visualNavigate} onFix={(range) => showFixAt(range.from)} onDragHint={setDragHint} onError={setError} onComposition={(active) => { composition.current = active; }} />}
        preview={<Preview document={document} source={currentSnapshot?.source ?? document.text} nodes={currentSnapshot?.analysis.nodes ?? []} scroll={activeSession.ui.previewScroll} onScrollPosition={(previewScroll) => deferScroll(document.id, { previewScroll })} onSelection={setPreviewRange} onNavigate={navigate} openExternal={(url) => { if (isTauri()) void openUrl(url).catch((reason) => setError(String(reason))); }} />}
        problems={layout.showProblems ? <ProblemsPanel diagnostics={analysis.diagnostics} journal={journal} onClearJournal={() => setJournal([])} onNavigate={(item) => navigate(item.span)} onQuickFix={(item) => showFix(item)} canFix={(item) => !!currentSnapshot && fixesFor(item).length > 0} unambiguous={unambiguousFixes.length} onFixAll={showAllFixes} onClose={() => setLayout((current) => ({ ...current, showProblems: false }))} /> : null}
        inspector={layout.showInspector ? <><h2 className="inspector-heading">Свойства<button className="icon-button panel-close" aria-label="Скрыть свойства" onClick={() => setLayout((current) => ({ ...current, showInspector: false }))}><Icon name="close" /></button></h2><div className="inspector-body">
          {selected && currentSnapshot ? <Properties document={document} snapshot={currentSnapshot} selected={selected} execute={execute} onError={setError} onNavigate={() => visualNavigate(sourceRange(document, selected.span))} />
            : <div className="selection-hint"><p>Выберите блок в конструкторе или в структуре, чтобы изменить его свойства.</p><p>Выделите текст, чтобы оформить его.</p><p><kbd>Alt</kbd>+<kbd>Enter</kbd> — исправления в позиции курсора.</p></div>}
        </div></> : null} />
    </div>
    {error && <div role="alert" className="error-banner"><span>{error.replace(/^Error: /, "")}</span><button aria-label="Закрыть сообщение" onClick={() => setErrorState(null)}><Icon name="close" /></button></div>}
    <StatusBar document={document} position={activeRange.from} errors={counts.errors} warnings={counts.warnings} synced={synced} hint={dragHint} onProblems={() => setLayout((current) => ({ ...current, showProblems: !current.showProblems }))} onGoToLine={() => setPalette(":")} />
    {quickFix && <QuickFixPopover key={`${quickFix.diagnostic?.span.start}-${quickFix.fixes.map((item) => item.id).join()}`} document={document} diagnostic={quickFix.diagnostic} title={quickFix.title} fixes={quickFix.fixes} anchor={quickFix.anchor} sameEverywhere={sameEverywhere(quickFix.diagnostic)} onApply={(command) => { setQuickFix(null); run(() => command, true); }} onClose={() => setQuickFix(null)} />}
    {batch && <BatchPreview key={batch.title} title={batch.title} label={batch.label} document={document} items={batch.items} onApply={(command) => { setBatch(null); run(() => command, true); }} onClose={() => setBatch(null)} />}
    {spoilerDialog && <div className="modal-backdrop"><form className="dialog" role="dialog" aria-label="Создать спойлер" onSubmit={(event) => { event.preventDefault(); run(() => { const origin = spoilerOrigin.current; if (!origin || !currentSnapshot || origin.documentId !== documentRef.current.id || origin.revision !== documentRef.current.revision) throw new Error("Документ изменился. Выделите текст заново."); return createSpoiler(documentRef.current, origin, spoilerTitle, currentSnapshot); }); setSpoilerDialog(false); }}><h3>Создать спойлер</h3><label>Заголовок <input autoFocus value={spoilerTitle} onChange={(event) => setSpoilerTitle(event.target.value)} /></label><p>Выделенный текст станет содержимым спойлера.</p><footer><button type="button" onClick={() => setSpoilerDialog(false)}>Отмена</button><button type="submit">Создать</button></footer></form></div>}
    {contextMenu.menu && <ContextMenu {...contextMenu.menu} onClose={contextMenu.close} />}
    {palette !== null && <CommandPalette initial={palette} commands={registry} scopes={availableScopes} lineCount={(document.text.match(/\n/g)?.length ?? 0) + 1}
      files={workspace.tabs.map((tab) => ({ id: tab.document.id, title: tab.document.path?.split(/[\\/]/).at(-1) ?? "untitled.bbcode", detail: tab.document.path ?? "не сохранён", active: tab.document.id === workspace.activeId }))}
      tags={paletteTags} onClose={() => setPalette(null)}
      onCommand={(command, scope) => { setPalette(null); requestAnimationFrame(() => command.run(scope)); }}
      onFile={(id) => { setPalette(null); showDocuments(); dispatchWorkspace({ type: "activate", documentId: id }); }}
      onTag={(span) => { setPalette(null); selectNode(span); }}
      onLine={(line) => { setPalette(null); const text = documentRef.current.text; let at = 0; for (let current = 1; current < line && at >= 0; current++) at = text.indexOf("\n", at) + 1 || -1; const from = Math.max(0, at); setActiveRange({ from, to: from }); navigateRange({ from, to: from }); }} />}
  </main></PreferencesContext.Provider>;
}

