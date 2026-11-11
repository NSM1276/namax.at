# namax.at Relaunch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить нынешний namax.at новым статичным сайтом-визиткой в стиле C с эффектной анимацией при прокрутке, на немецком и английском.

**Architecture:** Шесть самостоятельных HTML-страниц с полным текстом в разметке, один `css/site.css`, один `js/motion.js`. Скрипт только считает прогресс прокрутки секций и пишет его в CSS-переменные; всё движение описано в CSS и включается классом `js-motion` на `<html>`. Без этого класса страница — обычная читаемая лента.

**Tech Stack:** HTML, CSS, ванильный JavaScript (ES2020), Node 25 только для проверочного скрипта, хостинг Vercel.

**Spec:** `docs/superpowers/specs/2026-11-11-namax-relaunch-design.md` — исполнитель читает его целиком; тексты секций берутся оттуда дословно.

## Global Constraints

- Работа идёт в ветке `relaunch`, не в `main`. Ничего не пушить и не выкладывать без слова заказчика.
- На сайте нет: цен, знака `€`, клиентов, отзывов, годов основания, стажа, слов «Vater», «Sohn», обещаний о скорости ответа.
- Ссылки действия ведут только на `https://wa.me/4367764292055?text=…` и (когда появится ник) `https://t.me/<ник>`. `mailto:` и адрес `office@na-max.com` — только на страницах Impressum и Datenschutz.
- Ника Telegram пока нет: кнопка Telegram не выводится нигде, заглушек `t.me/` в коде нет.
- Никаких внешних запросов: шрифты, скрипты, стили — только со своего домена.
- Палитра: `#FFF8E7`, `#141414`, `#D6FF3F`, `#FF4D2E`, `#8C7BFF`, `#FFFFFF`; `#25D366` только для WhatsApp.
- Шрифты: Bricolage Grotesque (заголовки), Inter Tight (текст), файлы в `fonts/`.
- Анимируются только `transform` и `opacity`. Высоты закреплённых сцен — в `svh`.
- Вёрстка от 360px. Проверочные размеры: 360×740, 390×844, 768×1024, 1440×900.
- Canonical и `og:url` — на `https://www.namax.at/…`.
- Обращение в немецком тексте на «Sie».

## Review Focus

1. **JavaScript не загрузился или отключён** — виден весь текст, работают все кнопки, нет пустых экранов и закреплённых секций. Тест: Task 1 (`check.mjs`, текст в сыром HTML) и Task 5, шаг 5.
2. **`prefers-reduced-motion: reduce`** — класс `js-motion` не ставится, секции идут обычной лентой. Тест: Task 5, шаг 5.
3. **Низкий экран (360×640, телефон боком)** — содержимое закреплённой сцены не обрезается: если оно выше экрана, сцена не закрепляется. Тест: Task 6, шаг 4 и Task 7, шаг 4.
4. **Адресная строка iOS/Android прячется при прокрутке** — сцены не дёргаются при изменении высоты окна; пересчёт только по ширине. Тест: Task 5, шаг 5 (изменение одной высоты окна).
5. **Длинные немецкие слова и увеличенный шрифт (200%)** — нет горизонтальной прокрутки на 360px. Тест: Task 2, шаг 5 и Task 10, шаг 6.

---

## Структура файлов

| Файл | Назначение |
|---|---|
| `index.html` | Немецкая главная |
| `en/index.html` | Английская главная |
| `impressum.html`, `datenschutz.html` | Юридические страницы, DE |
| `en/impressum.html`, `en/datenschutz.html` | Юридические страницы, EN |
| `css/site.css` | Все стили: токены, компоненты, секции, движение |
| `js/motion.js` | Прогресс прокрутки → CSS-переменные |
| `fonts/` | Inter Tight (уже есть) + Bricolage Grotesque |
| `og-de.png`, `og-en.png` | Превью для мессенджеров, 1200×630 |
| `tools/og.html` | Исходник превью (снимается скриншотом) |
| `tools/check.mjs` | Проверка правил сайта по сырому HTML |
| `vercel.json`, `sitemap.xml`, `robots.txt`, `favicon.svg` | Служебные |

Общие имена, на которые опираются все задачи:

- Секции главной по порядку: `#hero`, `#services`, `#showcase`, `#how`, `#contact`.
- Закреплённая сцена: `<section data-scene data-steps="N">` с внутренним `<div class="scene-pin">`.
- `motion.js` выставляет на каждой `[data-scene]`: CSS-переменную `--p` (число 0…1) и атрибут `data-step` (целое 0…N−1).
- Кнопки: `.btn`, `.btn-wa`, `.btn-tg`. Нижняя полоса на телефоне: `.dock`.

---

### Task 1: Ветка, уборка, каркас и проверочный скрипт

**Files:**
- Create: `tools/check.mjs`, `index.html` (каркас), `css/site.css` (пустой), `js/motion.js` (пустой)
- Delete: `css/styles.css`, `js/app.js`, `js/translations.js`, `portfolio/`, `assets/`, `de.html`, `it.html`, `en.html`, `logo.jpg`, `logo2.jpg`, `nasim.png`, `og-image-*`, `fonts/instrument-serif-*`
- Modify: `.gitignore` (добавить `.superpowers/`)

**Interfaces:**
- Produces: команда `node tools/check.mjs` — код выхода 0, если все правила соблюдены, иначе 1 и список нарушений в виде `файл: правило`.

- [ ] **Step 1: Создать ветку**

Run: `git switch -c relaunch`

- [ ] **Step 2: Написать `tools/check.mjs`**

Скрипт без зависимостей читает все `*.html` в корне и в `en/` и проверяет:

```js
// для каждой страницы
assert(!/€|\bEUR\b|\b799\b/.test(html),            'no-price');
assert(!/2006|20 Jahre|20 years|Vater|Sohn|father|\bson\b/i.test(text), 'no-invented-claims');
assert(!/t\.me\/(<|$|")/.test(html),                'no-telegram-placeholder');
assert(!/https?:\/\/(fonts\.googleapis|fonts\.gstatic|cdn\.)/.test(html), 'no-external-requests');
assert(/<link rel="canonical" href="https:\/\/www\.namax\.at\//.test(html), 'canonical');
assert(/hreflang="de"/.test(html) && /hreflang="en"/.test(html) && /hreflang="x-default"/.test(html), 'hreflang');
// только НЕ юридические страницы
assert(!/mailto:|office@na-max\.com/.test(html),    'no-email-outside-legal');
// только главные страницы
for (const id of ['hero','services','showcase','how','contact']) assert(html.includes(`id="${id}"`), `section-${id}`);
assert((html.match(/href="https:\/\/wa\.me\/4367764292055\?text=/g) || []).length >= 3, 'whatsapp-cta');
assert(text.length > 1200,                           'text-in-html');   // текст есть без JS
```

`text` — это `html` без тегов, `<script>` и `<style>`. Юридические страницы определяются по имени файла (`impressum`, `datenschutz`).

- [ ] **Step 3: Убедиться, что проверка падает на старом сайте**

Run: `node tools/check.mjs`
Expected: код 1, среди нарушений `index.html: no-price` и `index.html: text-in-html`.

- [ ] **Step 4: Удалить старые файлы из списка Delete и заменить `index.html` каркасом**

Каркас: `<!doctype html>`, `lang="de"`, подключение `css/site.css` и `<script src="js/motion.js" defer>`, пустые `<section>` с пятью id, canonical и три `hreflang`.

- [ ] **Step 5: Спросить заказчика про `project/` и `README.md`**

Они не записаны в git, удаление необратимо. Удалять только после явного «да». Без ответа — оставить и продолжать.

- [ ] **Step 6: Запустить проверку**

Run: `node tools/check.mjs`
Expected: остаются только `whatsapp-cta` и `text-in-html` для `index.html`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove old site, add skeleton and site rule checks"
```

---

### Task 2: Основа стилей, шапка, первый экран, подвал, нижняя полоса

**Files:**
- Modify: `index.html`, `css/site.css`
- Create: `fonts/bricolage-grotesque-latin.woff2`, `fonts/bricolage-grotesque-latin-ext.woff2`

**Interfaces:**
- Produces: CSS-токены `--cream --ink --lime --red --violet --white --wa`, `--radius: 22px`; классы `.wrap`, `.btn`, `.btn-wa`, `.btn-tg`, `.tile`, `.dock`, `.site-header`, `.site-footer`. Константа ссылки WhatsApp (DE): `https://wa.me/4367764292055?text=Hallo%2C%20ich%20interessiere%20mich%20f%C3%BCr%20Ihre%20Leistungen.`

- [ ] **Step 1: Получить шрифт Bricolage Grotesque**

Нужны два файла woff2 (variable, оси `opsz` и `wght`, подмножества latin и latin-ext, лицензия OFL). Скачивание файла требует согласия заказчика: назвать источник и размер и дождаться «да». Старый шаблон `@font-face` с `unicode-range` взять из истории git (`git show main:index.html`, строки 32–37).

- [ ] **Step 2: Токены и базовые стили в `css/site.css`**

Сброс, токены, `@font-face`, типографика: заголовки Bricolage Grotesque 800, `letter-spacing: -.05em`, `line-height: .92`; текст Inter Tight. `overflow-wrap: anywhere` для заголовков, `hyphens: auto` для абзацев.

- [ ] **Step 3: Шапка, первый экран, подвал, `.dock` в `index.html`**

Тексты — из разделов 6.1, 6.2, 6.8, 6.9 спецификации дословно. Эталон вида — секция `.C` в `.superpowers/brainstorm/1834-1794365556/content/hero-directions.html`. Отличия от эталона: в шапке нет пунктов меню, есть ссылка `DE / EN` (на `/en`); кнопки Telegram нет. Каждое слово заголовка первого экрана обёрнуто в `<span class="w">`, слово `richtig` — в `<mark>`. `.dock` виден только при ширине до 760px.

- [ ] **Step 4: Запустить проверку**

Run: `node tools/check.mjs`
Expected: для `index.html` остаётся только `text-in-html` (текста пока мало).

- [ ] **Step 5: Проверить глазами в браузере**

Открыть `index.html` при 360×740, 390×844, 1440×900 и при масштабе текста 200%.
Expected: `document.documentElement.scrollWidth === innerWidth` на каждом размере; плитки и кнопки не вылезают за край.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: base styles, header, hero, footer and mobile dock"
```

---

### Task 3: Секция услуг (без движения)

**Files:**
- Modify: `index.html`, `css/site.css`

**Interfaces:**
- Produces: `<section id="services" data-scene data-steps="5">`, внутри пять `<article class="svc svc-N">` (N = 1…5), в каждой `<h2>`, `<p>` и `<div class="svc-art" aria-hidden="true">`.

- [ ] **Step 1: Разметка пяти карточек**

Заголовки и тексты — из раздела 6.3 спецификации дословно. Цвета фона по порядку: `--ink`, `--red`, `--lime`, `--violet`, `--white`.

- [ ] **Step 2: Иллюстрации в `.svc-art`**

Пять рисунков на HTML/CSS/SVG по описанию из 6.3: сборка страницы из блоков; сетка профиля 3×3; три слайда карусели; строка поиска с тремя результатами; пост с пометкой «Anzeige». Без цифр, без названий реальных фирм, без растровых картинок.

- [ ] **Step 3: Вид без движения**

Карточки идут обычной лентой одна под другой, каждая не ниже `70svh` на телефоне.

- [ ] **Step 4: Проверка и просмотр**

Run: `node tools/check.mjs` — нарушений для `#services` нет.
Открыть при 360×740 и 1440×900: текст каждой карточки читается, иллюстрация не перекрывает текст.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: services section with coded illustrations"
```

---

### Task 4: Секции «Schauen Sie selbst», переписка и финал (без движения)

**Files:**
- Modify: `index.html`, `css/site.css`

**Interfaces:**
- Produces:
  - `<section id="showcase" data-scene data-steps="3">` → `.phone` с тремя `.screen.screen-N` (карусель, Reel, лента с рекламой) и тремя подписями `.sticker.sticker-N`.
  - `<section id="how" data-scene data-steps="4">` → `.chat` с четырьмя `.msg.msg-N` (`.msg-in` — посетитель, `.msg-out` — namax) и списком `.steps` из трёх пунктов.
  - `<section id="contact" data-scene data-steps="1">` → `<h2>` и `.btn-wa`.

- [ ] **Step 1: `#showcase`**

Тексты — из 6.4. Заведение в сценах называется «Ihr Café». Без движения три экрана показаны стопкой друг под другом внутри одной рамки телефона высотой по содержимому.

- [ ] **Step 2: `#how`**

Сообщения и подписи — из 6.6 дословно. Четвёртое сообщение завершается настоящей ссылкой `.btn-wa`. Без движения все сообщения видны.

- [ ] **Step 3: `#contact`**

Тексты — из 6.7. Фон `--ink`. Наблюдатель в Task 5 скрывает `.dock`, когда `#contact` на экране; до этого `.dock` просто виден.

- [ ] **Step 4: Проверка**

Run: `node tools/check.mjs`
Expected: для `index.html` нарушений нет (код 0, если других страниц ещё нет).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: showcase phone, chat walkthrough and final call to action"
```

---

### Task 5: `motion.js` — прогресс прокрутки

**Files:**
- Modify: `js/motion.js`
- Create: `tools/motion.test.mjs`

**Interfaces:**
- Produces: чистая функция `sceneProgress(top, height, viewport)` → число 0…1 и `stepOf(p, steps)` → целое 0…steps−1, обе экспортируются для теста через `globalThis.__motion` при отсутствии `document`. В браузере скрипт: ставит `html.js-motion`, если `matchMedia('(prefers-reduced-motion: reduce)')` не совпал; на каждом кадре прокрутки пишет `--p` и `data-step` на каждую `[data-scene]`; ставит `html.dock-hidden`, пока `#contact` пересекает экран.

- [ ] **Step 1: Написать тест**

```js
import assert from 'node:assert/strict';
await import('../js/motion.js');
const { sceneProgress, stepOf } = globalThis.__motion;
assert.equal(sceneProgress(100, 3000, 800), 0);        // сцена ещё ниже верха
assert.equal(sceneProgress(0, 3000, 800), 0);
assert.equal(sceneProgress(-1100, 3000, 800), 0.5);    // середина: (height - viewport) / 2
assert.equal(sceneProgress(-2200, 3000, 800), 1);
assert.equal(sceneProgress(-9999, 3000, 800), 1);      // зажато сверху
assert.equal(sceneProgress(0, 600, 800), 0);           // сцена ниже экрана: без деления на ноль
assert.equal(stepOf(0, 5), 0);
assert.equal(stepOf(0.5, 5), 2);
assert.equal(stepOf(1, 5), 4);                         // не выходит за последний шаг
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node tools/motion.test.mjs`
Expected: ошибка — `__motion` не определён.

- [ ] **Step 3: Реализовать `js/motion.js`**

Один обработчик `scroll` (passive) с `requestAnimationFrame`. Размеры сцен кэшируются и пересчитываются только когда изменилась **ширина** окна — изменение одной высоты (адресная строка телефона) пересчёта не вызывает. Скрытие `.dock` — через `IntersectionObserver`.

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `node tools/motion.test.mjs`
Expected: без вывода, код 0.

- [ ] **Step 5: Проверить в браузере три режима**

- Обычный: у `<html>` есть `js-motion`, при прокрутке у `#services` меняются `--p` и `data-step`.
- Эмуляция `prefers-reduced-motion: reduce`: класса `js-motion` нет.
- JavaScript отключён: класса нет, весь текст виден, кнопки работают.
- Изменить только высоту окна (844 → 760 при той же ширине): значения `--p` не скачут, пересчёта размеров сцен нет.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scroll progress engine with reduced-motion and no-JS fallback"
```

---

### Task 6: Движение первого экрана и стопки услуг

**Files:**
- Modify: `css/site.css`, `index.html` (при необходимости — `data-scene` на `#hero`)

**Interfaces:**
- Consumes: `html.js-motion`, `--p`, `data-step` из Task 5; `.w`, `mark`, `.tile`, `.svc-N`, `.svc-art` из Task 2–3.

Все правила этой задачи начинаются с `.js-motion` и лежат внутри `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 1: Первый экран — появление**

При загрузке: слова `.w` выскакивают по очереди (шаг 60 мс), маркер под `richtig` растёт слева направо, плитки падают на место с отскоком. Анимации `@keyframes` с `animation-fill-mode: both`, исходное состояние в разметке — конечное.

- [ ] **Step 2: Первый экран — разлёт при прокрутке**

`#hero` получает `data-scene data-steps="1"`. Плитки смещаются и поворачиваются через `calc()` от `--p`, каждая в свою сторону; заголовок слегка уменьшается.

- [ ] **Step 3: Стопка услуг**

`#services` высотой `calc(5 * 100svh)`; каждая `.svc` — `position: sticky; top: 0; height: 100svh`. Карточка, поверх которой наехала следующая, уменьшается до `scale(.94)` и темнеет. Иллюстрация в `.svc-art` запускается, когда `data-step` секции равен номеру карточки − 1.

- [ ] **Step 4: Проверить на низком экране**

Открыть при 360×640 и при 844×390 (телефон боком).
Expected: текст ни одной карточки не обрезан. Если содержимое выше экрана — для `@media (max-height: 560px)` закрепление отключается, карточки идут лентой.

- [ ] **Step 5: Проверить плавность**

В инструментах разработчика с замедлением процессора ×4 прокрутить `#hero` и `#services`.
Expected: анимируются только `transform` и `opacity`, нет пересчёта раскладки на каждом кадре.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: hero entrance, tile scatter and stacked service cards"
```

---

### Task 7: Движение телефона, переписки и финала

**Files:**
- Modify: `css/site.css`

**Interfaces:**
- Consumes: `data-step` на `#showcase` (0…2) и `#how` (0…3), `--p` на `#contact`; классы из Task 4.

- [ ] **Step 1: Телефон**

`#showcase` высотой `calc(3 * 100svh)`, `.scene-pin` закреплён. Виден только `.screen`, номер которого соответствует `data-step`; смена — сдвигом и прозрачностью. Внутри активного экрана движение идёт само: слайды карусели листаются, текст «Reel» появляется по словам, рекламный пост въезжает в ленту. Подписи `.sticker-N` вылетают сбоку вместе со своим экраном. При ширине до 760px рамка телефона занимает `min(88vw, 52svh * 9 / 19)`.

- [ ] **Step 2: Переписка**

`#how` высотой `calc(3 * 100svh)`. Сообщение `.msg-N` видно, когда `data-step ≥ N − 1`; перед сообщениями namax на 600 мс показывается индикатор «печатает». Пункт `.steps` подсвечивается по шагу.

- [ ] **Step 3: Финал**

Заголовок `#contact` растёт от `scale(.7)` до `scale(1)` по `--p`.

- [ ] **Step 4: Проверить на низком экране**

Открыть при 360×640 и 844×390.
Expected: рамка телефона и переписка помещаются целиком; при `max-height: 560px` сцены не закрепляются и показывают всё содержимое лентой.

- [ ] **Step 5: Полный проход**

Прокрутить страницу сверху вниз и обратно при 390×844.
Expected: ни одна сцена не «запирает» прокрутку, обратная прокрутка возвращает сцены в исходное состояние, `.dock` исчезает на финале.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: phone showcase, chat and finale scroll scenes"
```

---

### Task 8: Английская версия

**Files:**
- Create: `en/index.html`

**Interfaces:**
- Consumes: вся разметка `index.html`; стили и скрипт подключаются как `/css/site.css` и `/js/motion.js`.

- [ ] **Step 1: Скопировать `index.html` в `en/index.html` и перевести**

`lang="en"`, тот же простой тон, обращение «you». Ссылка WhatsApp с английским приветствием: `?text=Hello%2C%20I%27m%20interested%20in%20your%20services.` Переключатель языка ведёт на `/`. Canonical — `https://www.namax.at/en`.

- [ ] **Step 2: Привести пути в `index.html` к абсолютным**

`/css/site.css`, `/js/motion.js`, `/fonts/…`, чтобы обе версии использовали одни файлы.

- [ ] **Step 3: Проверка**

Run: `node tools/check.mjs`
Expected: код 0 для `index.html` и `en/index.html`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: English version"
```

---

### Task 9: Impressum и Datenschutz

**Files:**
- Create: `impressum.html`, `datenschutz.html`, `en/impressum.html`, `en/datenschutz.html`
- Modify: `css/site.css` (класс `.legal`)

- [ ] **Step 1: Четыре страницы**

Шапка и подвал — как на главной, без `.dock` и без сцен. Содержание — из раздела 9 спецификации. Данные Impressum: Nasim Nuridinov e.U., Tscherttegasse 39, 1120 Wien, office@na-max.com, +43 677 64292055, UID ATU80802758, Magistrat der Stadt Wien, Mitglied der WKO Wien, Unternehmensgegenstand «Webdesign & Webentwicklung». В Datenschutz: нет формы, нет cookies, нет слежения, шрифты на своём сервере, хостинг Vercel, переход в WhatsApp/Telegram — по правилам этих сервисов; нормы — DSGVO и австрийское право (TKG 2021), без ссылок на немецкий TDSG.

- [ ] **Step 2: Отметить для заказчика**

В итоговом отчёте задачи написать: данные Impressum взяты со старого сайта и не подтверждены заказчиком; предмет деятельности не расширен.

- [ ] **Step 3: Проверка**

Run: `node tools/check.mjs`
Expected: код 0 для всех шести страниц; `mailto:` встречается только в юридических.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: legal pages in German and English"
```

---

### Task 10: Поиск, превью, перенаправления и итоговая проверка

**Files:**
- Modify: все шесть HTML (метаданные), `vercel.json`, `sitemap.xml`, `robots.txt`, `favicon.svg`, `tools/check.mjs`
- Create: `tools/og.html`, `og-de.png`, `og-en.png`

- [ ] **Step 1: Дополнить проверку и убедиться, что она падает**

Добавить в `tools/check.mjs`:

```js
assert(/<meta property="og:image" content="https:\/\/www\.namax\.at\/og-(de|en)\.png"/.test(html), 'og-image');
assert(/<script type="application\/ld\+json">/.test(html) === isHome, 'json-ld-on-home-only');
assert(/<meta name="description" content=".{50,160}"/.test(html), 'description');
```

Run: `node tools/check.mjs` → Expected: код 1, нарушения `og-image`, `description`.

- [ ] **Step 2: Метаданные и JSON-LD**

На каждой странице: `title`, `description`, Open Graph и Twitter-карточка. На двух главных — JSON-LD типа `ProfessionalService`: `name: "namax"`, адрес и телефон из Impressum, `areaServed: "Wien"`, `makesOffer` из пяти услуг. Без `aggregateRating`, `priceRange`, `foundingDate`.

- [ ] **Step 3: Превью для мессенджеров**

`tools/og.html` — страница 1200×630 в стиле C: логотип, заголовок первого экрана, цветные плитки; важное содержимое в центральном квадрате 630×630 (мессенджеры обрезают по квадрату). Параметр `?lang=en` переключает текст. Снять скриншотами в `og-de.png` и `og-en.png`.

- [ ] **Step 4: Служебные файлы**

`vercel.json`: сохранить `cleanUrls` и `trailingSlash: false`, добавить `redirects`: `/de` → `/`, `/it` → `/`; запрос `/` с `?lang=en` → `/en`; с `?lang=de` или `?lang=it` → `/` (через `has` с типом `query`). `sitemap.xml`: шесть адресов на `https://www.namax.at`, для главных — `xhtml:link` de/en/x-default. `robots.txt`: ссылка на `https://www.namax.at/sitemap.xml`. `favicon.svg`: буква n на `#141414` с цветом `#D6FF3F`.

- [ ] **Step 5: Запустить все проверки**

Run: `node tools/check.mjs && node tools/motion.test.mjs`
Expected: код 0.

- [ ] **Step 6: Проверка по разделу 13 спецификации**

- JavaScript отключён: весь текст виден, кнопки работают.
- 360×740, 390×844, 768×1024, 1440×900: нет горизонтальной прокрутки.
- Lighthouse (мобильный режим) для `/` и `/en`: производительность и доступность не ниже 90. Числа записать в отчёт.
- Поиск по всем HTML: нет `€`, `799`, `2006`, «Jahre Erfahrung», «Vater», «Sohn».

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: metadata, structured data, social previews and redirects"
```

- [ ] **Step 8: Остановиться**

Не сливать в `main`, не пушить, не выкладывать. Показать заказчику сайт локально и спросить, что дальше.

---

## Отложено до ответа заказчика

- **Кнопка Telegram.** Когда появится ник: добавить `.btn-tg` рядом с каждой `.btn-wa` (первый экран, `.dock`, финал) на обеих главных; в `tools/check.mjs` добавить требование хотя бы трёх ссылок `https://t.me/<ник>`.
- **Impressum.** Подтвердить данные и, если нужно, расширить Unternehmensgegenstand.
- **`project/` и `README.md`.** Удалить после явного согласия.
