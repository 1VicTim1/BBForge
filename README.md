# BBForge

BBForge — настольный редактор больших BBCode-постов и шапок 4PDA для Linux и Windows. Он сохраняет исходное форматирование документа, показывает структуру и приближённый предпросмотр, а также находит ошибки вложенности тегов.

## Возможности первой версии

- CodeMirror 6: подсветка BBCode, поиск, undo/redo и сворачивание spoiler.
- Lossless-парсер и линтер на Rust.
- Дерево тегов, переход к исходному диапазону и список диагностик.
- Локальный React-предпросмотр без исполнения HTML и загрузки изображений.
- Открытие и атомарное сохранение UTF-8 с сохранением BOM и смешанных LF/CRLF.
- Проверка неизвестных тегов, параметров, пересечений, незакрытых тегов и повторных ссылок.

Предпросмотр ориентирован на синтаксис 4PDA, но не гарантирует пиксельное совпадение с форумным движком. Ссылки открываются только после клика и только для `http`, `https` и `mailto`.

## Разработка

Требуются Node.js 24 и актуальный стабильный Rust.

```bash
npm ci
npm run dev
```

Браузерный dev-режим показывает интерфейс, но Rust-анализ и файловые диалоги работают в Tauri:

```bash
npm run tauri -- dev --features desktop
```

Для Linux нужны WebKitGTK 4.1, GTK 3 и стандартные зависимости Tauri. На Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

## Проверка

```bash
cargo fmt --all -- --check
cargo test --workspace --no-default-features
cargo clippy --workspace --all-targets --no-default-features -- -D warnings
npm run typecheck
npm test -- --run
npx playwright test
npm run build
```

## Сборка

```bash
npm run tauri:build
```

Результаты появляются в `target/release/bundle`. Windows использует системный WebView2 Runtime; современные Windows 10/11 обычно уже содержат его. Linux-пакеты зависят от системного WebKitGTK.
