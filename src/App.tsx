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
import type { NodeRef } from "./document/structure";
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
import "./styles.css";

const example = `[spoiler=[b][color=red]Важная информация![/color][/b]]\nТекст шапки\n[/spoiler]`;

export default function App() {
  const [document, setDocument] = useState(() => decodeDocument(new TextEncoder().encode(example)));
  const [analysis, setAnalysis] = useState<Analysis>(emptyAnalysis);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionRequest>();
  const [panels, setPanels] = useState({ outline: true, preview: true, diagnostics: true });
  const [mode, setMode] = useState<"code" | "builder" | "split">("split");
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);
  const [controller, setController] = useState<EditorController | null>(null);
  const [selected, setSelected] = useState<NodeRef | null>(null);
  const [activeRange, setActiveRange] = useState<SourceRange>({ from: 0, to: 0 });
  const composition = useRef(false);
  const documentRef = useRef(document);
  documentRef.current = document;
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
  };
  const execute = (command: EditCommand) => { if (!controller) throw new Error("Редактор загружается"); controller.execute(command); };
  const visualNavigate = (range: SourceRange) => { setMode("split"); setSelection({ ...range, nonce: Date.now() }); };

  const saveCurrent = async (saveAs = false): Promise<boolean> => {
    if (!isTauri()) return false;
    if (composition.current) { setError("Завершите ввод текста перед сохранением"); return false; }
    await controller?.finishComposition();
    const snapshot = documentRef.current;
    try {
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
    await controller?.finishComposition();
    return requestDocumentAction(documentRef.current.revision !== documentRef.current.savedRevision, chooseUnsaved, saveCurrent);
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
      if (!(event.ctrlKey || event.metaKey)) return;
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
      if (documentRef.current.revision === documentRef.current.savedRevision) return;
      event.preventDefault();
      if (await mayReplaceDocument()) {
        try { await getCurrentWindow().destroy(); } catch (reason) { setError(String(reason)); }
      }
    }).then((stop) => { unlisten = stop; });
    return () => unlisten?.();
  });

  const dirty = document.revision !== document.savedRevision;
  const navigate = (span: Span) => setSelection({ from: byteToUtf16(document.text, span.start), to: byteToUtf16(document.text, span.end), nonce: Date.now() });
  return <main className="app">
    <header className="toolbar">
      <h1>BBForge</h1>
      {(["code", "builder", "split"] as const).map((value) => <button key={value} onClick={() => { if (!composition.current) setMode(value); }}>{value === "code" ? "Код" : value === "builder" ? "Конструктор" : "Рядом"}</button>)}
      <button onClick={() => void newDocument()}>Новый</button><button disabled={!isTauri()} onClick={() => void openDocument()}>Открыть</button><button disabled={!isTauri()} onClick={() => void saveCurrent()}>Сохранить</button><button disabled={!isTauri()} onClick={() => void saveCurrent(true)}>Сохранить как</button>
      <button onClick={() => setPanels((value) => ({ ...value, outline: !value.outline }))}>Структура</button><button onClick={() => setPanels((value) => ({ ...value, preview: !value.preview }))}>Предпросмотр</button><button onClick={() => setPanels((value) => ({ ...value, diagnostics: !value.diagnostics }))}>Проблемы</button>
      <span className="spacer" /><span className="status">{document.path ?? "Без имени"}{dirty ? " · изменён" : ""}</span>
    </header>
    <section className={`workspace ${!panels.outline ? "without-outline" : ""} ${!panels.preview ? "without-preview" : ""}`}>
      {panels.outline && <aside className="panel outline"><h2>Структура</h2><Outline nodes={analysis.nodes} onNavigate={navigate} /></aside>}
      <section className={`source mode-${mode}`}>
        <div style={{ display: mode === "builder" ? "none" : "block", height: "100%" }}><Editor key={document.id} document={document} value={document.text} endings={document.endings} onChange={changeSource} onReady={setController} onSelection={setActiveRange} selectionRequest={selection} /></div>
        {mode !== "code" && <Builder key={document.id} document={document} snapshot={snapshot} execute={execute} getDocument={() => documentRef.current} onSelect={setSelected} onRange={(range: VisualRange) => setActiveRange(range)} onNavigate={visualNavigate} onError={setError} onComposition={(active) => { composition.current = active; }} />}
        <span hidden>{selected?.span.start}{activeRange.from}</span>
      </section>
      {panels.preview && <aside className="panel preview"><h2>Предпросмотр</h2><Preview source={document.text} nodes={analysis.nodes} onNavigate={navigate} openExternal={(url) => { if (isTauri()) void openUrl(url).catch((reason) => setError(String(reason))); }} /></aside>}
    </section>
    {panels.diagnostics && <section className="diagnostics"><div className="diagnostics-header"><h2>Проблемы</h2><button aria-label="Скрыть проблемы" onClick={() => setPanels((value) => ({ ...value, diagnostics: false }))}>×</button></div><Diagnostics diagnostics={analysis.diagnostics} onNavigate={navigate} />{error && <p className="error">{error}</p>}</section>}
  </main>;
}
