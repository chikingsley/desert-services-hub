/**
 * Email Census Task Extraction
 *
 * Extracts actionable tasks from classified emails using Gemini LLM.
 * Only processes emails in actionable categories (CONTRACT, ESTIMATE, etc.)
 */
import { GoogleGenAI } from "@google/genai";
import {
  type Email,
  type EmailClassification,
  getEmailById,
  getEmailsWithoutTasks,
  insertTask,
  type TaskPriority,
  type TaskType,
} from "./db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Categories that typically contain actionable tasks
const ACTIONABLE_CATEGORIES: EmailClassification[] = [
  "CONTRACT",
  "DUST_PERMIT",
  "SWPPP",
  "ESTIMATE",
  "INSURANCE",
  "INVOICE",
  "CHANGE_ORDER",
  "SCHEDULE",
];

// ============================================================================
// Types
// ============================================================================

interface ExtractedTask {
  description: string;
  type: TaskType;
  priority: TaskPriority;
  dueDate: string | null;
}

interface LLMTaskResponse {
  tasks: Array<{
    description: string;
    type: "action_required" | "fyi" | "follow_up" | "waiting_on";
    priority: "urgent" | "normal" | "low";
    dueDate?: string;
  }>;
  hasTasks: boolean;
}

interface ExtractionProgress {
  processed: number;
  total: number;
  tasksExtracted: number;
  current?: {
    emailId: number;
    subject: string | null;
    taskCount: number;
  };
}

interface ExtractionStats {
  emailsProcessed: number;
  tasksExtracted: number;
  byType: Record<TaskType, number>;
  byPriority: Record<TaskPriority, number>;
  errors: number;
}

// ============================================================================
// Task Extraction
// ============================================================================

/**
 * Extract tasks from a single email using Gemini LLM.
 */
export async function extractTasksFromEmail(
  email: Email
): Promise<ExtractedTask[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for task extraction");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `Analyze this email and extract any actionable tasks or items that require attention.

Task Types:
- action_required: Something the recipient needs to do (sign, submit, respond, review)
- fyi: Information only, no action needed
- follow_up: Need to check back on something later
- waiting_on: Waiting for someone else to take action

Priority:
- urgent: Due within 24-48 hours or time-sensitive
- normal: Standard business timeline (1-2 weeks)
- low: No specific deadline, can be deferred

Email Details:
Subject: ${email.subject ?? "(no subject)"}
From: ${email.fromName ?? ""} <${email.fromEmail ?? ""}>
To: ${email.toEmails.join(", ") || "(unknown)"}
Date: ${email.receivedAt}
Category: ${email.classification ?? "UNKNOWN"}
Attachments: ${email.attachmentNames.join(", ") || "(none)"}

Body Preview:
${email.bodyPreview ?? "(no content)"}

Extract tasks from this email. Be specific about what action is needed.
If there are no actionable tasks (just informational), set hasTasks to false.
For due dates, use ISO format (YYYY-MM-DD) if mentioned or inferable.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          hasTasks: {
            type: "BOOLEAN",
            description: "Whether the email contains actionable tasks",
          },
          tasks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                description: {
                  type: "STRING",
                  description: "Clear description of the task",
                },
                type: {
                  type: "STRING",
                  enum: ["action_required", "fyi", "follow_up", "waiting_on"],
                },
                priority: {
                  type: "STRING",
                  enum: ["urgent", "normal", "low"],
                },
                dueDate: {
                  type: "STRING",
                  description: "Due date in ISO format if mentioned",
                },
              },
              required: ["description", "type", "priority"],
            },
          },
        },
        required: ["hasTasks", "tasks"],
      },
    },
  });

  const result = JSON.parse(response.text || "{}") as LLMTaskResponse;

  if (!(result.hasTasks && result.tasks) || result.tasks.length === 0) {
    return [];
  }

  return result.tasks.map((t) => ({
    description: t.description,
    type: t.type,
    priority: t.priority,
    dueDate: t.dueDate ?? null,
  }));
}

/**
 * Extract and store tasks from a single email.
 */
export async function processEmailTasks(emailId: number): Promise<number> {
  const email = getEmailById(emailId);
  if (!email) {
    throw new Error(`Email not found: ${emailId}`);
  }

  // Skip if not in an actionable category
  if (!email.classification) {
    return 0;
  }
  if (!ACTIONABLE_CATEGORIES.includes(email.classification)) {
    return 0;
  }

  const tasks = await extractTasksFromEmail(email);

  for (const task of tasks) {
    insertTask({
      emailId: email.id,
      taskDescription: task.description,
      taskType: task.type,
      priority: task.priority,
      dueDate: task.dueDate,
    });
  }

  return tasks.length;
}

/**
 * Extract tasks from all actionable emails that don't have tasks yet.
 */
export async function extractAllTasks(
  options: {
    limit?: number;
    onProgress?: (progress: ExtractionProgress) => void;
  } = {}
): Promise<ExtractionStats> {
  const { limit = 1000, onProgress } = options;

  const emails = getEmailsWithoutTasks(ACTIONABLE_CATEGORIES, limit);

  const stats: ExtractionStats = {
    emailsProcessed: 0,
    tasksExtracted: 0,
    byType: {
      action_required: 0,
      fyi: 0,
      follow_up: 0,
      waiting_on: 0,
    },
    byPriority: {
      urgent: 0,
      normal: 0,
      low: 0,
    },
    errors: 0,
  };

  for (const [index, email] of emails.entries()) {
    try {
      const tasks = await extractTasksFromEmail(email);

      // Store tasks
      for (const task of tasks) {
        insertTask({
          emailId: email.id,
          taskDescription: task.description,
          taskType: task.type,
          priority: task.priority,
          dueDate: task.dueDate,
        });

        stats.tasksExtracted++;
        stats.byType[task.type]++;
        stats.byPriority[task.priority]++;
      }

      stats.emailsProcessed++;

      // Report progress
      if (onProgress) {
        onProgress({
          processed: index + 1,
          total: emails.length,
          tasksExtracted: stats.tasksExtracted,
          current: {
            emailId: email.id,
            subject: email.subject,
            taskCount: tasks.length,
          },
        });
      }

      // Rate limiting - avoid hitting API too fast
      if (index < emails.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`Failed to extract tasks from email ${email.id}:`, error);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Print extraction statistics.
 */
export function printExtractionStats(stats: ExtractionStats): void {
  console.log("\n=== Task Extraction Results ===\n");
  console.log(`Emails processed: ${stats.emailsProcessed}`);
  console.log(`Tasks extracted: ${stats.tasksExtracted}`);
  console.log(`Errors: ${stats.errors}`);

  console.log("\nBy type:");
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log("\nBy priority:");
  for (const [priority, count] of Object.entries(stats.byPriority)) {
    console.log(`  ${priority}: ${count}`);
  }
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 1000;

  console.log("Starting task extraction...\n");
  console.log(`Limit: ${limit}\n`);
  console.log(`Actionable categories: ${ACTIONABLE_CATEGORIES.join(", ")}\n`);

  extractAllTasks({
    limit,
    onProgress: (p) => {
      if (p.processed % 50 === 0 || p.processed === p.total) {
        console.log(
          `Progress: ${p.processed}/${p.total} (${p.tasksExtracted} tasks)`
        );
      }
    },
  })
    .then((stats) => {
      printExtractionStats(stats);
    })
    .catch((error) => {
      console.error("Task extraction failed:", error);
      process.exit(1);
    });
}
