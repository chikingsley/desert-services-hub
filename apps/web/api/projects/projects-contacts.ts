/**
 * Project contacts roll-up API handler
 * Route: GET /api/projects/:id/contacts
 */
import { db } from "@lib/db/client";

type BunProjectRequest = Request & { params: { id: string } };

interface ProjectRow {
  account_id: number | null;
  id: number;
  lifecycle_state: string | null;
  name: string;
}

interface ContactRollupRow {
  account_id: number | null;
  contact_id: number;
  email: string | null;
  email_links: number;
  estimate_links: number;
  name: string;
  phone: string | null;
  sources: string[] | null;
  title: string | null;
}

function parseProjectId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function getProjectContacts(
  req: BunProjectRequest
): Promise<Response> {
  try {
    const projectId = parseProjectId(req.params.id);
    if (!projectId) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const project = (await db
      .query<ProjectRow, [number]>(
        `SELECT id, name, lifecycle_state, account_id
         FROM projects
         WHERE id = $1`
      )
      .get(projectId)) as ProjectRow | null;

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const rows = (await db
      .query<ContactRollupRow, [number, number]>(
        `WITH estimate_links AS (
           SELECT
             c.id AS contact_id,
             c.name,
             c.email,
             c.phone,
             c.title,
             c.account_id,
             COUNT(DISTINCT pe.estimate_id)::int AS estimate_links,
             0::int AS email_links,
             ARRAY_AGG(DISTINCT ec.source) FILTER (WHERE ec.source IS NOT NULL) AS sources
           FROM project_estimates pe
           JOIN estimate_contacts ec ON ec.estimate_id = pe.estimate_id
           JOIN contacts c ON c.id = ec.contact_id
           WHERE pe.project_id = $1
           GROUP BY c.id, c.name, c.email, c.phone, c.title, c.account_id
         ),
         email_links AS (
           SELECT
             c.id AS contact_id,
             c.name,
             c.email,
             c.phone,
             c.title,
             c.account_id,
             0::int AS estimate_links,
             COUNT(DISTINCT ce.email_id)::int AS email_links,
             ARRAY_AGG(DISTINCT ce.relationship) FILTER (WHERE ce.relationship IS NOT NULL) AS sources
           FROM emails e
           JOIN contact_emails ce ON ce.email_id = e.id
           JOIN contacts c ON c.id = ce.contact_id
           WHERE e.project_id = $2
           GROUP BY c.id, c.name, c.email, c.phone, c.title, c.account_id
         ),
         combined AS (
           SELECT * FROM estimate_links
           UNION ALL
           SELECT * FROM email_links
         )
         SELECT
           contact_id,
           name,
           email,
           phone,
           title,
           account_id,
           SUM(estimate_links)::int AS estimate_links,
           SUM(email_links)::int AS email_links,
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT src), NULL) AS sources
         FROM (
           SELECT
             contact_id,
             name,
             email,
             phone,
             title,
             account_id,
             estimate_links,
             email_links,
             UNNEST(COALESCE(sources, ARRAY[]::text[])) AS src
           FROM combined
         ) exploded
         GROUP BY contact_id, name, email, phone, title, account_id
         ORDER BY (SUM(estimate_links) + SUM(email_links)) DESC,
                  LOWER(name) ASC,
                  contact_id ASC`
      )
      .all(projectId, projectId)) as ContactRollupRow[];

    return Response.json({
      contacts: rows,
      project: {
        id: project.id,
        name: project.name,
        lifecycle_state: project.lifecycle_state,
        account_id: project.account_id,
      },
      summary: {
        total_contacts: rows.length,
        contacts_with_estimate_links: rows.filter(
          (row) => row.estimate_links > 0
        ).length,
        contacts_with_email_links: rows.filter((row) => row.email_links > 0)
          .length,
      },
    });
  } catch (error) {
    console.error("Failed to fetch project contacts:", error);
    return Response.json(
      { error: "Failed to fetch project contacts" },
      { status: 500 }
    );
  }
}
