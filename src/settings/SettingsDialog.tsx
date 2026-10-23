import { useState, type ReactNode } from "react";
import { defaultPreferences, type Preferences } from "./preferences";

type Section = "appearance" | "code" | "builder" | "behavior";
const sections: Array<[Section, string]> = [["appearance", "Внешний вид"], ["code", "Редактор кода"], ["builder", "Конструктор"], ["behavior", "Поведение"]];

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="settings-row"><div className="settings-label"><span>{label}</span>{hint && <small>{hint}</small>}</div><div className="settings-control">{children}</div></div>;
}

export function SettingsDialog({ value, onApply, onClose, onResetLayout }: { value: Preferences; onApply(value: Preferences): void; onClose(): void; onResetLayout(): void }) {
  const [draft, setDraft] = useState(value), [section, setSection] = useState<Section>("appearance");
  const set = <K extends keyof Preferences>(key: K, next: Preferences[K]) => setDraft((current) => ({ ...current, [key]: next }));
  const check = (key: { [K in keyof Preferences]: Preferences[K] extends boolean ? K : never }[keyof Preferences], label: string, hint?: string) =>
    <label className="settings-check"><input type="checkbox" checked={draft[key]} onChange={(event) => set(key, event.target.checked)} /><span>{label}{hint && <small>{hint}</small>}</span></label>;
  const size = (key: "codeFontSize" | "builderFontSize", low: number, high: number) =>
    <select aria-label="Размер шрифта" value={draft[key]} onChange={(event) => set(key, Number(event.target.value))}>{Array.from({ length: high - low + 1 }, (_, at) => low + at).map((item) => <option key={item} value={item}>{item}</option>)}</select>;
  const changed = JSON.stringify(draft) !== JSON.stringify(value);
  return <div className="modal-backdrop" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <section className="dialog settings-dialog" role="dialog" aria-label="Настройки">
      <header><h3>Настройки</h3><button aria-label="Закрыть настройки" onClick={onClose}>×</button></header>
      <div className="settings-body">
        <nav className="settings-nav" aria-label="Разделы настроек">{sections.map(([id, title]) => <button key={id} className={section === id ? "active" : ""} aria-current={section === id} onClick={() => setSection(id)}>{title}</button>)}</nav>
        <div className="settings-page">
          {section === "appearance" && <>
            <h4>Внешний вид</h4>
            {check("tooltips", "Показывать подсказки к кнопкам", "Описание и сочетание клавиш при наведении")}
            {check("animations", "Анимации интерфейса", "Плавные переходы подсказок и раскрытия спойлеров")}
          </>}
          {section === "code" && <>
            <h4>Редактор кода</h4>
            <Row label="Размер шрифта">{size("codeFontSize", 10, 24)}</Row>
            <Row label="Межстрочный интервал"><select aria-label="Межстрочный интервал" value={draft.codeLineHeight} onChange={(event) => set("codeLineHeight", Number(event.target.value))}>{[1.3, 1.45, 1.6, 1.8, 2].map((item) => <option key={item} value={item}>{item}</option>)}</select></Row>
            {check("codeWrap", "Переносить длинные строки")}
            {check("codeLineNumbers", "Показывать номера строк")}
            {check("codeActiveLine", "Подсвечивать текущую строку")}
          </>}
          {section === "builder" && <>
            <h4>Конструктор</h4>
            <Row label="Размер шрифта">{size("builderFontSize", 11, 24)}</Row>
            <Row label="Ширина страницы"><select aria-label="Ширина страницы" value={draft.builderWidth} onChange={(event) => set("builderWidth", event.target.value as Preferences["builderWidth"])}><option value="narrow">Узкая</option><option value="medium">Средняя</option><option value="full">Во всю ширину</option></select></Row>
            <Row label="Раскрывать спойлеры" hint="При открытии документа"><select aria-label="Раскрывать спойлеры" value={draft.spoilerOpenDepth} onChange={(event) => set("spoilerOpenDepth", Number(event.target.value))}><option value={99}>Все</option><option value={2}>Два уровня</option><option value={1}>Только верхний уровень</option><option value={0}>Все свёрнуты</option></select></Row>
            {check("tagLabels", "Показывать метки тегов", "Подпись «spoiler» в заголовке блока")}
          </>}
          {section === "behavior" && <>
            <h4>Поведение</h4>
            {check("restoreSession", "Восстанавливать открытые документы при запуске")}
            <Row label="Обновление структуры" hint="Пауза после ввода перед анализом"><select aria-label="Обновление структуры" value={draft.analysisDelay} onChange={(event) => set("analysisDelay", Number(event.target.value))}>{[[50, "Мгновенно"], [150, "Быстро (150 мс)"], [400, "Обычно (400 мс)"], [1000, "Медленно (1 с)"]].map(([ms, title]) => <option key={ms} value={ms}>{title}</option>)}</select></Row>
            <Row label="Раскладка окна" hint="Панели, их размеры и режим редактора"><button onClick={onResetLayout}>Восстановить раскладку</button></Row>
          </>}
        </div>
      </div>
      <footer><button className="settings-reset" onClick={() => setDraft({ ...defaultPreferences })}>Сбросить по умолчанию</button><span className="spacer" /><button onClick={onClose}>Отмена</button><button disabled={!changed} onClick={() => onApply(draft)}>Применить</button><button className="primary" onClick={() => { onApply(draft); onClose(); }}>ОК</button></footer>
    </section>
  </div>;
}
