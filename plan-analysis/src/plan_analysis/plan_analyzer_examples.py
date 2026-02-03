"""
Example usage and test cases for Plan Analysis Utility
"""

import os

from .plan_analyzer import PlanAnalyzer, inspect_area, quick_analyze

# Set your API key
os.environ["GEMINI_API_KEY"] = "your-api-key-here"


def example_basic_analysis():
    """Example: Basic plan analysis"""
    print("=" * 60)
    print("Example 1: Basic SWPPP Plan Analysis")
    print("=" * 60)

    # Quick analysis
    result = quick_analyze(image_path="./sample-plans/swppp-example.pdf", plan_type="swppp")

    print(f"\nPlan Type: {result.plan_type}")
    print(f"Confidence: {result.confidence_score:.2%}")
    print(f"\nElements Found: {len(result.findings)}")
    for element in result.findings:
        print(f"  - {element['type']}: {element['count']} found")

    print(f"\nCompliance Items: {len(result.compliance_items)}")
    for item in result.compliance_items:
        status = "✓" if item["status"] == "pass" else "✗"
        print(f"  {status} {item['item']}")

    # Export report
    analyzer = PlanAnalyzer()
    analyzer.export_report(result, "./output/swppp-analysis-report.json")


def example_detailed_inspection():
    """Example: Detailed inspection with zoom"""
    print("\n" + "=" * 60)
    print("Example 2: Detailed Sediment Basin Inspection")
    print("=" * 60)

    analyzer = PlanAnalyzer()

    inspection = analyzer.detailed_inspection(
        image_path="./sample-plans/grading-plan.pdf",
        inspection_prompt="""
        Focus on sediment basins and traps:
        1. Count all sediment basins
        2. Verify each has proper dimensions labeled
        3. Check volume calculations
        4. Ensure outlet structures are detailed
        5. Verify maintenance access

        Use code execution to crop and inspect each basin area individually.
        """,
    )

    print("\nInspection Results:")
    print(inspection["raw_analysis"][:500] + "...")


def example_civil_plan_analysis():
    """Example: Civil plan with multiple focus areas"""
    print("\n" + "=" * 60)
    print("Example 3: Comprehensive Civil Plan Review")
    print("=" * 60)

    analyzer = PlanAnalyzer()

    result = analyzer.analyze_plan(
        image_path="./sample-plans/civil-site-plan.pdf",
        plan_type="civil",
        analysis_focus=[
            "drainage_infrastructure",
            "utility_locations",
            "erosion_controls",
        ],
        specific_areas=[
            "northwest drainage basin",
            "main entrance area",
            "retention pond",
        ],
    )

    print(f"\nDetailed Inspections Performed: {len(result.detailed_inspections)}")
    for inspection in result.detailed_inspections:
        print(f"\n  Area: {inspection['area']}")
        print(f"  Findings: {inspection['findings'][:100]}...")


def example_batch_processing():
    """Example: Batch processing multiple plans"""
    print("\n" + "=" * 60)
    print("Example 4: Batch Processing Multiple Plans")
    print("=" * 60)

    import glob

    analyzer = PlanAnalyzer()
    plans = glob.glob("./plans-to-review/*.pdf")

    results = []
    for plan_path in plans:
        print(f"\nAnalyzing: {os.path.basename(plan_path)}")
        result = analyzer.analyze_plan(image_path=plan_path, plan_type="swppp")
        results.append(
            {
                "file": os.path.basename(plan_path),
                "confidence": result.confidence_score,
                "compliance_passed": all(
                    item["status"] == "pass" for item in result.compliance_items
                ),
            }
        )

    # Summary
    print("\n" + "-" * 60)
    print("BATCH PROCESSING SUMMARY")
    print("-" * 60)
    passed = sum(1 for r in results if r["compliance_passed"])
    print(f"Total Plans: {len(results)}")
    print(f"Passed: {passed}")
    print(f"Needs Review: {len(results) - passed}")


def example_measurement_extraction():
    """Example: Extract specific measurements"""
    print("\n" + "=" * 60)
    print("Example 5: Measurement Extraction")
    print("=" * 60)

    inspection = inspect_area(
        image_path="./sample-plans/grading-plan.pdf",
        inspection_prompt="""
        Extract the following measurements from the grading plan:
        1. Total site area in acres
        2. Length of silt fence required
        3. Volume of excavation (cut)
        4. Volume of fill
        5. Net cut/fill balance

        Use Python code to:
        - Calculate areas from dimensions
        - Sum linear footage
        - Compute volumes from area and depth
        - Verify calculations

        Return all measurements with units.
        """,
    )

    print("\nMeasurements Extracted:")
    if "parsed_findings" in inspection:
        measurements = inspection["parsed_findings"].get("measurements", {})
        for key, value in measurements.items():
            print(f"  {key}: {value}")


if __name__ == "__main__":
    print("Plan Analysis Utility - Example Usage")
    print("=" * 60)
    print("\nThis file demonstrates various usage patterns.")
    print("Uncomment the examples you want to run.\n")

    # Uncomment to run examples:
    # example_basic_analysis()
    # example_detailed_inspection()
    # example_civil_plan_analysis()
    # example_batch_processing()
    # example_measurement_extraction()

    print("Examples defined:")
    print("  1. example_basic_analysis() - Quick SWPPP analysis")
    print("  2. example_detailed_inspection() - Sediment basin inspection with zoom")
    print("  3. example_civil_plan_analysis() - Multi-focus civil plan review")
    print("  4. example_batch_processing() - Process multiple plans")
    print("  5. example_measurement_extraction() - Extract specific measurements")
