# WooCommerce SEO Optimizer (Human‑in‑the‑Loop)

Инструмент для массовой SEO‑оптимизации товаров WooCommerce с поддержкой Rank Math SEO. Работает в полуавтоматическом режиме (Human‑in‑the‑Loop): экспорт товаров → улучшение (через AI или вручную) → валидация → импорт с preview, бекапом и возможностью отката.

## 🚀 Возможности

- Экспорт товаров по ID, категории, slug категории или всех (по умолчанию до 50 товаров за раз, легко расширяется пагинацией).
- Импорт с preview изменений (diff), запросом подтверждения и автоматическим бекапом.
- Поддержка Rank Math SEO: `meta_title`, `meta_description`, `focus_keyword`.
- Обновление `slug` (постоянной ссылки) через WordPress REST API (Application Passwords).
- HTML‑валидация с подсветкой ошибок: закрытые теги, иерархия заголовков, отсутствующие `alt` у изображений и т.п.
- Защита для Elementor: обновляется только первый текстовый виджет (описание), технические таблицы остаются нетронутыми.
- AI‑улучшение SEO‑полей и контента через OpenRouter (экономично и удобно).
- SEO‑анализатор без AI (оценка 0–100, экспорт в CSV).
- Rollback — откат последнего импорта.

## 🛠 Установка и настройка

Клонируйте репозиторий и установите зависимости:

```bash
git clone <репозиторий>
cd server
npm install
cp .env.example .env
```

Пример `.env` (заполните своими значениями):

```ini
WC_URL=https://ваш-сайт.ру
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...
WORDPRESS_USER=admin_username
WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx xxxx
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=openrouter/auto
```

## 📦 Использование

Экспорт товаров:

```bash
# По ID
node src/commands/export.js --ids=123,456

# По категории
node src/commands/export.js --category="Логгеры"
```

AI‑улучшение (только OpenRouter):

```bash
node src/commands/ai.js --input=export.json --enhance=all --examples=examples.json --verbose
```

Импорт с подтверждением и бекапом:

```bash
node src/commands/import.js --file=..._enhanced.json [--yes] [--skip-html-validation]
```

Откат последнего импорта:

```bash
node src/commands/rollback.js [--file=backup.json]
```

Анализ (без AI):

```bash
node src/commands/analyze.js --ids=123 --output=report.csv
```

## 🧠 Архитектура

- Source Layer — WooCommerce REST API, WordPress REST API.  
- Normalization Layer — приведение товаров к единому JSON.  
- Intelligence Layer — OpenRouter для SEO и контента (без локальных LLM).  
- Human‑in‑the‑Loop — preview, подтверждение, бекапы и ручная правка.

## 🧪 Технологии

- Node.js 18+ (ES modules, native fetch)  
- OpenRouter API  
- WooCommerce REST API, WordPress REST API  
- Zod (валидация), chalk (цветной вывод), readline (интерактив)

## 📄 Лицензия

MIT
