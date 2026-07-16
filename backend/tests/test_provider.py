import pytest
from pydantic import ValidationError

from app.agents.provider import MockLLMProvider
from app.schemas.requirements import RequirementBatch, RequirementExtractionResult


@pytest.mark.asyncio
async def test_mock_provider_is_offline_schema_validated_and_routes_low_confidence():
    result = await MockLLMProvider().structured_generate(
        system_prompt="fixed",
        user_input="建议提供其他说明材料。",
        output_schema=RequirementBatch,
        metadata={"source_page": 1, "prompt_version": "v1"},
    )
    assert result.results[0].confidence < 0.70
    assert result.results[0].manual_review_reason
    with pytest.raises(ValidationError):
        RequirementExtractionResult.model_validate(
            {
                "category": "other",
                "title": "候选要求",
                "normalized_requirement": "建议提供材料",
                "original_text": "建议提供材料",
                "mandatory": False,
                "disqualification_if_failed": False,
                "source_page": 1,
                "confidence": 0.5,
                "prompt_version": "v1",
            }
        )
