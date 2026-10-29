# 路线图 {#roadmap}

Zotero Neo 是独立项目。已发布版本为 v0.1.0；[更新记录](../CHANGELOG.md)区分已发布行为与未发布源码。当前工作流和准确按键见[使用指南](USER_GUIDE.md)与[命令参考](COMMAND_REFERENCE.md)。

## 当前 {#current}

v0.2.0 源码已合并到 `main`，包含已选定的 Library 工作流、Reader 侧栏与导航改进，以及按交互上下文区分的设置。这仍不是正式发布版本：在授权发布经验证的 v0.2.0 资产前，公开更新源仍保持官方 v0.1.0。

候选版本验收和负责人确认仍在进行。按[候选验收协议](V0_2_ACCEPTANCE.md)执行 U1–U9，并将实际人工与宿主结果记录在 [#137](https://github.com/zhongyangchuwu/Zotero-Neo/issues/137) 和 [#98](https://github.com/zhongyangchuwu/Zotero-Neo/issues/98)；候选包身份和发布准备由 [#142](https://github.com/zhongyangchuwu/Zotero-Neo/issues/142) 跟踪。

## 下一步 {#next}

- 完成候选包安装、升级、物理输入、逐视图和负责人审查等必要验收。
- 根据 #142 完成发布准备。打标签、提升更新源和发布都须通过发布门禁并获得明确授权。

更长期的候选事项包括命令面板参数与历史、更丰富且安全的标签操作、待 schema 在实际使用中稳定后再考虑的键位映射导入／导出，以及仅在确有明显价值时才考虑的可选 Spotlight 适配器。若要替换当前兼容路径，仍需要 Zotero 提供受支持的语义选区接口。宏、Ex 命令、广泛的 Vim 功能兼容，以及更深入的 EPUB／快照支持均不在已选定范围内。
