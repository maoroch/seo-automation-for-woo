import { getProducts, getProductsByCategory, getAllCategories } from '../lib/woocommerce.js';
import fs from 'fs/promises';
import path from 'path';

export async function exportCommand(options = {}) {
  const { ids: idsArg, category: categoryName, catId } = options;
  let products = [];

  if (catId) {
    console.log(`📦 Exporting products from category ID ${catId}...`);
    products = await getProductsByCategory(catId);
  } else if (categoryName) {
    console.log(`🔍 Searching category: "${categoryName}"...`);
    const allCats = await getAllCategories();
    const matched = allCats.find(cat => 
      cat.name.toLowerCase() === categoryName.toLowerCase() || 
      cat.slug.toLowerCase() === categoryName.toLowerCase()
    );
    if (!matched) {
      console.error(`❌ Category "${categoryName}" not found by name or slug.`);
      return;
    }
    console.log(`✅ Found category: ${matched.name} (ID: ${matched.id})`);
    products = await getProductsByCategory(matched.id);
    console.log(`📦 Exporting products from category "${matched.name}"...`);
  } else if (idsArg) {
    const ids = idsArg.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    console.log(`📦 Exporting products with IDs: ${ids.join(', ')}...`);
    products = await getProducts(ids);
  } else {
    console.log(`📦 Exporting all products...`);
    products = await getProducts();
  }

  const exportData = products.map(p => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    title: p.name,
    meta_title: p.meta_data?.find(m => m.key === '_yoast_wpseo_title')?.value || '',
    meta_description: p.meta_data?.find(m => m.key === '_yoast_wpseo_metadesc')?.value || '',
    description: p.description,
    short_description: p.short_description,
    images: p.images.map(img => ({
      id: img.id,
      src: img.src,
      alt: img.alt,
      title: img.title,
    })),
  }));

  const fileName = `export_${Date.now()}.json`;
  const filePath = path.join(process.cwd(), 'data', 'cache', fileName);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));

  console.log(`✅ Exported ${exportData.length} products to ${filePath}`);
  return filePath;
}

// парсинг аргументов командной строки
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const idsFlag = args.find(arg => arg.startsWith('--ids='));
  const categoryFlag = args.find(arg => arg.startsWith('--category='));
  const catIdFlag = args.find(arg => arg.startsWith('--catId='));
  
  const ids = idsFlag ? idsFlag.split('=')[1] : null;
  const category = categoryFlag ? categoryFlag.split('=')[1] : null;
  const catId = catIdFlag ? parseInt(catIdFlag.split('=')[1]) : null;

  if ((category && ids) || (catId && ids) || (category && catId)) {
    console.error('❌ Please use only one filter: --ids, --category, or --catId');
    process.exit(1);
  }

  exportCommand({ ids, category, catId }).catch(console.error);
}