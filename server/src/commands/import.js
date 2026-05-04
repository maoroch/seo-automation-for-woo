// src/commands/import.js
import fs from 'fs/promises';
import path from 'path';
import { updateProduct, getProducts } from '../lib/woocommerce.js';
import { ImportDataSchema } from '../schemas/import.schema.js';
import { createBackup, getLatestBackup, restoreBackup } from '../services/backup.js';

// простая функция диффа для консоли
function simpleDiff(oldVal, newVal, fieldName) {
  if (oldVal === newVal) return null;
  // обрезаем длинные строки
  const oldStr = typeof oldVal === 'string' ? oldVal.slice(0, 100) + (oldVal.length > 100 ? '…' : '') : JSON.stringify(oldVal);
  const newStr = typeof newVal === 'string' ? newVal.slice(0, 100) + (newVal.length > 100 ? '…' : '') : JSON.stringify(newVal);
  return { field: fieldName, old: oldStr, new: newStr };
}

export async function importCommand(filePath, options = {}) {
  // 1. читаем JSON
  const rawData = await fs.readFile(filePath, 'utf8');
  const importProducts = JSON.parse(rawData);
  
  // 2. валидация Zod
  const result = ImportDataSchema.safeParse(importProducts);
  if (!result.success) {
    console.error('❌ Validation failed:', result.error.errors);
    return;
  }
  const validatedData = result.data;
  
  // 3. получаем текущие товары из Woo (или кэша)
  const ids = validatedData.map(p => p.id);
  const currentProducts = await getProducts(ids);
  const currentMap = new Map(currentProducts.map(p => [p.id, p]));
  
  // 4. дифф и сбор изменений
  const changes = [];
  for (const newProd of validatedData) {
    const oldProd = currentMap.get(newProd.id);
    if (!oldProd) {
      console.warn(`⚠️ Product id ${newProd.id} not found in store, skipping`);
      continue;
    }
    const prodChanges = [];
    // проверяем каждое разрешённое поле
    const fieldsToCompare = ['name', 'meta_title', 'meta_description', 'description', 'short_description'];
    for (const field of fieldsToCompare) {
      const oldVal = oldProd[field] || (field === 'meta_title' ? oldProd.meta_data?.find(m=>m.key==='_yoast_wpseo_title')?.value : null);
      const newVal = newProd[field];
      const diff = simpleDiff(oldVal, newVal, field);
      if (diff) prodChanges.push(diff);
    }
    // images отдельно: сравниваем alt/title
    if (newProd.images && oldProd.images) {
      // упрощённо: сравним массивы по id
      for (const newImg of newProd.images) {
        const oldImg = oldProd.images.find(i => i.id === newImg.id);
        if (oldImg && (oldImg.alt !== newImg.alt || oldImg.title !== newImg.title)) {
          prodChanges.push({ field: `images[${newImg.id}].alt/title`, old: `${oldImg.alt}|${oldImg.title}`, new: `${newImg.alt}|${newImg.title}` });
        }
      }
    }
    if (prodChanges.length) {
      changes.push({ id: newProd.id, name: oldProd.name, changes: prodChanges });
    }
  }
  
  // 5. показать preview
  if (changes.length === 0) {
    console.log('✅ No changes detected.');
    return;
  }
  console.log('\n📋 Preview of changes:\n');
  for (const item of changes) {
    console.log(`🆔 Product ${item.id} — ${item.name}`);
    for (const ch of item.changes) {
      console.log(`   - ${ch.field}: "${ch.old}" → "${ch.new}"`);
    }
    console.log('');
  }
  
  // 6. запросить подтверждение (если не опция --yes)
  if (!options.yes) {
    const readline = (await import('readline')).default;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question('⚠️ Apply these changes? (y/N): ', resolve));
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      console.log('❌ Import cancelled.');
      return;
    }
  }
  
  // 7. создать бекап
  const backupPath = await createBackup(ids.map(id => currentMap.get(id)));
  console.log(`📦 Backup saved to ${backupPath}`);
  
  // 8. применить изменения
  let successCount = 0;
  for (const newProd of validatedData) {
    try {
      // подготовить объект обновления
      const updateData = {};
      if (newProd.name) updateData.name = newProd.name;
      if (newProd.description) updateData.description = newProd.description;
      if (newProd.short_description) updateData.short_description = newProd.short_description;
      if (newProd.meta_title) {
        // для Yoast SEO нужно обновить meta_data
        updateData.meta_data = [
          { key: '_yoast_wpseo_title', value: newProd.meta_title }
        ];
      }
      if (newProd.meta_description) {
        updateData.meta_data = updateData.meta_data || [];
        updateData.meta_data.push({ key: '_yoast_wpseo_metadesc', value: newProd.meta_description });
      }
      // images обновление (альты)
      if (newProd.images) {
        updateData.images = newProd.images.map(img => ({
          id: img.id,
          alt: img.alt,
          title: img.title,
        }));
      }
      if (Object.keys(updateData).length === 0) continue;
      await updateProduct(newProd.id, updateData);
      successCount++;
    } catch (err) {
      console.error(`❌ Failed to update product ${newProd.id}:`, err.message);
    }
  }
  console.log(`✅ Import completed: ${successCount} of ${validatedData.length} products updated.`);
}

// CLI запуск
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const fileFlag = args.find(arg => arg.startsWith('--file='));
  const yesFlag = args.includes('--yes');
  if (!fileFlag) {
    console.error('Usage: node import.js --file=path/to/file.json [--yes]');
    process.exit(1);
  }
  const filePath = fileFlag.split('=')[1];
  importCommand(filePath, { yes: yesFlag }).catch(console.error);
}