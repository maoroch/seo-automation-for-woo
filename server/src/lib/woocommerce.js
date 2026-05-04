// src/lib/woocommerce.js
import 'dotenv/config';

const BASE_URL = process.env.WC_URL;
const CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

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
  params.append('per_page', 50); // максимум за раз
  params.append('_fields', 'id,sku,name,title,meta_data,description,short_description,images,categories'); // только нужные поля для уменьшения трафика
  const response = await request(`products?${params.toString()}`);
  return response; // массив товаров
}

export async function updateProduct(id, data) {
  return request(`products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getProduct(id) {
  return request(`products/${id}`);
}

export async function getCategories() {
  let allCategories = [];
  let page = 1;
  let perPage = 100;
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
  params.append('_fields', 'id,sku,name,title,meta_data,description,short_description,images,categories');
  return request(`products?${params.toString()}`);
}