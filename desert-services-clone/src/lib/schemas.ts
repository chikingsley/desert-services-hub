import { z } from "zod/v4";

export const contactFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(1, "Phone number is required"),
  email: z.email("Please enter a valid email"),
  message: z.string().min(1, "Message is required"),
  honeypot: z.string().max(0).optional(),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export const serviceRequestFormSchema = z.object({
  generalContractor: z.string().optional(),
  projectName: z.string().min(1, "Project name is required"),
  contactName: z.string().min(1, "Contact name is required"),
  contactPhone: z.string().min(1, "Phone number is required"),
  contactEmail: z.email("Please enter a valid email"),
  projectAddress: z.string().min(1, "Project address is required"),
  servicesRequested: z.array(z.string()).optional(),
  honeypot: z.string().max(0).optional(),
});

export type ServiceRequestFormValues = z.infer<typeof serviceRequestFormSchema>;
