# Страницы заведений: подготовка и проверки после выкладки

Страницы `<slug>.namax.at` больше не лежат файлами в `v/<slug>/`. Их собирает функция `api/venue/page.js` из базы при каждом запросе. `middleware.js` направляет туда любой адрес заведения, кроме `/api/` и `/v/_shared/`.

## Шаг 0. Что делает Насим (один раз, до первой выкладки)

1. Vercel → проект namax → Storage: создать **Neon Postgres** и **Blob**, подключить к проекту. Vercel сам добавит `DATABASE_URL` и `BLOB_READ_WRITE_TOKEN`.
2. Vercel → проект → Settings → Environment Variables: добавить `ANTHROPIC_API_KEY`.
3. Создать таблицы: вставить содержимое `api/_lib/venues/schema.sql` в Neon → SQL Editor и выполнить. Это безопасно повторять: стоит `if not exists`.
4. Скопировать `DATABASE_URL` в `.env.local` (файл не попадает в git), чтобы работали `tools/venue-sync.mjs` и `tools/venue-inbox.mjs`.
5. Загрузить пачку (сначала без `--write`, чтобы посмотреть, что будет):
   ```
   node tools/venue-sync.mjs --city --district 12 --kind friseur --limit 15
   node tools/venue-sync.mjs --city --district 12 --kind friseur --limit 15 --write
   ```
   Без `--public` страницы скрыты от поиска (`noindex`), но открываются по адресу. Ключи владельцев — в `venues/.keys.tsv`, ссылки — в `venues/.links-<дата>.md`. Оба файла не попадают в git. Никому их не пересылать целиком.
6. Каждое утро: `node tools/venue-inbox.mjs` — удаления (срочно), вопросы, изменения за сутки.

## Проверки после выкладки

`<slug>` — любая страница из пачки, `<Название>` — название этого заведения, `<ключ>` — его ключ из `venues/.keys.tsv`.

| Что проверяем | Команда | Что должно быть |
|---|---|---|
| По адресу открывается страница заведения | `curl -s https://<slug>.namax.at/ \| grep -c "<Название>"` | `1` или больше |
| …и это не главная namax | `curl -s https://<slug>.namax.at/ \| grep -c "Studio für Web"` | `0` |
| Скрытая страница закрыта от поиска | `curl -s https://<slug>.namax.at/ \| grep -c noindex` | `1` у скрытой, `0` у открытой |
| В публичной странице нет чата и ключа | `curl -s https://<slug>.namax.at/ \| grep -c 'data-oc'` | `0` |
| Владелец видит чат | `curl -s "https://<slug>.namax.at/?k=<ключ>" \| grep -c 'role="dialog"'` | `1` |
| Страница владельца не кешируется | `curl -sI "https://<slug>.namax.at/?k=<ключ>" \| grep -i cache-control` | `private, no-store` |
| Чат без ключа закрыт | `curl -s -X POST https://<slug>.namax.at/api/venue/chat -d '{"input":{"start":true}}' -o /dev/null -w '%{http_code}'` | `403` |
| robots.txt у заведения | `curl -s https://<slug>.namax.at/robots.txt` | `Disallow: /` у скрытой, `Allow: /` и `Sitemap` у открытой |
| Sitemap | `curl -s https://www.namax.at/api/venue/sitemap` | только открытые заведения |
| Шрифты на адресе заведения | `curl -sI https://<slug>.namax.at/v/_shared/fonts/anton-latin.woff2` | `200` |
| Старый путь уводит на адрес заведения | `curl -sI https://www.namax.at/v/<slug>` | `307`, `location: https://<slug>.namax.at/` |
| Несуществующее заведение | `curl -sI https://gibt-es-nicht.namax.at/` | `404` |
| Основной сайт не задет | `curl -sI https://www.namax.at/webdesign-wien` | `200` |
| Почта не задета | `nslookup -type=MX namax.at` | `mx03` и `mx04.secure-mailgate.com` |

Живая проверка чата (руками, на телефоне): открыть ссылку владельца → «Chat öffnen» → язык → «Etwas ändern» → «Öffnungszeiten» → изменить день → «Speichern». Страница сразу показывает новое время. Потом «Fotos hinzufügen» → одно фото → оно появляется на странице. Затем написать свободный текст, например «Samstag bis 17 Uhr»: это первый настоящий вызов модели. В ответе должно быть «Ich habe verstanden: … Soll ich das so übernehmen?».

## Что не проверено до выкладки

Всё ниже проверено локально (тесты и `tools/serve.mjs`), но не на Vercel:
- что функции с `export const GET/POST` запускаются на Node-рантайме Vercel;
- что `middleware.js` подхватывается и не перенаправляет, а подставляет адрес;
- запросы к Neon (`sql.query`). Сами запросы проверены на настоящем движке Postgres (PGlite) с этой же `schema.sql`;
- загрузка в Vercel Blob (`put`);
- схемы инструментов для Claude (`strict: true`, `anyOf` с `null`): если первый вызов вернёт 400, причина здесь (`api/_lib/venues/assistant.mjs`, `TOOLS`).

Если первая строка таблицы даёт `0`:
1. Проверить, что сертификат для `*.namax.at` выпущен (Vercel → проект → Domains).
2. Vercel → проект → Logs: вызывается ли Middleware и `api/venue/page` на запрос к адресу заведения. Ошибка `DATABASE_URL is not set` значит, что не сделан шаг 0.
3. Не выкладывать пачку дальше, пока это не починено.
