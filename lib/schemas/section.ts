import { z } from "zod";

/**
 * Quote section schema
 */
export const SectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  title: z.string().nullable(),
  showSubtotal: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
  catalogCategoryId: z.string().nullable(),
});

export type Section = z.infer<typeof SectionSchema>;

export const NewSectionSchema = SectionSchema.omit({
  id: true,
  sortOrder: true,
}).extend({
  id: z.string().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export type NewSection = z.infer<typeof NewSectionSchema>;
