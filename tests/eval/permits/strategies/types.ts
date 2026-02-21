/** A permit retrieval strategy returns ranked permit IDs for a query. */
export interface PermitRetrievalStrategy {
  init?(): Promise<void>;

  /** Given a query string, return permit IDs ranked by relevance (best first). */
  retrieve(query: string): Promise<string[]>;

  cleanup?(): Promise<void>;
}
