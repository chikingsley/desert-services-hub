"""
Mistral MCP Server

A Model Context Protocol server for Mistral Document AI:
- OCR processing (durable, resumable)
- Structured data extraction

Environment Variables:
    MISTRAL_API_KEY: Required. Your Mistral API key.
"""

from mistral_mcp.client import MistralClient
from mistral_mcp.split_ocr import split_and_ocr

__version__ = "0.1.0"

__all__ = [
    "MistralClient",
    "split_and_ocr",
]
