# Current interface / 当前界面

Updated 2026-09-08 for Preview V0.1.0. Twenty screenshots show the production renderer
with fictional recordings and analysis results, not screenshots of personal data.
They document the UI, not an end-to-end screen-capture or model-compatibility test.

截图为当前生产界面，使用虚构录制记录、分析结果与示例配置，不含个人录制、密钥或真实路径。
页面内容与控件来自应用本身，截图不代表端到端录制或模型兼容性测试。

## English

<table>
<tr>
<td width="50%" align="center"><a href="images/en/recorder-light.png"><img src="images/en/recorder-light.png" alt="Recorder · light" width="600"></a><br><sub>Recorder · light</sub></td>
<td width="50%" align="center"><a href="images/en/recorder-dark.png"><img src="images/en/recorder-dark.png" alt="Recorder · dark" width="600"></a><br><sub>Recorder · dark</sub></td>
</tr>
<tr>
<td width="50%" align="center"><a href="images/en/library-light.png"><img src="images/en/library-light.png" alt="Recordings · weekly update · light" width="600"></a><br><sub>Recordings · weekly update · light</sub></td>
<td width="50%" align="center"><a href="images/en/library-dark.png"><img src="images/en/library-dark.png" alt="Recordings · weekly update · dark" width="600"></a><br><sub>Recordings · weekly update · dark</sub></td>
</tr>
<tr>
<td width="50%" align="center"><a href="images/en/library-example-light.png"><img src="images/en/library-example-light.png" alt="Recordings · product comparison · light" width="600"></a><br><sub>Recordings · product comparison · light</sub></td>
<td width="50%" align="center"><a href="images/en/library-example-dark.png"><img src="images/en/library-example-dark.png" alt="Recordings · product comparison · dark" width="600"></a><br><sub>Recordings · product comparison · dark</sub></td>
</tr>
<tr>
<td width="50%" align="center"><a href="images/en/model-management-light.png"><img src="images/en/model-management-light.png" alt="Model management · light" width="600"></a><br><sub>Model management · light</sub></td>
<td width="50%" align="center"><a href="images/en/model-management-dark.png"><img src="images/en/model-management-dark.png" alt="Model management · dark" width="600"></a><br><sub>Model management · dark</sub></td>
</tr>
<tr>
<td width="50%" align="center"><a href="images/en/advanced-settings-light.png"><img src="images/en/advanced-settings-light.png" alt="Advanced settings · light" width="600"></a><br><sub>Advanced settings · light</sub></td>
<td width="50%" align="center"><a href="images/en/advanced-settings-dark.png"><img src="images/en/advanced-settings-dark.png" alt="Advanced settings · dark" width="600"></a><br><sub>Advanced settings · dark</sub></td>
</tr>
</table>

## 中文

<table>
<tr>
<td width="50%" align="center"><a href="images/zh-CN/recorder-light.png"><img src="images/zh-CN/recorder-light.png" alt="录制 · 浅色" width="600"></a><br><sub>录制 · 浅色</sub></td>
<td width="50%" align="center"><a href="images/zh-CN/recorder-dark.png"><img src="images/zh-CN/recorder-dark.png" alt="录制 · 深色" width="600"></a><br><sub>录制 · 深色</sub></td>
</tr>
<tr>
<td width="50%" align="center"><a href="images/zh-CN/library-light.png"><img src="images/zh-CN/library-light.png" alt="录制记录 · 周报示例 · 浅色" width="600"></a><br><sub>录制记录 · 周报示例 · 浅色</sub></td>
<td width="50%" align="center"><a href="images/zh-CN/library-dark.png"><img src="images/zh-CN/library-dark.png" alt="录制记录 · 周报示例 · 深色" width="600"></a><br><sub>录制记录 · 周报示例 · 深色</sub></td>
</tr>
<tr>
<td width="50%" align="center"><a href="images/zh-CN/library-example-light.png"><img src="images/zh-CN/library-example-light.png" alt="录制记录 · 产品对比 · 浅色" width="600"></a><br><sub>录制记录 · 产品对比 · 浅色</sub></td>
<td width="50%" align="center"><a href="images/zh-CN/library-example-dark.png"><img src="images/zh-CN/library-example-dark.png" alt="录制记录 · 产品对比 · 深色" width="600"></a><br><sub>录制记录 · 产品对比 · 深色</sub></td>
</tr>
<tr>
<td width="50%" align="center"><a href="images/zh-CN/model-management-light.png"><img src="images/zh-CN/model-management-light.png" alt="模型管理 · 浅色" width="600"></a><br><sub>模型管理 · 浅色</sub></td>
<td width="50%" align="center"><a href="images/zh-CN/model-management-dark.png"><img src="images/zh-CN/model-management-dark.png" alt="模型管理 · 深色" width="600"></a><br><sub>模型管理 · 深色</sub></td>
</tr>
<tr>
<td width="50%" align="center"><a href="images/zh-CN/advanced-settings-light.png"><img src="images/zh-CN/advanced-settings-light.png" alt="高级设置 · 浅色" width="600"></a><br><sub>高级设置 · 浅色</sub></td>
<td width="50%" align="center"><a href="images/zh-CN/advanced-settings-dark.png"><img src="images/zh-CN/advanced-settings-dark.png" alt="高级设置 · 深色" width="600"></a><br><sub>高级设置 · 深色</sub></td>
</tr>
</table>

## Reproduce / 重新生成

Build the production renderer with `npm run build:vite`, serve `dist` on localhost:8766,
then run `python3 scripts/capture-doc-images.py` with Playwright and Chromium installed.
The script provides a synthetic IPC bridge, never connects to Electron or model services,
and uses default settings rather than a maintainer's saved preferences.
