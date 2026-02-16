"""Policy definitions for retrieval-first contract review."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from contract_review.models import CandidateHit, Severity

FindingStatus = Literal["needs_judgement", "uncertain_missing_evidence"]


class PolicyRule(BaseModel):
    """One policy objective to retrieve evidence for."""

    model_config = ConfigDict(extra="forbid")

    rule_id: str
    title: str
    description: str
    severity_on_missing: Severity
    queries: list[str] = Field(min_length=1)
    min_hits: int = Field(default=1, ge=1)
    min_term_coverage: float = Field(default=0.3, ge=0.0, le=1.0)
    min_query_support: int = Field(default=1, ge=1)


class PolicyFinding(BaseModel):
    """Policy-level result from retrieval coverage stage."""

    model_config = ConfigDict(extra="forbid")

    rule_id: str
    title: str
    severity: Severity
    status: FindingStatus
    summary: str
    evidence: list[CandidateHit] = Field(default_factory=list)


def default_policy_catalog() -> list[PolicyRule]:
    """Desert Services baseline policy set (fail-closed, high recall)."""
    return [
        PolicyRule(
            rule_id="INSPECTION_QUANTITY",
            title="Inspection Quantity",
            description="Find explicit count/quantity commitment for inspections.",
            severity_on_missing="critical",
            queries=[
                "inspection quantity number of inspections total inspections",
                "sixty inspections fifty inspections twelve inspections",
            ],
            min_term_coverage=0.35,
            min_query_support=1,
        ),
        PolicyRule(
            rule_id="INSPECTION_FREQUENCY",
            title="Inspection Frequency",
            description="Find frequency language (bi-weekly/every 14 days).",
            severity_on_missing="warning",
            queries=[
                "inspection frequency bi-weekly every two weeks every 14 days",
                "weekly monthly once per week inspection cadence",
            ],
            min_term_coverage=0.3,
            min_query_support=1,
        ),
        PolicyRule(
            rule_id="INSPECTION_RAIN_EVENT",
            title="Rain Event Trigger",
            description="Find rain-trigger inspection requirement windows.",
            severity_on_missing="warning",
            queries=[
                "after rainfall within 24 hours rain event trigger",
                "precipitation threshold 0.5 inches storm event inspection",
            ],
            min_term_coverage=0.35,
            min_query_support=1,
        ),
        PolicyRule(
            rule_id="PAYMENT_TERMS",
            title="Payment Terms",
            description="Find payment timing/retainage terms for extraction.",
            severity_on_missing="warning",
            queries=[
                "payment terms net 30 pay when paid retainage",
                "progress payment pay application billing window",
            ],
            min_term_coverage=0.3,
            min_query_support=1,
        ),
        PolicyRule(
            rule_id="SCOPE_CREEP",
            title="Scope Creep Language",
            description="Retrieve clauses that may expand scope beyond estimate.",
            severity_on_missing="critical",
            queries=[
                "maintain repair replace amend adjust replenish remove",
                "subcontractor responsibility for maintenance of bmps",
            ],
            min_term_coverage=0.35,
            min_query_support=1,
        ),
        PolicyRule(
            rule_id="LIABILITY_AND_FINES",
            title="Liability and Fines",
            description="Retrieve indemnity/fines/citation language for review.",
            severity_on_missing="warning",
            queries=[
                "liability fines penalties citation indemnify hold harmless",
                "responsible for violations damages or governmental fines",
            ],
            min_term_coverage=0.35,
            min_query_support=1,
        ),
        PolicyRule(
            rule_id="SOV_SCOPE_ALIGNMENT",
            title="SOV Scope Alignment",
            description="Retrieve scope line-items to compare against estimate SOV.",
            severity_on_missing="critical",
            queries=[
                "schedule of values line item quantity unit price",
                "scope includes signs fence inlet protection spill kit roll off",
            ],
            min_term_coverage=0.35,
            min_query_support=1,
        ),
        PolicyRule(
            rule_id="COMPANY_NAME_INTEGRITY",
            title="Company Name Integrity",
            description="Retrieve legal-entity references for name mismatch checks.",
            severity_on_missing="critical",
            queries=[
                "desert services llc legal name subcontractor name",
                "innovative development group idg deseret desert service",
            ],
            min_term_coverage=0.3,
            min_query_support=1,
        ),
    ]
