export interface WebhookJob {
  attempts: number;
  id: number;
  job_type: string;
  max_attempts: number;
  monday_item_id: string | null;
  payload: string;
}
