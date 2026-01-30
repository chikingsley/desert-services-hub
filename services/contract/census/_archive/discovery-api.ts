/**
 * API endpoint for Email Discovery Engine
 *
 * Provides REST API for discovering related emails and providing feedback
 *
 * Endpoints:
 *   GET  /discover/:emailId - Discover related emails
 *   POST /discover/:emailId/feedback - Provide feedback
 */

import type { Feedback } from "./discovery";
import { discoveryEngine } from "./discovery";

interface DiscoveryResult {
  seedEmailId: number;
  emails: Array<{
    id: number;
    subject: string;
    from: string;
    receivedAt: string;
    confidence: number;
    discoveryReason: string;
    groupId?: string;
  }>;
  attachments: Array<{
    id: number;
    name: string;
    size: number;
    confidence: number;
    discoveryReason: string;
    relatedEmailIds: number[];
  }>;
  groups: Array<{
    id: string;
    name: string;
    type: string;
    emailIds: number[];
    confidence: number;
    metadata: Record<string, unknown>;
  }>;
  signals: Array<{
    type: string;
    confidence: number;
    description: string;
    emailCount: number;
  }>;
  metadata: Record<string, unknown>;
  overallConfidence: number;
}

export interface DiscoveryAPI {
  /**
   * Discover related emails for a seed email
   */
  discover(
    emailId: number,
    options?: {
      maxResults?: number;
      minConfidence?: number;
      includeFeedback?: boolean;
    }
  ): Promise<{
    success: boolean;
    data?: DiscoveryResult;
    error?: string;
  }>;

  /**
   * Provide feedback to improve discovery
   */
  provideFeedback(
    emailId: number,
    feedback: Feedback
  ): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
}

export const discoveryAPI: DiscoveryAPI = {
  async discover(
    emailId: number,
    options?: {
      maxResults?: number;
      minConfidence?: number;
      includeFeedback?: boolean;
    }
  ): Promise<{ success: boolean; data?: DiscoveryResult; error?: string }> {
    try {
      const result = await discoveryEngine.discover(emailId, options);

      const data: DiscoveryResult = {
        seedEmailId: result.seedEmailId,
        emails: result.emails.map((e) => ({
          id: e.id,
          subject: e.subject ?? "",
          from: e.fromName ?? e.fromEmail ?? "",
          receivedAt: e.receivedAt,
          confidence: e.confidence,
          discoveryReason: Array.isArray(e.discoveryReason)
            ? e.discoveryReason.join(", ")
            : e.discoveryReason,
          groupId: e.groupId,
        })),
        attachments: result.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          size: a.size ?? 0,
          confidence: a.confidence,
          discoveryReason: Array.isArray(a.discoveryReason)
            ? a.discoveryReason.join(", ")
            : a.discoveryReason,
          relatedEmailIds: a.relatedEmailIds,
        })),
        groups: result.groups.map((g) => ({
          id: g.id,
          name: g.name,
          type: g.type as string,
          emailIds: g.emails,
          confidence: g.confidence,
          metadata: g.metadata ?? {},
        })),
        signals: result.signals.map((s) => ({
          type: s.type,
          confidence: s.confidence,
          description: s.description,
          emailCount: s.emailIds.length,
        })),
        metadata: result.metadata,
        overallConfidence: result.confidence,
      };

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  provideFeedback(emailId, feedback) {
    try {
      discoveryEngine.provideFeedback({
        ...feedback,
        emailId, // Use seed email ID
      });

      return Promise.resolve({
        success: true,
        message: "Feedback recorded successfully",
      });
    } catch (error) {
      return Promise.resolve({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
};

interface DiscoveryQuery {
  maxResults?: string;
  minConfidence?: string;
  includeFeedback?: string;
}

/**
 * Example Express/Hono route handlers
 */
export function createDiscoveryRoutes() {
  return {
    // GET /discover/:emailId
    getDiscover(req: { params: { emailId: string }; query: DiscoveryQuery }) {
      const emailId = Number.parseInt(req.params.emailId, 10);
      const options = {
        maxResults: req.query.maxResults
          ? Number.parseInt(req.query.maxResults, 10)
          : undefined,
        minConfidence: req.query.minConfidence
          ? Number.parseFloat(req.query.minConfidence)
          : undefined,
        includeFeedback: req.query.includeFeedback === "true",
      };

      return discoveryAPI.discover(emailId, options);
    },

    // POST /discover/:emailId/feedback
    postFeedback(req: { params: { emailId: string }; body: Feedback }) {
      const emailId = Number.parseInt(req.params.emailId, 10);
      return discoveryAPI.provideFeedback(emailId, req.body);
    },
  };
}
