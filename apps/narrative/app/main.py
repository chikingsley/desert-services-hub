"""FastAPI application for SWPPP document generation."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router


# Create FastAPI app
app = FastAPI(
    title="AutoNarrative - SWPPP Document Generator",
    description="Automatically generate SWPPP documents from validated data",
    version="0.1.0",
    docs_url="/docs",  # Swagger UI at /docs
    redoc_url="/redoc",  # ReDoc at /redoc
)

# Add CORS middleware (configure as needed for your use case)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this based on your needs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "AutoNarrative SWPPP Document Generator",
        "docs": "/docs",
        "endpoints": {
            "validate": "/api/v1/swppp/validate - Check if your data is valid",
            "generate": "/api/v1/swppp/generate - Generate document and get path",
            "download": "/api/v1/swppp/generate-and-download - Generate and download document"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
