import { writeFileSync } from 'node:fs';
import { content, installationPrompt, release } from '../website/content.mjs';

const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const repo = release.repo;
const asset = name => `${repo}/releases/download/${release.tag}/${name}`;
const mark = '<span class="pulse small" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></span>';
for (const [locale, c] of Object.entries(content)) {
  const page = locale === 'zh' ? 'index.html' : 'en.html';
  writeFileSync(new URL(`../website/${page}`, import.meta.url), `<!doctype html>
<html lang="${c.lang}">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escape(c.description)}"><meta name="theme-color" content="#112b29">
  <title>${c.title}</title>
  <link rel="alternate" hreflang="zh-CN" href="https://songhonglei.github.io/better-skill-recorder/">
  <link rel="alternate" hreflang="en" href="https://songhonglei.github.io/better-skill-recorder/en.html">
  <link rel="stylesheet" href="style.css"><script src="site.js" defer></script>
</head>
<body>
  <a class="skip" href="#main">${c.skip}</a>
  <header class="wrap">
    <a class="brand" href="${page}">${mark}Better Skill Recorder</a>
    <nav aria-label="${locale === 'zh' ? '主导航' : 'Main navigation'}">
      <a href="#start">${c.nav[0]}</a><a href="#install">${c.nav[1]}</a><a href="${repo}">GitHub ↗</a>
      <a class="language" href="${c.otherPage}" aria-label="${c.otherLabel}" lang="${locale === 'zh' ? 'en' : 'zh-CN'}">${c.other}</a>
    </nav>
  </header>
  <main id="main">
    <section class="hero wrap">
      <div class="intro">
        <p class="eyebrow">BETTER SKILL RECORDER · ${release.version.toUpperCase()}</p>
        <h1>${c.headline[0]}<span>${c.headline[1]}</span></h1>
        <p class="lead">${c.lead}</p>
        <div class="actions"><a class="button primary" href="${asset(release.filename)}">${c.download} ↓</a><a class="button secondary" href="#agent-install">${c.agentButton} ↗</a></div>
        <p class="caption">${c.platform}</p>
        <ul class="feature-list">${c.features.map(f => `<li>${f}</li>`).join('')}</ul>
      </div>
      <section class="hero-carousel" aria-label="${locale === 'zh' ? '产品展示' : 'Product showcase'}" aria-roledescription="${locale === 'zh' ? '轮播' : 'carousel'}">
      <div class="carousel-stage">
      <div class="brand-slide carousel-slide" data-slide="0" role="group" aria-label="${locale === 'zh' ? '1 / 2：品牌视觉' : '1 of 2: Brand visual'}">
        <div class="brand-slide-top"><span>WORKFLOW / 01</span><span>● CAPTURE</span></div>
        <span class="pulse large" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></span>
        <div class="brand-slide-bottom"><h2>${locale === 'zh' ? '让经验可以被复用' : 'Make your know-how reusable'}</h2><p>${locale === 'zh' ? '真实操作　→　有序步骤　→　SKILL' : 'REAL WORK　→　CLEAR STEPS　→　SKILL'}</p></div>
      </div>
      <div class="workflow-demo carousel-slide" data-slide="1" role="group" aria-label="${locale === 'zh' ? '2 / 2：一个小例子' : '2 of 2: A simple example'}" aria-hidden="true" inert>
        <div class="demo-heading"><span class="record-dot" aria-hidden="true"></span><span>${c.example}</span><span class="demo-time">00:28</span></div>
        <h2>${c.exampleName}</h2>
        <div class="voice"><span class="wave" aria-hidden="true">▂ ▅ ▃ ▇ ▄ ▂ ▆ ▃</span><p>${c.narration}</p><small>${c.input}</small></div>
        <div class="generated"><div class="generated-heading"><span aria-hidden="true">↳</span> ${c.output}<span class="file-tag">SKILL.md</span></div><ol>${c.sampleSteps.map(s => `<li>${s}</li>`).join('')}</ol></div>
        <p class="demo-caption">${c.exampleNote}</p>
      </div>
      </div>
      <div class="carousel-controls"><button type="button" class="slide-dot" data-go="0" aria-current="true" aria-label="${locale === 'zh' ? '显示品牌视觉' : 'Show brand visual'}"></button><button type="button" class="slide-dot" data-go="1" aria-label="${locale === 'zh' ? '显示一个小例子' : 'Show example'}"></button><button type="button" class="carousel-toggle" data-pause="${locale === 'zh' ? '暂停轮播' : 'Pause slideshow'}" data-play="${locale === 'zh' ? '播放轮播' : 'Play slideshow'}">${locale === 'zh' ? '暂停轮播' : 'Pause slideshow'}</button></div>
      </section>
    </section>
    <section class="section wrap" id="start">
      <div class="section-heading"><p class="eyebrow">RECORD → REVIEW → EXPORT</p><h2>${c.flowTitle}</h2><p>${c.flowSub}</p></div>
      <ol class="steps">${c.steps.map(([h,p],i) => `<li><span class="number">0${i+1}</span><h3>${h}</h3><p>${p}</p></li>`).join('')}</ol>
    </section>
    <section class="install-section" id="install"><div class="wrap">
      <div class="section-heading"><p class="eyebrow">GET STARTED</p><h2>${c.installTitle}</h2><p>${c.installSub}</p></div>
      <div class="install-grid">
        <article class="manual-install"><h3>${c.manualTitle}</h3><p class="muted">${c.manualSub}</p><ol class="install-list">
          ${c.installSteps.map(([h,p],i) => `<li><h4>${h}</h4><p>${p}</p>${i === 0 ? `<code>shasum -a 256 -c SHA256SUMS.txt</code><a href="${asset('SHA256SUMS.txt')}">${c.checksum} ↗</a>` : ''}</li>`).join('')}
        </ol><a class="text-link" href="${repo}/blob/main/${c.guidePath}">${c.guide} ↗</a></article>
        <article class="agent-install" id="agent-install"><div class="agent-heading"><span class="agent-symbol" aria-hidden="true">&gt;_</span><h3>${c.agentTitle}</h3></div><p>${c.agentSub}</p>
          <label class="sr-only" for="agent-prompt">${c.promptLabel}</label><textarea id="agent-prompt" readonly spellcheck="false">${escape(installationPrompt(locale))}</textarea>
          <button type="button" class="button primary" id="copy-prompt" data-copied="${c.copied}" data-error="${c.copyFailed}">${c.copy}</button><p id="copy-status" class="copy-status" role="status" aria-live="polite"></p>
          <p class="agent-note">${c.agentNote}</p>
        </article>
      </div>
    </div></section>
    <section class="section wrap details"><div><p class="eyebrow">CONTROL STAYS WITH YOU</p><h2>${c.controlsTitle}</h2><p>${c.controlsSub}</p><a class="text-link" href="${repo}/blob/main/docs/ADVANCED_SETTINGS.md">${c.settingsLink} ↗</a></div><dl>${c.settings.map(([t,v,p]) => `<div><dt>${t}</dt><dd>${v}<span>${p}</span></dd></div>`).join('')}</dl></section>
    <section class="wrap faq"><h2>${c.faqTitle}</h2>${c.faq.map(([h,p]) => `<details><summary>${h}</summary><p>${p}</p></details>`).join('')}<a class="text-link" href="${repo}/issues">${c.issue} ↗</a></section>
  </main>
  <footer class="wrap"><div class="footer-brand"><strong>Better Skill Recorder</strong><small>${release.version} · MIT</small><p>${c.attribution} <a href="https://github.com/microsoft/skill-recorder">Microsoft Skill Recorder ↗</a><br>${c.attributionEnd}</p></div><nav aria-label="${locale === 'zh' ? '页脚导航' : 'Footer navigation'}"><a href="${repo}">${c.source}</a><a href="${repo}/blob/main/THIRD-PARTY-NOTICES.md">${c.notices}</a><a href="${repo}/blob/main/SECURITY.md">${c.security}</a></nav></footer>
</body>
</html>
`);
}
console.log('Generated Chinese and English project pages');
writeFileSync(new URL('../docs/AGENT_INSTALL.md', import.meta.url), `# Agent installation / Agent 安装

Copy the prompt in your language to an agent with terminal and local file access.
复制对应语言的提示词，交给具备终端与本地文件操作能力的 Agent。
The agent must not bypass macOS security controls or handle your credentials.
系统授权和密钥输入由用户完成，已有 App 替换前需确认并备份。

## 中文

\`\`\`text
${installationPrompt('zh')}
\`\`\`

## English

\`\`\`text
${installationPrompt('en')}
\`\`\`

Generated from website/content.mjs by scripts/build-website.mjs. Update the release
metadata and rebuild these instructions together when publishing a new app version.
`);
