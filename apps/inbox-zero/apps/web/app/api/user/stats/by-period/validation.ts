import { zodPeriod } from "@inboxzero/tinybird";
import { z } from "zod";

export const statsByPeriodQuerySchema = z.object({
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type StatsByPeriodQuery = z.infer<typeof statsByPeriodQuerySchema>;
