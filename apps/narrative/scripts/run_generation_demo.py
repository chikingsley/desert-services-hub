"""
Test using the REAL project structure.

This demonstrates the difference between the quick test and the full system:
- Uses Pydantic models for validation
- Uses DocumentGenerator service
- Tests the complete flow (but without the API layer)
"""

import sys
from pathlib import Path
from datetime import date

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from app.models.swppp import SWPPPData, ProjectInfo, PermitInfo, ContactInfo, SiteDetails
from app.services.document_generator import DocumentGenerator


def test_with_real_project_files():
    """Test using the actual Pydantic models and DocumentGenerator service."""

    print("\n=== Testing with REAL project structure ===\n")

    # Step 1: Create data using Pydantic models
    # This will VALIDATE the data automatically
    print("1. Creating and validating SWPPP data with Pydantic...")

    try:
        swppp_data = SWPPPData(
            project=ProjectInfo(
                project_name="Starbucks Maricopa",
                project_address="42590 W Maricopa Casa Grande Hwy",
                city="Maricopa",
                state="AZ",
                zip_code="85138",
                county="Pinal",
                latitude=33.04,
                longitude=-112.0
            ),
            permit=PermitInfo(
                permit_number="AZG2025-001",
                project_start_date=date(2025, 2, 15),
                project_end_date=date(2025, 8, 30),
                disturbed_area_acres=1.31
            ),
            site_details=SiteDetails(
                intended_use_after="Retail / Restaurants",
                total_property_area_acres=1.31,
                total_disturbed_area_acres=1.42,
                max_disturbed_area_one_time_acres=1.42,
                percent_impervious_before=0.0,
                percent_impervious_after=85.0,
                soil_type_description="Valencia sandy loam (Type A soil) - moderate erosion potential",
                is_tribal_land=True  # Test checkbox
            ),
            owner=ContactInfo(
                name="Eddie Bersi",
                company="41 North Contractors, LLC",
                address="4906 Main Street Suite 102",
                city="Lisle",
                state="IL",
                zip_code="60532",
                phone="805-651-0015",
                email="eddie@41north.com"
            ),
            contractor=ContactInfo(
                name="Eddie Bersi",
                company="41 North Contractors, LLC",
                address="4906 Main Street Suite 102",
                city="Lisle",
                state="IL",
                zip_code="60532",
                phone="805-651-0015",
                email="eddie@41north.com"
            ),
            qsp=ContactInfo(
                name="Jayson Roti",
                company="Desert Services",
                address="P.O. Box 14695",
                city="Scottsdale",
                state="AZ",
                zip_code="85254",
                phone="480-513-8986",
                email="info@desertservices.net"
            ),
            # New fields for template testing
            operator=ContactInfo(
                name="Eddie Bersi",
                company="41 North Contractors, LLC",
                address="4906 Main Street Suite 102",
                city="Lisle",
                state="IL",
                zip_code="60532",
                phone="805-651-0015",
                email="eddie@41north.com",
                area_of_control="Full Site Control"
            ),
            emergency_contact=ContactInfo(
                name="Site Superintendent",
                company="41 North Contractors",
                phone="805-651-0015",
                email="emergency@41north.com"
            ),
            site_supervisor=ContactInfo(
                name="Field Manager",
                company="41 North Contractors",
                address="On Site",
                city="Maricopa",
                state="AZ",
                zip_code="85138",
                phone="555-123-4567",
                email="field@41north.com"
            ),
            subcontractor=ContactInfo(
                name="Grading Foreman",
                company="Earth Movers Inc",
                address="123 Dirt Rd",
                city="Phoenix",
                state="AZ",
                zip_code="85001",
                phone="602-555-9999",
                email="grading@earthmovers.com"
            ),
            
            swppp_prepared_date=date(2025, 1, 10),
            swppp_revision=1,
            site_description="Construction of a new Starbucks drive-thru with associated parking and landscaping.",
            receiving_waters="Morrison Creek"
        )
        print("   ✓ Data validation passed!")

    except Exception as e:
        print(f"   ✗ Validation failed: {e}")
        # Print detailed validation errors if any
        import traceback
        traceback.print_exc()
        return

    # Step 2: Use the DocumentGenerator service
    print("\n2. Using DocumentGenerator service to fill template...")

    template_path = BASE_DIR / "templates/cgp_p3_template.docx"
    output_path = BASE_DIR / "templates/output/real_system_test.docx"

    try:
        generator = DocumentGenerator(template_path)
        result_path = generator.generate_swppp(swppp_data, output_path)
        print(f"   ✓ Document generated: {result_path}")

    except FileNotFoundError as e:
        print(f"   ✗ Template not found: {e}")
        return
    except Exception as e:
        print(f"   ✗ Generation failed: {e}")
        import traceback
        traceback.print_exc()
        return

    print("\n=== SUCCESS ===")
    print(f"The document was created using:")
    print(f"  - Pydantic models (app/models/swppp.py)")
    print(f"  - DocumentGenerator service (app/services/document_generator.py)")
    print(f"  - Your template: {template_path}")
    print(f"\nOpen: {result_path.absolute()}")


def test_with_missing_data():
    """Show what happens when required data is missing."""

    print("\n\n=== Testing validation with MISSING data ===\n")

    try:
        swppp_data = SWPPPData(
            project=ProjectInfo(
                project_name="Test Project",
                project_address="123 Test St",
                city="Sacramento",
                state="CA",
                zip_code="95814",
                county="Sacramento"
            ),
            permit=PermitInfo(
                permit_number="TEST12345",
                project_start_date=date(2025, 1, 15),
                project_end_date=date(2025, 12, 31),
                disturbed_area_acres=2.5
            ),
            site_details=SiteDetails(
                intended_use_after="Test",
                total_property_area_acres=1.0,
                total_disturbed_area_acres=1.0,
                percent_impervious_before=0,
                percent_impervious_after=100,
                soil_type_description="Test Soil"
            ),
            owner=ContactInfo(
                name="John Smith",
                company="Test Company",
                phone="9165551234",
                email="test@example.com"
            ),
            # Missing contractor!
            # Missing qsp!
        )
        print("   ✗ This shouldn\'t print - validation should have failed!")

    except Exception as e:
        print("   ✓ Pydantic correctly caught missing required fields!")
        print(f"   Error: {type(e).__name__}")


if __name__ == "__main__":
    test_with_real_project_files()
    test_with_missing_data()
