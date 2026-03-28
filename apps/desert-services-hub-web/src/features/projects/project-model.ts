import { z } from "zod";

export const projectEmailSchema = z.object({
  fromEmail: z.string().email(),
  id: z.number().int().positive(),
  receivedAt: z.string(),
  subject: z.string().min(1),
});

export const projectDocumentSchema = z.object({
  documentType: z.string().min(1),
  extractionStatus: z.string().min(1),
  fileName: z.string().min(1),
  id: z.number().int().positive(),
  qaStatus: z.string().min(1),
});

export const workspaceProjectSchema = z.object({
  awardedValue: z.number().nullable(),
  bidStatus: z.string().nullable(),
  bidValue: z.number().nullable(),
  canonicalEstimateId: z.number().int().positive().nullable(),
  contractStatus: z.string().nullable(),
  contractor: z.string().nullable(),
  documentCount: z.number().int().nonnegative(),
  documents: z.array(projectDocumentSchema),
  dustPermitStatus: z.string().nullable(),
  emailCount: z.number().int().nonnegative(),
  emails: z.array(projectEmailSchema),
  estimateName: z.string().nullable(),
  estimateNumber: z.string().nullable(),
  lastTouchAt: z.string(),
  nextAction: z.string().min(1),
  noiStatus: z.string().nullable(),
  projectId: z.number().int().positive(),
  projectName: z.string().min(1),
  safetyStatus: z.string().nullable(),
});

export const projectWorkspaceSchema = z.object({
  projects: z.array(workspaceProjectSchema).min(1),
});

export type ProjectEmail = z.infer<typeof projectEmailSchema>;
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;
export type WorkspaceProject = z.infer<typeof workspaceProjectSchema>;
export type ProjectWorkspace = z.infer<typeof projectWorkspaceSchema>;
