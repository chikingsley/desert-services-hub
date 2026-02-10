"""Tests for contract keyword scanner."""

from __future__ import annotations

from contract_review.scanner import Flag, ScanResult, scan


def _active(result: ScanResult, rule_id: str) -> list[Flag]:
    return [f for f in result.flags if f.rule_id == rule_id and not f.false_positive]


# ---------------------------------------------------------------------------
# Framework
# ---------------------------------------------------------------------------


class TestFramework:
    def test_empty_text(self) -> None:
        result = scan("")
        assert len(result.flags) == 0

    def test_clean_text(self) -> None:
        result = scan("This is a normal purchase order for SWPPP work.")
        assert len(result.flags) == 0


# ---------------------------------------------------------------------------
# Scope creep words
# ---------------------------------------------------------------------------


class TestScopeCreep:
    def test_maintain(self) -> None:
        result = scan("Subcontractor shall maintain all BMPs on site.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1
        assert "maintain" in flags[0].keyword.lower()

    def test_maintenance(self) -> None:
        result = scan("Ongoing maintenance of erosion control devices.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1
        assert "maintenance" in flags[0].keyword.lower()

    def test_repair(self) -> None:
        result = scan("Subcontractor shall repair damaged silt fence.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_remove(self) -> None:
        result = scan("Remove all BMPs upon project completion.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_removal(self) -> None:
        result = scan("Removal of temporary erosion controls.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_amend(self) -> None:
        result = scan("Subcontractor shall amend the SWPPP as needed.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_adjust(self) -> None:
        result = scan("Adjust filter sock placement per inspector.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_replace(self) -> None:
        result = scan("Replace damaged inlet protection within 24 hours.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_replacement(self) -> None:
        result = scan("Replacement of BMPs is Subcontractor's responsibility.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_upgrade(self) -> None:
        result = scan("Upgrade erosion controls if directed by inspector.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_upgrading(self) -> None:
        result = scan("Upgrading the existing BMPs shall be included.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_regrade(self) -> None:
        result = scan("Regrade disturbed areas after construction.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_replenish(self) -> None:
        result = scan("Replenish rock entrance material weekly.")
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1

    def test_multiple_words(self) -> None:
        text = "Maintain, repair, and replace all BMPs. Remove upon completion."
        result = scan(text)
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 4  # maintain, repair, replace, remove

    def test_context_included(self) -> None:
        text = "X" * 50 + " Subcontractor shall maintain all filter sock. " + "Y" * 50
        result = scan(text)
        flags = _active(result, "SCOPE_CREEP")
        assert len(flags) == 1
        assert "filter sock" in flags[0].context


# ---------------------------------------------------------------------------
# Former company name
# ---------------------------------------------------------------------------


class TestFormerCompany:
    def test_idg_standalone(self) -> None:
        result = scan("This contract is between IDG and the Owner.")
        flags = _active(result, "FORMER_COMPANY")
        assert len(flags) == 1

    def test_innovative_development_group(self) -> None:
        result = scan("Innovative Development Group LLC shall perform the work.")
        flags = _active(result, "FORMER_COMPANY")
        assert len(flags) == 1

    def test_idg_not_in_other_words(self) -> None:
        """IDG should only match as standalone, not inside other words."""
        result = scan("The bridge was inspected.")
        flags = _active(result, "FORMER_COMPANY")
        assert len(flags) == 0

    def test_desert_services_no_flag(self) -> None:
        result = scan("Desert Services LLC shall perform the work.")
        flags = _active(result, "FORMER_COMPANY")
        assert len(flags) == 0


# ---------------------------------------------------------------------------
# Company name misspelling
# ---------------------------------------------------------------------------


class TestCompanyMisspelling:
    def test_deseret(self) -> None:
        """Known real-world misspelling from Elanto contract."""
        result = scan("Deseret Services LLC shall perform the work.")
        flags = _active(result, "COMPANY_MISSPELLING")
        assert len(flags) == 1
        assert "Deseret" in flags[0].keyword

    def test_deseret_standalone(self) -> None:
        """Deseret alone (without Services) should still flag."""
        result = scan("This contract is between Deseret and the Owner.")
        flags = _active(result, "COMPANY_MISSPELLING")
        assert len(flags) == 1

    def test_dessert_services(self) -> None:
        result = scan("Dessert Services LLC shall perform the work.")
        flags = _active(result, "COMPANY_MISSPELLING")
        assert len(flags) == 1

    def test_desert_service_singular(self) -> None:
        """Missing 's' — Desert Service instead of Desert Services."""
        result = scan("Desert Service LLC shall perform the work.")
        flags = _active(result, "COMPANY_MISSPELLING")
        assert len(flags) == 1

    def test_correct_name_no_flag(self) -> None:
        """Correct spelling should NOT flag."""
        result = scan("Desert Services LLC shall perform the work.")
        flags = _active(result, "COMPANY_MISSPELLING")
        assert len(flags) == 0

    def test_correct_name_no_flag_throughout(self) -> None:
        """Multiple correct uses should not flag."""
        text = "Desert Services. Desert Services LLC. Desert Services, Inc."
        result = scan(text)
        flags = _active(result, "COMPANY_MISSPELLING")
        assert len(flags) == 0

    def test_case_insensitive(self) -> None:
        result = scan("DESERET SERVICES shall perform the work.")
        flags = _active(result, "COMPANY_MISSPELLING")
        assert len(flags) == 1
