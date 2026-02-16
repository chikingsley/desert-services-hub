"""
Entry point for running the AutoNarrative SWPPP generator.

To run the API server:
    uv run uvicorn app.main:app --reload

Or:
    python main.py
"""

import uvicorn


def main():
    """Start the FastAPI development server."""
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes
    )


if __name__ == "__main__":
    main()
