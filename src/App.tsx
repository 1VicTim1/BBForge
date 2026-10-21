import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./editor/Editor";
import { createAnalysisClient, type AnalysisRequest, type AnalysisResponse } from "./analysis/client";
import { createTauriAnalyzer } from "./analysis/tauri";
import { emptyAnalysis, type Analysis } from "./analysis/types";
import "./styles.css";

const example = `[spoiler=[b][color=red]Важная информация![/color][/b]]\nТекст шапки\n[/spoiler]`;

export default function App() {
  const [source, setSource] = useState(example);
  const [revision, setRevision] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis>(emptyAnalysis);
  const documentId = useRef(crypto.randomUUID());
  const analyze = useMemo(() => isTauri()
    ? createTauriAnalyzer<Analysis>(invoke)
    : async (request: AnalysisRequest): Promise<AnalysisResponse<Analysis>> => ({ ...request, analysis: emptyAnalysis() }), []);
  const client = useMemo(() => createAnalysisClient(analyze, setAnalysis), [analyze]);
  useEffect(() => {
    client.update({ source, documentId: documentId.current, revision });
    return () => client.dispose();
  }, [client, revision, source]);

  const changeSource = (value: string) => {
    setSource(value);
    setRevision((current) => current + 1);
  };
  return <main className="app">
    <header className="toolbar">
      <h1>BBForge</h1>
      <button>Новый</button><button>Открыть</button><button>Сохранить</button>
      <span className="spacer" /><span className="status">Без имени · изменён</span>
    </header>
    <section className="workspace">
      <aside className="panel outline"><h2>Структура</h2><button className="tree-item">▾ Важная информация!</button></aside>
      <section className="source"><Editor value={source} onChange={changeSource} /></section>
      <aside className="panel preview"><h2>Предпросмотр</h2><details open><summary>Важная информация!</summary><pre>{source}</pre></details></aside>
    </section>
    <section className="diagnostics"><h2>Проблемы</h2>{analysis.diagnostics.length === 0
      ? <p>Ошибок не найдено</p>
      : analysis.diagnostics.map((item, index) => <p key={`${item.code}-${item.span.start}-${index}`}>{item.line}:{item.column} · {item.message}</p>)}</section>
  </main>;
}
