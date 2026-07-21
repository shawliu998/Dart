# BidEvidence Fixture Sans

`BidEvidenceFixtureSans.ttf` 是仅包含演示夹具所需字符的测试字体子集，用于在 PDF 中嵌入中文字符，避免运行环境依赖系统 CMap 或系统字体。

- 上游：Noto Sans SC
- 上游仓库：https://github.com/google/fonts/tree/main/ofl/notosanssc
- 源文件：`NotoSansSC[wght].ttf`
- 源文件 SHA-256：`a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`
- 许可证：SIL Open Font License 1.1，完整条款见 `OFL.txt`
- 修改：固定为 Regular 字重，仅保留演示生成器当前使用的字符，并将 PDF 嵌入/展示名称设为 `BidEvidence Fixture Sans`

字体 name table 中仍保留 `Noto Sans SC` 作为上游兼容名称；PDF 内嵌入的主名称为 `BidEvidenceFixtureSans-Regular`。

该字体不得脱离 OFL 条款单独分发。生成的 PDF 文档不因嵌入该字体而改变项目本身的 AGPL-3.0-only 许可证。
