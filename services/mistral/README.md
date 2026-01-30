# Mistral MCP

Mistral Document AI MCP server with OCR, batch processing, and smart PDF handling.

## Features

- **OCR Processing**: Extract text from PDFs, images, and documents using Mistral's OCR models
- **Batch Processing**: Process multiple documents with 50% cost savings via batch API
- **Smart PDF Handling**: Automatic splitting of large documents that exceed Mistral's limits (50MB, 1000 pages)
- **Document Q&A**: Ask questions about document content

## Installation

```bash
uv sync --all-extras
```css

## Usage

```python
from mistral_mcp.client import MistralClient
from mistral_mcp.ocr import ocr_document

# Initialize client
client = MistralClient()

# OCR from URL
result = await client.ocr_from_url("https://example.com/doc.pdf")
print(result.full_text)

# OCR from local file with auto-splitting for large documents
result = await ocr_document("/path/to/large.pdf", auto_split=True)
```css

## Environment Variables

- `MISTRAL_API_KEY`: Your Mistral API key (required)

## Development

```bash
# Install dev dependencies
uv sync --all-extras

# Run linting
uv run ruff check .
uv run ruff format .

# Run type checking
uv run mypy src/

# Run tests
uv run pytest
```
