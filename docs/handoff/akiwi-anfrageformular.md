# Передача для сессии akiwi-at: форма заявки вместо WhatsApp

Написано сессией namax-at 2026-11-24. Сессия namax в репозиторий akiwi-at не пишет: эти правки делает сессия akiwi-at, после «ок» от Nasim.

## Что уже сделано на стороне namax

- Одна общая форма для трёх сайтов (namax.at, akiwi.at, fightfolio.de) лежит на `https://www.namax.at/js/contact.js`.
- Заявки приходят Nasim в его список на namax (`/liste`, вкладка «Anfragen») с меткой «akiwi.at». Там же кнопки «Anrufen» / «WhatsApp» с готовым приветствием «hier ist Nasim von Akiwi».
- Сервер узнаёт, что заявка с Akiwi, по адресу сайта (Origin `https://akiwi.at` или `https://<что-угодно>.akiwi.at`), а не по тексту заявки. Чужие сайты получают отказ.
- В статистике namax (`/liste/statistik`) есть счётчик формы по шагам. Считается без имён, номеров и текста: на какой странице и какой кнопкой открыли, кто выбран, что выбрано, на каком шаге закрыли, отправили ли.
- Форма сама подбирает вид Akiwi: белая карточка, чёрная обводка, зелёный #1F9D55. Обращение на «Sie». Языки DE / EN / TR.
- Форма ничего не сохраняет в браузере (ни cookies, ни localStorage).

**Пока это не задеплоено:** namax ждёт «ок» Nasim на деплой. Правки ниже включать только после того, как `https://www.namax.at/js/contact.js` отдаёт новую версию (в ней есть строка `akiwi`).

## Что сделать в akiwi-at

### 1. Подключить скрипт один раз

В `app/layout.jsx`, внутри `<body>`:

```jsx
<script src="https://www.namax.at/js/contact.js?v=2" defer />
```

CSP у akiwi сейчас нет (`next.config.mjs` и `vercel.json` без `Content-Security-Policy`). Если появится, добавить `https://www.namax.at` в `script-src` и в `connect-src`.

### 2. Кнопки

Любой элемент с `data-contact="<место>"` открывает форму. Место: латиница, до 12 букв, пишется в статистику («какой кнопкой открыли»).

Дополнительные атрибуты (все по желанию):

| атрибут | что делает |
|---|---|
| `data-role` | сразу отвечает на шаг 1 «кто вы»: `owner` (у меня заведение), `staff` (работаю там), `guest` (гость) |
| `data-wish` | сразу отвечает на шаг 2 «что нужно»: `add` (добавить заведение), `fix` (изменить данные), `certificate` (прислать халяль-сертификат), `photos` (прислать фото), `report` (сообщить об ошибке), `remove` (убрать заведение), `other` (другое) |
| `data-topic` | о чём заявка, до 120 знаков, например название заведения. Nasim видит его в заголовке заявки и в приветствии. |
| `data-text` | готовый текст от страницы, до 1200 знаков. Добавляется к сообщению. |
| `data-lang` | язык формы. Без него берётся `lang` ближайшего родителя. `<main lang={lang}>` на /lokale и /eintrag уже есть, так что TR / EN / DE переключаются сами. |

Гостю (`guest`) номер не обязателен, зато нужно сообщение. Гость видит только `report` / `add` / `other`.

### 3. Где менять

- **`components/LokaleContent.jsx`.** Кнопка `whatsapp` (используется дважды) становится:
  ```jsx
  <button type="button" className="ak-btn ak-btn--green ak-btn--block ak-lokale-cta" data-contact="lokale" data-role="owner">{c.write}</button>
  ```
  `c.write` надо добавить в `data/lokale-copy.js`: DE «Anfrage senden», EN «Send a request», TR «Talep gönderin».
  Строку `c.reply` под кнопкой оставить. Instagram, телефон и e-mail пока оставить; убирать ли их, решает Nasim в конце.
- **`app/eintrag/[id]/EintragForm.jsx`, функция `send()`.** Вместо `window.open(CONTACT.whatsapp(buildMessage()))` кнопка отправки открывает форму с готовым текстом:
  ```jsx
  <button type="submit" ... {...(consent ? { 'data-contact': 'eintrag', 'data-role': 'owner', 'data-wish': 'fix', 'data-topic': venue.name, 'data-text': buildMessage() } : {})}>
  ```
  - Пока галочка согласия не стоит, атрибутов нет. Срабатывает своя проверка (`setTried(true)`), а форма namax не открывается.
  - `send()` для случая с согласием больше ничего не открывает, только `e.preventDefault()`.
  - Владелец в форме вводит номер и выбирает «Anruf» или «WhatsApp». Фото и сертификат Nasim потом попросит в WhatsApp.
- **Прочие места**, где сейчас `CONTACT.whatsapp(...)`: заменить так же, с подходящими `data-role` / `data-wish`. Найти их: `grep -rn "CONTACT.whatsapp" app components`.

### 4. Обязательно до включения на живом сайте

- **Datenschutz.** У akiwi сейчас нет страницы Datenschutz. Сейчас ссылка «Datenschutz» в форме ведёт на `https://www.akiwi.at/impressum`. Форма собирает номер телефона, имя и текст, поэтому без текста о защите данных её включать нельзя. Nasim отложил этот пункт «на самый конец»; вернуться к нему вместе с Nasim. Что текст должен сказать:
  - что хранится: кто, что, номер, имя, текст, время;
  - зачем: только чтобы ответить;
  - сколько хранится: выполненные заявки 90 дней, невыполненные до 180 дней;
  - где лежит: хостинг Vercel и база Neon у namax, ответственный Nasim;
  - что форма грузится с `www.namax.at`;
  - что шаги формы считаются без личных данных.

  Как появится страница, поменять ссылку в `js/contact.js` на стороне namax (`privacy` у akiwi).
- **Проверка.** Превью Vercel (`*.vercel.app`) сервер namax не пустит: это чужой адрес. Проверять только на `www.akiwi.at` после деплоя, одной настоящей заявкой от Nasim, потом отметить её «Erledigt».
