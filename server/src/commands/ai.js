// src/commands/ai.js
import fs from 'fs/promises';
import path from 'path';
import { callOpenRouter, extractJsonFromResponse } from '../lib/openrouter.js';
import { getTokenLimiter } from '../lib/token-limiter.js';

// ==============================================
// 1. Системные промпты
// ==============================================
const SEO_SYSTEM_PROMPT = `Ты — эксперт по SEO для интернет-магазинов. Твоя задача — генерировать ТОЛЬКО meta_title, meta_description и focus_keyword.

ЖЁСТКИЕ ПРАВИЛА (нарушение недопустимо):

1. ДЛИНА:
   - meta_title: от 50 до 70 символов включительно.
   - meta_description: от 120 до 160 символов включительно.
   - focus_keyword: не более 5 слов.

2. ЗАПРЕЩЕНО:
   - keyword stuffing (повтор одного и того же ключа 3+ раз).
   - общие фразы без конкретики.
   - HTML-теги.

3. ТРЕБОВАНИЯ:
   - meta_title: начни с ключевого слова, добавь бренд.
   - meta_description: раскрой пользу, призыв к действию.
   - focus_keyword: то же ключевое слово, что в meta_title, без бренда.

4. ЕСЛИ ПОЛЯ УЖЕ ХОРОШИ — оставь их.

ОТВЕТ: ТОЛЬКО JSON-массив с полями id, meta_title, meta_description, focus_keyword.
Никаких пояснений, только JSON.`;

const CONTENT_SYSTEM_PROMPT = `Ты — API, который возвращает только JSON для e-commerce копирайтинга. Верни ТОЛЬКО JSON-массив.

Задача: улучшить description и short_description товара.
Правила:
- Сохраняй HTML-теги, меняй только текст внутри.
- Заменяй h6/h5 на h2/h3, где уместно.
- Делай текст информативнее, добавляй ключевые слова.
- Не выдумывай несуществующие характеристики.

Пример ответа:
[
  {
    "id": 12345,
    "description": "<p>Улучшенное описание...</p>",
    "short_description": "<p>Улучшенное краткое описание...</p>"
  }
]

Никаких пояснений, только JSON. Если поля не меняются, верни их как есть.`;

// ==============================================
// 2. Пост-обработка SEO
// ==============================================
function clampString(str, minLen, maxLen, placeholder = '') {
  if (!str) return placeholder;
  let trimmed = str.trim();
  if (trimmed.length < minLen) return trimmed;
  if (trimmed.length > maxLen) {
    trimmed = trimmed.slice(0, maxLen - 3).trim() + '…';
  }
  return trimmed;
}

function removeKeywordStuffing(text, maxRepetitions = 2) {
  const words = text.split(/\s+/);
  const result = [];
  let lastWord = '';
  let repeatCount = 0;
  for (const w of words) {
    if (w.toLowerCase() === lastWord.toLowerCase()) {
      repeatCount++;
      if (repeatCount >= maxRepetitions) continue;
    } else {
      repeatCount = 0;
      lastWord = w;
    }
    result.push(w);
  }
  return result.join(' ');
}

function postprocessSeoResponse(seoItem, productId) {
  let fixed = { ...seoItem };
  let changed = false;

  if (fixed.meta_title) {
    let newTitle = removeKeywordStuffing(fixed.meta_title);
    if (newTitle !== fixed.meta_title) {
      fixed.meta_title = newTitle;
      changed = true;
    }
    const clamped = clampString(fixed.meta_title, 50, 70, fixed.meta_title);
    if (clamped !== fixed.meta_title) {
      fixed.meta_title = clamped;
      changed = true;
    }
  }
  if (fixed.meta_description) {
    let newDesc = removeKeywordStuffing(fixed.meta_description);
    if (newDesc !== fixed.meta_description) {
      fixed.meta_description = newDesc;
      changed = true;
    }
    const clamped = clampString(fixed.meta_description, 120, 160, fixed.meta_description);
    if (clamped !== fixed.meta_description) {
      fixed.meta_description = clamped;
      changed = true;
    }
  }
  if (fixed.focus_keyword && typeof fixed.focus_keyword === 'string') {
    let kw = fixed.focus_keyword.trim();
    const words = kw.split(/\s+/);
    if (words.length > 5) {
      fixed.focus_keyword = words.slice(0, 5).join(' ');
      changed = true;
    }
  }
  if (changed) {
    console.warn(`⚠️ Автокоррекция SEO для товара ${productId}`);
  }
  return fixed;
}

// ==============================================
// 3. Построение запросов (с обрезкой длинных полей)
// ==============================================
function buildUserPromptForSeo(products) {
  const data = products.map(p => ({
    id: p.id,
    name: p.name ? p.name.slice(0, 500) : '', // обрезаем, чтобы уменьшить токены
    meta_title: p.meta_title,
    meta_description: p.meta_description,
    focus_keyword: p.focus_keyword,
  }));
  return `Улучши SEO-поля для следующих товаров:\n${JSON.stringify(data, null, 2)}`;
}

function buildUserPromptForContent(products) {
  const data = products.map(p => ({
    id: p.id,
    description: p.description ? p.description.slice(0, 3000) : '', // обрезаем до 3000 символов
    short_description: p.short_description,
  }));
  return `Улучши description и short_description. Верни ТОЛЬКО JSON-массив. Никаких пояснений.\n\nДанные:\n${JSON.stringify(data, null, 2)}`;
}

// ==============================================
// 4. Основная функция запроса к OpenRouter
// ==============================================
async function enhanceWithOpenRouter(products, systemPrompt, userPromptBuilder, mode, examples = []) {
  let finalSystemPrompt = systemPrompt;
  if (examples.length) {
    finalSystemPrompt += '\n\nВот примеры желаемого стиля:\n';
    for (const ex of examples) {
      finalSystemPrompt += `Оригинал: ${JSON.stringify(ex.original)}\nУлучшенный: ${JSON.stringify(ex.improved)}\n\n`;
    }
    finalSystemPrompt += 'Используй эти примеры.';
  }
  const userPrompt = userPromptBuilder(products);
  const maxTokens = mode === 'content' ? 8000 : 4000;
  const estimatedTokens = (userPrompt.length / 4) + (maxTokens / 2);
  const limiter = getTokenLimiter(10000, 10 * 60 * 1000);
  await limiter.waitForTokens(Math.ceil(estimatedTokens));

  const response = await callOpenRouter(finalSystemPrompt, userPrompt, { maxTokens });
  if (!response || response.trim() === '') throw new Error('OpenRouter вернул пустой ответ');
  const json = extractJsonFromResponse(response);
  if (!Array.isArray(json) || json.length !== products.length) throw new Error('Несоответствие длины ответа');
  return json;
}

// ==============================================
// 5. CLI команда
// ==============================================
export async function aiCommand(inputFile, outputFile, options = {}) {
  const { enhanceMode = 'all', verbose = false, examplesFile = null } = options;

  let products;
  try {
    const raw = await fs.readFile(inputFile, 'utf8');
    products = JSON.parse(raw);
    if (!Array.isArray(products)) products = [products];
  } catch (err) {
    console.error(`❌ Ошибка чтения ${inputFile}:`, err.message);
    return;
  }

  let examples = [];
  if (examplesFile) {
    try {
      const exRaw = await fs.readFile(examplesFile, 'utf8');
      examples = JSON.parse(exRaw);
      console.log(`📚 Загружено ${examples.length} примеров few-shot`);
    } catch (err) {
      console.warn(`⚠️ Не удалось загрузить примеры: ${err.message}`);
    }
  }

  console.log(`📦 Загружено товаров: ${products.length}`);
  let enhancedProducts = [...products];

  if (enhanceMode === 'seo') {
    const seoJson = await enhanceWithOpenRouter(products, SEO_SYSTEM_PROMPT, buildUserPromptForSeo, 'seo', examples);
    for (let i = 0; i < products.length; i++) {
      const corrected = postprocessSeoResponse(seoJson[i], products[i].id);
      enhancedProducts[i] = { ...enhancedProducts[i], ...corrected };
    }
  } else if (enhanceMode === 'content') {
    const contentJson = await enhanceWithOpenRouter(products, CONTENT_SYSTEM_PROMPT, buildUserPromptForContent, 'content', examples);
    for (let i = 0; i < products.length; i++) {
      if (contentJson[i].description) enhancedProducts[i].description = contentJson[i].description;
      if (contentJson[i].short_description) enhancedProducts[i].short_description = contentJson[i].short_description;
    }
  } else if (enhanceMode === 'all') {
    // SEO
    const seoJson = await enhanceWithOpenRouter(products, SEO_SYSTEM_PROMPT, buildUserPromptForSeo, 'seo', examples);
    for (let i = 0; i < products.length; i++) {
      const corrected = postprocessSeoResponse(seoJson[i], products[i].id);
      enhancedProducts[i] = { ...enhancedProducts[i], ...corrected };
    }
    // Content
    const contentJson = await enhanceWithOpenRouter(products, CONTENT_SYSTEM_PROMPT, buildUserPromptForContent, 'content', examples);
    for (let i = 0; i < products.length; i++) {
      if (contentJson[i].description) enhancedProducts[i].description = contentJson[i].description;
      if (contentJson[i].short_description) enhancedProducts[i].short_description = contentJson[i].short_description;
    }
  }

  const outPath = outputFile || inputFile.replace(/\.json$/, `_${enhanceMode}_enhanced.json`);
  await fs.writeFile(outPath, JSON.stringify(enhancedProducts, null, 2));
  console.log(`✅ Сохранено в ${outPath}`);
  console.log('💡 Запустите импорт: node src/commands/import.js --file=' + outPath);
}

// CLI парсинг
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const inputFlag = args.find(a => a.startsWith('--input='));
  const outputFlag = args.find(a => a.startsWith('--output='));
  const enhanceFlag = args.find(a => a.startsWith('--enhance='));
  const verboseFlag = args.includes('--verbose');
  const examplesFlag = args.find(a => a.startsWith('--examples='));

  if (!inputFlag) {
    console.error('Usage: node ai.js --input=file.json [--output=out.json] [--enhance=seo|content|all] [--verbose] [--examples=examples.json]');
    process.exit(1);
  }

  const inputFile = inputFlag.split('=')[1];
  const outputFile = outputFlag ? outputFlag.split('=')[1] : null;
  const enhanceMode = enhanceFlag ? enhanceFlag.split('=')[1] : 'all';
  const examplesFile = examplesFlag ? examplesFlag.split('=')[1] : null;

  aiCommand(inputFile, outputFile, { enhanceMode, verbose: verboseFlag, examplesFile }).catch(console.error);
}