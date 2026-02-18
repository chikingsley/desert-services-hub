"""
Test Data Mapper

Verifies that the SWPPPDataMapper correctly transforms extracted JSON data
into a valid SWPPPData Pydantic object.
"""

import json
import sys
from pathlib import Path
from datetime import date

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from app.services.data_mapper import SWPPPDataMapper
from app.models.swppp_variables import EstimateExtraction, StormPlanExtraction

def test_mapper_with_real_json():
    print("\n=== Testing Data Mapper with Extracted JSON ===\n")
    
    # Load extracted data
    est_path = BASE_DIR / "data/extracted/extracted_estimate.json"
    storm_path = BASE_DIR / "data/extracted/extracted_storm_plan.json"
    
    estimate_data = None
    storm_data = None
    
    if est_path.exists():
        with open(est_path, 'r') as f:
            raw_est = json.load(f)
            # Convert string dates to date objects if necessary for the Pydantic model
            # But the Pydantic model `EstimateExtraction` handles parsing string dates usually
            estimate_data = EstimateExtraction(**raw_est)
            print("✓ Loaded Estimate JSON")
            
    if storm_path.exists():
        with open(storm_path, 'r') as f:
            raw_storm = json.load(f)
            storm_data = StormPlanExtraction(**raw_storm)
            print("✓ Loaded Storm Plan JSON")
            
    if not estimate_data and not storm_data:
        print("❌ No data found to map. Run run_extraction_demo.py first.")
        return

    # Initialize Mapper
    mapper = SWPPPDataMapper()
    
    try:
        # Perform Mapping
        print("⏳ Mapping data to SWPPPData model...")
        swppp_result = mapper.merge_and_map(estimate=estimate_data, storm_plan=storm_data)
        
        print("\n✅ Mapping Successful!")
        print("-" * 40)
        print(f"Project: {swppp_result.project.project_name}")
        print(f"Address: {swppp_result.project.project_address}, {swppp_result.project.city}")
        print(f"Coords:  {swppp_result.project.latitude}, {swppp_result.project.longitude}")
        print(f"Permit:  {swppp_result.permit.permit_number} ({swppp_result.permit.project_start_date} to {swppp_result.permit.project_end_date})")
        print(f"Site:    {swppp_result.site_details.total_disturbed_area_acres} acres disturbed")
        print(f"Use:     {swppp_result.site_details.intended_use_after}")
        print(f"Imperv:  {swppp_result.site_details.percent_impervious_before}% -> {swppp_result.site_details.percent_impervious_after}%")
        print("-" * 40)
        
        # Validation check
        print(f"Owner: {swppp_result.owner.name}")
        print(f"Contractor: {swppp_result.contractor.company}")
        
    except Exception as e:
        print(f"\n❌ Mapping Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_mapper_with_real_json()
