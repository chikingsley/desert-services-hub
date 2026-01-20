import { z } from "zod";

/**
 * Bill-to information schema
 */
export const BillToSchema = z.object({
  companyName: z.string().default(""),
  address: z.string().nullable().default(null),
  email: z.string().email().nullable().or(z.literal("")).default(null),
  phone: z.string().nullable().default(null),
});

export type BillTo = z.infer<typeof BillToSchema>;

/**
 * Job/site information schema
 */
export const JobInfoSchema = z.object({
  siteName: z.string().min(1, "Site name is required"),
  address: z.string().nullable().default(null),
});

export type JobInfo = z.infer<typeof JobInfoSchema>;

/**
 * Estimator information schema
 */
export const EstimatorSchema = z.object({
  name: z.string().default(""),
  email: z.string().email().or(z.literal("")).default(""),
  phone: z.string().nullable().default(null),
});

export type Estimator = z.infer<typeof EstimatorSchema>;
