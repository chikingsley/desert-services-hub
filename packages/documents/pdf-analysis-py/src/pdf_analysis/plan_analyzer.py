"""
Plan Analysis Utility with Gemini 3 Flash Agentic Vision
For analyzing Civil, Grading, Drainage, and SWPPP plans
"""

import json
import os
import tempfile
from dataclasses import asdict, dataclass
from typing import Any, cast

# Gemini 3 Flash imports
from google import genai
from google.genai import types


@dataclass
class AnalysisResult:
    """Structured result from plan analysis"""

    plan_type: str
    analysis_type: str
    findings: list[dict[str, Any]]
    measurements: dict[str, float]
    compliance_items: list[dict[str, Any]]
    detailed_inspections: list[dict[str, Any]]
    recommendations: list[str]
    confidence_score: float
    raw_analysis: str


class PlanAnalyzer:
    """
    Plan Analysis Utility using Gemini 3 Flash Agentic Vision

    Capabilities:
    - Detailed inspection with zoom/crop
    - Element counting and measurement
    - Compliance checking
    - Structured reporting
    """

    def __init__(self, api_key: str | None = None):
        """Initialize with Gemini API key"""
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY required")

        self.client = genai.Client(api_key=self.api_key)
        self.model = "gemini-3-flash-preview"

    def analyze_plan(
        self,
        image_path: str,
        plan_type: str = "civil",
        analysis_focus: list[str] | None = None,
        specific_areas: list[str] | None = None,
    ) -> AnalysisResult:
        """
        Analyze a plan using agentic vision

        Args:
            image_path: Path to plan image or PDF
            plan_type: Type of plan (civil, grading, drainage, swppp)
            analysis_focus: Specific aspects to analyze
            specific_areas: Areas to zoom into for detailed inspection
        """
        # Convert PDF to image if needed
        if image_path.lower().endswith(".pdf"):
            image_path = self._pdf_to_image(image_path)

        # Load image
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        # Build analysis prompt
        prompt = self._build_analysis_prompt(
            plan_type=plan_type,
            analysis_focus=analysis_focus,
            specific_areas=specific_areas,
        )

        # Create image part
        image = types.Part.from_bytes(
            data=image_bytes,
            mime_type="image/jpeg" if image_path.endswith(".jpg") else "image/png",
        )
        contents = cast(Any, [image, prompt])

        # Execute analysis with code execution enabled
        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                tools=[types.Tool(code_execution=types.ToolCodeExecution())],
                temperature=0.2,
                max_output_tokens=4096,
            ),
        )

        # Parse structured results
        return self._parse_analysis_response(
            response_text=response.text or "",
            plan_type=plan_type,
            analysis_focus=analysis_focus,
        )

    def detailed_inspection(
        self,
        image_path: str,
        inspection_prompt: str,
        zoom_areas: list[tuple] | None = None,
    ) -> dict[str, Any]:
        """
        Perform detailed inspection with zoom capabilities

        Args:
            image_path: Path to image
            inspection_prompt: Specific inspection instructions
            zoom_areas: List of (x, y, width, height) tuples for zoom regions
        """
        if image_path.lower().endswith(".pdf"):
            image_path = self._pdf_to_image(image_path)

        with open(image_path, "rb") as f:
            image_bytes = f.read()

        # Build detailed inspection prompt
        full_prompt = f"""You are a civil engineering plan inspector using agentic vision.

INSPECTION TASK:
{inspection_prompt}

INSTRUCTIONS:
1. First, examine the entire plan for overall context
2. Use code execution to crop and zoom into specific areas as needed
3. Generate Python code to:
   - Crop specific regions for closer inspection
   - Count elements (sediment basins, drainage structures, etc.)
   - Measure distances and areas
   - Annotate findings directly on the image
4. Provide detailed observations for each inspected area
5. Note any compliance issues or missing elements

Use the Think → Act → Observe loop:
- THINK: What areas need detailed inspection?
- ACT: Generate code to crop/zoom/measure
- OBSERVE: Analyze the results and refine your inspection

Return your findings in structured JSON format with:
- inspected_areas: list of areas examined with coordinates
- findings: detailed observations per area
- measurements: any calculated measurements
- compliance_status: pass/fail/needs_review per item
- annotated_image_base64: base64 of annotated image (if applicable)
"""

        image = types.Part.from_bytes(
            data=image_bytes,
            mime_type="image/jpeg" if image_path.endswith(".jpg") else "image/png",
        )
        contents = cast(Any, [image, full_prompt])

        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                tools=[types.Tool(code_execution=types.ToolCodeExecution())],
                temperature=0.1,
                max_output_tokens=8192,
            ),
        )

        return {
            "inspection_prompt": inspection_prompt,
            "raw_analysis": response.text or "",
            "parsed_findings": self._extract_json_from_response(response.text or ""),
        }

    def _build_analysis_prompt(
        self,
        plan_type: str,
        analysis_focus: list[str] | None,
        specific_areas: list[str] | None,
    ) -> str:
        """Build appropriate analysis prompt based on plan type"""

        base_prompt = f"""You are an expert civil engineering plan reviewer analyzing a {plan_type.upper()} plan.

ANALYSIS REQUIREMENTS:
"""

        if plan_type == "swppp":
            base_prompt += """
1. Identify all SWPPP elements:
   - Sediment basins/traps
   - Silt fences and barriers
   - Inlet protection
   - Construction entrances
   - Stabilized areas
   - Drainage patterns and flow arrows

2. Check compliance indicators:
   - Erosion control coverage
   - Sediment control placement
   - Proper labeling and notes
   - Legend completeness

3. Inspect specific areas with zoom if needed:
   - Sediment basin details (dimensions, volume)
   - Drainage structure connections
   - Perimeter controls
"""
        elif plan_type == "grading":
            base_prompt += """
1. Analyze grading plan elements:
   - Contour lines and intervals
     - Existing vs proposed elevations
   - Cut and fill areas
   - Slope calculations
   - Drainage patterns

2. Check critical areas:
   - Property line setbacks
   - Utility clearances
   - Retention/detention areas
   - Swale locations
"""
        elif plan_type == "drainage":
            base_prompt += """
1. Review drainage infrastructure:
   - Pipe sizes and materials
   - Inlet locations and types
   - Manhole locations
   - Flow directions
   - Catch basin details

2. Verify hydraulic elements:
   - Flow calculations
   - Pipe slopes
   - Connection points
   - Outfall locations
"""

        # Add specific focus areas
        if analysis_focus:
            base_prompt += f"\n\nSPECIFIC FOCUS AREAS: {', '.join(analysis_focus)}\n"

        if specific_areas:
            base_prompt += f"\nZOOM INTO THESE AREAS: {', '.join(specific_areas)}\n"

        base_prompt += """

Use Python code execution to:
- Crop and zoom into specific regions for detailed inspection
- Count elements accurately
- Calculate areas and distances
- Verify scale and dimensions

Return results in this JSON structure:
{
    "plan_type": "type",
    "elements_found": [{"type": "", "count": 0, "locations": []}],
    "measurements": {"area_acres": 0.0, "linear_feet": 0.0},
    "compliance_items": [{"item": "", "status": "pass/fail", "notes": ""}],
    "zoom_inspections": [{"area": "", "findings": "", "coordinates": []}],
    "recommendations": [""],
    "confidence": 0.95
}
"""

        return base_prompt

    def _parse_analysis_response(
        self, response_text: str, plan_type: str, analysis_focus: list[str] | None
    ) -> AnalysisResult:
        """Parse Gemini response into structured AnalysisResult"""

        # Try to extract JSON from response
        json_data = self._extract_json_from_response(response_text)

        return AnalysisResult(
            plan_type=plan_type,
            analysis_type=analysis_focus[0] if analysis_focus else "general",
            findings=json_data.get("elements_found", []),
            measurements=json_data.get("measurements", {}),
            compliance_items=json_data.get("compliance_items", []),
            detailed_inspections=json_data.get("zoom_inspections", []),
            recommendations=json_data.get("recommendations", []),
            confidence_score=json_data.get("confidence", 0.8),
            raw_analysis=response_text,
        )

    def _extract_json_from_response(self, response_text: str) -> dict:
        """Extract JSON from Gemini response text"""
        import re

        # Try to find JSON in code blocks
        json_match = re.search(r"```json\n(.*?)\n```", response_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except Exception:
                pass

        # Try to find JSON in curly braces
        json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except Exception:
                pass

        return {}

    def _pdf_to_image(self, pdf_path: str, page: int = 0) -> str:
        """Convert PDF page to image for analysis"""
        from kreuzberg import render_page_to_image

        pdf_bytes = Path(pdf_path).read_bytes()
        # dpi=144 = 2x zoom from 72 DPI base
        png_data = render_page_to_image(pdf_bytes, page, dpi=144)

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(png_data)
            return tmp.name

    def export_report(self, result: AnalysisResult, output_path: str):
        """Export analysis result to JSON file"""
        with open(output_path, "w") as f:
            json.dump(asdict(result), f, indent=2)
        print(f"Report exported to: {output_path}")


# Convenience functions for quick analysis
def quick_analyze(
    image_path: str, plan_type: str = "civil", api_key: str | None = None
) -> AnalysisResult:
    """Quick analysis of a plan"""
    analyzer = PlanAnalyzer(api_key=api_key)
    return analyzer.analyze_plan(image_path, plan_type=plan_type)


def inspect_area(
    image_path: str, inspection_prompt: str, api_key: str | None = None
) -> dict[str, Any]:
    """Detailed inspection of specific plan areas"""
    analyzer = PlanAnalyzer(api_key=api_key)
    return analyzer.detailed_inspection(image_path, inspection_prompt)
