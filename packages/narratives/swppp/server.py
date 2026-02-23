"""FastAPI application for SWPPP document generation."""

from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from swppp.config import Settings
from swppp.models.canonical_swppp import CanonicalSWPPPPayload
from swppp.models.swppp import SWPPPData
from swppp.services.canonical_mapper import CanonicalSWPPPMapper
from swppp.services.document_generator import DocumentGenerator

settings = Settings()

app = FastAPI(
    title="SWPPP Document Generator",
    description="Generate SWPPP documents from validated data",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_output_path(project_name: str) -> tuple[str, Path]:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"SWPPP_{project_name.replace(' ', '_')}_{timestamp}.docx"
    output_path = settings.output_dir / output_filename
    return output_filename, output_path


def _generate_document(data: SWPPPData) -> tuple[str, Path]:
    if not settings.template_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Template not found: {settings.template_path}",
        )

    output_filename, output_path = _build_output_path(data.project.project_name)
    generator = DocumentGenerator(settings.template_path)
    generated_path = generator.generate_swppp(data, output_path)
    return output_filename, generated_path


@app.get("/")
async def root():
    return {
        "message": "SWPPP Document Generator",
        "docs": "/docs",
        "endpoints": {
            "validate": "/api/v1/swppp/validate",
            "generate": "/api/v1/swppp/generate",
            "download": "/api/v1/swppp/generate-and-download",
            "validate_canonical": "/api/v1/swppp/validate-canonical",
            "generate_from_canonical": "/api/v1/swppp/generate-from-canonical",
        },
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/api/v1/swppp/validate")
async def validate_swppp_data(data: SWPPPData):
    """Validate SWPPP data without generating a document."""
    return {
        "status": "valid",
        "message": "All required data is present and valid",
        "project_name": data.project.project_name,
        "permit_number": data.permit.permit_number,
    }


@app.post("/api/v1/swppp/generate")
async def generate_swppp_document(data: SWPPPData):
    """Generate a SWPPP document from validated data."""
    try:
        output_filename, generated_path = _generate_document(data)
        return {
            "status": "success",
            "message": "SWPPP document generated successfully",
            "document_path": str(generated_path),
            "filename": output_filename,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating document: {e!s}",
        )


@app.post("/api/v1/swppp/generate-and-download")
async def generate_and_download_swppp(data: SWPPPData):
    """Generate a SWPPP document and return it for download."""
    try:
        output_filename, generated_path = _generate_document(data)
        return FileResponse(
            path=generated_path,
            filename=output_filename,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating document: {e!s}",
        )


@app.post("/api/v1/swppp/validate-canonical")
async def validate_canonical_swppp_data(data: CanonicalSWPPPPayload):
    """Validate canonical payload and deterministic mapping output."""
    mapper = CanonicalSWPPPMapper()
    mapped = mapper.to_swppp(data)
    return {
        "status": "valid",
        "message": "Canonical payload is valid and maps cleanly",
        "project_name": mapped.project.project_name,
        "permit_number": mapped.permit.permit_number,
    }


@app.post("/api/v1/swppp/generate-from-canonical")
async def generate_swppp_document_from_canonical(data: CanonicalSWPPPPayload):
    """Generate a SWPPP document from canonical payload fields."""
    try:
        mapper = CanonicalSWPPPMapper()
        mapped = mapper.to_swppp(data)
        output_filename, generated_path = _generate_document(mapped)
        return {
            "status": "success",
            "message": "SWPPP document generated from canonical payload",
            "document_path": str(generated_path),
            "filename": output_filename,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating document from canonical payload: {e!s}",
        )
