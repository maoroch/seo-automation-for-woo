// src/commands/ai.js
import fs from 'fs/promises';
import path from 'path';
import { callOpenRouter } from '../lib/openrouter.js';

// Системный промпт — настройте под свои задачи
const SYSTEM_PROMPT = `Ты — эксперт по SEO для интернет-магазинов. Твоя задача — улучшить SEO-метаданные товаров WooCommerce с плагином Rank Math.

Правила:
- НЕ меняй HTML-теги в description и short_description (только текст внутри).
- НЕ меняй id, sku, name, slug, images.
- Заполни meta_title (50-70 символов) и meta_description (120-160) на русском.
- Если focus_keyword пустое — предложи одно ключевое слово.
- Верни ТОЛЬКО валидный JSON массовом формате (массив объектов).
- Не добавляй лишние поля, кроме: meta_title, meta_description, focus_keyword.
- Не добавляй пояснений, только JSON.`;

// Функция для отправки всей партии товаров за один запрос (экономия токенов)
async function enhanceProducts(products, verbose = false) {
  const userPrompt = `Улучши следующие товары (массив JSON):\n${JSON.stringify(products, null, 2)}\n\nВерни массив JSON с обновлёнными полями meta_title, meta_description, focus_keyword. Не меняй другие поля.`;

  if (verbose) console.log('🔄 Отправка запроса в OpenRouter...');
  const responseText = await callOpenRouter(SYSTEM_PROMPT, userPrompt, { maxTokens: 8000 });

  // Извлечь JSON из ответа (модель может добавить ```json ... ```)
  let jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  let cleanedJson = jsonMatch ? jsonMatch[1] : responseText;
  cleanedJson = cleanedJson.trim();

  let enhanced;
  try {
    enhanced = JSON.parse(cleanedJson);
  } catch (err) {
    console.error('❌ Не удалось распарсить ответ модели:', err.message);
    console.error('Ответ модели (первые 500 символов):', cleanedJson.slice(0, 500));
    throw new Error('Модель вернула невалидный JSON');
  }

  // Убедимся, что вернулся массив той же длины
  if (!Array.isArray(enhanced) || enhanced.length !== products.length) {
    throw new Error(`Несоответствие длины: ожидалось ${products.length}, получено ${enhanced?.length}`);
  }

  // Обогащаем исходные товары полученными полями
  const result = products.map((original, idx) => ({
    ...original,
    meta_title: enhanced[idx].meta_title || original.meta_title,
    meta_description: enhanced[idx].meta_description || original.meta_description,
    focus_keyword: enhanced[idx].focus_keyword || original.focus_keyword,
  }));
  return result;
}

export async function aiCommand(inputFile, outputFile, options = {}) {
  const { verbose = false } = options;

  // Читаем исходный JSON
  let products;
  try {
    const raw = await fs.readFile(inputFile, 'utf8');
    products = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Не удалось прочитать файл ${inputFile}:`, err.message);
    return;
  }

  if (!Array.isArray(products)) {
    console.log('📦 Обнаружен один товар, оборачиваем в массив');
    products = [products];
  }

  console.log(`📦 Загружено товаров: ${products.length}`);

  // Ограничение для безопасности (бесплатные лимиты)
  if (products.length > 50) {
    console.warn('⚠️ Слишком много товаров (более 50). OpenRouter может ограничить. Рекомендую разбить на части.');
  }

  // Вызов API
  const enhancedProducts = await enhanceProducts(products, verbose);

  // Сохраняем результат
  const outPath = outputFile || inputFile.replace(/\.json$/, '_ai.json');
  await fs.writeFile(outPath, JSON.stringify(enhancedProducts, null, 2));
  console.log(`✅ Готово. Сохранено в ${outPath}`);
  console.log('💡 Теперь запустите импорт: node src/commands/import.js --file=' + outPath);
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const inputFlag = args.find(arg => arg.startsWith('--input='));
  const outputFlag = args.find(arg => arg.startsWith('--output='));
  const verboseFlag = args.includes('--verbose');

  if (!inputFlag) {
    console.error('Usage: node ai.js --input=export.json [--output=result.json] [--verbose]');
    process.exit(1);
  }
  const inputFile = inputFlag.split('=')[1];
  const outputFile = outputFlag ? outputFlag.split('=')[1] : null;
  aiCommand(inputFile, outputFile, { verbose: verboseFlag }).catch(console.error);
}