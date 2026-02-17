from pdf_analysis.config import Settings
from pdf_analysis.provider_manager import ProviderManager
from pdf_analysis.types import ProviderName


def test_provider_order_parsing() -> None:
    settings = Settings(pdf_analysis_provider_order="local,gemini")
    manager = ProviderManager(settings)
    assert manager.order[0] == ProviderName.LOCAL
    assert manager.order[1] == ProviderName.GEMINI
