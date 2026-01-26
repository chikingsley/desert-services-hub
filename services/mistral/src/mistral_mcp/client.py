"""
Mistral API client wrapper.

Provides a unified interface to Mistral's Document AI capabilities.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from dotenv import load_dotenv
from mistralai import Mistral
from mistralai.models import (
    AssistantMessage,
    ContentChunk,
    DocumentURLChunk,
    ImageURLChunk,
    JSONSchema,
    ResponseFormat,
    SystemMessage,
    TextChunk,
    ToolMessage,
    UserMessage,
)

from mistral_mcp.types import (
    MISTRAL_OCR_MODEL,
    ImageInfo,
    OCRPage,
    OCRResult,
    TableFormat,
    TableInfo,
)

if TYPE_CHECKING:
    from mistralai.models import OCRResponse

logger = logging.getLogger(__name__)


def _load_dotenv() -> None:
    """Load .env from project root if not already loaded."""
    # Walk up to find .env
    current = Path(__file__).resolve()
    for parent in current.parents:
        env_file = parent / ".env"
        if env_file.exists():
            load_dotenv(env_file)
            return


def get_api_key() -> str:
    """
    Get the Mistral API key from environment.

    Returns:
        The API key string.

    Raises:
        ValueError: If MISTRAL_API_KEY is not set.
    """
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        # Try loading .env
        _load_dotenv()
        api_key = os.environ.get("MISTRAL_API_KEY")

    if not api_key:
        raise ValueError(
            "MISTRAL_API_KEY environment variable is required. "
            "Get your key at https://console.mistral.ai"
        )
    return api_key


class MistralClient:
    """
    Wrapper around the Mistral SDK for Document AI operations.

    Provides simplified methods for OCR, document Q&A, and structured extraction.

    Example:
        client = MistralClient()
        result = await client.ocr_from_url("https://example.com/doc.pdf")
        print(result.full_text)
    """

    def __init__(self, api_key: str | None = None):
        """
        Initialize the Mistral client.

        Args:
            api_key: Mistral API key. If not provided, reads from
                MISTRAL_API_KEY environment variable.
        """
        self._api_key = api_key or get_api_key()
        self._client = Mistral(api_key=self._api_key)

    @property
    def client(self) -> Mistral:
        """Get the underlying Mistral SDK client."""
        return self._client

    async def _get_signed_url_with_retry(
        self,
        file_id: str,
        expiry: int = 1,
        max_retries: int = 3,
        delay: float = 1.0,
    ) -> str:
        """Get signed URL with retry logic for race conditions."""
        last_error: Exception | None = None
        for attempt in range(max_retries):
            try:
                signed_url = await self._client.files.get_signed_url_async(
                    file_id=file_id,
                    expiry=expiry,
                )
                return signed_url.url
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    await asyncio.sleep(delay)
        raise last_error  # type: ignore[misc]

    async def ocr_from_url(
        self,
        url: str,
        *,
        model: str = MISTRAL_OCR_MODEL,
        table_format: TableFormat | None = None,
        extract_header: bool = False,
        extract_footer: bool = False,
        include_images: bool = False,
    ) -> OCRResult:
        """
        Process a document from URL with OCR.

        Args:
            url: URL to the document (PDF, PPTX, DOCX) or image.
            model: OCR model to use. Defaults to mistral-ocr-latest.
            table_format: How to format extracted tables.
            extract_header: Whether to extract page headers.
            extract_footer: Whether to extract page footers.
            include_images: Whether to include base64 images in response.

        Returns:
            OCRResult with extracted content.
        """
        # Determine document type based on extension
        is_image = any(
            url.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".avif"]
        )

        # Use proper SDK types
        document: DocumentURLChunk | ImageURLChunk
        if is_image:
            document = ImageURLChunk(image_url=url)
        else:
            document = DocumentURLChunk(document_url=url)

        # Build table_format as literal type
        tf: Literal["markdown", "html"] | None = None
        if table_format:
            tf = "html" if table_format == TableFormat.HTML else "markdown"

        response = await self._client.ocr.process_async(
            model=model,
            document=document,
            table_format=tf,
            extract_header=extract_header,
            extract_footer=extract_footer,
            include_image_base64=include_images,
        )

        return self._parse_ocr_response(response, model)

    async def ocr_from_file(
        self,
        file_path: str,
        *,
        model: str = MISTRAL_OCR_MODEL,
        table_format: TableFormat | None = None,
        extract_header: bool = False,
        extract_footer: bool = False,
        include_images: bool = False,
    ) -> OCRResult:
        """
        Process a local file with OCR.

        Uploads the file to Mistral's servers, gets a signed URL, then processes.

        Args:
            file_path: Path to the local file.
            model: OCR model to use.
            table_format: How to format extracted tables.
            extract_header: Whether to extract page headers.
            extract_footer: Whether to extract page footers.
            include_images: Whether to include base64 images in response.

        Returns:
            OCRResult with extracted content.

        Raises:
            FileNotFoundError: If the file doesn't exist.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # Upload file to Mistral
        content = path.read_bytes()
        uploaded_file = await self._client.files.upload_async(
            file={"file_name": path.name, "content": content},
            purpose="ocr",
        )

        # Get a signed URL for the uploaded file (with retry for race conditions)
        signed_url = await self._get_signed_url_with_retry(uploaded_file.id)

        # Build table_format as literal type
        tf: Literal["markdown", "html"] | None = None
        if table_format:
            tf = "html" if table_format == TableFormat.HTML else "markdown"

        response = await self._client.ocr.process_async(
            model=model,
            document=DocumentURLChunk(document_url=signed_url),
            table_format=tf,
            extract_header=extract_header,
            extract_footer=extract_footer,
            include_image_base64=include_images,
        )

        return self._parse_ocr_response(response, model)

    async def ocr_from_base64(
        self,
        base64_content: str,
        *,
        model: str = MISTRAL_OCR_MODEL,
        table_format: TableFormat | None = None,
        extract_header: bool = False,
        extract_footer: bool = False,
        include_images: bool = False,
        file_name: str = "document.pdf",
    ) -> OCRResult:
        """
        Process base64-encoded content with OCR.

        Decodes and uploads the content, then processes via signed URL.

        Args:
            base64_content: Base64-encoded document content.
            model: OCR model to use.
            table_format: How to format extracted tables.
            extract_header: Whether to extract page headers.
            extract_footer: Whether to extract page footers.
            include_images: Whether to include base64 images in response.
            file_name: Name to use for the uploaded file.

        Returns:
            OCRResult with extracted content.
        """
        # Decode base64 content
        content = base64.b64decode(base64_content)

        # Upload to Mistral
        uploaded_file = await self._client.files.upload_async(
            file={"file_name": file_name, "content": content},
            purpose="ocr",
        )

        # Get signed URL (with retry for race conditions)
        signed_url = await self._get_signed_url_with_retry(uploaded_file.id)

        # Build table_format as literal type
        tf: Literal["markdown", "html"] | None = None
        if table_format:
            tf = "html" if table_format == TableFormat.HTML else "markdown"

        response = await self._client.ocr.process_async(
            model=model,
            document=DocumentURLChunk(document_url=signed_url),
            table_format=tf,
            extract_header=extract_header,
            extract_footer=extract_footer,
            include_image_base64=include_images,
        )

        return self._parse_ocr_response(response, model)

    async def document_qa(
        self,
        question: str,
        document_url: str | None = None,
        document_path: str | None = None,
        model: str = "mistral-large-latest",
    ) -> str:
        """
        Ask a question about a document.

        Args:
            question: The question to ask.
            document_url: URL to the document.
            document_path: Path to local document (alternative to URL).
            model: Chat model to use for Q&A.

        Returns:
            The answer to the question.

        Raises:
            ValueError: If neither document_url nor document_path is provided.
        """
        if not document_url and not document_path:
            raise ValueError("Either document_url or document_path must be provided")

        # Build content using proper SDK types
        content: list[ContentChunk] = [TextChunk(text=question)]

        if document_url:
            content.append(DocumentURLChunk(document_url=document_url))
        else:
            # Upload local file and get signed URL
            doc_path = Path(document_path)  # type: ignore[arg-type]
            file_bytes = doc_path.read_bytes()

            uploaded_file = await self._client.files.upload_async(
                file={"file_name": doc_path.name, "content": file_bytes},
                purpose="ocr",
            )

            signed_url = await self._get_signed_url_with_retry(uploaded_file.id)

            content.append(DocumentURLChunk(document_url=signed_url))

        # Type the messages list explicitly for mypy
        messages: list[UserMessage | AssistantMessage | SystemMessage | ToolMessage] = [
            UserMessage(content=content)
        ]

        response = await self._client.chat.complete_async(
            model=model,
            messages=messages,
        )

        # Response content can be string or list, handle both
        result = response.choices[0].message.content
        if isinstance(result, str):
            return result
        # If it's a list of chunks, extract text from first chunk
        return str(result)

    async def extract_structured(
        self,
        prompt: str,
        schema: dict[str, object],
        schema_name: str = "extraction",
        document_url: str | None = None,
        document_path: str | None = None,
        model: str = "mistral-large-latest",
    ) -> str:
        """
        Extract structured JSON data from a document using a schema.

        Args:
            prompt: Instructions for what to extract.
            schema: JSON Schema defining the expected output structure.
            schema_name: Name for the schema (used in API).
            document_url: URL to the document.
            document_path: Path to local document (alternative to URL).
            model: Model to use (default: mistral-large-latest).

        Returns:
            JSON string matching the provided schema.

        Example:
            schema = {
                "type": "object",
                "properties": {
                    "contractor": {"type": "string"},
                    "amount": {"type": "number"},
                    "date": {"type": "string"}
                },
                "required": ["contractor", "amount"]
            }
            result = await client.extract_structured(
                "Extract the contractor name, contract amount, and date.",
                schema,
                document_path="/path/to/contract.pdf"
            )
        """
        # Build content
        content: list[ContentChunk] = [TextChunk(text=prompt)]

        if document_url:
            content.append(DocumentURLChunk(document_url=document_url))
        elif document_path:
            # Upload local file and get signed URL
            doc_path = Path(document_path)
            file_bytes = doc_path.read_bytes()

            uploaded_file = await self._client.files.upload_async(
                file={"file_name": doc_path.name, "content": file_bytes},
                purpose="ocr",
            )

            signed_url = await self._get_signed_url_with_retry(uploaded_file.id)

            content.append(DocumentURLChunk(document_url=signed_url))

        # Build messages
        messages: list[UserMessage | AssistantMessage | SystemMessage | ToolMessage] = [
            UserMessage(content=content)
        ]

        # Use JSON schema response format
        response_format = ResponseFormat(
            type="json_schema",
            json_schema=JSONSchema(name=schema_name, schema_definition=schema),
        )

        response = await self._client.chat.complete_async(
            model=model,
            messages=messages,
            response_format=response_format,
        )

        result = response.choices[0].message.content
        if isinstance(result, str):
            return result
        return str(result)

    async def extract_json(
        self,
        prompt: str,
        document_url: str | None = None,
        document_path: str | None = None,
        model: str = "mistral-large-latest",
    ) -> str:
        """
        Extract JSON data from a document (free-form, no schema).

        Args:
            prompt: Instructions for what to extract as JSON.
            document_url: URL to the document.
            document_path: Path to local document (alternative to URL).
            model: Model to use (default: mistral-large-latest).

        Returns:
            JSON string.
        """
        # Build content
        content: list[ContentChunk] = [TextChunk(text=prompt)]

        if document_url:
            content.append(DocumentURLChunk(document_url=document_url))
        elif document_path:
            doc_path = Path(document_path)
            file_bytes = doc_path.read_bytes()

            uploaded_file = await self._client.files.upload_async(
                file={"file_name": doc_path.name, "content": file_bytes},
                purpose="ocr",
            )

            signed_url = await self._get_signed_url_with_retry(uploaded_file.id)

            content.append(DocumentURLChunk(document_url=signed_url))

        messages: list[UserMessage | AssistantMessage | SystemMessage | ToolMessage] = [
            UserMessage(content=content)
        ]

        # Use json_object mode (free-form JSON)
        response_format = ResponseFormat(type="json_object")

        response = await self._client.chat.complete_async(
            model=model,
            messages=messages,
            response_format=response_format,
        )

        result = response.choices[0].message.content
        if isinstance(result, str):
            return result
        return str(result)

    def _parse_ocr_response(self, response: OCRResponse, model: str) -> OCRResult:
        """Parse the raw OCR response into our model."""
        pages: list[OCRPage] = []

        for page_data in response.pages:
            images: list[ImageInfo] = [
                ImageInfo(
                    id=img.id,
                    top_left_x=img.top_left_x,
                    top_left_y=img.top_left_y,
                    bottom_right_x=img.bottom_right_x,
                    bottom_right_y=img.bottom_right_y,
                    image_base64=getattr(img, "image_base64", None),
                )
                for img in getattr(page_data, "images", []) or []
            ]

            tables: list[TableInfo] = [
                TableInfo(id=tbl.id, content=tbl.content)
                for tbl in getattr(page_data, "tables", []) or []
            ]

            page = OCRPage(
                index=page_data.index,
                markdown=page_data.markdown,
                images=images,
                tables=tables,
                hyperlinks=getattr(page_data, "hyperlinks", []) or [],
                header=getattr(page_data, "header", None),
                footer=getattr(page_data, "footer", None),
            )
            pages.append(page)

        # Convert usage_info object to dict
        raw_usage = getattr(response, "usage_info", None)
        if raw_usage is not None and hasattr(raw_usage, "__dict__"):
            usage_info = {
                k: v for k, v in vars(raw_usage).items() if not k.startswith("_")
            }
        elif isinstance(raw_usage, dict):
            usage_info = raw_usage
        else:
            usage_info = {}

        return OCRResult(
            pages=pages,
            model=model,
            usage_info=usage_info,
        )
