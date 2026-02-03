/**
 * Entity Repository
 */
import { db } from "../connection";
import type { EmailEntity } from "../types";

export function insertEntity(
  emailId: number,
  entityType: string,
  entityValue: string
): number {
  const result = db.run(
    `INSERT INTO email_entities (email_id, entity_type, entity_value)
     VALUES (?, ?, ?)`,
    [emailId, entityType, entityValue]
  );

  return Number(result.lastInsertRowid);
}

export function getEntitiesForEmail(emailId: number): EmailEntity[] {
  const rows = db
    .query<
      {
        id: number;
        email_id: number;
        entity_type: string;
        entity_value: string;
        created_at: string;
      },
      [number]
    >("SELECT * FROM email_entities WHERE email_id = ?")
    .all(emailId);

  return rows.map((row) => ({
    id: row.id,
    emailId: row.email_id,
    entityType: row.entity_type,
    entityValue: row.entity_value,
    createdAt: row.created_at,
  }));
}
