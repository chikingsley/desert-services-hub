import { z } from "zod";

export const documentReviewFieldSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

export const documentReviewItemSchema = z.object({
  canPreview: z.boolean(),
  canRerun: z.boolean(),
  createdAt: z.string(),
  documentType: z.string().min(1),
  emailId: z.number().int().positive().nullable(),
  emailSubject: z.string().nullable(),
  extractedFields: z.array(documentReviewFieldSchema),
  extractionStatus: z.string().min(1),
  fileName: z.string().min(1),
  id: z.number().int().positive(),
  keySignals: z.array(z.string()),
  previewLabel: z.string().min(1),
  projectId: z.number().int().positive().nullable(),
  projectName: z.string().nullable(),
  qaStatus: z.enum(["approved", "needs_work", "unreviewed"]),
  source: z.string().min(1),
  summary: z.string().min(1),
  updatedAt: z.string(),
});

export const documentReviewWorkspaceSchema = z.object({
  items: z.array(documentReviewItemSchema).min(1),
});

export type DocumentReviewField = z.infer<typeof documentReviewFieldSchema>;
export type DocumentReviewItem = z.infer<typeof documentReviewItemSchema>;
export type DocumentReviewWorkspace = z.infer<
  typeof documentReviewWorkspaceSchema
>;
