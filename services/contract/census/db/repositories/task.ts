/**
 * Task Repository
 */
import { db } from "../connection";
import type {
  Email,
  EmailClassification,
  EmailTask,
  InsertTaskData,
  TaskPriority,
  TaskType,
} from "../types";
import { parseEmailRow } from "./email";

export function insertTask(data: InsertTaskData): number {
  const result = db.run(
    `INSERT INTO email_tasks (email_id, task_description, task_type, priority, due_date)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.emailId,
      data.taskDescription,
      data.taskType ?? null,
      data.priority ?? null,
      data.dueDate ?? null,
    ]
  );

  return Number(result.lastInsertRowid);
}

export function getTasksForEmail(emailId: number): EmailTask[] {
  const rows = db
    .query<
      {
        id: number;
        email_id: number;
        task_description: string;
        task_type: string | null;
        priority: string | null;
        due_date: string | null;
        status: string;
        created_at: string;
      },
      [number]
    >("SELECT * FROM email_tasks WHERE email_id = ?")
    .all(emailId);

  return rows.map((row) => ({
    id: row.id,
    emailId: row.email_id,
    taskDescription: row.task_description,
    taskType: row.task_type as TaskType | null,
    priority: row.priority as TaskPriority | null,
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export function updateTaskStatus(taskId: number, status: string): void {
  db.run("UPDATE email_tasks SET status = ? WHERE id = ?", [status, taskId]);
}

export function getEmailsWithoutTasks(
  classifications: EmailClassification[],
  limit = 1000
): Email[] {
  const placeholders = classifications.map(() => "?").join(", ");
  const rows = db
    .query<Record<string, unknown>, (string | number)[]>(
      `SELECT e.* FROM emails e
       LEFT JOIN email_tasks t ON t.email_id = e.id
       WHERE e.classification IN (${placeholders})
       AND t.id IS NULL
       ORDER BY e.received_at DESC
       LIMIT ?`
    )
    .all(...classifications, limit);

  return rows.map(parseEmailRow);
}

export function clearTasks(): void {
  db.run("DELETE FROM email_tasks");
}
