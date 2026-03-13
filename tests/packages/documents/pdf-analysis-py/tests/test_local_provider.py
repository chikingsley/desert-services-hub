from pdf_analysis.config import Settings
from pdf_analysis.providers.local import LocalProvider
from types import SimpleNamespace


def test_settings_blank_values_fall_back_to_defaults() -> None:
    settings = Settings(
        ollama_endpoint="",
        ollama_public_endpoint="",
        ollama_model="",
        ollama_chat_model="",
        ollama_public_model="",
        ollama_public_chat_model="",
        pdf_analysis_provider_order="",
    )
    assert settings.ollama_endpoint == "https://ollama.peacockery.studio/v1"
    assert settings.ollama_public_endpoint == "https://llama.peacockery.studio/v1"
    assert settings.ollama_model == "glm-ocr:latest"
    assert settings.ollama_chat_model == "granite4:latest"
    assert settings.ollama_public_model == "glm-ocr:latest"
    assert settings.ollama_public_chat_model == "granite4:latest"
    assert settings.pdf_analysis_provider_order == "openrouter"


def test_completion_endpoint_variants() -> None:
    settings = Settings()
    provider = LocalProvider(settings)

    assert provider._endpoint_variants("https://example.com/v1") == [
        "https://example.com/v1/chat/completions"
    ]
    assert provider._endpoint_variants("https://example.com") == [
        "https://example.com/chat/completions",
        "https://example.com/v1/chat/completions",
    ]
    assert provider._endpoint_variants("https://example.com/chat/completions") == [
        "https://example.com/chat/completions"
    ]


def test_rapidocr_payload_to_elements_from_word_results() -> None:
    elements = LocalProvider._rapidocr_payload_to_elements(
        SimpleNamespace(
            word_results=[[["Total", 0.98, [[20, 40], [100, 40], [100, 70], [20, 70]]]]]
        ),
        page_number=2,
        zoom=2.0,
    )
    assert len(elements) == 1
    assert elements[0]["page"] == 2
    assert elements[0]["text"] == "Total"
    assert elements[0]["x0"] == 10
    assert elements[0]["y0"] == 20
    assert elements[0]["x1"] == 50
    assert elements[0]["y1"] == 35


def test_rapidocr_payload_to_elements_from_list_shape() -> None:
    elements = LocalProvider._rapidocr_payload_to_elements(
        [
            [[[10, 10], [40, 10], [40, 30], [10, 30]], "Invoice", 0.95],
            [[[50, 10], [90, 10], [90, 30], [50, 30]], "1234", 0.93],
        ],
        page_number=1,
        zoom=1.0,
    )
    assert [element["text"] for element in elements] == ["Invoice", "1234"]
    assert elements[1]["x0"] == 50
    assert elements[1]["y1"] == 30
