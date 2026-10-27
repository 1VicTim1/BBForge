# Плагины и темы

Плагин или тема — это zip-архив с `manifest.json` и файлами пакета. Пакеты описывают изменения декларативно: профили форумов, темы, CSS, команды и правки интерфейса. Своего кода пакет не исполняет.

Каталоги с готовыми пакетами:

- [BBForge-plugins](https://github.com/1VicTim1/BBForge-plugins) — плагины;
- [BBForge-themes](https://github.com/1VicTim1/BBForge-themes) — темы.

В приложении: «Настройки → Плагины и темы» (или «Инструменты → Плагины и темы…»). Там же установка из файла и каталог.

## Безопасность

- **Разрешения.** Пакет получает только то, что перечислено в `permissions`. Если разрешения нет, BBForge пропускает соответствующий вклад и показывает предупреждение у пакета в настройках.
- **Подпись.** Пакет подписывается ключом Ed25519. Подпись покрывает список всех файлов и их SHA-256, поэтому любое изменение, добавление или удаление файла её ломает. Пакеты, подписанные ключом из `TRUSTED_KEYS` (`src-tauri/src/plugins.rs`), ставятся сразу. Если подписи нет, ключ неизвестен или подпись недействительна, BBForge показывает разрешения пакета и спрашивает подтверждение.
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
| `dependencies` | пакеты, которые загружаются раньше этого; если зависимости нет, BBForge выводит предупреждение |

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
| `document.edit` | команды, которые вставляют или оборачивают текст (`insert`, `wrap`) |

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

1. `bbforge.profile-selector` добавляет список профилей в строку состояния и объявляет слот `bbforge.profile-selector.options`.
2. `bbforge.selector-style` оформляет этот список своим CSS и скрывает дублирующую метку `status.profile`.
3. `bbforge.forum-profiles` добавляет профили XenForo, phpBB и SMF и пункт «Другие форумы…» в слот селектора.

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

`keys` записываются по физическим клавишам (`Ctrl+Alt+KeyH`, `Ctrl+Shift+Digit1`), так же как в настройках сочетаний. Сочетания пользователя и встроенные важнее: занятое сочетание плагину не достанется. Команды попадают в палитру (Ctrl+Shift+P), их можно ставить в меню и на панели.

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

Чтобы BBForge доверял ключу другого разработчика, добавьте его открытый ключ в `TRUSTED_KEYS` в `src-tauri/src/plugins.rs`.

## Каталоги

Репозиторий каталога содержит `packages/<папка>/` с исходниками пакетов, `dist/` с подписанными архивами и `index.json`. Всё это собирает `build.sh` (`bbforge-pack pack` для каждой папки и затем `bbforge-pack index`). BBForge читает `index.json` из `main`-ветки репозиториев, перечисленных в `CATALOGS` (`src-tauri/src/catalog.rs`). Скачанный архив сверяется с SHA-256 из каталога, затем проходит ту же проверку подписи и разрешений, что и файл с диска.
