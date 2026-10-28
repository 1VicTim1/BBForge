import { useState, type ReactNode } from "react";
import { defaultPreferences, type Preferences } from "./preferences";
import { KeymapEditor } from "../keymap/KeymapEditor";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";

type Section = "appearance" | "code" | "builder" | "keymap" | "behavior" | "plugins";
const sections: Array<[Section, string]> = [["appearance", "Внешний вид"], ["code", "Редактор кода"], ["builder", "Конструктор"], ["keymap", "Сочетания клавиш"], ["behavior", "Поведение"], ["plugins", "Плагины и темы"]];
type Options = Array<[string | number, string]>;
interface Setting { key: Exclude<keyof Preferences, "keymap">; section: Section; label: string; hint?: string; options?: Options; desktop?: boolean }
const range = (low: number, high: number): Options => Array.from({ length: high - low + 1 }, (_, at) => [low + at, `${low + at} px`]);
const settings: Setting[] = [
  { key: "theme", section: "appearance", label: "Тема", hint: "Системная следует настройке ОС", options: [["dark", "Тёмная"], ["light", "Светлая"], ["system", "Как в системе"]] },
  { key: "profile", section: "behavior", label: "Профиль форума", hint: "Набор тегов, по которому проверяется документ. «Автоматически» выбирает профиль по тегам и ссылкам документа; профили других форумов добавляют плагины", options: [] },
  { key: "ruleSet", section: "behavior", label: "Правила раздела", hint: "Ограничения и обязательные поля шапки раздела форума; нарушения появятся в «Проблемах»", options: [] },
  { key: "density", section: "appearance", label: "Плотность интерфейса", hint: "Компактная уменьшает высоту строк и панелей", options: [["comfortable", "Обычная"], ["compact", "Компактная"]] },
  { key: "systemFrame", section: "appearance", label: "Системная рамка окна", hint: "Заголовок и кнопки окна от оконного менеджера вместо собственных", desktop: true },
  { key: "tooltips", section: "appearance", label: "Показывать подсказки к кнопкам", hint: "Описание и сочетание клавиш при наведении" },
  { key: "animations", section: "appearance", label: "Анимации интерфейса", hint: "Плавные переходы подсказок, поповеров и раскрытия спойлеров" },
  { key: "codeFontSize", section: "code", label: "Размер шрифта", hint: "JetBrains Mono", options: range(11, 18) },
  { key: "codeLineHeight", section: "code", label: "Межстрочный интервал", options: [[1.3, "1.3"], [1.45, "1.45"], [1.54, "1.54 (20 px)"], [1.6, "1.6"], [1.8, "1.8"], [2, "2"]] },
  { key: "codeWrap", section: "code", label: "Переносить длинные строки" },
  { key: "codeLineNumbers", section: "code", label: "Показывать номера строк" },
  { key: "codeActiveLine", section: "code", label: "Подсвечивать текущую строку" },
  { key: "builderFontSize", section: "builder", label: "Размер шрифта", hint: "Текст в конструкторе и предпросмотре", options: range(12, 20) },
  { key: "builderWidth", section: "builder", label: "Ширина колонки", options: [["narrow", "Узкая (620 px)"], ["medium", "Средняя (700 px)"], ["full", "Во всю ширину"]] },
  { key: "spoilerOpenDepth", section: "builder", label: "Раскрывать спойлеры", hint: "При открытии документа", options: [[99, "Все"], [2, "Два уровня"], [1, "Только верхний уровень"], [0, "Все свёрнуты"]] },
  { key: "tagLabels", section: "builder", label: "Показывать метки тегов", hint: "Подпись «spoiler» в заголовке блока" },
  { key: "spellcheck", section: "behavior", label: "Проверять орфографию", hint: "Русский и английский; варианты исправления — по правому клику на слове" },
  { key: "checkUpdates", section: "behavior", label: "Проверять обновления", hint: "Раз в день при запуске BBForge смотрит, нет ли новой версии на GitHub", desktop: true },
  { key: "restoreSession", section: "behavior", label: "Восстанавливать открытые документы при запуске" },
  { key: "analysisDelay", section: "behavior", label: "Обновление структуры", hint: "Пауза после ввода перед анализом", options: [[50, "Мгновенно"], [150, "Быстро (150 мс)"], [400, "Обычно (400 мс)"], [1000, "Медленно (1 с)"]] },
];
const modified = (value: Preferences, key: keyof Preferences) => JSON.stringify(value[key]) !== JSON.stringify(defaultPreferences[key]);

/** Settings live in an editor tab and apply immediately; changed settings carry an accent bar. */
export function SettingsPage({ value, onChange, onResetLayout, onRecording, desktop, themes = [], profiles = [], ruleSets = [], plugins, initialSection = "appearance" }: { value: Preferences; onChange(value: Preferences): void; onResetLayout(): void; onRecording?(active: boolean): void; desktop: boolean; themes?: Options; profiles?: Options; ruleSets?: Options; plugins?: ReactNode; initialSection?: Section }) {
  const [section, setSection] = useState<Section>(initialSection), [query, setQuery] = useState("");
  const optionsFor = (item: Setting): Options => item.key === "theme" ? [...item.options!.slice(0, 2), ...themes, item.options![2]] : item.key === "profile" ? profiles : item.key === "ruleSet" ? [["", "Не проверять"], ...ruleSets] : item.options!;
  const set = <K extends keyof Preferences>(key: K, next: Preferences[K]) => onChange({ ...value, [key]: next });
  const visible = settings.filter((item) => (!item.desktop || desktop) && (query ? `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(query.toLowerCase()) : item.section === section));
  const changedIn = (id: Section) => settings.filter((item) => item.section === id && modified(value, item.key)).length + (id === "keymap" && Object.keys(value.keymap).length ? Object.keys(value.keymap).length : 0);
  const row = (item: Setting) => {
    const current = value[item.key];
    if (typeof current === "boolean") return <label key={item.key} className={`settings-row check-row ${modified(value, item.key) ? "modified" : ""}`}>
      <span className="settings-label"><span>{item.label}</span>{item.hint && <small>{item.hint}</small>}</span>
      <input type="checkbox" checked={current} onChange={(event) => set(item.key, event.target.checked as never)} />
    </label>;
    return <div key={item.key} className={`settings-row ${modified(value, item.key) ? "modified" : ""}`}>
      <label className="settings-label" htmlFor={`setting-${item.key}`}><span>{item.label}</span>{item.hint && <small>{item.hint}</small>}</label>
      <div className="settings-control"><Select id={`setting-${item.key}`} label={item.label} value={current as string | number} options={optionsFor(item).map(([option, title]) => ({ value: option, label: title }))} onChange={(option) => set(item.key, option as never)} /></div>
    </div>;
  };
  return <div className="settings-page-view" role="region" aria-label="Настройки">
    <nav className="settings-nav" aria-label="Разделы настроек">
      <label className="panel-filter"><Icon name="search" /><input aria-label="Поиск настроек" placeholder="Поиск настроек" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {sections.map(([id, title]) => <button key={id} className={!query && section === id ? "active" : ""} aria-current={!query && section === id} onClick={() => { setQuery(""); setSection(id); }}>{title}{changedIn(id) > 0 && <small title="Изменено настроек">{changedIn(id)}</small>}</button>)}
    </nav>
    <div className="settings-content"><div className="settings-content-inner">
      <h4>{query ? "Результаты поиска" : sections.find(([id]) => id === section)![1]}</h4>
      {(query || section !== "keymap") && visible.map(row)}
      {!query && section === "plugins" && plugins}
      {query && visible.length === 0 && <p className="settings-empty">Нет настроек, подходящих под «{query}»</p>}
      {!query && section === "keymap" && <KeymapEditor value={value.keymap} onChange={(keymap) => set("keymap", keymap)} onRecording={onRecording} />}
      {!query && section === "behavior" && <div className="settings-row"><span className="settings-label"><span>Раскладка окна</span><small>Панели, их размеры и режим редактора</small></span><div className="settings-control"><button className="secondary-button" onClick={onResetLayout}>Восстановить раскладку</button></div></div>}
      <div className="settings-footer"><small>Изменения применяются сразу. Полоса слева отмечает настройки, отличающиеся от стандартных.</small><button className="secondary-button" onClick={() => onChange({ ...defaultPreferences })}>Сбросить по умолчанию</button></div>
    </div></div>
  </div>;
}
