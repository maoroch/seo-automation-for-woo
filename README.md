# WooCommerce SEO Optimizer (Human-in-the-Loop с Claude)

Инструмент для массовой SEO-оптимизации товаров WooCommerce с поддержкой Rank Math SEO.  
Работает по принципу Human-in-the-Loop (HITL): вы экспортируете товары в JSON, редактируете их (вручную или через Claude), а затем импортируете обратно с контролем изменений, валидацией и автоматическим бэкапом.

## 🚀 Возможности

- Экспорт товаров по ID, по категории или всех (до 50 товаров за раз).
- Поддержка Rank Math SEO: `meta_title`, `meta_description`, `focus_keyword`.
- Обновление `slug` (постоянной ссылки) через WordPress REST API (Application Passwords).
- Валидация HTML перед импортом (защита от некорректных тегов/таблиц).
- Preview изменений (diff) с подтверждением перед записью.
- Автоматический бэкап изменяемых товаров.
- Команда отката последнего импорта (`rollback`).
- SEO‑анализатор без AI (оценка заголовков, описаний, ключевых слов, alt и т.д.).
- Экспорт отчёта анализа в CSV.

## 📦 Требования

- Node.js 18+ (с поддержкой fetch и ES-модулей)
- WordPress + WooCommerce
- Плагин Rank Math SEO (активирован)
- Для обновления `slug`: в WordPress должны быть включены Application Passwords (по умолчанию включены при HTTPS).
    - Если сайт на HTTP, можно добавить в `wp-config.php`:
        ```php
        define('WP_ENVIRONMENT_TYPE', 'local');
        ```

## 🛠 Установка

Клонируйте репозиторий:
```bash
git clone https://github.com/your-repo/woo-seo-optimizer.git
cd woo-seo-optimizer
```

Установите зависимости:
```bash
npm install
```

Скопируйте пример окружения и заполните:
```bash
cp .env.example .env
```

Минимальное содержимое `.env`:
```ini
WC_URL=https://ваш-сайт.ру
WC_CONSUMER_KEY=ck_xxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxx

# Только если планируете изменять slug (постоянную ссылку)
WORDPRESS_USER=admin_username
WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

Как получить ключи WooCommerce:
- В админке WordPress: WooCommerce → Настройки → Дополнительно → REST API → Добавить ключ. Дайте права на чтение/запись.

Как получить Application Password для WordPress:
- В админке: Пользователи → Ваш профиль → секция "Application Passwords". Создайте новый пароль и скопируйте его (включая пробелы).

Убедитесь, что созданы папки для кэша и бэкапов — они создадутся автоматически при первом запуске.

## 🧪 Использование

Экспорт товаров:
```bash
# Экспорт всех товаров (максимум 50)
node src/commands/export.js

# Экспорт по ID
node src/commands/export.js --ids=123,456

# Экспорт по названию категории (или slug)
node src/commands/export.js --category="Логгеры"

# Экспорт по ID категории
node src/commands/export.js --catId=84
```
Результат: `data/cache/export_<timestamp>.json`.

Редактирование JSON:
- Отредактируйте поля вручную или отправьте файл в Claude с запросом:
    "УлучшИ SEO для товаров, не ломая HTML. Верни JSON в том же формате."
- Не меняйте `id`, не добавляйте поля, которые нельзя изменять (price, stock и т.д.).
- Для обновления `slug` добавьте/измените поле `slug`.
- Для фокусного ключевого слова используйте поле `focus_keyword`.

Импорт (с preview и подтверждением):
```bash
node src/commands/import.js --file=data/cache/export_1234567890.json
```
- Система покажет diff и запросит подтверждение.
- Для автоматического применения добавьте флаг `--yes`:
```bash
node src/commands/import.js --file=... --yes
```
- Чтобы пропустить HTML‑валидацию (рискованно):
```bash
node src/commands/import.js --file=... --skip-html-validation
```

Откат последнего импорта:
```bash
node src/commands/rollback.js
```
- Откатит товары до состояния перед последним импортом.
- Можно указать конкретный бэкап:
```bash
node src/commands/rollback.js --file=data/backups/backup_1234567890.json
```

SEO-анализ товаров (без AI):
```bash
# Анализ всех товаров (первые 50)
node src/commands/analyze.js

# Анализ по ID
node src/commands/analyze.js --ids=123,456

# Анализ категории
node src/commands/analyze.js --category="Логгеры"

# Сохранить отчёт в CSV
node src/commands/analyze.js --ids=123 --output=report.csv
```

Анализатор проверяет:
- Длину Title (SEO‑заголовок) — 50–70 символов.
- Длину Meta description — 120–160 символов.
- Наличие фокусного ключевого слова (`focus_keyword`).
- Вхождение ключевого слова в Title и Meta description.
- Длину контента (description) — желательно >1000 символов.
- Наличие `alt` у главного изображения.
- Наличие заголовков H1/H2 в описании.
- Итоговый SEO Score — от 0 до 100 баллов.

## 🧰 Структура проекта

Примерная структура:
```
├── data/
│   ├── cache/          # Экспортированные JSON товаров
│   └── backups/        # Бэкапы перед импортом
├── src/
│   ├── commands/
│   │   ├── export.js
│   │   ├── import.js
│   │   ├── rollback.js
│   │   └── analyze.js
│   ├── lib/
│   │   └── woocommerce.js     # API клиент (Woo + WP)
│   ├── schemas/
│   │   └── import.schema.js   # Zod валидация
│   ├── services/
│   │   ├── backup.js
│   │   └── seo-analyzer.js
│   └── ...
├── .env
├── package.json
└── README.md
```

## ⚠️ Важные замечания

- Безопасность: никогда не коммитьте `.env` в репозиторий.
- Лимит товаров: команда экспорта по умолчанию выгружает не более 50 товаров (ограничение API). При необходимости можно увеличить `per_page` в `woocommerce.js`, но WooCommerce может ограничивать.
- HTML-валидация: простая, проверяет только закрытые теги — этого достаточно для ~90% случаев.
- Обновление `slug`: требует прав на запись постов через WordPress REST API. Убедитесь, что у пользователя есть права редактирования товаров.
- Rank Math: код использует ключи `rank_math_title`, `rank_math_description`, `rank_math_focus_keyword`. Если вы используете Yoast SEO, замените эти ключи на `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`, `_yoast_wpseo_focuskw` в файлах `export.js`, `import.js`, `seo-analyzer.js`.

## 🧪 Тестирование

Простой сценарий проверки:
1. Экспортируйте один товар:
     ```bash
     node src/commands/export.js --ids=123
     ```
2. Отредактируйте `meta_title`, `focus_keyword` и `images[0].alt` в полученном JSON.
3. Импортируйте с preview:
     ```bash
     node src/commands/import.js --file=data/cache/export_xxx.json
     ```
4. Убедитесь, что изменения применились в админке WooCommerce.
5. Запустите анализатор:
     ```bash
     node src/commands/analyze.js --ids=123
     ```

## 🤝 Вклад в проект

Проект открыт для улучшений. Основные направления:
- Автоматическая отправка JSON в Claude API (убрать ручное копирование).
- Поддержка пагинации (экспорт всех товаров без лимита 50).
- Веб-интерфейс (React) для визуального diff.
- A/B тестирование мета-тегов.

## 📄 Лицензия

MIT

Приятной SEO‑оптимизации! 🚀