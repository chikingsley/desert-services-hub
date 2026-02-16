"""
Master Script: Generate SWPPP

This script orchestrates the entire SWPPP generation pipeline:
1. Extracts data from sample PDF documents using the DocumentAnalyzer (Gemini AI).
2. Maps and merges the extracted data into a validated SWPPPData Pydantic model
   using the SWPPPDataMapper.
3. Saves an intermediate JSON file for human review (future UI integration).
4. Generates a final SWPPP document using the DocumentGenerator and a Word template.
"""

import os
import sys
import json
from pathlib import Path
from datetime import date
import shutil # Added for directory removal

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))

from app.services.document_analyzer import DocumentAnalyzer
from app.services.data_mapper import SWPPPDataMapper
from app.services.document_generator import DocumentGenerator
from app.models.swppp import SWPPPData
from app.models.swppp_variables import EstimateExtraction, StormPlanExtraction, NOIExtraction

def main():
    print("\n🚀 Starting SWPPP Generation Pipeline...")
    print("=" * 60)

    # --- Configuration ---
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        print("❌ Error: GEMINI_API_KEY environment variable not set.")
        print("Please set it before running the script (e.g., in your .env file).")
        sys.exit(1)

    template_path = BASE_DIR / "templates/cgp_p3_template.docx"
    output_dir = BASE_DIR / "templates/output"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_doc_path = output_dir / "generated_swppp.docx"
    intermediate_json_path = BASE_DIR / "data/extracted/intermediate_swppp_data.json"

    # --- Step 1: Extract Data from Documents ---
    print("\n--- Step 1: Extracting Data from PDFs ---")
    analyzer = DocumentAnalyzer(gemini_api_key=gemini_api_key)

    estimate_data: Optional[EstimateExtraction] = None
    storm_plan_data: Optional[StormPlanExtraction] = None
    noi_data: Optional[NOIExtraction] = None # Placeholder for NOI

    try:
        print("Analyzing Estimate PDF...")
        estimate_path = BASE_DIR / "data/samples/0098-25 Signed-Approved Est_10012504_from_DESERT_SERVICES for SWPPP.pdf"
        estimate_data = analyzer.analyze_estimate(estimate_path)
        print("✅ Estimate data extracted.")
    except Exception as e:
        print(f"❌ Error extracting estimate data: {e}")
        import traceback
        traceback.print_exc()

    try:
        print("Analyzing Storm Plan PDF...")
        storm_plan_path = BASE_DIR / "data/samples/Storm Management Plans - Starbucks - 3rd Submittal.pdf"
        storm_plan_data = analyzer.analyze_storm_plan(storm_plan_path)
        print("✅ Storm Plan data extracted.")
    except Exception as e:
        print(f"❌ Error extracting storm plan data: {e}")
        import traceback
        traceback.print_exc()
    
    # Mock NOI data for now as we don't have a sample NOI yet
    noi_data = NOIExtraction(
        azpdes_number="AZG2025-MOCKED",
        project_start_date=date(2025, 3, 1),
        project_end_date=date(2026, 3, 1)
    )
    print("✅ Mock NOI data loaded.")

    # --- Step 2: Map and Merge Data ---
    print("\n--- Step 2: Mapping and Merging Data ---")
    mapper = SWPPPDataMapper()
    swppp_data: Optional[SWPPPData] = None
    try:
        swppp_data = mapper.merge_and_map(
            estimate=estimate_data, 
            storm_plan=storm_plan_data,
            noi=noi_data
        )
        print("✅ Data successfully mapped to SWPPPData model.")
    except Exception as e:
        print(f"❌ Error mapping data: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1) # Exit if mapping fails, cannot proceed

    # --- Step 3: Saving Intermediate Data for Review ---
    print("\n--- Step 3: Saving Intermediate Data for Review ---")
    try:
        # Ensure the parent directory exists
        intermediate_json_path.parent.mkdir(parents=True, exist_ok=True)

        # Explicitly remove if it's a directory or an existing file
        if intermediate_json_path.is_dir():
            print(f"Warning: '{intermediate_json_path}' is a directory. Removing it.")
            shutil.rmtree(intermediate_json_path)
        elif intermediate_json_path.is_file():
            print(f"Info: '{intermediate_json_path}' exists as a file. Overwriting.")
            intermediate_json_path.unlink() # Delete the file so open() can create a new one

        with open(intermediate_json_path, "w", encoding="utf-8") as f:
            json.dump(swppp_data.model_dump(mode='json'), f, indent=2, default=str)
        print(f"✅ Intermediate SWPPP data saved to: {intermediate_json_path}")
        print("    (This JSON can be reviewed and edited before final document generation.)")
    except Exception as e:
        print(f"❌ Error saving intermediate JSON: {e}")
        import traceback
        traceback.print_exc()

    # --- Step 4: Generate Document ---
    print("\n--- Step 4: Generating Final SWPPP Document ---")
    generator = DocumentGenerator(template_path)
    try:
        final_doc_path = generator.generate_swppp(swppp_data, output_doc_path)
        print(f"✅ SWPPP document generated successfully: {final_doc_path}")
        print("\n--- Pipeline Complete! ---")
        print(f"Open: {final_doc_path}")
    except Exception as e:
        print(f"❌ Error generating document: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
