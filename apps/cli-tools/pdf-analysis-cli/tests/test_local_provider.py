from pdf_analysis.config import Settings
from pdf_analysis.providers.local import LocalProvider


def test_settings_blank_values_fall_back_to_defaults() -> None:
    settings = Settings(
        ollama_endpoint="",
        ollama_model="",
        ollama_chat_model="",
        pdf_analysis_provider_order="",
    )
    assert settings.ollama_endpoint == "https://ollama.peacockery.studio/v1"
    assert settings.ollama_model == "glm-ocr:latest"
    assert settings.ollama_chat_model == "granite4:latest"
    assert settings.pdf_analysis_provider_order == "local,mistral,gemini"


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
