import fs from 'fs/promises';
import path from 'path';
import { updateProduct, getProducts, updateProductSlug } from '../lib/woocommerce.js';
import { ImportDataSchema } from '../schemas/import.schema.js';
import { createBackup } from '../services/backup.js';
import readline from 'readline';

// ======================== ПРОСТОЙ HTML-ВАЛИДАТОР (без зависимостей) ========================
function validateHtml(html, fieldName, productId) {
  const errors = [];
  // Стек для отслеживания открытых тегов
  const stack = [];
  // Регулярка для нахождения тегов (открывающих, закрывающих, самозакрывающихся)
  const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  // Самозакрывающиеся теги (void elements)
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    if (isClosing) {
      // Закрывающий тег
      if (stack.length === 0 || stack[stack.length - 1] !== tagName) {
        errors.push(`Closing tag </${tagName}> without matching opening tag`);
        continue;
      }
      stack.pop();
    } else {
      // Открывающий тег
      if (voidTags.has(tagName)) {
        continue; // самозакрывающиеся – не добавляем в стек
      }
      stack.push(tagName);
    }
  }

  if (stack.length > 0) {
    errors.push(`Unclosed tags: ${stack.join(', ')}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, errors: [] };
}
// =========================================================================================

// ---- Вспомогательные функции ----
function getChangedFields(oldProduct, newProduct) {
  const changes = {};

  const directFields = ['name', 'description', 'short_description'];
  for (const field of directFields) {
    const oldVal = oldProduct[field] || '';
    const newVal = newProduct[field];
    if (newVal !== undefined && oldVal !== newVal) {
      changes[field] = { old: oldVal, new: newVal };
    }
  }

  if (newProduct.slug !== undefined && oldProduct.slug !== newProduct.slug) {
    changes.slug = { old: oldProduct.slug, new: newProduct.slug };
  }

  const oldMeta = oldProduct.meta_data || [];
  const oldMetaMap = new Map(oldMeta.map(m => [m.key, m.value]));
  const newTitle = newProduct.meta_title;
  const newDesc = newProduct.meta_description;
  const newFocus = newProduct.focus_keyword;

  if (newTitle !== undefined && oldMetaMap.get('rank_math_title') !== newTitle) {
    changes.meta_title = { old: oldMetaMap.get('rank_math_title') || '', new: newTitle };
  }
  if (newDesc !== undefined && oldMetaMap.get('rank_math_description') !== newDesc) {
    changes.meta_description = { old: oldMetaMap.get('rank_math_description') || '', new: newDesc };
  }
  if (newFocus !== undefined && oldMetaMap.get('rank_math_focus_keyword') !== newFocus) {
    changes.focus_keyword = { old: oldMetaMap.get('rank_math_focus_keyword') || '', new: newFocus };
  }

  const oldImages = oldProduct.images || [];
  const newImages = newProduct.images || [];
  if (newImages.length > 0) {
    const imageChanges = [];
    for (const newImg of newImages) {
      const oldImg = oldImages.find(i => i.id === newImg.id);
      if (oldImg) {
        if ((newImg.alt !== undefined && oldImg.alt !== newImg.alt) ||
            (newImg.title !== undefined && oldImg.title !== newImg.title)) {
          imageChanges.push({
            id: newImg.id,
            oldAlt: oldImg.alt,
            newAlt: newImg.alt,
            oldTitle: oldImg.title,
            newTitle: newImg.title,
          });
        }
      }
    }
    if (imageChanges.length) changes.images = imageChanges;
  }

  return changes;
}

function buildUpdateData(changes, oldProduct) {
  const updateData = {};

  if (changes.name) updateData.name = changes.name.new;
  if (changes.description) updateData.description = changes.description.new;
  if (changes.short_description) updateData.short_description = changes.short_description.new;

  if (changes.meta_title || changes.meta_description || changes.focus_keyword) {
    const oldMeta = oldProduct.meta_data || [];
    const metaMap = new Map(oldMeta.map(m => [m.key, m.value]));
    if (changes.meta_title) metaMap.set('rank_math_title', changes.meta_title.new);
    if (changes.meta_description) metaMap.set('rank_math_description', changes.meta_description.new);
    if (changes.focus_keyword) metaMap.set('rank_math_focus_keyword', changes.focus_keyword.new);
    updateData.meta_data = Array.from(metaMap, ([key, value]) => ({ key, value }));
  }

  if (changes.images && changes.images.length) {
    const oldImages = oldProduct.images || [];
    const newImages = oldImages.map(oldImg => {
      const imgChange = changes.images.find(c => c.id === oldImg.id);
      if (imgChange) {
        return {
          id: oldImg.id,
          src: oldImg.src,
          alt: imgChange.newAlt !== undefined ? imgChange.newAlt : oldImg.alt,
          title: imgChange.newTitle !== undefined ? imgChange.newTitle : oldImg.title,
        };
      }
      return oldImg;
    });
    updateData.images = newImages;
  }

  return updateData;
}

// ---- Основная функция импорта ----
export async function importCommand(filePath, options = {}) {
  const { autoConfirm = false, skipHtmlValidation = false } = options;

  console.log(`🔍 Reading import file: ${filePath}`);
  let importProducts;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    importProducts = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read/parse JSON: ${err.message}`);
    return;
  }

  if (!Array.isArray(importProducts) && typeof importProducts === 'object' && importProducts !== null && importProducts.id) {
    console.log('📦 Single product detected, wrapping in array');
    importProducts = [importProducts];
  }

  const validation = ImportDataSchema.safeParse(importProducts);
  if (!validation.success) {
    console.error('❌ Validation errors:');
    for (const issue of validation.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    return;
  }
  const validatedProducts = validation.data;
  console.log(`✅ Validated ${validatedProducts.length} products`);

  // ========== HTML-валидация (если не пропущена) ==========
  if (!skipHtmlValidation) {
    let hasHtmlErrors = false;
    const htmlFields = ['description', 'short_description'];
    for (const product of validatedProducts) {
      for (const field of htmlFields) {
        const html = product[field];
        if (html && typeof html === 'string') {
          const result = validateHtml(html, field, product.id);
          if (!result.valid) {
            console.error(`❌ HTML validation errors in product ${product.id}, field "${field}":`);
            result.errors.forEach(err => console.error(`    - ${err}`));
            hasHtmlErrors = true;
          }
        }
      }
    }
    if (hasHtmlErrors) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(resolve => rl.question('⚠️ HTML validation failed. Continue import anyway? (y/N): ', resolve));
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        console.log('❌ Import cancelled due to HTML errors.');
        return;
      }
    }
  }

  const ids = validatedProducts.map(p => p.id);
  console.log(`📡 Fetching current data for ${ids.length} products...`);
  const currentProducts = await getProducts(ids);
  const currentMap = new Map(currentProducts.map(p => [p.id, p]));

  const allChanges = [];
  for (const newProduct of validatedProducts) {
    const oldProduct = currentMap.get(newProduct.id);
    if (!oldProduct) {
      console.warn(`⚠️ Product ID ${newProduct.id} not found in store, skipping`);
      continue;
    }
    const changes = getChangedFields(oldProduct, newProduct);
    if (Object.keys(changes).length === 0) continue;
    allChanges.push({
      id: newProduct.id,
      name: oldProduct.name,
      changes,
      oldProduct,
    });
  }

  if (allChanges.length === 0) {
    console.log('✅ No changes detected. Import aborted.');
    return;
  }

  // Preview diff
  console.log('\n📋 Preview of changes:\n');
  for (const item of allChanges) {
    console.log(`🆔 Product ${item.id} — ${item.name}`);
    const ch = item.changes;
    if (ch.name) console.log(`   • name: "${ch.name.old}" → "${ch.name.new}"`);
    if (ch.slug) console.log(`   • slug: "${ch.slug.old}" → "${ch.slug.new}"`);
    if (ch.description) console.log(`   • description: (length ${ch.description.old.length} → ${ch.description.new.length})`);
    if (ch.short_description) console.log(`   • short_description: (length ${ch.short_description.old.length} → ${ch.short_description.new.length})`);
    if (ch.meta_title) console.log(`   • meta_title: "${ch.meta_title.old}" → "${ch.meta_title.new}"`);
    if (ch.meta_description) console.log(`   • meta_description: "${ch.meta_description.old}" → "${ch.meta_description.new}"`);
    if (ch.focus_keyword) console.log(`   • focus_keyword: "${ch.focus_keyword.old}" → "${ch.focus_keyword.new}"`);
    if (ch.images) {
      console.log(`   • images:`);
      ch.images.forEach(img => {
        console.log(`       - id ${img.id}: alt "${img.oldAlt || ''}" → "${img.newAlt || ''}", title "${img.oldTitle || ''}" → "${img.newTitle || ''}"`);
      });
    }
    console.log('');
  }

  if (!autoConfirm) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question('⚠️ Apply these changes? (y/N): ', resolve));
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      console.log('❌ Import cancelled.');
      return;
    }
  }

  const backupProducts = allChanges.map(item => item.oldProduct);
  const backupPath = await createBackup(backupProducts);
  console.log(`📦 Backup saved to ${backupPath}`);

  let successCount = 0;
  let failCount = 0;
  for (const item of allChanges) {
    try {
      const updateData = buildUpdateData(item.changes, item.oldProduct);
      let productUpdated = false;
      if (Object.keys(updateData).length > 0) {
        await updateProduct(item.id, updateData);
        productUpdated = true;
      }
      let slugUpdated = false;
      if (item.changes.slug) {
        await updateProductSlug(item.id, item.changes.slug.new);
        slugUpdated = true;
      }
      if (productUpdated || slugUpdated) {
        console.log(`✅ Updated product ${item.id} — ${item.name}`);
        if (slugUpdated) console.log(`   🔗 Slug changed to: ${item.changes.slug.new}`);
        successCount++;
      } else {
        console.log(`⚠️ No changes applied for product ${item.id}`);
      }
    } catch (err) {
      console.error(`❌ Failed to update product ${item.id}: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n🎉 Import finished: ${successCount} updated, ${failCount} failed.`);
}

// ---- CLI entry point ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const fileFlag = args.find(arg => arg.startsWith('--file='));
  const yesFlag = args.includes('--yes');
  const skipHtmlFlag = args.includes('--skip-html-validation');
  if (!fileFlag) {
    console.error('Usage: node import.js --file=path/to/file.json [--yes] [--skip-html-validation]');
    process.exit(1);
  }
  const filePath = fileFlag.split('=')[1];
  importCommand(filePath, { autoConfirm: yesFlag, skipHtmlValidation: skipHtmlFlag }).catch(console.error);
}