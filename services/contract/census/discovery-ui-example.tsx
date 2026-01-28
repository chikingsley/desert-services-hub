/**
 * Example React component showing how to use Discovery Engine in UI
 *
 * This demonstrates:
 * - Auto-grouping emails by discovery groups
 * - Showing confidence scores
 * - Allowing user feedback (exclude/include/regroup)
 * - Visual grouping in UI
 */

import { useEffect, useState } from "react";
import type { DiscoveryResult, Feedback } from "./discovery";

interface DiscoveryUIProps {
  seedEmailId: number;
}

export function DiscoveryUI({ seedEmailId }: DiscoveryUIProps) {
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  useEffect(() => {
    async function loadDiscovery() {
      setLoading(true);
      try {
        // In real app, this would be an API call
        const response = await fetch(`/api/discover/${seedEmailId}`);
        const data = await response.json();
        setResult(data.data);
      } catch (error) {
        console.error("Failed to load discovery:", error);
      } finally {
        setLoading(false);
      }
    }

    loadDiscovery();
  }, [seedEmailId]);

  async function handleFeedback(
    emailId: number,
    action: "exclude" | "include" | "regroup",
    targetGroupId?: string
  ) {
    const feedback: Feedback = {
      emailId,
      action,
      targetGroupId,
    };

    try {
      await fetch(`/api/discover/${seedEmailId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedback),
      });

      // Reload discovery with feedback applied
      const response = await fetch(
        `/api/discover/${seedEmailId}?includeFeedback=true`
      );
      const data = await response.json();
      setResult(data.data);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    }
  }

  if (loading) {
    return <div>Loading related emails...</div>;
  }

  if (!result) {
    return <div>No results found</div>;
  }

  return (
    <div className="discovery-ui">
      {/* Header */}
      <div className="discovery-header">
        <h2>Related Emails & Documents</h2>
        <div className="confidence-badge">
          Confidence: {(result.confidence * 100).toFixed(0)}%
        </div>
        <div className="stats">
          {result.emails.length} emails • {result.attachments.length}{" "}
          attachments • {result.groups.length} groups
        </div>
      </div>

      {/* Discovery Signals */}
      <div className="signals-section">
        <h3>Discovery Signals</h3>
        <div className="signals-grid">
          {result.signals.map((signal) => (
            <div className="signal-card" key={signal.type}>
              <div className="signal-type">{signal.type}</div>
              <div className="signal-confidence">
                {(signal.confidence * 100).toFixed(0)}%
              </div>
              <div className="signal-description">{signal.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Groups */}
      <div className="groups-section">
        <h3>Email Groups</h3>
        <div className="groups-list">
          {result.groups.map((group) => (
            <button
              className={`group-card ${selectedGroup === group.id ? "selected" : ""}`}
              key={group.id}
              onClick={() => setSelectedGroup(group.id)}
              type="button"
            >
              <div className="group-header">
                <span className="group-icon">
                  {group.type === "thread" && "💬"}
                  {group.type === "project" && "📁"}
                  {group.type === "subject" && "📧"}
                  {group.type === "date" && "📅"}
                  {group.type === "attachment" && "📎"}
                </span>
                <span className="group-name">{group.name}</span>
                <span className="group-confidence">
                  {(group.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="group-count">{group.emails.length} emails</div>
            </button>
          ))}
        </div>
      </div>

      {/* Emails grouped by discovery group */}
      <div className="emails-section">
        <h3>Discovered Emails</h3>
        {result.groups.map((group) => {
          const groupEmails = result.emails.filter(
            (e) => e.groupId === group.id
          );

          return (
            <div className="email-group" key={group.id}>
              <div className="group-header">
                <h4>{group.name}</h4>
                <span className="email-count">{groupEmails.length} emails</span>
              </div>

              <div className="emails-list">
                {groupEmails.map((email) => (
                  <div className="email-card" key={email.id}>
                    <div className="email-header">
                      <div className="email-subject">
                        {email.subject || "(No Subject)"}
                      </div>
                      <div className="email-confidence">
                        {(email.confidence * 100).toFixed(0)}%
                      </div>
                    </div>

                    <div className="email-meta">
                      <span>{email.fromName || email.fromEmail}</span>
                      <span>
                        {new Date(email.receivedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="email-reasons">
                      Found via: {email.discoveryReason.join(", ")}
                    </div>

                    <div className="email-actions">
                      <button
                        className="btn-exclude"
                        onClick={() => handleFeedback(email.id, "exclude")}
                        type="button"
                      >
                        Exclude
                      </button>
                      <button
                        className="btn-regroup"
                        onClick={() =>
                          handleFeedback(email.id, "regroup", "project-123")
                        }
                        type="button"
                      >
                        Move to Project
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Ungrouped emails */}
        {result.emails.filter((e) => !e.groupId).length > 0 && (
          <div className="email-group">
            <div className="group-header">
              <h4>Other Related Emails</h4>
            </div>
            <div className="emails-list">
              {result.emails
                .filter((e) => !e.groupId)
                .map((email) => (
                  <div className="email-card" key={email.id}>
                    <div className="email-subject">
                      {email.subject || "(No Subject)"}
                    </div>
                    <div className="email-meta">
                      {email.fromName || email.fromEmail} •{" "}
                      {new Date(email.receivedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Attachments */}
      <div className="attachments-section">
        <h3>Discovered Attachments</h3>
        <div className="attachments-grid">
          {result.attachments.map((attachment) => (
            <div className="attachment-card" key={attachment.id}>
              <div className="attachment-name">{attachment.name}</div>
              <div className="attachment-meta">
                {attachment.size
                  ? `${(attachment.size / 1024).toFixed(1)}KB`
                  : "Unknown size"}
                • {(attachment.confidence * 100).toFixed(0)}% confidence
              </div>
              <div className="attachment-reasons">
                {attachment.discoveryReason.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * CSS (example - would be in separate file)
 */
const _styles = `
.discovery-ui {
  padding: 20px;
}

.discovery-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.confidence-badge {
  padding: 4px 12px;
  background: #e3f2fd;
  border-radius: 12px;
  font-weight: 600;
}

.signals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.signal-card {
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.group-card {
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 8px;
}

.group-card.selected {
  border-color: #2196f3;
  background: #e3f2fd;
}

.email-card {
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 8px;
}

.email-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn-exclude, .btn-regroup {
  padding: 4px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}
`;
