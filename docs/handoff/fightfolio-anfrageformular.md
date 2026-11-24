# Передача для сессии FightFolio-MMA: форма заявки вместо WhatsApp / Instagram / mailto

Написано сессией namax-at 2026-11-24. Сессия namax в репозиторий FightFolio-MMA не пишет: эти правки делает сессия FightFolio, после «ок» от Nasim.

## Что уже сделано на стороне namax

- Одна общая форма для трёх сайтов лежит на `https://www.namax.at/js/contact.js`.
- Заявки приходят Nasim в его список на namax (`/liste`, вкладка «Anfragen») с меткой «fightfolio.de». Там же кнопки «Anrufen» / «WhatsApp» с приветствием «hier ist Nasim von FightFolio».
- Сервер узнаёт FightFolio по адресу сайта (Origin `https://fightfolio.de` или `https://www.fightfolio.de`). Чужие сайты, превью `*.vercel.app` и `http://` получают отказ.
- Шаги формы считаются в статистике namax без имён, номеров и текста.
- Вид FightFolio: тёмная карточка #13131A, текст #F4F4F6, оранжевый #ED681F, углы 6px. Обращение на «du». Языки DE / EN, по `lang` страницы или ближайшего родителя.
- В браузере ничего не сохраняется.

**Пока это не задеплоено:** namax ждёт «ок» Nasim. Правки включать после того, как `https://www.namax.at/js/contact.js` отдаёт версию со строкой `fightfolio`.

## Конфликт с правилами FightFolio, решает Nasim

В CLAUDE.md FightFolio есть два правила, которые эта форма меняет:
- «Kein Tracking, keine Cookies, keine Drittanbieter-Requests»: скрипт грузится с `www.namax.at`, это сервер самого Nasim, но другой домен. Шаги формы считаются без личных данных.
- «Kontaktwege laufen über mailto:, bis es Backend gibt»: бэкенд теперь есть, это namax.

Обновить эти строки в CLAUDE.md, когда Nasim скажет «ок».

Если Nasim не хочет внешний скрипт, есть вариант: положить копию `contact.js` в `public/` FightFolio, тогда в CSP нужен только `connect-src`. Минус: две копии надо держать одинаковыми.

## Что сделать в FightFolio-MMA

### 1. CSP (`next.config.mjs`)

Добавить `https://www.namax.at`:
- в `script-src`: сейчас `'self' 'unsafe-inline'`;
- в `connect-src`: сейчас `'self'`.

### 2. Подключить скрипт один раз

В `components/Shell.jsx`, внутри `<body>`, общий для DE и EN:

```jsx
<script src="https://www.namax.at/js/contact.js?v=2" defer />
```

### 3. Кнопки

Любой элемент с `data-contact="<место>"` (латиница, до 12 букв) открывает форму. Дополнительные атрибуты:

| атрибут | значения |
|---|---|
| `data-role` | `fighter` (Kämpfer/in), `coach` (Trainer/in), `gym` (Club / Gym), `other` (Veranstalter, Presse, Sponsor …) |
| `data-wish` | `profile` (Profil anlegen), `fix` (Angaben korrigieren), `remove` (Profil entfernen), `collab` (Zusammenarbeit), `other` |
| `data-topic` | о ком или о чём, до 120 знаков, например имя бойца или зал |
| `data-text` | готовый текст, до 1200 знаков. Обычно не нужен. |

Где менять:
- **`components/JoinContent.jsx`** (`/fuer-kaempfer`, `/en/for-fighters`): три кнопки `t.roles` с `waLink(msg)` становятся `<button type="button" ... data-contact="join" data-role="fighter|coach|gym" data-wish="profile">`.
  - Текст кнопок оставить. Иконку WhatsApp заменить на стрелку или убрать.
  - `ctaTitle`: «Schreib mir auf WhatsApp» → «Schreib uns» / «Write to us».
  - `ctaSub`: «die Nachricht ist schon vorbereitet» → «dauert eine Minute».
  - Строка «Kein WhatsApp? Schreib an …» с e-mail: на усмотрение Nasim, по умолчанию оставить.
- **`components/ContactOptions.jsx`** (профиль бойца, GymCta, ForFighters): главной сделать одну кнопку `data-contact="profile"` (на странице зала `"gym"`, в ForFighters `"forfighters"`).
  - `data-topic={topic}`. Для профиля это `f.name`, а не «Anfrage für …»: Nasim видит тему в заголовке.
  - Роль не задавать, пусть человек выберет сам (пишут и бойцы, и промоутеры, и пресса).
  - Instagram и e-mail можно оставить мелкой строкой под кнопкой, WhatsApp убрать. Окончательно решает Nasim в конце.
  - `compact` (сайдбар): та же кнопка, но маленькой ссылкой.

### 4. До включения на живом сайте

- **Datenschutz** (`app/(de)/datenschutz/page.jsx`). Сейчас там написано «Kontakt läuft ausschließlich per E-Mail; es gibt keine Formulare, die Daten speichern». Это станет неправдой. Нужен раздел про форму:
  - что хранится: кто, что, номер, имя, текст, время;
  - зачем: только для ответа;
  - сколько хранится: выполненные 90 дней, остальные до 180;
  - где лежит: Vercel и Neon у namax, ответственный Nasim;
  - что скрипт грузится с www.namax.at;
  - что шаги считаются без личных данных.

  Nasim отложил тексты «на самый конец»; без них форму не включать. Форма ссылается на `/datenschutz`; страница только немецкая, EN-страницы ведут туда же.
- **Проверка.** Только на `www.fightfolio.de` после деплоя, одной настоящей заявкой от Nasim, потом «Erledigt».
