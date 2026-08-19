import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type UiLanguage = "en" | "zh-CN";

const STORAGE_KEY = "better-skill-recorder.language";
const LANGUAGE_EVENT = "better-skill-recorder-language-change";

const ZH: Record<string, string> = {
  "CAPTURE → UNDERSTAND → BUILD": "录制 → 理解 → 构建",
  "FIELD RECORDER / 01": "现场记录 / 01",
  "Recordings": "录制记录",
  "Model control": "模型控制",
  "Library sections": "会话库分区",
  "RECENT SESSIONS": "最近会话",
  "ACTIVE MODEL": "当前模型",
  "ACTIVE ROUTE": "当前路由",
  "Custom endpoint": "自定义端点",
  "Custom model": "自定义模型",
  "Managed runtime": "托管运行时",
  "No session selected": "尚未选择会话",
  "Pick a recording on the left to review its reconstructed intent and steps.": "从左侧选择一条录制，查看重建后的意图与步骤。",
  "No recordings yet.": "还没有录制。",
  "No recordings yet": "还没有录制",
  "Loading…": "加载中…",
  "Loading model control…": "正在加载模型控制…",
  "Delete this recording?": "删除这条录制？",
  "This cannot be undone.": "此操作无法撤销。",
  "Cancel": "取消",
  "Delete": "删除",
  "Delete recording": "删除录制",
  "skill": "技能",
  "automation": "自动化",
  "analyzed": "已分析",
  "processing": "处理中",
  "recorded": "已录制",
  "Not analyzed yet": "尚未分析",
  "steps": "个步骤",
  "video": "视频",
  "voice pending": "语音待处理",
  "voice": "语音",
  "Analysis": "分析",
  "What you did": "你完成了什么",
  "Steps": "步骤",
  "Edit": "编辑",
  "Name": "名称",
  "Goal": "目标",
  "Save": "保存",
  "Appears in your sessions list": "将显示在会话列表中",
  "Short name, e.g. Research habit articles": "简短名称，例如：调研习惯养成文章",
  "One sentence: what were you trying to do?": "用一句话说明你想完成什么",
  "Click any step to edit · reorder, add or remove — saved automatically": "点击任一步骤即可编辑、排序、添加或删除，修改会自动保存",
  "Still processing this recording… try again in a moment.": "这条录制仍在处理中，请稍后再试。",
  "See what you did in this recording, step by step.": "逐步查看你在这次录制中完成的操作。",
  "Analyze recording": "分析录制",
  "What gets sent for analysis": "哪些内容会发送用于分析",
  "When you choose Analyze, the event timeline (window and document titles, URLs, and clipboard previews), plus screen images, narration text, and other content you provide, are sent to the configured analysis provider. GitHub Copilot cloud is the default; a source preview may use an explicitly configured custom endpoint.": "选择“分析”后，事件时间线（窗口与文档标题、网址和剪贴板预览）、屏幕图像、旁白文本以及你提供的其他内容会发送到当前配置的分析服务。默认使用 GitHub Copilot 云端，也可明确配置自定义端点。",
  "Do not analyze a recording that may contain passwords, access tokens, API keys, credentials, secrets, or other sensitive or confidential information.": "请勿分析可能包含密码、访问令牌、API 密钥、凭证及其他敏感或机密信息的录制。",
  "By default, before anything is sent, this computer hides sensitive details like passwords, keys, emails, and card or ID numbers from the text and your screen images. You can turn this off in What's recorded for more accurate analysis. It can miss things, so it is a safety net, not a guarantee.": "默认情况下，本机会在发送前隐藏文本和屏幕图像中的密码、密钥、邮箱、银行卡号或证件号等敏感信息。你可以在“会录制什么”中关闭此功能以获得更准确的分析。它可能存在漏检，因此只是安全网而非绝对保证。",
  "Working…": "处理中…",
  "Starting…": "正在启动…",
  "Stopping…": "正在停止…",
  "Transcribing voice…": "正在转写语音…",
  "Preparing voice model…": "正在准备语音模型…",
  "Downloading voice model…": "正在下载语音模型…",
  "First analysis downloads the ~250 MB voice model once — later runs skip this.": "首次分析会下载约 250 MB 的语音模型，后续无需重复下载。",
  "Voice transcript added after this analysis": "本次分析完成后新增了语音转写",
  "Re-analyze to include it. This replaces the current summary and any edits.": "重新分析即可纳入语音内容；当前摘要和编辑内容将被替换。",
  "Replace analysis": "替换分析",
  "Re-analyze with voice": "结合语音重新分析",
  "Create…": "创建…",
  "Create another →": "再创建一个 →",
  "Open skill →": "打开技能 →",
  "Open automation →": "打开自动化 →",
  "Turn this recording into a skill or an automation": "将这条录制转换为技能或自动化",
  "Skill created": "技能已创建",
  "Automation created": "自动化已创建",
  "Skill & automation created": "技能与自动化均已创建",
  "Create": "创建",
  "What do you want to build from this recording?": "你想用这条录制构建什么？",
  "Coming soon": "即将推出",
  "Back to the analysis": "返回分析",
  "Opening the skill…": "正在打开技能…",
  "Opening the automation…": "正在打开自动化…",
  "Planning the skill…": "正在规划技能…",
  "Planning the automation…": "正在规划自动化…",
  "Writing the skill…": "正在生成技能…",
  "Writing the automation…": "正在生成自动化…",
  "Exporting the skill…": "正在导出技能…",
  "What the skill will do": "技能将完成什么",
  "What the automation will do": "自动化将完成什么",
  "When it runs": "运行时间",
  "Automation ready": "自动化已就绪",
  "Create skill": "创建技能",
  "Create automation": "创建自动化",
  "Create & export skill": "创建并导出技能",
  "Create & export automation": "创建并导出自动化",
  "Reveal skill": "显示技能",
  "Reveal bundle": "显示文件包",
  "Close": "关闭",
  "Add step": "添加步骤",
  "Move up": "上移",
  "Move down": "下移",
  "Remove": "删除",
  "Click to edit": "点击编辑",
  "Step title": "步骤标题",
  "Step detail": "步骤详情",
  "Step label": "步骤名称",
  "Step description": "步骤说明",
  "Step instruction": "步骤指令",
  "What happens in this step?": "这一步会发生什么？",
  "The instruction the agent runs for this step": "智能体在此步骤执行的指令",
  "Native tool this step uses": "此步骤使用的原生工具",
  "A little more detail": "补充更多细节",
  "Skill title": "技能标题",
  "Skill description": "技能说明",
  "Automation title": "自动化标题",
  "Automation description": "自动化说明",
  "One-line description of what this skill does": "用一句话说明此技能的作用",
  "One-line description of what this automation does": "用一句话说明此自动化的作用",
  "No value is defined for this token": "此变量尚未定义值",
  "Esc to cancel · ⏎ to save": "Esc 取消 · ⏎ 保存",
  "Once a day": "每天一次",
  "Every…": "每隔…",
  "A few times a day": "每天多次",
  "from": "起始于",
  "Days": "日期",
  "every day": "每天",
  "Every day": "每天",
  "Add time": "添加时间",
  "Remove time": "删除时间",
  "Done": "完成",
  "Before you record": "开始录制前",
  "Keep passwords, access tokens, API keys, and other sensitive or confidential information off screen and out of narration.": "请勿让密码、访问令牌、API 密钥及其他敏感或机密信息出现在屏幕或旁白中。",
  "For complete transparency, review exactly what's captured and what may later be sent to the configured provider for analysis.": "你可以先查看具体会录制哪些内容，以及稍后可能发送给已配置模型服务进行分析的内容。",
  "See exactly what's captured": "查看具体录制内容",
  "Start recording": "开始录制",
  "Starting": "正在启动",
  "Action failed": "操作失败",
  "Could not start recording.": "无法开始录制。",
  "Could not stop the recording.": "无法停止录制。",
  "Could not discard the recording.": "无法丢弃录制。",
  "Unsupported narration language.": "不支持该旁白语言。",
  "Could not change the narration language.": "无法更改旁白语言。",
  "Could not update the narration preference.": "无法更新旁白设置。",
  "Could not change the microphone.": "无法更改麦克风状态。",
  "Could not switch microphones.": "无法切换麦克风。",
  "Could not select that microphone.": "无法选择该麦克风。",
  "Could not select that screen.": "无法选择该屏幕。",
  "Could not download the voice transcription model.": "无法下载语音转写模型。",
  "Could not download the protection models.": "无法下载保护模型。",
  "Could not update advanced protection.": "无法更新高级保护设置。",
  "Could not delete this recording.": "无法删除这条录制。",
  "Could not save your changes": "无法保存更改",
  "Analysis failed": "分析失败",
  "Planning failed": "规划失败",
  "Could not create the skill": "无法创建技能",
  "Could not create the automation": "无法创建自动化",
  "Stop recording": "停止录制",
  "Capture saved. Open Sessions to analyze": "录制已保存，请打开会话进行分析",
  "Recording discarded": "录制已丢弃",
  "Screen capture needs attention": "录屏权限需要处理",
  "Loading screens...": "正在加载屏幕…",
  "No screens available": "没有可用屏幕",
  "Narrate": "旁白",
  "Explain out loud (optional)": "边操作边讲解（可选）",
  "Requesting microphone access...": "正在请求麦克风权限…",
  "Microphone needs attention": "麦克风需要处理",
  "Voice off for this recording": "本次录制未开启语音",
  "Recording settings": "录制设置",
  "Language": "语言",
  "Microphone": "麦克风",
  "English": "英语",
  "Chinese": "中文",
  "The transcript stays in this language": "转写文本将使用此语言",
  "Screen": "屏幕",
  "Loading microphones...": "正在加载麦克风…",
  "Records your screen and activity": "录制屏幕与操作",
  "Protection off": "保护已关闭",
  "Review sessions": "查看会话",
  "GitHub Copilot found": "已找到 GitHub Copilot",
  "found": "已找到",
  "missing": "缺失",
  "advanced protection": "高级保护",
  "toggles from anywhere": "可在任意位置切换录制",
  "What's recorded": "会录制什么",
  "This tool records your screen and activity so it can turn what you did into a reusable skill. Here is exactly what it captures and what leaves your computer.": "本工具会录制屏幕与操作，并把你的过程转换为可复用技能。以下是具体录制内容及会离开本机的数据。",
  "While you're recording": "录制过程中",
  "Only between Start and Stop.": "仅限点击开始到停止之间。",
  "Which apps you switch to, and their window and document titles.": "你切换到的应用，以及窗口和文档标题。",
  "Web addresses of the pages you open.": "你打开页面的网址。",
  "A short preview of text you copy, up to 120 characters.": "复制文本的简短预览，最多 120 个字符。",
  "A silent video of the screen you select, at a low frame rate.": "所选屏幕的低帧率无声视频。",
  "Do not type, paste, display, copy, or narrate passwords, access tokens, API keys, credentials, secrets, or other sensitive or confidential information. Anything visible on screen can appear in the recording, and copied text previews and narration are captured too.": "请勿输入、粘贴、展示、复制或讲述密码、访问令牌、API 密钥、凭证及其他敏感或机密信息。屏幕上的任何内容都可能进入录制，复制文本预览和旁白也会被记录。",
  "Voice narration (only if you turn it on)": "语音旁白（仅在开启时）",
  "Off by default. Choose the initial state and microphone with Narrate, then use the floating recording bar.": "默认关闭。可在“旁白”中选择初始状态和麦克风，录制时也可通过悬浮条控制。",
  "Enabling Narrate briefly opens and releases the microphone so the app can request permission and show the available inputs. No audio is saved during this check.": "开启旁白时会短暂打开并释放麦克风，用于请求权限和显示可用输入；此检查不会保存音频。",
  "Your microphone audio is saved only while it is on and a recording is running.": "仅在录制进行且麦克风开启时保存音频。",
  "Turning the microphone off ends that voice segment and releases the device. Turning it on again, or switching inputs, starts a new segment linked to the same recording timeline.": "关闭麦克风会结束当前语音片段并释放设备；再次开启或切换输入会在同一录制时间线上创建新片段。",
  "The recording can be turned into text on this computer using an on-device model. The transcript stays in the language you select from Whisper's 99 supported choices. The first transcription needs a one-time ~252 MB download that you choose when to start.": "录音可由本机模型转换为文字，并保留你从 Whisper 支持的 99 种语言中选择的语言。首次转写需要一次性下载约 252 MB 模型，下载时机由你决定。",
  "Leave Narrate and the recording-bar microphone off and no microphone is opened.": "保持旁白和录制条麦克风关闭，应用就不会打开麦克风。",
  "Where it's stored": "存储位置",
  "Everything is saved on this computer, in the app's own session folder.": "所有内容都保存在本机应用专用的会话目录中。",
  "Recordings stay until you delete them. You can delete any recording from Sessions.": "录制会一直保留，直到你在会话中手动删除。",
  "What's sent for analysis": "分析时会发送什么",
  "Nothing leaves your computer while you record.": "录制过程中不会向外发送任何内容。",
  "When you choose Analyze, the event timeline (window and document titles, URLs, and clipboard previews), plus screen images and narration text if recorded, are sent to the configured analysis provider. GitHub Copilot cloud is the default; a source preview can instead use an explicitly configured custom endpoint.": "选择“分析”后，事件时间线（窗口与文档标题、网址和剪贴板预览）、屏幕图像以及已录制的旁白文本会发送到当前配置的分析服务。默认使用 GitHub Copilot 云端，也可明确配置自定义端点。",
  "By default, before anything is sent, this computer hides sensitive details like passwords, keys, emails, and card or ID numbers from that text and from your screen images. You can turn this off below.": "默认情况下，本机会在发送前隐藏文本和屏幕图像中的密码、密钥、邮箱、银行卡号或证件号等敏感信息。你可以在下方关闭此功能。",
  "Advanced protection": "高级保护",
  "On by default. Before your recording is analyzed, it checks the text and your screen images on this computer and hides sensitive details. Turn it off to send everything as recorded.": "默认开启。分析前会在本机检查文本与屏幕图像并隐藏敏感信息；关闭后将按原始录制内容发送。",
  "It hides sensitive details like passwords, keys, emails, and card or ID numbers, both in the text that is sent (including narration) and in your screen images.": "它会隐藏发送文本（包括旁白）和屏幕图像中的密码、密钥、邮箱、银行卡号或证件号等敏感信息。",
  "Turning it off sends your recording as recorded. That can make the analysis more accurate, but nothing is hidden, so only do it when the recording has nothing sensitive.": "关闭后会发送原始录制内容，分析可能更准确，但不会隐藏任何信息；仅在确认录制中没有敏感内容时使用。",
  "It all runs on this computer.": "全部处理均在本机完成。",
  "On-device model ready": "本机模型已就绪",
  "On-device model not set up yet": "本机模型尚未配置",
  "Setting up the on-device model…": "正在配置本机模型…",
  "Couldn't set up the model": "模型配置失败",
  "Set up now": "立即配置",
  "Retry": "重试",
  "No method is 100% effective. It can miss details or mask the wrong ones. Treat it as a safety net, not a guarantee, and still avoid capturing anything secret.": "任何方法都无法做到百分之百准确，可能漏检或误遮挡。请把它视为安全网而非绝对保证，并继续避免录制任何机密信息。",
  "What it never does": "绝不会做什么",
  "It does not log your keystrokes.": "不会记录你的按键内容。",
  "It only captures while a recording is running. Nothing runs in the background.": "仅在录制进行时采集内容，不会在后台持续运行。",
  "Got it": "知道了",
  "Discard this recording?": "丢弃这次录制？",
  "Screen video, activity, and recorded voice segments will be permanently deleted.": "屏幕视频、操作记录和语音片段将被永久删除。",
  "Keep recording": "继续录制",
  "Discard recording": "丢弃录制",
  "Discarding...": "正在丢弃…",
  "Choose microphone": "选择麦克风",
  "Audio input": "音频输入",
  "Selected": "已选择",
  "System default": "系统默认",
  "Capturing": "录制中",
  "Saving": "保存中",
  "Saving...": "正在保存…",
  "Discarding": "正在丢弃",
  "On": "开启",
  "Off": "关闭",
  "MODEL CONTROL": "模型控制",
  "Choose the mind behind the recording.": "选择理解这次录制的智能模型。",
  "Route analysis, visual understanding, Skills and Automations through Copilot or your own OpenAI-compatible endpoint.": "通过 Copilot 或你自己的 OpenAI 兼容端点完成分析、视觉理解、技能与自动化构建。",
  "Model not set": "尚未设置模型",
  "01 / PROVIDER": "01 / 服务商",
  "Routing": "路由选择",
  "One choice powers every AI workflow in the app.": "一个选择即可驱动应用内全部 AI 工作流。",
  "Analysis provider": "分析服务商",
  "Official managed runtime": "官方托管运行时",
  "Self-hosted or third-party": "自托管或第三方服务",
  "02 / ENDPOINT": "02 / 端点",
  "Connection": "连接设置",
  "Chat Completions + function calling required.": "需要支持 Chat Completions 与函数调用。",
  "Base URL": "基础地址",
  "The app appends /chat/completions when needed.": "需要时应用会自动补充 /chat/completions。",
  "Model ID": "模型 ID",
  "Model presets": "模型预设",
  "Configured model presets": "已配置的模型预设",
  "Globally managed in agent-provider.json": "在 agent-provider.json 中全局管理",
  "READY": "可用",
  "Verified": "已验证",
  "Edit modelPresets in the global JSON file, reload it here, or enter any compatible model ID above.": "可在全局 JSON 文件中编辑 modelPresets 后重新加载，也可以直接输入任意兼容的模型 ID。",
  "API Key": "API 密钥",
  "Stored — enter to replace": "已保存，输入新值可替换",
  "Optional for local endpoints": "本地端点可不填写",
  "Hide": "隐藏",
  "Show": "显示",
  "Encrypted in the operating system credential store.": "已加密保存在操作系统凭据存储中。",
  "Supplied by the process environment.": "由进程环境变量提供。",
  "Saved separately with operating system encryption.": "使用操作系统加密单独保存。",
  "Secure storage unavailable; use the API-key environment variable.": "安全存储不可用，请使用 API 密钥环境变量。",
  "Remove stored key on save": "保存时删除已存密钥",
  "Visual analysis": "视觉分析",
  "Send selected, locally redacted recording frames to the model.": "将选中的、经本机脱敏的录制帧发送给模型。",
  "CONFIG FILE": "配置文件",
  "Open folder": "打开文件夹",
  "Open model settings": "打开模型设置",
  "Reload JSON": "重新加载 JSON",
  "Reloading…": "正在重新加载…",
  "Changes apply immediately": "更改会立即生效",
  "Existing idle model conversations are cleared to prevent cross-provider context.": "为防止跨服务商串联上下文，现有空闲模型会话将被清除。",
  "Test connection": "测试连接",
  "Testing…": "正在测试…",
  "Save & activate": "保存并启用",
  "Activating…": "正在启用…",
  "Configuration reloaded and activated.": "配置已重新加载并启用。",
  "Could not save model settings.": "无法保存模型设置。",
  "Could not reload the configuration file.": "无法重新加载配置文件。",
  "Could not open the folder.": "无法打开文件夹。",
  "Process environment overrides": "进程环境变量覆盖了",
  "Includes private information": "包含隐私信息",
  "This bundle is everything captured in this recording — screen video, screenshots, visited URLs, clipboard contents, and any voice narration and transcript. Share it only with people you trust.": "此文件包包含本次录制的全部内容，包括屏幕视频、截图、访问网址、剪贴板内容以及语音旁白和转写文本。请仅与可信的人分享。",
  "Download .zip": "下载 .zip",
  "Download details for debugging": "下载调试详情",
  "Preparing debug bundle…": "正在准备调试文件包…",
  "Debug bundle saved": "调试文件包已保存",
  "Couldn't save": "保存失败",
  "Sign in to Copilot": "登录 Copilot",
  "Opening…": "正在打开…",
  "A terminal opened — finish signing in there, then try again.": "终端已打开，请在那里完成登录后重试。",
  "Or run this command yourself:": "也可以自行运行以下命令：",
  "Couldn't open a terminal.": "无法打开终端。",
  "Checked for sensitive details before sending": "发送前已检查敏感信息",
  "Review": "查看",
  "Dismiss": "忽略",
  "High risk": "高风险",
  "Possibly sensitive": "可能敏感",
  "Low confidence": "低置信度",
  "Blurred on-screen details": "已模糊屏幕敏感信息",
  "Screen images": "屏幕图像",
};

function preferredLanguage(): UiLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh-CN") return stored;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function getUiLanguage(): UiLanguage {
  return preferredLanguage();
}

function translateDynamic(value: string): string | null {
  let match: RegExpMatchArray | null;
  if ((match = value.match(/^(\d+) events captured$/))) return `已捕获 ${match[1]} 个事件`;
  if ((match = value.match(/^Ready to capture · (.+)$/))) return `准备录制 · ${match[1]}`;
  if ((match = value.match(/^(\d+) ready to analyze$/))) return `${match[1]} 条待分析`;
  if ((match = value.match(/^(\d+) recordings?$/))) return `${match[1]} 条录制`;
  if ((match = value.match(/^(\d+) steps$/))) return `${match[1]} 个步骤`;
  if ((match = value.match(/^(\d+)s$/))) return `${match[1]}秒`;
  if ((match = value.match(/^(\d+)m (\d+)s$/))) return `${match[1]}分${match[2]}秒`;
  if ((match = value.match(/^Review sessions, (\d+) ready to analyze$/))) return `查看会话，${match[1]} 条待分析`;
  if ((match = value.match(/^Review sessions, (\d+) recorded$/))) return `查看会话，共 ${match[1]} 条录制`;
  if (value === "Review sessions, nothing recorded yet") return "查看会话，尚无录制";
  if ((match = value.match(/^Delete recording from (.+)$/))) return `删除 ${match[1]} 的录制`;
  if ((match = value.match(/^Frees (.+) from this device\.$/))) return `将从本机释放 ${match[1]}。`;
  if ((match = value.match(/^(\d[\d,]*) bytes used by this recording$/))) return `本次录制占用 ${match[1]} 字节`;
  if ((match = value.match(/^Using (.+)$/))) return `正在使用 ${match[1]}`;
  if ((match = value.match(/^Next: (.+)$/))) return `下次使用：${match[1]}`;
  if ((match = value.match(/^Listening · (.+)$/))) return `正在聆听 · ${match[1]}`;
  if ((match = value.match(/^Downloading voice model… (\d+)%$/))) return `正在下载语音模型… ${match[1]}%`;
  if ((match = value.match(/^Setting up the on-device model… (\d+)%$/))) return `正在配置本机模型… ${match[1]}%`;
  if ((match = value.match(/^(\d+) READY$/))) return `${match[1]} 个可用`;
  if ((match = value.match(/^(GitHub Copilot|Custom model) is active\. New analyses use this configuration\.$/))) {
    return `${match[1] === "Custom model" ? "自定义模型" : match[1]} 已启用，新的分析将使用此配置。`;
  }
  if ((match = value.match(/^Hid (\d+) sensitive details? before sending$/))) return `发送前已隐藏 ${match[1]} 项敏感信息`;
  if ((match = value.match(/^Blurred (\d+) on-screen areas? in screen images before sending$/))) return `发送前已在屏幕图像中模糊 ${match[1]} 处内容`;
  return null;
}

export function translateUiText(value: string, language: UiLanguage): string {
  if (language === "en") return value;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return value;
  const translated = ZH[normalized] ?? translateDynamic(normalized);
  if (!translated) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

type LanguageContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(preferredLanguage);

  const setLanguage = useCallback((next: UiLanguage) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLanguageState(next);
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: next }));
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent | Event) => {
      if (event instanceof StorageEvent && event.key !== STORAGE_KEY) return;
      const detail = event instanceof CustomEvent ? event.detail : null;
      setLanguageState(detail === "en" || detail === "zh-CN" ? detail : preferredLanguage());
    };
    window.addEventListener("storage", sync);
    window.addEventListener(LANGUAGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(LANGUAGE_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.body.dataset.language = language;
  }, [language]);

  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = (message?: unknown) => {
      const localized = typeof message === "string" ? translateUiText(message, language) : message;
      nativeAlert.call(window, localized);
    };
    return () => {
      window.alert = nativeAlert;
    };
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}

const LOCALIZED_ATTRIBUTES = ["aria-label", "title", "placeholder"] as const;

function shouldSkip(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return Boolean(element?.closest(
    "[data-no-localize], code, pre, [contenteditable='true'], .summary-text, .summary-why, .sensitive-snippet",
  ));
}

export function UiLocalizer({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const languageRef = useRef(language);
  languageRef.current = language;

  useEffect(() => {
    const textOriginals = new Map<Text, string>();
    const attributeOriginals = new Map<Element, Map<string, string>>();
    let applying = false;

    const localizeText = (node: Text) => {
      if (shouldSkip(node)) return;
      const current = node.nodeValue ?? "";
      const prior = textOriginals.get(node);
      if (languageRef.current === "en") {
        if (prior != null && current !== prior) node.nodeValue = prior;
        return;
      }
      if (prior != null && current === translateUiText(prior, "zh-CN")) return;
      const translated = translateUiText(current, "zh-CN");
      if (translated !== current) {
        textOriginals.set(node, current);
        node.nodeValue = translated;
      }
    };

    const localizeElement = (element: Element) => {
      if (shouldSkip(element)) return;
      for (const attribute of LOCALIZED_ATTRIBUTES) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        let originals = attributeOriginals.get(element);
        const prior = originals?.get(attribute);
        if (languageRef.current === "en") {
          if (prior != null && current !== prior) element.setAttribute(attribute, prior);
          continue;
        }
        if (prior != null && current === translateUiText(prior, "zh-CN")) continue;
        const translated = translateUiText(current, "zh-CN");
        if (translated !== current) {
          if (!originals) {
            originals = new Map();
            attributeOriginals.set(element, originals);
          }
          originals.set(attribute, current);
          element.setAttribute(attribute, translated);
        }
      }
    };

    const visit = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        localizeText(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const element = root as Element;
      localizeElement(element);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        if (current.nodeType === Node.TEXT_NODE) localizeText(current as Text);
        else localizeElement(current as Element);
        current = walker.nextNode();
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (applying) return;
      applying = true;
      try {
        for (const mutation of mutations) {
          if (mutation.type === "characterData") localizeText(mutation.target as Text);
          else if (mutation.type === "attributes") localizeElement(mutation.target as Element);
          else mutation.addedNodes.forEach(visit);
        }
      } finally {
        applying = false;
      }
    });

    visit(document.body);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...LOCALIZED_ATTRIBUTES],
    });
    return () => {
      observer.disconnect();
      applying = true;
      for (const [node, original] of textOriginals) {
        if (node.nodeValue !== original) node.nodeValue = original;
      }
      for (const [element, originals] of attributeOriginals) {
        for (const [attribute, original] of originals) {
          if (element.getAttribute(attribute) !== original) {
            element.setAttribute(attribute, original);
          }
        }
      }
      applying = false;
    };
  }, [language]);

  return children;
}

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={language === "zh-CN" ? "界面语言" : "Interface language"}
      data-no-localize
    >
      <span className="language-switcher-label">{language === "zh-CN" ? "界面" : "UI"}</span>
      <button
        type="button"
        className={language === "en" ? "active" : ""}
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={language === "zh-CN" ? "active" : ""}
        aria-pressed={language === "zh-CN"}
        onClick={() => setLanguage("zh-CN")}
      >
        中文
      </button>
    </div>
  );
}
