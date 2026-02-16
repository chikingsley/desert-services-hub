"""
Test Document Analysis

Demonstrates extracting variables from your Starbucks project documents.

Usage:
    # Set your Anthropic API key first:
    export ANTHROPIC_API_KEY="your-key-here"

    # Then run:
    uv run python scripts/test_document_analysis.py
"""

import json
import sys
import os
from pathlib import Path

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from app.services.document_analyzer import DocumentAnalyzer


def test_estimate_extraction(gemini_api_key: str):
    """Test extraction from Desert Services estimate."""
    print("\n" + "="*60)
    print("TESTING: Estimate Extraction")
    print("="*60)

    estimate_path = BASE_DIR / "data/samples/0098-25 Signed-Approved Est_10012504_from_DESERT_SERVICES for SWPPP.pdf"

    if not estimate_path.exists():
        print(f"❌ File not found: {estimate_path}")
        return None

    analyzer = DocumentAnalyzer(gemini_api_key=gemini_api_key)

    print(f"\n📄 Analyzing: {estimate_path.name}")
    print("⏳ Sending to Gemini API...")

    try:
        result = analyzer.analyze_estimate(estimate_path)

        print("\n✅ Extraction successful!")
        print("\n📊 EXTRACTED DATA:")
        print("-" * 60)

        # Pretty print the results
        data = result.model_dump()

        print(f"\n🏢 CLIENT INFO:")
        print(f"  Company: {data['client_company']}")
        print(f"  Contact: {data['client_contact']}")
        print(f"  Address: {data['client_address']}")
        print(f"  Phone: {data['client_phone']}")

        print(f"\n🏗️  PROJECT INFO:")
        print(f"  Job Name: {data['job_name']}")
        print(f"  Location: {data['job_location']}")

        print(f"\n👤 ESTIMATE INFO:")
        print(f"  Estimator: {data['estimator_name']}")
        print(f"  Number: {data['estimate_number']}")
        print(f"  Date: {data['estimate_date']}")

        print(f"\n📋 BMPs FOUND ({len(data['bmps_found'])}):")
        for i, bmp in enumerate(data['bmps_found'], 1):
            print(f"\n  {i}. {bmp['name']}")
            print(f"     Code: {bmp.get('code', 'N/A')}")
            print(f"     Quantity: {bmp.get('quantity', 'N/A')}")
            print(f"     Description: {bmp['description'][:80]}...")

        print(f"\n🔍 INSPECTIONS:")
        print(f"  Schedule: {data['inspection_schedule']}")

        # Save to file
        output_file = BASE_DIR / "data/extracted/extracted_estimate.json"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w") as f:
            json.dump(data, f, indent=2, default=str)
        print(f"\n💾 Full results saved to: {output_file}")

        return result

    except Exception as e:
        print(f"\n❌ Error during extraction: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_storm_plan_extraction(gemini_api_key: str):
    """Test extraction from Storm Management Plan."""
    print("\n" + "="*60)
    print("TESTING: Storm Plan Extraction")
    print("="*60)

    storm_plan_path = BASE_DIR / "data/samples/Storm Management Plans - Starbucks - 3rd Submittal.pdf"

    if not storm_plan_path.exists():
        print(f"❌ File not found: {storm_plan_path}")
        return None

    analyzer = DocumentAnalyzer(gemini_api_key=gemini_api_key)

    print(f"\n📄 Analyzing: {storm_plan_path.name}")
    print("⏳ Sending to Gemini API...")
    print("⚠️  Note: Large PDF, may take 10-20 seconds...")

    try:
        result = analyzer.analyze_storm_plan(storm_plan_path)

        print("\n✅ Extraction successful!")
        print("\n📊 EXTRACTED DATA:")
        print("-" * 60)

        data = result.model_dump()

        print(f"\n📍 PROJECT LOCATION:")
        print(f"  Name: {data['project_name']}")
        print(f"  Address: {data['project_address']}")
        print(f"  City: {data['city']}, {data['state']} {data['zip_code']}")
        print(f"  County: {data['county']}")

        print(f"\n🌐 COORDINATES:")
        print(f"  Latitude: {data['latitude']}")
        print(f"  Longitude: {data['longitude']}")

        print(f"\n📏 SITE METRICS:")
        print(f"  Site Area: {data['site_area_acres']} acres")
        print(f"  Disturbed Area: {data['total_disturbed_area_acres']} acres")
        print(f"  Max Disturbed: {data['max_disturbed_area_one_time_acres']} acres")
        print(f"  Impervious: {data['percent_impervious_before']}% -> {data['percent_impervious_after']}%")
        print(f"  Building Area: {data['building_area_sf']} SF")
        print(f"  Parking Spaces: {data['parking_spaces']}")

        print(f"\n🏗️  SITE DETAILS:")
        print(f"  Intended Use: {data['intended_use_after']}")
        print(f"  Soil Type: {data['soil_type_description']}")

        print(f"\n💧 WATER INFO:")
        print(f"  Receiving Water: {data['receiving_water']}")
        print(f"  Flood Zone: {data['flood_zone']}")

        print(f"\n👥 CONSULTANTS:")
        print(f"  Civil Engineer: {data['civil_engineer_company']}")
        print(f"  Contact: {data['civil_engineer_contact']}")
        print(f"  Developer: {data['developer']}")
        print(f"  Owner: {data['owner']}")

        # Save to file
        output_file = BASE_DIR / "data/extracted/extracted_storm_plan.json"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w") as f:
            json.dump(data, f, indent=2, default=str)
        print(f"\n💾 Full results saved to: {output_file}")

        return result

    except Exception as e:
        print(f"\n❌ Error during extraction: {e}")
        import traceback
        traceback.print_exc()
        return None

extraction_summary = {"estimate": "N/A", "storm_plan": "N/A"}

def main():
    """Run all extraction tests."""
    print("\n🚀 SWPPP Document Analysis Test")
    print("=" * 60)
    print("\nThis will analyze your Starbucks Maricopa project documents")
    print("and extract variables needed for SWPPP generation.")
    print("=" * 60)

    try:
        # Ensure GEMINI_API_KEY is set in your environment
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not gemini_api_key:
            print("Please set the GEMINI_API_KEY environment variable.")
            sys.exit(1)

        # Test Estimate Extraction
        try:
            estimate_data = test_estimate_extraction(gemini_api_key)
            if estimate_data:
                extraction_summary["estimate"] = "SUCCESS"
        except Exception as e:
            print(f"❌ Error during estimate extraction: {e}")
            import traceback
            traceback.print_exc()
            extraction_summary["estimate"] = "FAILED"

        # Test Storm Plan Extraction
        try:
            storm_plan_data = test_storm_plan_extraction(gemini_api_key)
            if storm_plan_data:
                extraction_summary["storm_plan"] = "SUCCESS"
        except Exception as e:
            print(f"❌ Error during storm plan extraction: {e}")
            import traceback
            traceback.print_exc()
            extraction_summary["storm_plan"] = "FAILED"

        # Summary
        print("\n" + "="*60)
        print("SUMMARY")
        print("="*60)

        print(f"✅ Estimate extraction: {extraction_summary['estimate']}")
        print(f"✅ Storm Plan extraction: {extraction_summary['storm_plan']}")

        if extraction_summary["estimate"] == "SUCCESS" and extraction_summary["storm_plan"] == "SUCCESS":
            print("\n🎉 All extractions successful!")
            print("\nNext steps:")
            print("  1. Review extracted data in JSON files in data/extracted/")
            print("  2. Merge data into complete SWPPP variables")
            print("  3. Generate filled SWPPP template")
    except Exception as main_e:
        print(f"An unexpected error occurred in main: {main_e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()