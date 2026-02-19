export interface WebhookJob {
  id: number;
  job_type: string;
  monday_item_id: string | null;
  payload: string;
  attempts: number;
  max_attempts: number;
}
