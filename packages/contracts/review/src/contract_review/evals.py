"""Evaluation helpers for policy-level retrieval coverage."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from contract_review.policies import PolicyRule

LabelValue = Literal["present", "missing", "unknown"]


class FixtureLabels(BaseModel):
    """Expected policy outcomes for one fixture."""

    model_config = ConfigDict(extra="forbid")

    fixture: str
    rules: dict[str, LabelValue] = Field(default_factory=dict)


class LabelsFile(BaseModel):
    """Expected outcomes file for eval runs."""

    model_config = ConfigDict(extra="forbid")

    version: str = "v1"
    fixtures: list[FixtureLabels] = Field(default_factory=list)


@dataclass(slots=True)
class FixtureEvalResult:
    fixture: str
    expected_present: int
    found_present: int
    expected_missing: int
    correctly_missing: int
    unknown: int
    misses: list[str]
    false_positives: list[str]

    @property
    def present_recall(self) -> float:
        if self.expected_present == 0:
            return 1.0
        return self.found_present / self.expected_present

    @property
    def missing_recall(self) -> float:
        if self.expected_missing == 0:
            return 1.0
        return self.correctly_missing / self.expected_missing


def build_labels_template(
    fixture_names: list[str],
    policies: list[PolicyRule],
) -> LabelsFile:
    """Build a starter labels file with all policy values set to unknown."""
    fixtures: list[FixtureLabels] = []
    for fixture in sorted(set(fixture_names)):
        fixtures.append(
            FixtureLabels(
                fixture=fixture,
                rules={policy.rule_id: "unknown" for policy in policies},
            )
        )
    return LabelsFile(version="v1", fixtures=fixtures)
