from __future__ import annotations

from contract_review.policies import PolicyRule
from contract_review.workflow import ContractReviewWorkflow


def test_workflow_returns_candidates_for_matching_policy() -> None:
    text = """--- Page 1 ---
# Scope
Provide 60 inspections every two weeks.

Inspect within 24 hours after rain events above 0.5 inches.

Payment terms: net 30 from approved invoice.
"""
    workflow = ContractReviewWorkflow()
    policies = [
        PolicyRule(
            rule_id="INSPECTION_QUANTITY",
            title="Inspection Quantity",
            description="Find explicit inspection quantity",
            severity_on_missing="critical",
            queries=["60 inspections every two weeks"],
            min_hits=1,
        ),
        PolicyRule(
            rule_id="PAYMENT_TERMS",
            title="Payment Terms",
            description="Find payment terms",
            severity_on_missing="warning",
            queries=["payment terms net 30"],
            min_hits=1,
        ),
    ]

    result = workflow.run(
        source_text=text,
        source_name="fixture.md",
        policies=policies,
        max_chunk_chars=600,
        overlap_paragraphs=1,
        top_k_per_query=4,
    )

    assert result.document_map.page_count == 1
    assert len(result.findings) == 2
    assert all(finding.status == "needs_judgement" for finding in result.findings)
    assert all(finding.evidence for finding in result.findings)


def test_workflow_fail_closed_when_no_evidence() -> None:
    text = """--- Page 1 ---
# Administrative
Project contact list and transmittal instructions only.
"""
    workflow = ContractReviewWorkflow()
    policies = [
        PolicyRule(
            rule_id="INSPECTION_QUANTITY",
            title="Inspection Quantity",
            description="Find explicit inspection quantity",
            severity_on_missing="critical",
            queries=["inspection quantity number of inspections"],
            min_hits=1,
        ),
    ]

    result = workflow.run(source_text=text, policies=policies, top_k_per_query=3)

    assert len(result.findings) == 1
    assert result.findings[0].status == "uncertain_missing_evidence"
    assert result.findings[0].severity == "critical"
    assert result.findings[0].evidence == []
