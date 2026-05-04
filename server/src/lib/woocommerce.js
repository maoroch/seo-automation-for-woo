import 'dotenv/config';

const BASE_URL = process.env.WC_URL;
const CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;
const WP_USER = process.env.WORDPRESS_USER;
const WP_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

if (!BASE_URL || !CONSUMER_KEY || !CONSUMER_SECRET) {
  throw new Error('Missing WooCommerce environment variables. Check .env file.');
}

const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}/wp-json/wc/v3/${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WooCommerce API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

export async function getProducts(ids = []) {
  const params = new URLSearchParams();
  if (ids.length) {
    params.append('include', ids.join(','));
  }
  params.append('per_page', 50);
  params.append('_fields', 'id,sku,name,slug,meta_data,description,short_description,images,categories');
  const response = await request(`products?${params.toString()}`);
  return response;
}

export async function updateProduct(id, data) {
  return request(`products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getCategories(search = '') {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  params.append('per_page', 100);
  return request(`products/categories?${params.toString()}`);
}

export async function getAllCategories() {
  let allCategories = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const params = new URLSearchParams();
    params.append('per_page', perPage);
    params.append('page', page);
    const categories = await request(`products/categories?${params.toString()}`);
    if (!categories.length) break;
    allCategories = allCategories.concat(categories);
    page++;
  }
  return allCategories;
}

export async function getProductsByCategory(categoryId, limit = 50) {
  const params = new URLSearchParams();
  params.append('category', categoryId);
  params.append('per_page', limit);
  params.append('_fields', 'id,sku,name,slug,meta_data,description,short_description,images,categories');
  return request(`products?${params.toString()}`);
}

// --- Slug update via WordPress REST API ---
export async function updateProductSlug(productId, newSlug) {
  if (!WP_USER || !WP_APP_PASSWORD) {
    throw new Error('WORDPRESS_USER and WORDPRESS_APP_PASSWORD must be set in .env');
  }
  const url = `${BASE_URL}/wp-json/wp/v2/product/${productId}`;
  const wpAuth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${wpAuth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ slug: newSlug }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WordPress API error (${response.status}): ${errorText}`);
  }
  return response.json();
}