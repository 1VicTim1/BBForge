# Плагины и темы

Плагин или тема — это zip-архив с `manifest.json` и файлами пакета. Большую часть возможностей пакет описывает декларативно: профили форумов, темы, CSS, команды, правки интерфейса, конвертеры. Для своей логики у плагина может быть скрипт `main.js`, он работает в изолированной песочнице (см. «Скрипты»).

Каталоги с готовыми пакетами:

- [BBForge-plugins](https://github.com/1VicTim1/BBForge-plugins) — плагины;
- [BBForge-themes](https://github.com/1VicTim1/BBForge-themes) — темы.

В приложении: «Настройки → Плагины и темы» (или «Инструменты → Плагины и темы…»). Там же установка из файла и каталог.

## Безопасность

- **Разрешения.** Пакет получает только то, что перечислено в `permissions`. Если разрешения нет, BBForge пропускает соответствующий вклад и показывает предупреждение у пакета в настройках.
- **Подпись.** Пакет подписывается ключом Ed25519. Подпись покрывает список всех файлов и их SHA-256, поэтому любое изменение, добавление или удаление файла её ломает. Доверенные ключи — корневой ключ, вшитый в BBForge, и список разработчиков `trusted-keys.json` в репозитории [BBForge-plugins](https://github.com/1VicTim1/BBForge-plugins), подписанный корневым ключом. BBForge скачивает список при запуске, проверяет подпись и хранит последнюю проверенную копию; добавить разработчика или отозвать ключ можно без нового релиза.
- **Подтверждение.** Любую установку пользователь подтверждает в диалоге с разрешениями и зависимостями пакета. Если пакет без подписи, подписан неизвестным ключом или подпись недействительна, нужно второе подтверждение. Из каталога ставятся только пакеты с доверенной подписью.
- **Проверка при запуске.** Архив хранится в каталоге данных приложения (`plugins/<id>.zip`) и перепроверяется при каждом запуске. Если файл изменился после установки, пакет не загружается, пока пользователь не подтвердит новую версию.
- **Ограничения архива.** Не больше 2000 файлов, 10 МБ на файл и 50 МБ всего. Пути только относительные, без `..`, скрытых файлов и символических ссылок.

## manifest.json

```json
{
  "manifestVersion": 1,
  "type": "plugin",
  "id": "author.my-plugin",
  "name": "Мой плагин",
  "version": "1.0.0",
  "description": "Что делает плагин",
  "author": "Автор",
  "homepage": "https://…",
  "engine": ">=0.4.0",
  "dependencies": { "bbforge.profile-selector": "^1.0.0" },
  "permissions": ["profiles", "ui.add"],
  "contributes": { }
}
```

| Поле | Описание |
| --- | --- |
| `type` | `plugin` или `theme`; влияет только на значок и порядок загрузки (темы загружаются последними) |
| `id` | `автор.имя`: строчная латиница, цифры, дефис. Все элементы, команды и точки расширения пакета начинаются с `id.` |
| `version`, `engine` | semver; `engine` — требуемая версия BBForge |
| `dependencies` | пакеты, без которых этот не работает: id → требование к версии (`^1.0.0`, `~1.2`, `>=1.0 <2.0`, `1.x`, `*`, `a \|\| b`; голая версия `1.2` означает `^1.2`). Пакет загружается, только если каждая зависимость установлена, включена, загружена и подходит по версии; иначе в настройках показано, чего не хватает |

### Разрешения

| Разрешение | Что даёт |
| --- | --- |
| `profiles` | добавлять профили форумов (`contributes.profiles`) |
| `profiles.select` | переключать профиль: список с `bind: "profile"`, команда `setProfile` |
| `themes` | добавлять темы (`contributes.themes`) |
| `themes.select` | переключать тему: список с `bind: "theme"`, команда `setTheme` |
| `styles` | подключать CSS (`contributes.styles`, `styles` у темы) |
| `ui.add` | добавлять элементы интерфейса (`op: "add"`) |
| `ui.modify` | переименовывать, перемещать, менять значки и классы, скрывать (`op: "update"`, `op: "move"`) |
| `ui.remove` | удалять элементы (`op: "remove"`) |
| `ui.slots` | объявлять свои точки расширения (`contributes.slots`) |
| `commands` | добавлять команды и сочетания клавиш (`contributes.commands`) |
| `document.read` | скриптом читать весь текст документа (`bb.document.text()`) |
| `document.edit` | команды, которые вставляют или оборачивают текст (`insert`, `wrap`, `convert`) |
| `converters` | добавлять конвертеры разметки (`contributes.converters`) |
| `scripts` | исполнять свой скрипт (`main`) в песочнице |
| `network:<домен>` | скриптом обращаться к домену и его поддоменам по https, например `network:4pda.to` |
| `windows` | скриптом открывать окно сайта из разрешённых доменов и читать его куки |
| `storage` | скриптом хранить свои данные (до 1 МБ) |

Список хранится в `crates/bbforge-plugin/permissions.json`.

## Профили форумов

Профиль описывает теги форума. Встроенный профиль 4PDA лежит в `crates/bbcode-core/profiles/4pda.json`.

```json
{
  "id": "xenforo",
  "name": "XenForo 2",
  "extends": "4pda",
  "removeTags": ["attachment"],
  "tags": [
    { "name": "hide", "as": "spoiler", "label": "Скрытый текст", "value": "optional" },
    { "name": "mod", "role": "block", "value": "optional",
      "render": { "element": "div", "caption": "Модератор: {value}", "style": { "border": "1px solid #c33" } } }
  ]
}
```

| Поле тега | Описание |
| --- | --- |
| `name` | имя тега, строчными |
| `as` | встроенное поведение: `b i u s sub sup size color background font url left center right img attachment spoiler quote code list *`. Тег с `as: "spoiler"` работает в конструкторе, структуре и рефакторингах как спойлер. Если имя совпадает со встроенным тегом, `as` можно не указывать |
| `role` | `inline`, `block`, `media`, `item`: цвет подсветки и место в структуре |
| `value` | `none`, `optional`, `required`; `required` без значения даёт предупреждение |
| `valueFormat` | `color`, `url`, `size`, `font`, `text`; `color` включает проверку цвета |
| `blankCheck` | предупреждать о пустом теге |
| `raw` | содержимое до закрывающего тега — обычный текст (как `[code]`) |
| `leaf` | у тега нет закрывающей пары (как `[attachment=1]`) |
| `render` | как рисовать тег без `as` в конструкторе и предпросмотре |

`ruleSets` — правила разделов форума, их пользователь выбирает в «Настройки → Поведение → Правила раздела». Нарушения появляются в «Проблемах»:

```json
"ruleSets": [{ "id": "devices", "title": "Android - Устройства", "rules": [
  { "id": "spoilers", "type": "maxCount", "tags": ["spoiler"], "max": 10, "message": "В шапке не больше 10 спойлеров" },
  { "id": "photos", "type": "insideOnly", "tags": ["img", "attachment"], "only": "\\.(png|jpe?g)\\b", "container": "spoiler", "message": "Фото только под спойлером" },
  { "id": "android", "type": "requiredText", "pattern": "Требуется Android", "message": "Нет поля «Требуется Android»", "severity": "info" },
  { "id": "length", "type": "maxLength", "max": 60000, "message": "Слишком длинная шапка" } ] }]
```

`tags` и `container` — встроенные поведения, `only` — регулярное выражение по значению или тексту тега, `severity` — `error`, `warning` (по умолчанию) или `info`. Профиль с `extends` наследует наборы базового и может заменить их своими с тем же `id`. В профиле 4PDA есть наборы «Android - Устройства» (по официальным рекомендациям раздела), «Android - Программы», «Android - Игры» и «Программы для ПК».

`detect` помогает выбрать профиль автоматически (настройка «Профиль форума → Автоматически», она стоит по умолчанию): `hosts` — домены форума в ссылках документа, `tags` — теги, которые есть только на этом форуме.

```json
"detect": { "hosts": ["4pda.to", "4pda.ru"], "tags": ["ispoiler"] }
```

Каждый различный тег документа даёт профилю +1, если профиль его знает, и −2, если нет; тег из `detect.tags` даёт +3, ссылка на домен из `detect.hosts` — +5. Побеждает профиль с наибольшим счётом; при равенстве остаётся текущий.

`render.element` — одно из `span div strong em u s sub sup small mark code pre blockquote ul ol li details`. `render.style` принимает CSS-свойства `color backgroundColor fontSize fontFamily fontWeight fontStyle textDecoration textAlign border borderLeft borderRadius padding margin display`. `{value}` подставляет значение тега, если оно подходит под `valueFormat`; `url()` и экранирование запрещены. `render.caption` — подпись перед содержимым.

Профили берутся из `contributes.profiles`: путь к JSON-файлу пакета или объект прямо в манифесте. Выбрать профиль можно в «Настройки → Поведение → Профиль форума» или в плагине-переключателе.

## Темы

```json
{
  "id": "night",
  "name": "Ночь",
  "base": "dark",
  "tokens": { "--accent": "#E5A84B", "--bg-editor": "#16181D" },
  "styles": ["themes/night.css"],
  "ui": [ { "op": "update", "target": "menu.refactor", "set": { "title": "Чистка" } } ]
}
```

- `base` — `dark` или `light`: от неё берутся все токены, которые тема не задала.
- `tokens` — переменные из `src/styles/tokens.css` (цвета интерфейса, подсветки `--syn-*`, радиусы, размеры). Значения — цвета, длины и шрифты, без `url()`.
- `styles` — CSS темы, нужно разрешение `styles`.
- `ui` — правки интерфейса, действуют, пока тема активна. Нужны разрешения `ui.*`, как у плагина.

Темы подключаются через `contributes.themes` и выбираются в «Настройки → Внешний вид → Тема».

## Интерфейс: слоты и элементы

Каждое место, которое пакет может менять, — слот: упорядоченный список элементов с постоянными id. У каждого элемента есть атрибут `data-ui-id`, поэтому CSS плагина находит его как `[data-ui-id="format.bold"]`.

| Слот | Элементы |
| --- | --- |
| `titlebar.menus` | `menu.file`, `menu.edit`, `menu.view`, `menu.refactor`, `menu.tools`; каждое меню — тоже слот с id команд внутри |
| `titlebar.actions` | пусто; кнопки и списки плагинов в заголовке окна |
| `toolbar.format` | `format.undo`, `format.redo`, `format.bold`, `format.italic`, `format.underline`, `format.strike`, `format.color`, `format.background`, `format.link`, `format.quote`, `format.code`, `format.list`, `format.spoiler`, `format.sync` и разделители `toolbar.format.*` |
| `statusbar.left` | `status.problems`, `status.sync` |
| `statusbar.right` | `status.position`, `status.endings`, `status.encoding`, `status.language`, `status.profile` |
| `activitybar` | `activity.outline`, `activity.search`, `activity.blocks`, `activity.problems` |
| `activitybar.bottom` | `activity.settings` |
| `sidebar.blocks` | `block.spoiler`, `block.quote`, `block.code`, `block.list`, `block.url`, `block.img` |

Полный список — `src/plugins/slots.ts`.

### Изменения (`contributes.ui`)

```json
[
  { "op": "add", "slot": "toolbar.format", "after": "format.list",
    "item": { "id": "author.my-plugin.hr", "kind": "button", "icon": "minus", "command": "author.my-plugin.insert-hr" } },
  { "op": "move", "target": "format.code", "before": "format.bold" },
  { "op": "move", "target": "file.new", "slot": "toolbar.format", "before": "format.undo" },
  { "op": "update", "target": "menu.view", "set": { "title": "Отображение", "icon": "eye", "className": "my-class", "hidden": false } },
  { "op": "remove", "target": "format.strike" }
]
```

- `add` (`ui.add`) — новый элемент в слот, перед `before` или после `after` (иначе в конец).
- `move` (`ui.modify`) — перестановка внутри слота. С `slot` элемент переезжает в другой слот; встроенный элемент так можно перенести, только если это команда.
- `update` (`ui.modify`) — `title`, `icon`, `tooltip`, `className` (добавляется к классам), `hidden`.
- `remove` (`ui.remove`).

Изменять можно и элементы других плагинов. Так один плагин может оформить или перенести элемент другого.

### Элементы плагинов

| `kind` | Поля |
| --- | --- |
| `button` | `title`, `icon`, `tooltip`, `command`, `showTitle` |
| `select` | `title`, `bind` (`profile` или `theme`), `source` (`profiles` или `themes` — встроенный список), `itemsSlot` — слот, куда другие плагины добавляют пункты |
| `option` | пункт для `itemsSlot`: `title` и `value` (id профиля или темы) или `command` |
| `command` | пункт меню, который вызывает `command` |
| `separator`, `text` | разделитель и надпись |

`icon` — имя встроенного значка (`bold`, `code`, `globe`, `star`, `palette`, `puzzle`, `package`, …; полный список в `src/components/Icon.tsx`) или `asset:путь/в/пакете.svg` (png, jpg, webp, gif, svg).

### Точки расширения (`contributes.slots`)

```json
"slots": [ { "id": "author.my-plugin.options", "title": "Пункты моего списка" } ]
```

Id слота начинается с id пакета. Другие плагины добавляют в него элементы обычным `add`. Пример цепочки из каталога:

1. `bbforge.profile-selector` добавляет оформленный список профилей в строку состояния вместо метки `status.profile` и объявляет слот `bbforge.profile-selector.options`.
2. `bbforge.forum-profiles` добавляет профили XenForo, phpBB и SMF и пункт «Другие форумы…» в слот селектора.

Чтобы оформить чужой элемент, достаточно CSS по `[data-ui-id="…"]` (разрешение `styles`) или `update` с `className` (разрешение `ui.modify`).

## Команды

```json
"commands": [
  { "id": "author.my-plugin.insert-hr", "title": "Вставить разделитель", "category": "Мой плагин",
    "icon": "minus", "keys": ["Ctrl+Alt+KeyH"], "run": { "insert": "[hr]" } }
]
```

| `run` | Действие | Разрешение |
| --- | --- | --- |
| `{ "insert": "текст $" }` | вставить текст на место выделения; `$` заменяется выделенным текстом | `document.edit` |
| `{ "wrap": "тег", "value": "…" }` | обернуть выделение в `[тег=value]…[/тег]` | `document.edit` |
| `{ "command": "id" }` | выполнить встроенную или чужую команду | — |
| `{ "setProfile": "id" }` | переключить профиль форума | `profiles.select` |
| `{ "setTheme": "id" }` | переключить тему | `themes.select` |
| `{ "convert": "id" }` | открыть конвертер: HTML → BBCode с вставкой на место курсора или выделения | `document.edit` |

`keys` записываются по физическим клавишам (`Ctrl+Alt+KeyH`, `Ctrl+Shift+Digit1`), так же как в настройках сочетаний. Сочетания пользователя и встроенные важнее: занятое сочетание плагину не достанется. Команды попадают в палитру (Ctrl+Shift+P), их можно ставить в меню и на панели.

## Конвертеры

Конвертер превращает HTML в BBCode по правилам из пакета (`contributes.converters`, разрешение `converters`). Открывается командой с `run: { "convert": "<id>" }`. В диалог можно вставить фрагмент, скопированный прямо со страницы (BBForge возьмёт HTML из буфера и сохранит оформление), или HTML-код. Если в документе выделен HTML, он конвертируется на месте.

```json
{
  "id": "author.import.html",
  "title": "HTML → BBCode",
  "hint": "Подсказка над полем ввода",
  "maps": { "size": { "14pt": "4", "12pt": "3" } },
  "rules": [
    { "match": "script, style", "skip": true },
    { "match": "br", "open": "\n", "leaf": true },
    { "match": "div.post-block.spoil", "open": "[spoiler={bbcode:.block-title}]\n", "close": "\n[/spoiler]", "content": ".block-body", "block": true },
    { "match": "div.post-block.spoil", "open": "[spoiler]\n", "close": "\n[/spoiler]", "content": ".block-body", "block": true },
    { "match": "img[src]", "open": "[img]{attr:src}[/img]", "leaf": true },
    { "match": "[style*='font-size']", "open": "[size={style:font-size|map:size}]", "close": "[/size]" },
    { "match": "[style*='color']", "open": "[color={style:color|hex}]", "close": "[/color]" }
  ]
}
```

Каждый элемент берёт первое правило, у которого подходит CSS-селектор `match` и найдены значения всех подстановок; без правила элемент оставляет только содержимое.

| Поле | Описание |
| --- | --- |
| `open`, `close` | текст до и после содержимого |
| `skip` | выбросить элемент вместе с содержимым |
| `leaf` | не обрабатывать содержимое (картинки) |
| `raw` | содержимое как обычный текст с переносами строк (код) |
| `block` | результат на отдельных строках |
| `content` | селектор потомка, чьё содержимое становится телом (у спойлера 4PDA — `.block-body`) |

Подстановки: `{attr:имя}`, `{style:свойство}` (значение из атрибута style как написано), `{text:селектор}` (текст потомка), `{bbcode:селектор}` (сконвертированный потомок; потомок не попадает в тело). Фильтры: `|map:таблица` (из `maps`), `|hex` (`rgb()` → `#rrggbb`), `|font` (первое семейство шрифта). `?` в конце (`{bbcode:.block-title?}`) разрешает пустое значение. Скобки, кавычки и переводы строк из значений удаляются. HTML разбирается в инертный документ: скрипты не выполняются, ничего не загружается.

## Скрипты

```json
{ "main": "main.js", "exports": ["session"], "permissions": ["scripts", "network:4pda.to", "storage", "commands"],
  "contributes": { "commands": [{ "id": "author.plugin.go", "title": "Сделать что-то", "run": { "script": "go", "args": { "any": "json" } } }] } }
```

```js
// main.js: функции плагина — свойства exports, первым аргументом приходит bb
exports.go = async (bb, args) => {
  const link = await bb.ui.prompt({ title: "Ссылка", label: "Адрес поста" });
  if (!link) return;
  const page = await bb.http.get("https://4pda.to/forum/index.php?showtopic=1", { encoding: "windows-1251" });
  const [title] = await bb.html.query(page.text, "title");
  if (await bb.ui.review({ title: "Результат", text: title.text }) === "insert") await bb.document.insert(title.text);
};
```

Скрипт работает в отдельном Web Worker: без доступа к интерфейсу, документу, Tauri и сети (`fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts` и т. п. удалены). Наружу ведёт только `bb`, и каждый вызов проверяется по разрешениям пакета; сеть, окна и хранилище настольная часть проверяет ещё раз по манифесту установленного пакета. Скрипт, который перестал отвечать (например, ушёл в бесконечный цикл), останавливается.

| Вызов | Что делает | Разрешение |
| --- | --- | --- |
| `bb.http.get(url, { cookies, encoding })` | GET-запрос; `cookies` — объект имя → значение; возвращает `{ status, contentType, text }`, кодировка из `encoding` или заголовка | `network:<домен>` |
| `bb.window.open(url, { title })` | окно сайта (своё хранилище браузера у каждого плагина, переходы только по его доменам); возвращает идентификатор окна | `windows` |
| `bb.window.waitForCookies(window, names, { ignore, timeout })` | ждёт, пока у окна появятся все куки `names` (значения из `ignore` не считаются), возвращает их | `windows` |
| `bb.window.close(window)`, `bb.window.clearData()` | закрыть окно; забыть куки и кэш окон плагина | `windows` |
| `bb.storage.get(key)`, `set(key, value)`, `remove(key)` | личное хранилище, значения — JSON | `storage` |
| `bb.html.query(html, selector)` | разбор HTML в инертный документ; элементы `{ text, value, html, attributes }` | — |
| `bb.ui.prompt({ title, label, placeholder, hint, value })` | строка от пользователя или `null` | — |
| `bb.ui.review({ title, text, hint, format })` | показать текст: `"insert"`, `"copy"` или `null`; `format: "diff"` раскрашивает строки на `+` и `-` | — |
| `bb.document.text()` | весь документ на момент запуска команды | `document.read` |
| `bb.ui.notify(text)`, `bb.log(...)` | запись в журнал | — |
| `bb.document.selection()`, `bb.document.insert(text)` | выделение на момент запуска команды; вставка на его место | `document.edit` |
| `bb.plugins.call(id, fn, args)` | функция плагина из своих `dependencies`, если тот перечислил её в `exports` | — |
| `bb.commands.update(id, { title, icon, hint })` | изменить вид своей команды (меню, палитра, кнопки), например «Войти» ↔ «Выйти» | — |

`bb.http.get(url, { as: "dataUrl" })` возвращает картинку как `{ status, contentType, dataUrl }` (только `image/*`, до 6 МБ).

**Предпросмотр картинок.** Плагин со скриптом может объявить `"imagePreview": { "script": "preview" }` в `contributes`. Для каждой картинки `[img]` с доменов из его разрешений `network:…` BBForge вызывает `preview(bb, { url })` и показывает возвращённый `data:image/…` в предпросмотре и миниатюрой в конструкторе; без такого плагина остаются заглушки.

Если в скрипте есть `exports.activate`, BBForge вызывает её при загрузке плагина: удобно, чтобы сразу выставить названия команд по сохранённому состоянию.

Данные плагина (хранилище, куки его окон) лежат в `<данные приложения>/plugin-data/<id>/` и удаляются вместе с пакетом.

## bbforge-pack

Утилита упаковки и подписи находится в `crates/bbforge-pack`:

```sh
cargo install --path crates/bbforge-pack
bbforge-pack keygen --signer "Автор" --out ~/.config/bbforge/signing-key.json   # один раз; ключ держите в секрете
bbforge-pack pack ./my-plugin --key ~/.config/bbforge/signing-key.json        # проверка манифеста, my-plugin/../<id>-<version>.zip
bbforge-pack pack ./my-plugin --out dist                                      # без подписи, в папку dist
bbforge-pack verify dist/author.my-plugin-1.0.0.zip                           # манифест, разрешения, состояние подписи
bbforge-pack pubkey ~/.config/bbforge/signing-key.json                        # открытый ключ
bbforge-pack index dist --out index.json --prefix dist                        # index.json каталога
```

`pack` упаковывает все файлы папки, кроме скрытых, `.zip` и старого `signature.json`. Ошибки манифеста останавливают упаковку. Предупреждения, например вклад без нужного разрешения, выводятся, но архив собирается. Ключ можно передать через переменную `BBFORGE_SIGNING_KEY`.

Чтобы BBForge доверял ключу другого разработчика, добавьте его открытый ключ в `trusted-keys.json` каталога, увеличьте `serial` и подпишите список корневым ключом: `bbforge-pack sign-keys trusted-keys.json --key <корневой ключ>`.

## Каталоги

Репозиторий каталога содержит `packages/<папка>/` с исходниками пакетов, `dist/` с подписанными архивами и `index.json`. Всё это собирает `build.sh` (`bbforge-pack pack` для каждой папки и затем `bbforge-pack index`). BBForge читает `index.json` из `main`-ветки репозиториев, перечисленных в `CATALOGS` (`src-tauri/src/catalog.rs`). Скачанный архив сверяется с SHA-256 из каталога, затем проходит ту же проверку подписи и разрешений, что и файл с диска.
