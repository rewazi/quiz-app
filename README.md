# Quiz App (Kahoot-style) — PocketBase + Vite

Многопользовательская викторина: ведущий создаёт анкету и запускает игру,
игроки подключаются по коду. Бэкенд — PocketBase, фронтенд — ванильный
JS через `pocketbase` SDK, сборка — Vite. Деплой — Coolify.

Прогресс: реализованы шаги 1–2 из плана (коллекции/правила/индексы;
создание анкеты и редактирование вопросов ведущим). Игровой цикл,
хуки на подсчёт очков и генерацию кода — следующие шаги.

## Локальный запуск

```bash
npm install
cp .env.example .env      # укажите URL своего PocketBase
npm run dev
```

Откройте `http://localhost:5173/` — стартовая страница с двумя кнопками
(`/host.html`, `/play.html`).

## PocketBase: импорт схемы

1. Поднимите PocketBase (локально или как отдельный сервис в Coolify).
2. Зайдите в Admin UI → **Settings → Import collections**.
3. Загрузите `pb_schema.json` из корня репозитория и подтвердите импорт.

Схема создаёт 5 коллекций согласно заданию:

| Коллекция | Назначение |
|---|---|
| `quizzes` | анкеты (title, owner, isPublished) |
| `questions` | вопросы анкеты (text, options, correctIndex, timeLimit, image, order) |
| `games` | запущенные игры (code, status, currentQuestion, questionStartedAt) |
| `players` | участники игры (nickname, score, опциональный user) |
| `answers` | ответы игроков (optionIndex; isCorrect/points пишутся хуком) |

Правила API (list/view/create/update/delete) и уникальные индексы
(`answers(player, question)`, `players(game, nickname)`, `games.code`)
заданы прямо в `pb_schema.json` — вручную в Admin UI ничего дополнительно
настраивать не нужно.

**Важно:** поле `owner`/`host`/`user` в схеме ссылается на системную
коллекцию `users` по её стандартному id (`_pb_users_auth_`). Если у вас
уже есть кастомная auth-коллекция с другим id, поправьте `collectionId`
в `pb_schema.json` перед импортом.

## Переменные окружения

| Переменная | Где используется | Пример |
|---|---|---|
| `VITE_POCKETBASE_URL` | адрес PocketBase, вшивается в сборку Vite | `https://pb.example.com` |

`.env` в git не коммитится (см. `.gitignore`). На Coolify переменная
задаётся в настройках приложения (Environment Variables) — Vite
подставит её на этапе `npm run build`.

## Деплой на Coolify

1. Новое приложение → **Public Repository / GitHub** → указать этот репозиторий.
2. Build pack: **Nodejs** (или Dockerfile, если нужен кастомный образ).
   - Install command: `npm install`
   - Build command: `npm run build`
   - Publish directory / Start: раздача статики из `dist/` (например,
     через встроенный Nginx-конфиг Coolify для статических сайтов).
3. Environment Variables → добавить `VITE_POCKETBASE_URL` с адресом
   вашего PocketBase-сервиса (тоже развёрнутого в Coolify отдельным
   ресурсом, либо внешнего).
4. Включить **Auto Deploy** на push в `main`.
5. PocketBase хранит данные и файлы (image) в volume — для `pb_hooks/`
   отдельная настройка через File Storage / mount в Coolify понадобится
   на этапе добавления серверной логики (не в этом шаге).

## Структура репозитория

```
pb_schema.json     — экспорт коллекций для импорта в PocketBase
pb_hooks/           — заготовка под серверные хуки (следующий этап)
index.html          — главная страница (/)
host.html + src/host.js — интерфейс ведущего: вход, список анкет,
                          редактор анкеты и вопросов
play.html           — заглушка под экран игрока (следующий этап)
src/pocketbase.js   — общий PocketBase-клиент и функции авторизации
src/style.css       — общие стили
```

## Что уже работает (шаги 1–2)

- Регистрация/вход ведущего через стандартную auth-коллекцию `users`.
- Создание анкеты (`quizzes`), переключение публикации.
- Добавление вопроса: текст, 2–4 варианта ответа с отметкой правильного,
  ограничение по времени, необязательное изображение.
- Список вопросов анкеты с изменением порядка (↑/↓) и удалением.

## Дальше (не в этом шаге)

- Экран ведущего: запуск игры → лобби с кодом → показ вопроса всем →
  результаты → таблица лидеров.
- Экран игрока (`/play.html`): вход по коду и никнейму, ответ на
  вопрос, обратный отсчёт, свой результат.
- `pb_hooks/`: генерация `games.code` на сервере; проверка ответа и
  начисление очков в `onRecordCreateRequest("answers")` — клиент не
  должен иметь возможность самостоятельно проставить `isCorrect`/`points`.
