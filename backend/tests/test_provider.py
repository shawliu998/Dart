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


@pytest.mark.asyncio
async def test_mock_provider_classifies_common_bid_requirements() -> None:
    lines = [
        "3.2 提供有效ISO 9001证书。",
        "3.4 近三年同类案例不少于2个。",
        "3.5 每个案例须提供验收证明。",
        "4.1 项目负责人相关经验不少于5年。",
        "4.2 合同签订后90日内完成交付。",
        "4.3 质保期不少于3年。",
        "4.4 投标有效期90日。",
        "4.5 增值税率统一为6%。",
        "5.1 投标文件必须为PDF格式。",
        "5.4 全部材料企业主体名称应一致。",
    ]
    result = await MockLLMProvider().structured_generate(
        system_prompt="fixed",
        user_input="\n".join(lines),
        output_schema=RequirementBatch,
        metadata={"source_page": 1, "prompt_version": "v1"},
    )
    by_text = {item.original_text: item for item in result.results}

    assert set(by_text) == set(lines)
    assert {line: by_text[line].category for line in lines} == {
        lines[0]: "qualification",
        lines[1]: "case",
        lines[2]: "case",
        lines[3]: "personnel",
        lines[4]: "delivery",
        lines[5]: "service",
        lines[6]: "commercial",
        lines[7]: "commercial",
        lines[8]: "format",
        lines[9]: "legal",
    }
    assert all(item.mandatory and item.confidence >= 0.80 for item in by_text.values())
    assert by_text[lines[1]].expected_evidence_types == ["contract", "acceptance_report"]
    assert by_text[lines[2]].expected_evidence_types == ["acceptance_report"]
    assert by_text[lines[3]].expected_evidence_types == ["staff_certificate", "resume"]


@pytest.mark.asyncio
async def test_mock_provider_keeps_optional_materials_non_mandatory() -> None:
    result = await MockLLMProvider().structured_generate(
        system_prompt="fixed",
        user_input="可提供项目负责人资质证书作为补充材料。",
        output_schema=RequirementBatch,
        metadata={"source_page": 1, "prompt_version": "v1"},
    )

    assert result.results[0].category == "personnel"
    assert result.results[0].mandatory is False
    assert result.results[0].confidence < 0.70
