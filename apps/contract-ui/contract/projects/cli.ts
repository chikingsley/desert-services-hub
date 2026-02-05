#!/usr/bin/env bun

/**
 * Projects CLI
 *
 * Usage:
 *   bun projects/cli.ts add --name "Project" --contractor "GC" [--po "PO-123"]
 *   bun projects/cli.ts list
 *   bun projects/cli.ts get <project_number>
 *   bun projects/cli.ts update <project_number> --contract-status "Executed"
 *   bun projects/cli.ts columns [--action keep|delete|add]
 *   bun projects/cli.ts seed-columns --yes
 *   bun projects/cli.ts tasks add <project_number> --type contract --name "Send contract" [--status Pending]
 *   bun projects/cli.ts tasks list <project_number>
 *   bun projects/cli.ts tasks update <task_id> --status "Done"
 */

import { db } from "./schema";
import { seedMondayColumns } from "./seed-columns";

type Project = {
  id: number;
  project_number: string;
  project_name: string;
  contractor: string | null;
  po_number: string | null;
  awarded_value: number | null;
  start_date: string | null;
  end_date: string | null;
  project_status: string;
  contract_status: string;
  dust_permit_status: string;
  noi_status: string;
  swppp_status: string;
  signs_status: string;
  outlook_folder: string | null;
  award_notice_date: string | null;
  award_notice_mailbox: string | null;
  award_notice_message_id: string | null;
  award_notice_type: string | null;
  contract_received_mailbox: string | null;
  contract_received_message_id: string | null;
  created_at: string;
};

type ProjectWithCounts = Project & {
  open_tasks: number;
};

type MondayColumn = {
  id: number;
  column_name: string;
  monday_id: string | null;
  monday_type: string | null;
  action: string;
  notes: string;
};

type ProjectTask = {
  id: number;
  project_id: number;
  task_type: string;
  task_name: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
};

const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        result[key] = value;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) {
    console.error(`Error: ${name} is required`);
    console.error("Run: bun projects/cli.ts --help");
    process.exit(1);
  }
  return value;
}

function getNextProjectNumber(): string {
  const result = db
    .query<{ max_num: string | null }, []>(
      "SELECT MAX(CAST(project_number AS INTEGER)) as max_num FROM projects"
    )
    .get();

  const maxNum = result?.max_num ? Number.parseInt(result.max_num, 10) : 1000;
  return String(maxNum + 1);
}

function addProject(opts: Record<string, string>) {
  const name = opts.name;
  const contractor = opts.contractor;
  const po = opts.po || null;
  const value = opts.value ? Number.parseFloat(opts.value) : null;

  if (!name) {
    console.error("Error: --name is required");
    process.exit(1);
  }

  const projectNumber = getNextProjectNumber();

  db.run(
    `INSERT INTO projects (project_number, project_name, contractor, po_number, awarded_value)
     VALUES (?, ?, ?, ?, ?)`,
    [projectNumber, name, contractor || null, po, value]
  );

  console.log(`Created project ${projectNumber}: ${name}`);
  if (contractor) console.log(`  Contractor: ${contractor}`);
  if (po) console.log(`  PO: ${po}`);
  if (value) console.log(`  Value: $${value.toLocaleString()}`);
}

function listProjects() {
  const opts = parseArgs(args.slice(1));
  const limit = opts.limit ? Number.parseInt(opts.limit, 10) : 50;
  const needsOnly = opts.needs === "true";

  const projects = db
    .query<ProjectWithCounts, [number]>(
      `
      SELECT
        p.*,
        (
          SELECT COUNT(*) FROM tasks t
          WHERE t.project_id = p.id AND t.status != 'Done'
        ) as open_tasks
      FROM projects p
      ORDER BY CAST(p.project_number AS INTEGER) DESC
      LIMIT ?
      `
    )
    .all(limit);

  if (projects.length === 0) {
    console.log("No projects yet.");
    return;
  }

  const isTerminal = (deliverable: string, status: string) => {
    const normalized = status.trim().toLowerCase();
    switch (deliverable) {
      case "contract":
        return normalized === "executed";
      case "dust":
        return normalized === "received" || normalized === "not needed";
      case "noi":
        return normalized === "approved" || normalized === "not needed";
      case "swppp":
        return normalized === "approved" || normalized === "not needed";
      case "signs":
        return normalized === "delivered" || normalized === "not needed";
      default:
        return false;
    }
  };

  const needsWork = (p: ProjectWithCounts) => {
    if (p.open_tasks > 0) return true;
    if (!isTerminal("contract", p.contract_status)) return true;
    if (!isTerminal("dust", p.dust_permit_status)) return true;
    if (!isTerminal("noi", p.noi_status)) return true;
    if (!isTerminal("swppp", p.swppp_status)) return true;
    if (!isTerminal("signs", p.signs_status)) return true;
    return false;
  };

  const filtered = needsOnly ? projects.filter(needsWork) : projects;
  if (filtered.length === 0) {
    console.log("No projects need action.");
    return;
  }

  console.log(
    `\n${"#".padEnd(6)} ${"Project Name".padEnd(28)} ${"Contractor".padEnd(22)} ${"Contract".padEnd(10)} ${"Dust".padEnd(10)} ${"NOI".padEnd(10)} ${"SWPPP".padEnd(10)} ${"Signs".padEnd(10)} ${"Tasks".padEnd(5)} Needs`
  );
  console.log("-".repeat(130));

  for (const p of filtered) {
    const needs: string[] = [];
    if (!isTerminal("contract", p.contract_status)) needs.push("Contract");
    if (!isTerminal("dust", p.dust_permit_status)) needs.push("Dust");
    if (!isTerminal("noi", p.noi_status)) needs.push("NOI");
    if (!isTerminal("swppp", p.swppp_status)) needs.push("SWPPP");
    if (!isTerminal("signs", p.signs_status)) needs.push("Signs");
    if (p.open_tasks > 0) needs.push(`Tasks:${p.open_tasks}`);

    console.log(
      `${p.project_number.padEnd(6)} ${p.project_name.slice(0, 26).padEnd(28)} ${(p.contractor || "-").slice(0, 20).padEnd(22)} ${p.contract_status.padEnd(10)} ${p.dust_permit_status.padEnd(10)} ${p.noi_status.padEnd(10)} ${p.swppp_status.padEnd(10)} ${p.signs_status.padEnd(10)} ${String(p.open_tasks).padEnd(5)} ${needs.length ? needs.join(", ") : "-"}`
    );
  }
  console.log(`\nTotal: ${filtered.length} projects`);
}

function getProject(projectNumber: string) {
  const project = db
    .query<Project, [string]>("SELECT * FROM projects WHERE project_number = ?")
    .get(projectNumber);

  if (!project) {
    console.error(`Project ${projectNumber} not found`);
    process.exit(1);
  }

  console.log(`\nProject #${project.project_number}`);
  console.log("-".repeat(40));
  console.log(`Name:        ${project.project_name}`);
  console.log(`Contractor:  ${project.contractor || "-"}`);
  console.log(`PO:          ${project.po_number || "-"}`);
  console.log(
    `Value:       ${project.awarded_value ? `$${project.awarded_value.toLocaleString()}` : "-"}`
  );
  console.log(`Status:      ${project.project_status}`);
  console.log(`Created:     ${project.created_at}`);
  if (project.award_notice_date) {
    const typeInfo = project.award_notice_type
      ? ` (${project.award_notice_type})`
      : "";
    console.log(`Win Notice:  ${project.award_notice_date}${typeInfo}`);
    if (project.award_notice_mailbox || project.award_notice_message_id) {
      console.log(
        `  Source: ${project.award_notice_mailbox ?? "-"} ${project.award_notice_message_id ?? ""}`.trimEnd()
      );
    }
  }
  if (
    project.contract_received_mailbox ||
    project.contract_received_message_id
  ) {
    console.log(
      `Contract Source: ${project.contract_received_mailbox ?? "-"} ${project.contract_received_message_id ?? ""}`.trimEnd()
    );
  }
  console.log("");
  console.log("Deliverables:");
  console.log(`  Contract:    ${project.contract_status}`);
  console.log(`  Dust Permit: ${project.dust_permit_status}`);
  console.log(`  NOI:         ${project.noi_status}`);
  console.log(`  SWPPP:       ${project.swppp_status}`);
  console.log(`  Signs:       ${project.signs_status}`);

  // Get the full project with dates
  const full = db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM projects WHERE project_number = ?"
    )
    .get(projectNumber);

  if (full) {
    const contractDates = [
      full.contract_received_date && `Received: ${full.contract_received_date}`,
      full.contract_initial_response_date &&
        `Response: ${full.contract_initial_response_date}`,
      full.contract_sent_to_ic_date &&
        `Sent to IC: ${full.contract_sent_to_ic_date}`,
      full.contract_signed_date && `Signed: ${full.contract_signed_date}`,
    ].filter(Boolean);

    const dustDates = [
      full.dust_permit_requested_date &&
        `Requested: ${full.dust_permit_requested_date}`,
      full.dust_permit_filed_date && `Filed: ${full.dust_permit_filed_date}`,
      full.dust_permit_issued_date && `Issued: ${full.dust_permit_issued_date}`,
      full.dust_permit_renewal_date &&
        `Renewal: ${full.dust_permit_renewal_date}`,
      full.dust_permit_billing_notified_date &&
        `Billing Notified: ${full.dust_permit_billing_notified_date}`,
    ].filter(Boolean);

    if (contractDates.length > 0) {
      console.log("");
      console.log("Contract Timeline:");
      for (const d of contractDates) console.log(`  ${d}`);
    }

    if (dustDates.length > 0) {
      console.log("");
      console.log("Dust Permit Timeline:");
      for (const d of dustDates) console.log(`  ${d}`);
    }
  }
}

function updateProject(projectNumber: string, opts: Record<string, string>) {
  const project = db
    .query<Project, [string]>("SELECT * FROM projects WHERE project_number = ?")
    .get(projectNumber);

  if (!project) {
    console.error(`Project ${projectNumber} not found`);
    process.exit(1);
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  const fieldMap: Record<string, string> = {
    name: "project_name",
    contractor: "contractor",
    po: "po_number",
    value: "awarded_value",
    status: "project_status",
    "contract-status": "contract_status",
    "dust-status": "dust_permit_status",
    "noi-status": "noi_status",
    "swppp-status": "swppp_status",
    "signs-status": "signs_status",
    "start-date": "start_date",
    "end-date": "end_date",
    "location-address": "location_address",
    "location-city": "location_city",
    "location-state": "location_state",
    "location-zip": "location_zip",
    "contract-file": "contract_file",
    "dust-permit-file": "dust_permit_file",
    "sov-file": "sov_file",
    "monday-item-id": "monday_item_id",
    "linked-estimate-ids": "linked_estimate_ids",
    // Contract dates
    "contract-received": "contract_received_date",
    "contract-received-mailbox": "contract_received_mailbox",
    "contract-received-message-id": "contract_received_message_id",
    "contract-response": "contract_initial_response_date",
    "contract-sent-ic": "contract_sent_to_ic_date",
    "contract-signed": "contract_signed_date",
    // Award notice (won)
    "award-notice": "award_notice_date",
    "award-notice-mailbox": "award_notice_mailbox",
    "award-notice-message-id": "award_notice_message_id",
    // Win notice (alias)
    "win-notice": "award_notice_date",
    "win-notice-mailbox": "award_notice_mailbox",
    "win-notice-message-id": "award_notice_message_id",
    "win-notice-type": "award_notice_type",
    // Dust permit dates
    "dust-requested": "dust_permit_requested_date",
    "dust-filed": "dust_permit_filed_date",
    "dust-issued": "dust_permit_issued_date",
    "dust-renewal": "dust_permit_renewal_date",
    "dust-billing-notified": "dust_permit_billing_notified_date",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (opts[key] !== undefined) {
      updates.push(`${dbField} = ?`);
      if (key === "value") {
        values.push(Number.parseFloat(opts[key]));
        continue;
      }
      if (key === "linked-estimate-ids") {
        const raw = opts[key].trim();
        if (raw.startsWith("[")) {
          try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) throw new Error("not array");
            values.push(JSON.stringify(parsed));
          } catch {
            console.error(
              "Error: --linked-estimate-ids must be a JSON array or comma-separated list"
            );
            process.exit(1);
          }
        } else {
          const parts = raw
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
          values.push(JSON.stringify(parts));
        }
        continue;
      }

      values.push(opts[key]);
    }
  }

  if (updates.length === 0) {
    console.log("No updates specified");
    return;
  }

  updates.push("updated_at = datetime('now')");
  values.push(projectNumber);

  db.run(
    `UPDATE projects SET ${updates.join(", ")} WHERE project_number = ?`,
    values
  );

  console.log(`Updated project ${projectNumber}`);
  getProject(projectNumber);
}

function listColumns(opts: Record<string, string>) {
  const action = opts.action;

  let query = "SELECT * FROM monday_columns";
  const params: string[] = [];

  if (action) {
    query += " WHERE action = ?";
    params.push(action);
  }

  query += " ORDER BY action, column_name";

  const columns = db.query<MondayColumn, string[]>(query).all(...params);

  const grouped: Record<string, MondayColumn[]> = {};
  for (const col of columns) {
    if (!grouped[col.action]) grouped[col.action] = [];
    grouped[col.action].push(col);
  }

  for (const [act, cols] of Object.entries(grouped)) {
    console.log(`\n=== ${act.toUpperCase()} (${cols.length}) ===`);
    for (const col of cols) {
      const mondayInfo = col.monday_id ? ` [${col.monday_id}]` : "";
      console.log(`  ${col.column_name}${mondayInfo}`);
      if (col.notes) console.log(`    └─ ${col.notes}`);
    }
  }
}

function seedColumns(opts: Record<string, string>) {
  const yes = opts.yes === "true";
  if (!yes) {
    console.error(
      "Refusing to overwrite monday_columns without --yes (this will DELETE and reseed the table)"
    );
    process.exit(1);
  }

  const result = seedMondayColumns();
  console.log(`Seeded ${result.seeded} columns`);
  console.log("\nSummary:");
  for (const row of result.summary) {
    console.log(`  ${row.action}: ${row.count}`);
  }
}

function findProjectId(projectNumber: string): number {
  const project = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE project_number = ?"
    )
    .get(projectNumber);

  if (!project) {
    console.error(`Project ${projectNumber} not found`);
    process.exit(1);
  }

  return project.id;
}

function tasksAdd(projectNumber: string, opts: Record<string, string>) {
  const projectId = findProjectId(projectNumber);
  const taskType = requireArg(opts.type, "--type");
  const taskName = requireArg(opts.name, "--name");

  const status = opts.status || "Pending";
  const dueDate = opts["due-date"] || null;
  const notes = opts.notes || null;
  const filePath = opts.file || null;

  db.run(
    `INSERT INTO tasks (project_id, task_type, task_name, status, due_date, notes, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [projectId, taskType, taskName, status, dueDate, notes, filePath]
  );

  const created = db
    .query<{ id: number }, []>("SELECT last_insert_rowid() as id")
    .get();
  console.log(`Created task ${created?.id ?? "?"} on project ${projectNumber}`);
}

function tasksList(projectNumber: string, opts: Record<string, string>) {
  const projectId = findProjectId(projectNumber);
  const includeCompleted = opts.all === "true";

  const query = includeCompleted
    ? "SELECT * FROM tasks WHERE project_id = ? ORDER BY id DESC"
    : "SELECT * FROM tasks WHERE project_id = ? AND status != 'Done' ORDER BY id DESC";

  const tasks = db.query<ProjectTask, [number]>(query).all(projectId);

  if (tasks.length === 0) {
    console.log("No tasks.");
    return;
  }

  console.log(
    `\n${"ID".padEnd(6)} ${"Type".padEnd(14)} ${"Status".padEnd(14)} ${"Due".padEnd(12)} Task`
  );
  console.log("-".repeat(80));

  for (const t of tasks) {
    console.log(
      `${String(t.id).padEnd(6)} ${t.task_type.slice(0, 12).padEnd(14)} ${t.status.slice(0, 12).padEnd(14)} ${(t.due_date || "-").padEnd(12)} ${t.task_name}`
    );
  }
  console.log(`\nTotal: ${tasks.length} tasks`);
}

function tasksUpdate(taskId: string, opts: Record<string, string>) {
  const id = Number.parseInt(taskId, 10);
  if (!Number.isFinite(id)) {
    console.error("Error: <task_id> must be a number");
    process.exit(1);
  }

  const existing = db
    .query<ProjectTask, [number]>("SELECT * FROM tasks WHERE id = ?")
    .get(id);

  if (!existing) {
    console.error(`Task ${id} not found`);
    process.exit(1);
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  const fieldMap: Record<string, string> = {
    type: "task_type",
    name: "task_name",
    status: "status",
    "due-date": "due_date",
    notes: "notes",
    file: "file_path",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (opts[key] !== undefined) {
      updates.push(`${dbField} = ?`);
      values.push(opts[key] === "" ? null : opts[key]);
    }
  }

  if (updates.length === 0) {
    console.log("No updates specified");
    return;
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.run(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`, values);
  console.log(`Updated task ${id}`);
}

function tasksCommand(rest: string[]) {
  const sub = rest[0];
  switch (sub) {
    case "add":
      tasksAdd(
        requireArg(rest[1], "<project_number>"),
        parseArgs(rest.slice(2))
      );
      break;
    case "list":
      tasksList(
        requireArg(rest[1], "<project_number>"),
        parseArgs(rest.slice(2))
      );
      break;
    case "update":
      tasksUpdate(requireArg(rest[1], "<task_id>"), parseArgs(rest.slice(2)));
      break;
    default:
      console.error("Error: tasks requires a subcommand: add | list | update");
      console.error("Run: bun projects/cli.ts --help");
      process.exit(1);
  }
}

function showHelp() {
  console.log(`
Projects CLI

Commands:
  add --name "Project Name" --contractor "GC" [--po "PO-123"] [--value 50000]
      Create a new project

  list
      List projects
      Options:
        --limit 50
        --needs (only show projects needing action)

  get <project_number>
      Show project details

  update <project_number> [options]
      Update a project
      Options:
        --name, --contractor, --po, --value
        --status (project status)
        --contract-status, --dust-status, --noi-status, --swppp-status, --signs-status
        --start-date, --end-date
        --location-address, --location-city, --location-state, --location-zip
        --contract-file, --dust-permit-file, --sov-file
        --monday-item-id, --linked-estimate-ids (JSON array or comma-separated list)
        Contract dates: --contract-received, --contract-response, --contract-sent-ic, --contract-signed
          Sources: --contract-received-mailbox, --contract-received-message-id
        Win notice: --win-notice (alias: --award-notice)
          Sources: --win-notice-mailbox, --win-notice-message-id
          Type: --win-notice-type (CONTRACT, LOI, NTP, PO, WORK_REQUEST, etc.)
        Dust permit dates: --dust-requested, --dust-filed, --dust-issued, --dust-renewal, --dust-billing-notified

  columns [--action keep|delete|add]
      Show Monday column plan

  seed-columns --yes
      Reset + seed monday_columns from \`projects/seed-columns.ts\`

  tasks add <project_number> --type <type> --name <name> [options]
  tasks list <project_number> [--all]
  tasks update <task_id> [options]
      Manage per-project tasks (stored in projects.db)

Examples:
  bun projects/cli.ts add --name "MODERA PV" --contractor "Ryan Companies" --po "PO-2025-001"
  bun projects/cli.ts update 1001 --contract-status "Executed" --dust-status "Received"
  bun projects/cli.ts columns --action delete
  bun projects/cli.ts list --needs
  bun projects/cli.ts seed-columns --yes
  bun projects/cli.ts tasks add 1001 --type contract --name "Save contract to SharePoint" --due-date 2026-02-05
  bun projects/cli.ts tasks list 1001
`);
}

// Main
switch (command) {
  case "add":
    addProject(parseArgs(args.slice(1)));
    break;
  case "list":
    listProjects();
    break;
  case "get":
    getProject(requireArg(args[1], "<project_number>"));
    break;
  case "update":
    updateProject(
      requireArg(args[1], "<project_number>"),
      parseArgs(args.slice(2))
    );
    break;
  case "columns":
    listColumns(parseArgs(args.slice(1)));
    break;
  case "seed-columns":
    seedColumns(parseArgs(args.slice(1)));
    break;
  case "tasks":
    tasksCommand(args.slice(1));
    break;
  case "help":
  case "--help":
  case "-h":
  default:
    showHelp();
    break;
}
