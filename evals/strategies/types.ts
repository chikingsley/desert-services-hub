/** A retrieval strategy returns ranked project IDs for a query. */
export interface RetrievalStrategy {
  /** Optional setup (DB connections, index loading, etc.) */
  init?(): Promise<void>;

  /** Given a query, return project IDs ranked by relevance (best first). */
  retrieve(query: {
    _id: string;
    text: string;
    metadata: {
      source: string;
      subject?: string;
      from_name?: string;
      from_email?: string;
      email_id?: number;
    };
  }): Promise<number[]>;

  /** Optional cleanup (close connections, etc.) */
  cleanup?(): Promise<void>;
}
