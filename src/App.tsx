import { useState } from "react";
import { Editor } from "./editor/Editor";
import "./styles.css";

const example = `[spoiler=[b][color=red]Важная информация![/color][/b]]\nТекст шапки\n[/spoiler]`;

export default function App() {
  const [source, setSource] = useState(example);
  return <main className="app">
    <header className="toolbar">
      <h1>BBForge</h1>
      <button>Новый</button><button>Открыть</button><button>Сохранить</button>
      <span className="spacer" /><span className="status">Без имени · изменён</span>
    </header>
    <section className="workspace">
      <aside className="panel outline"><h2>Структура</h2><button className="tree-item">▾ Важная информация!</button></aside>
      <section className="source"><Editor value={source} onChange={setSource} /></section>
      <aside className="panel preview"><h2>Предпросмотр</h2><details open><summary>Важная информация!</summary><pre>{source}</pre></details></aside>
    </section>
    <section className="diagnostics"><h2>Проблемы</h2><p>Ошибок не найдено</p></section>
  </main>;
}
