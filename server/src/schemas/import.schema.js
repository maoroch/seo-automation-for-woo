import { z } from 'zod';

const ImageSchema = z.object({
  id: z.number().positive(),
  src: z.string().optional(),
  alt: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

export const ImportProductSchema = z.object({
  id: z.number().positive(),
  slug: z.string().optional(),           // новая опция
  name: z.string().min(1).optional(),
  sku: z.string().optional(),
  title: z.string().optional(),          // дублирует name, оставлено для совместимости
  meta_title: z.string().max(70).optional(),
  meta_description: z.string().max(160).optional(),
  focus_keyword: z.string().max(100).optional(), // новое: фокусное ключевое слово
  description: z.string().optional(),
  short_description: z.string().optional(),
  images: z.array(ImageSchema).optional(),
});

export const ImportDataSchema = z.array(ImportProductSchema);