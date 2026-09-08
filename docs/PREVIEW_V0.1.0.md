# Preview V0.1.0

**Unsigned Preview · Apple Silicon Mac only · Not notarized by Apple**

内部版本 / Git tag：`0.1.0-preview.1` / `v0.1.0-preview.1`

这是 Better Skill Recorder 独立预览版本线的起点，并非回退到上游旧功能版本

## 本轮更新

- 自定义 OpenAI 兼容模型，移除捆绑的 Copilot 运行时
- 预设模型、自由模型 ID、Qwen Token Plan 地址联动及安全密钥存储
- 统一图标、明暗主题、中英文切换、模型管理和录制界面
- 新增高级设置：最短录制时长、音频大小上限、快捷键和禁用名单、30 天默认保留期
- 本地安全录制、share-safe / personal Skill 导出
- macOS ARM64 包体瘦身、内置校验后的英文 OCR 数据
- 渲染器沙箱、IPC 来源限制、音频有界读取和后台处理恢复
- 改善权限提示、重新检测和本机开发签名稳定性

## 安装

下载本 Release 的 ZIP 和 `SHA256SUMS.txt`，校验后解压，拖入「应用程序」

[中文安装与使用说明](https://github.com/Songhonglei/better-skill-recorder/blob/main/docs/GETTING_STARTED.zh-CN.md) · [English installation](https://github.com/Songhonglei/better-skill-recorder/blob/main/INSTALL.md)

## 测试范围与限制

本轮自动化测试及类型检查通过后发布；尚未完成独立干净 Mac 的全流程验收，请先用非敏感示例试用

该包没有 Apple Developer ID 和公证，需手动放行，升级可能需重新授权。仅 Apple Silicon；无自动更新；不录制系统音频。模型需自行配置并支持相应工具调用 / 视觉能力。安全脱敏不是绝对保证，分享前请人工复核

第三方许可证、版本固定的上游源码链接、校验信息及构建说明随 App 的 `Contents/Resources/compliance` 提供，无需另行下载 `compliance-sources.zip`
