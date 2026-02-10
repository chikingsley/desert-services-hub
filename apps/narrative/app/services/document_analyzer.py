"""
Document Analyzer Service

Extracts SWPPP variables from PDF documents using LLM vision models.
Supports multiple document types: Estimate, Storm Plan, NOI, etc.
"""

import json
from pathlib import Path
from typing import Optional, Dict, Any, List

import google.generativeai as genai
import google.generativeai.types as types
from app.models.swppp_variables import (
    EstimateExtraction,
    StormPlanExtraction,
    NOIExtraction
)



class DocumentAnalyzer:
    """
    Analyzes construction documents to extract SWPPP variables.

    Uses LLM vision models (Claude, Gemini, etc.) to intelligently
    extract data from PDFs regardless of format.
    """

    def __init__(self, gemini_api_key: Optional[str] = None, model_name: str = "models/gemini-2.5-flash"):
        """
        Initialize document analyzer with Gemini API.

        Args:
            gemini_api_key: Gemini API key.
            model_name: Gemini model to use.
        """
        if not gemini_api_key:
            raise ValueError("Gemini API Key is required.")
        
        genai.configure(api_key=gemini_api_key)
        self.model = genai.GenerativeModel(model_name)
        self.model_name = model_name


    def _analyze_document(
        self,
        pdf_path: Path,
        extraction_prompt: str,
        response_schema: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send PDF to Gemini for analysis with structured extraction.

        Args:
            pdf_path: Path to PDF file
            extraction_prompt: Prompt describing what to extract
            response_schema: Optional JSON schema for response

        Returns:
            Extracted data as dictionary
        """
        # Upload PDF file to Gemini
        print(f"Uploading PDF to Gemini: {pdf_path.name}")
        file = genai.upload_file(path=pdf_path, display_name=pdf_path.name, mime_type='application/pdf')
        print(f"File uploaded: {file.uri}")

        # Build the content for the model
        contents: List[Any] = [file, extraction_prompt]
        if response_schema:
            contents.append(f"\n\nReturn data in this JSON format:\n{response_schema}\n\nReturn ONLY valid JSON, no other text.")

        # Call Gemini API
        response = self.model.generate_content(
            contents,
            generation_config=types.GenerationConfig(temperature=0.0) # Set temperature to 0 for consistent JSON output
        )

        # Delete the uploaded file after use
        genai.delete_file(file.name)

        # Extract JSON from response
        response_text = response.text

        # Try to parse JSON
        try:
            # Sometimes LLMs wrap JSON in markdown code blocks
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            return json.loads(response_text)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse JSON response: {e}\nResponse: {response_text}")

    def analyze_estimate(self, pdf_path: Path) -> EstimateExtraction:
        """
        Extract data from Desert Services estimate.

        Args:
            pdf_path: Path to estimate PDF

        Returns:
            EstimateExtraction with parsed data
        """
        prompt = """
Analyze this Desert Services estimate and extract the following information:

1. CLIENT INFORMATION (in the "To:" section):
   - Company name
   - Contact person (if shown)
   - Address
   - Phone number

2. PROJECT INFORMATION:
   - Job Name
   - Job Location/Address (if different from "To:" section)

3. ESTIMATOR:
   - Estimator name
   - Estimate number
   - Estimate date

4. BMPs (Best Management Practices):
   For each line item that describes a BMP (erosion control, SWPPP items, etc.), extract:
   - Item description
   - Quantity and unit (e.g., "2,355 LF", "1 Each")
   - Any BMP codes mentioned (like EC-7, ASPC-5, etc.)

5. INSPECTION SCHEDULE:
   - If inspections are mentioned, note the frequency (e.g., "every 14 days")

Look for items like:
- SWPPP Narrative
- Compost Filter Sock
- Rock Entrance
- Inlet Protection
- Spill Kit
- SWPPP Sign
- Inspections
- Dust Control
- Concrete Washout

Return as JSON with these fields:
{
  "client_company": "Company name",
  "client_contact": "Contact person or null",
  "client_address": "Full address",
  "client_phone": "Phone number",
  "job_name": "Project/Job name",
  "job_location": "Location if specified",
  "estimator_name": "Name",
  "estimate_number": "Number",
  "estimate_date": "YYYY-MM-DD or null",
  "inspection_schedule": "Description or null",
  "bmps_found": [
    {
      "code": "BMP code if mentioned, else null",
      "name": "Short name",
      "description": "Full description from line item",
      "quantity": "Quantity and unit",
      "is_temporary": true
    }
  ]
}
"""

        data = self._analyze_document(pdf_path, prompt)
        return EstimateExtraction(**data)

    def analyze_storm_plan(self, pdf_path: Path) -> StormPlanExtraction:
        """
        Extract data from Storm Management Plan (engineering drawings).

        Args:
            pdf_path: Path to storm plan PDF

        Returns:
            StormPlanExtraction with parsed data
        """
        prompt = """
Analyze this Storm Management Plan / Stormwater Plan and extract the following:

1. PROJECT INFORMATION (usually on cover sheet):
   - Project name
   - Project address (full street address)
   - City
   - State
   - ZIP code
   - County

2. LOCATION COORDINATES:
   - Latitude (decimal degrees, to 6 decimal places)
   - Longitude (decimal degrees, to 6 decimal places)

3. SITE METRICS (in LOT DATA or similar section):
   - Site area in acres
   - Building area in square feet
   - Number of parking spaces (if shown)
   - Total area to be disturbed (acres)
   - Max area disturbed at one time (acres)
   - Percent imperviousness BEFORE construction
   - Percent imperviousness AFTER construction

4. SITE DETAILS:
   - Intended use of site after construction (e.g. "Retail", "Restaurant")
   - Soil type description (look for "Geotechnical" notes or "Soil" notes)

5. WATER INFORMATION:
   - Receiving water name (where stormwater goes)
   - Flood zone designation (if shown)

6. CONSULTANTS/ENGINEERS:
   - Civil Engineer company name
   - Civil Engineer contact person
   - Developer name
   - Owner name

Return as JSON:
{
  "project_name": "Name",
  "project_address": "Street address",
  "city": "City",
  "state": "State",
  "zip_code": "ZIP",
  "county": "County",
  "latitude": 33.123456,
  "longitude": -111.123456,
  "site_area_acres": 1.31,
  "total_disturbed_area_acres": 1.42,
  "max_disturbed_area_one_time_acres": 1.42,
  "building_area_sf": 2432,
  "parking_spaces": 36,
  "percent_impervious_before": 0.0,
  "percent_impervious_after": 85.0,
  "intended_use_after": "Restaurant",
  "soil_type_description": "Sandy loam",
  "receiving_water": "Water body name",
  "flood_zone": "Zone designation",
  "civil_engineer_company": "Company name",
  "civil_engineer_contact": "Contact person",
  "developer": "Developer name",
  "owner": "Owner name"
}

Use null for any fields not found.
"""

        data = self._analyze_document(pdf_path, prompt)
        return StormPlanExtraction(**data)

    def analyze_noi(self, pdf_path: Path) -> NOIExtraction:
        """
        Extract data from NOI (Notice of Intent) document.

        Args:
            pdf_path: Path to NOI PDF

        Returns:
            NOIExtraction with parsed data
        """
        prompt = """
Analyze this NOI (Notice of Intent) document and extract:

1. AZPDES PERMIT NUMBER (unique tracking number)
2. PROJECT DATES:
   - Project start date
   - Project completion/end date
3. ENDANGERED SPECIES INFORMATION (if present)
4. HISTORIC PRESERVATION INFORMATION (if present)

Return as JSON:
{
  "azpdes_number": "Permit number or null",
  "project_start_date": "YYYY-MM-DD or null",
  "project_end_date": "YYYY-MM-DD or null",
  "endangered_species_info": {
    "species_present": true/false,
    "species_list": ["species 1", "species 2"],
    "determination_method": "Method description"
  },
  "historic_preservation_info": {
    "sites_present": true/false,
    "description": "Description or null"
  }
}
"""

        data = self._analyze_document(pdf_path, prompt)
        return NOIExtraction(**data)


# Convenience function for quick testing
def analyze_pdf(pdf_path: str, doc_type: str = "estimate") -> Dict[str, Any]:
    """
    Quick helper to analyze a PDF.

    Args:
        pdf_path: Path to PDF
        doc_type: Type of document ("estimate", "storm_plan", "noi")

    Returns:
        Extracted data dictionary
    """
    analyzer = DocumentAnalyzer()
    path = Path(pdf_path)

    if doc_type == "estimate":
        result = analyzer.analyze_estimate(path)
    elif doc_type == "storm_plan":
        result = analyzer.analyze_storm_plan(path)
    elif doc_type == "noi":
        result = analyzer.analyze_noi(path)
    else:
        raise ValueError(f"Unknown document type: {doc_type}")

    return result.model_dump()
