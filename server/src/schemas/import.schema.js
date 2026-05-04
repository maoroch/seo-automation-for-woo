// src/schemas/import.schema.js
import { z } from 'zod';

const ImageSchema = z.object({
  id: z.number().optional(),
  src: z.string().optional(), // запрещаем менять, но для безопасности оставляем optional
  alt: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
}).strict(); // запрещаем любые другие поля в images

export const ImportProductSchema = z.object({
  id: z.number().positive(),
  name: z.string().min(1).optional(),
  sku: z.string().optional(), // разрешаем, но позже проверим, что не меняется?
  title: z.string().optional(),  // возможно, дублирует name - уточним
  meta_title: z.string().max(70).optional(),   // рекомендуемая длина
  meta_description: z.string().max(160).optional(),
  description: z.string().optional(),   // HTML
  short_description: z.string().optional(), // HTML
  images: z.array(ImageSchema).optional(),
}).strict(); // запрещает поля price, stock, etc.

export const ImportDataSchema = z.array(ImportProductSchema);