# WooCommerce SEO Optimizer (Human-in-the-Loop с Claude)

Инструмент для массовой SEO-оптимизации товаров WooCommerce с поддержкой **Rank Math SEO**.  
Работает по принципу Human‑in‑the‑Loop (HITL): вы экспортируете товары в JSON, улучшаете их вручную или через AI, затем импортируете обратно с контролем изменений, валидацией и автоматическими бекапами.

## 🔥 Возможности

- Экспорт товаров по ID, по категории (название или slug) или всех (до 50 товаров за раз).
- Импорт с preview — показывает diff изменений, требует подтверждения и создаёт бекап перед записью.
- Поддержка Rank Math: `meta_title`, `meta_description`, `focus_keyword`.
- Обновление slug (постоянной ссылки) через WordPress REST API (Application Passwords).
- Простая HTML-валидация — проверка незакрытых тегов.
- SEO-анализатор (без AI) — оценка по 8 критериям, SEO Score (0–100), экспорт в CSV.
- Откат (rollback) — восстановление из последнего бекапа.
- AI-улучшение через OpenRouter — бесплатный/дешёвый генератор SEO-полей с поддержкой многих LLM.

## 📦 Требования

- Node.js 18+ (с поддержкой fetch и ES-модулей).
- WordPress + WooCommerce + Rank Math SEO (активирован).
- Для обновления slug: включены Application Passwords в WordPress (по умолчанию при HTTPS; для HTTP можно добавить в `wp-config.php`:
     ```php
     define('WP_ENVIRONMENT_TYPE', 'local');
     ```)
     
## 🛠 Установка

1. Клонируйте репозиторий и перейдите в папку server:
      ```bash
      git clone <repo-url>
      cd WooCommerce-SEO-Optimizer-Human-in-the-Loop-SEO-with-Claude/server
      ```
2. Установите зависимости:
      ```bash
      npm install
      ```
3. Создайте файл .env на основе примера:
      ```bash
      cp .env.example .env
      ```
4. Заполните минимум в `.env`:
      ```env
      WC_URL=https://ваш-сайт.ру
      WC_CONSUMER_KEY=ck_xxxx
      WC_CONSUMER_SECRET=cs_xxxx

      # Для обновления slug:
      WORDPRESS_USER=admin_username
      WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx xxxx

      # Для AI через OpenRouter (опционально):
      OPENROUTER_API_KEY=sk-or-v1-...
      OPENROUTER_MODEL=openrouter/auto   # или конкретная free-модель
      ```
      Как получить ключи WooCommerce: WooCommerce → Настройки → Дополнительно → REST API → Добавить ключ (права на чтение/запись).  
      Application Password: Пользователи → Профиль → раздел "Application Passwords".  
      OpenRouter: зарегистрируйтесь на openrouter.ai и создайте API-ключ.

5. Убедитесь, что созданы папки:
      - `data/cache`
      - `data/backups`  
      (папки создаются автоматически при первом запуске, но можно создать вручную).

## 🧪 Использование

Экспорт товаров:
```bash
# Все товары (максимум 50)
node src/commands/export.js

# По ID
node src/commands/export.js --ids=123,456,789

# По названию категории (или slug)
node src/commands/export.js --category="Логгеры"

# По ID категории
node src/commands/export.js --catId=84
```
Файл экспорта сохраняется в `data/cache/export_<timestamp>.json`.

Импорт (с preview и подтверждением):
```bash
node src/commands/import.js --file=data/cache/export_1234567890.json
```
- Для автоматического подтверждения: `--yes`
- Чтобы пропустить HTML-валидацию (рискованно): `--skip-html-validation`

Откат последнего импорта:
```bash
node src/commands/rollback.js
```
Или указать конкретный бекап:
```bash
node src/commands/rollback.js --file=data/backups/backup_1234567890.json
```

SEO-анализатор (без AI):
```bash
# Все товары (первые 50)
node src/commands/analyze.js

# По ID
node src/commands/analyze.js --ids=123,456

# По категории
node src/commands/analyze.js --category="Логгеры"

# Сохранить отчёт в CSV
node src/commands/analyze.js --ids=123 --output=report.csv
```
Вывод — таблица с ID, SEO Score, названием и проблемами. CSV содержит все детали.

AI-улучшение через OpenRouter (требуется OPENROUTER_API_KEY):
```bash
# Улучшить экспортированный файл
node src/commands/ai.js --input=data/cache/export_1234567890.json

# С указанием выходного файла и verbose-режима
node src/commands/ai.js --input=export.json --output=improved.json --verbose
```
Скрипт отправляет массив товаров в выбранную LLM, получает обновлённые `meta_title`, `meta_description`, `focus_keyword` и сохраняет результат.

## 🧰 Структура проекта
```
server/
├── data/
│   ├── cache/               # экспортированные JSON
│   └── backups/             # бекапы перед импортом
├── src/
│   ├── commands/
│   │   ├── export.js
│   │   ├── import.js
│   │   ├── rollback.js
│   │   ├── analyze.js
│   │   └── ai.js
│   ├── lib/
│   │   ├── woocommerce.js   # API клиент (Woo + WP)
│   │   └── openrouter.js    # клиент OpenRouter
│   ├── schemas/
│   │   └── import.schema.js # Zod валидация
│   ├── services/
│   │   ├── backup.js
│   │   └── seo-analyzer.js
├── .env
├── package.json
└── README.md
```

## ⚙️ Настройка AI-промпта

В `src/commands/ai.js` есть переменная `SYSTEM_PROMPT`. Пример:
```javascript
const SYSTEM_PROMPT = `Ты — эксперт по SEO для интернет-магазинов.
Правила:
- НЕ меняй HTML-теги в description и short_description.
- Для каждого товара заполни meta_title (50-70 символов), meta_description (120-160), focus_keyword (одно ключевое слово).
- Если поля уже заполнены — улучши их, но не меняй смысл.
- Верни ТОЛЬКО валидный JSON (массив объектов).
- Не добавляй пояснений, только JSON.`;
```

## 🚀 Идеи для улучшения

- Пагинация в экспорте — автоматически загружать все товары (снять лимит 50).
- Интеграция с Claude (Anthropic) как альтернатива OpenRouter.
- Веб-интерфейс (React) для визуального просмотра diff и редактирования JSON.
- A/B тестирование мета-тегов через GSC.
- Пакетная обработка папки с JSON-файлами.
- Уведомления в Telegram о завершении операций.
- Планировщик (cron) для автоматизации экспорт→AI→импорт.
- Поддержка других SEO-плагинов (Yoast, All in One SEO).
- Локальные LLM (Ollama) для приватности.
- Расширенная HTML-валидация и аудит изменений.
- Поддержка вариативных товаров (SEO для каждой вариации).

## 📄 Лицензия

MIT
