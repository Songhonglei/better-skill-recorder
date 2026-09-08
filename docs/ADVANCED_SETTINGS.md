# 高级设置

[English](#advanced-settings-english) · [当前界面 / Current UI](SCREENSHOTS.md#advanced-settings--高级设置)

会话库左侧的“高级设置”是应用全局选项入口，沿用模型管理的青绿主题、字体与底部保存栏

| 选项 | 默认 | 范围 | 生效方式 |
| --- | --- | --- | --- |
| 最短录屏时长 | 5 秒 | 1–100 秒，整数 | 保存录制时，短于阈值的记录被丢弃，并弹窗说明；已有记录不受影响 |
| 音频最大体积 | 100 MB | 10–1000 MB，整数 | 每个音频文件读取前检查；超限显示路径与压缩/切割提示，保留原文件 |
| 录屏快捷键 | Option + Shift + R | Command / Control / Option 等修饰键 + 字母或数字 | 保存时尝试向系统注册，失败不保存、不释放旧快捷键 |
| 录制保留天数 | 30 天 | 1–3650 天，整数 | 按录制结束时间计算，过期会话目录（含内部分析/构建结果）移入废纸篓；外部导出不受影响 |

设置位于 Electron userData 下的 `app-settings.json`，与模型凭据分离，采用临时文件加原子重命名保存
正在录制或启动/停止期间不允许修改全局设置
音频 MB 在程序中按 1024 × 1024 字节计算；较大上限会提高解码内存峰值，推荐保留 100 MB
快捷键可用性以系统注册结果为准，不保证识别所有第三方应用内部非全局快捷键
录入快捷键期间暂时解除当前绑定，离开输入框、切换窗口或关闭页面时恢复

保留检查在启动时及每小时执行；会话库打开、录制或模型任务进行中时延后，后台转写、后处理及带未完成标记的会话被跳过。移入废纸篓失败会保留原文件并记录日志，不回退为永久删除。可从废纸篓恢复后延长保留天数，避免再次过期

快捷键采用禁用名单 + 系统注册检查两层策略。名单包括刷新、编辑、窗口/标签操作、系统截图、锁屏及开发者工具等高频组合；修饰键顺序统一后匹配。旧文件中的禁用组合仅替换为默认快捷键，不重置时长/音频配置

参考：[Apple 快捷键](https://support.apple.com/en-us/102650)、[Chrome 快捷键](https://support.google.com/chrome/answer/157179)。名单是本应用的保守保护策略，不承诺发现所有第三方自定义快捷键

后续可考虑：磁盘限额、默认屏幕/麦克风、通知偏好、诊断日志级别

## Advanced settings (English)

Open **Advanced settings** below Model management in the sidebar. These are global settings
and are stored separately from credentials, in `app-settings.json` under the app's user-data folder.

| Setting | Default | Range and behavior |
| --- | --- | --- |
| Minimum recording duration | 5 seconds | Integer 1–100; shorter recordings are discarded on stop with a notice, not applied retroactively |
| Maximum audio size | 100 MB | Integer 10–1000; checked before reading each file; oversized audio is preserved and its path shown for compression/splitting |
| Recording shortcut | Option + Shift + R | Modifiers plus a letter/digit; both common-shortcut denylist and system registration must pass before saving |
| Recording retention | 30 days | Integer 1–3650; expired sessions and internal analysis/build results move to Trash; external exports are unaffected |

MB uses 1024 × 1024 bytes. Raising the audio limit can increase peak decoding memory.
Settings cannot change while recording or while a recording starts/stops. Shortcut capture
temporarily releases the current binding and restores it on blur or window close. A successful
system registration cannot detect every third-party app's internal shortcut.

Retention runs at startup and hourly, deferring while the library is open or recording/model
tasks are active. Transcription, post-processing and unfinished sessions are skipped. Trash
failures preserve the files rather than permanently deleting them. Restore from Trash and
extend retention if necessary; export important material before expiry.

Legacy forbidden shortcuts fall back to the default without resetting other valid settings.
Saved custom values are preserved on update; missing retention values default to 30 days.
