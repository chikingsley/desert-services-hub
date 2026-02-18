"""
Example showing how to use the AutoNarrative API.

This demonstrates how data validation works and how to call the endpoints.
"""

import httpx
from datetime import date


# Example SWPPP data
# This will be VALIDATED by Pydantic before the document is generated
sample_data = {
    "project": {
        "project_name": "Main Street Shopping Center",
        "project_address": "123 Main St",
        "city": "Sacramento",
        "state": "CA",
        "zip_code": "95814",
        "county": "Sacramento",
        "apn": "123-456-789",
        "latitude": 38.5816,
        "longitude": -121.4944
    },
    "permit": {
        "permit_number": "CAS000002",
        "wdid": "5 123456789",
        "permit_issue_date": "2025-01-05",
        "project_start_date": "2025-01-15",
        "project_end_date": "2025-12-31",
        "disturbed_area_acres": 5.2
    },
    "owner": {
        "name": "John Smith",
        "title": "Project Manager",
        "company": "ABC Development Corp",
        "phone": "9165551234",
        "email": "jsmith@abcdev.com",
        "cell_phone": "9165551111"
    },
    "contractor": {
        "name": "Jane Doe",
        "title": "Site Superintendent",
        "company": "XYZ Construction Inc",
        "phone": "9165555678",
        "email": "jdoe@xyzconstruction.com"
    },
    "qsp": {
        "name": "Bob Johnson",
        "title": "Qualified SWPPP Practitioner",
        "company": "Environmental Services Inc",
        "phone": "9165559999",
        "email": "bjohnson@envservices.com",
        "emergency_phone": "9165558888"
    },
    "swppp_prepared_date": "2025-01-10",
    "swppp_revision": 1,
    "site_description": "Construction of a new 50,000 sq ft shopping center with associated parking lot and landscaping. Work includes grading, utilities installation, building construction, and paving.",
    "receiving_waters": "Morrison Creek, tributary to Sacramento River"
}


def validate_data_example():
    """
    Example: Validate data without generating a document.

    This is useful to check if all required fields are present
    and correctly formatted before attempting document generation.
    """
    print("\n=== VALIDATION EXAMPLE ===")
    print("Checking if data is valid...")

    response = httpx.post(
        "http://localhost:8000/api/v1/swppp/validate",
        json=sample_data,
        timeout=10.0
    )

    if response.status_code == 200:
        print("✓ Data is valid!")
        print(f"  Response: {response.json()}")
    else:
        print("✗ Validation failed!")
        print(f"  Error: {response.json()}")


def generate_document_example():
    """
    Example: Generate a SWPPP document.

    The data is automatically validated by Pydantic.
    If any required fields are missing or invalid, you'll get
    a detailed error message explaining what needs to be fixed.
    """
    print("\n=== DOCUMENT GENERATION EXAMPLE ===")
    print("Generating SWPPP document...")

    response = httpx.post(
        "http://localhost:8000/api/v1/swppp/generate",
        json=sample_data,
        timeout=30.0
    )

    if response.status_code == 200:
        result = response.json()
        print("✓ Document generated successfully!")
        print(f"  File: {result['filename']}")
        print(f"  Path: {result['document_path']}")
    else:
        print("✗ Generation failed!")
        print(f"  Status: {response.status_code}")
        print(f"  Error: {response.json()}")


def validation_error_example():
    """
    Example: What happens when required data is missing.

    This shows how Pydantic validation catches errors BEFORE
    attempting to generate the document.
    """
    print("\n=== VALIDATION ERROR EXAMPLE ===")
    print("Trying to generate with missing required fields...")

    # Missing required fields: contractor, qsp, and some project info
    incomplete_data = {
        "project": {
            "project_name": "Test Project",
            # Missing required fields!
        },
        "permit": {
            "permit_number": "TEST123",
            "project_start_date": "2025-01-15",
            "project_end_date": "2025-12-31",
            "disturbed_area_acres": 1.0
        },
        "owner": {
            "name": "Test Owner",
            "title": "Owner",
            "company": "Test Co",
            "phone": "1234567890",
            "email": "test@example.com"
        },
        # Missing contractor and qsp!
        "swppp_prepared_date": "2025-01-10",
        "site_description": "Test site",
        "receiving_waters": "Test Creek"
    }

    response = httpx.post(
        "http://localhost:8000/api/v1/swppp/validate",
        json=incomplete_data,
        timeout=10.0
    )

    print(f"Status: {response.status_code}")
    if response.status_code == 422:  # Validation error
        print("✓ Validation correctly caught missing fields:")
        errors = response.json()
        print(f"  {errors}")


if __name__ == "__main__":
    print("AutoNarrative API Usage Examples")
    print("=" * 50)
    print("\nMake sure the API is running first:")
    print("  uv run uvicorn app.main:app --reload")
    print("\nOr:")
    print("  uv run python main.py")

    try:
        # Example 1: Validate data
        validate_data_example()

        # Example 2: Generate document
        generate_document_example()

        # Example 3: See what happens with invalid data
        validation_error_example()

    except httpx.ConnectError:
        print("\n✗ Error: Cannot connect to API")
        print("  Make sure the server is running on http://localhost:8000")
    except Exception as e:
        print(f"\n✗ Error: {e}")
