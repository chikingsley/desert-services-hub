"""API routes for SWPPP document generation."""

from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.models.swppp import SWPPPData
from app.services.document_generator import DocumentGenerator


router = APIRouter(prefix="/api/v1", tags=["swppp"])

# Path configuration
TEMPLATES_DIR = Path("templates")
OUTPUT_DIR = Path("templates/output")


@router.post("/swppp/generate")
async def generate_swppp_document(data: SWPPPData):
    """
    Generate a SWPPP document from validated data.

    This endpoint:
    1. Receives JSON data matching the SWPPPData model
    2. FastAPI automatically validates the data using Pydantic
    3. If validation fails, returns detailed error messages
    4. If validation succeeds, generates the Word document
    5. Returns the path to the generated document

    Args:
        data: SWPPP data (validated automatically by Pydantic)

    Returns:
        JSON with the path to the generated document

    Raises:
        HTTPException: If template not found or generation fails
    """
    try:
        # Choose which template to use (you can make this configurable)
        template_path = TEMPLATES_DIR / "cgp_p3_template.docx"

        if not template_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Template not found: {template_path}. Please ensure the template exists."
            )

        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"SWPPP_{data.project.project_name.replace(' ', '_')}_{timestamp}.docx"
        output_path = OUTPUT_DIR / output_filename

        # Generate the document
        generator = DocumentGenerator(template_path)
        generated_path = generator.generate_swppp(data, output_path)

        return {
            "status": "success",
            "message": "SWPPP document generated successfully",
            "document_path": str(generated_path),
            "filename": output_filename
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating document: {str(e)}"
        )


@router.post("/swppp/generate-and-download")
async def generate_and_download_swppp(data: SWPPPData):
    """
    Generate a SWPPP document and return it for download.

    This endpoint generates the document and immediately returns it
    as a downloadable file instead of just the path.

    Args:
        data: SWPPP data (validated automatically by Pydantic)

    Returns:
        The generated Word document as a file download

    Raises:
        HTTPException: If template not found or generation fails
    """
    try:
        template_path = TEMPLATES_DIR / "cgp_p3_template.docx"

        if not template_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Template not found: {template_path}"
            )

        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"SWPPP_{data.project.project_name.replace(' ', '_')}_{timestamp}.docx"
        output_path = OUTPUT_DIR / output_filename

        # Generate the document
        generator = DocumentGenerator(template_path)
        generated_path = generator.generate_swppp(data, output_path)

        # Return as downloadable file
        return FileResponse(
            path=generated_path,
            filename=output_filename,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating document: {str(e)}"
        )


@router.post("/swppp/validate")
async def validate_swppp_data(data: SWPPPData):
    """
    Validate SWPPP data without generating a document.

    Useful for checking if your data is valid before attempting generation.
    If this endpoint succeeds, you know all required fields are present
    and correctly formatted.

    Args:
        data: SWPPP data to validate

    Returns:
        Confirmation that data is valid
    """
    return {
        "status": "valid",
        "message": "All required data is present and valid",
        "project_name": data.project.project_name,
        "permit_number": data.permit.permit_number
    }
