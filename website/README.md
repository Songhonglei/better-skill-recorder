# Project website

Static Chinese and English download and onboarding pages, deployed by `.github/workflows/pages.yml`.
No application credentials, analytics or API calls are used. Google Fonts provides Noto
Sans SC and DM Sans; local sans fallbacks keep the page usable if unavailable.

Design: restrained product walkthrough, pale sage / deep teal with a coral recording
point. DFII: impact 4 + fit 5 + feasibility 5 + performance 4 − consistency risk 4 = 14.
A localized logo visual alternates with a concrete narration-to-Skill example every
2.5 seconds. Hover, keyboard focus, or a hidden tab pauses playback; explicit playback
and slide controls are provided. Reduced-motion preferences disable autoplay.
The heading is deliberately
compact, with separate beginner benefits and expert features. DM Sans supplies the
English display character; Noto Sans SC keeps Chinese readable. Spacing follows an 8px
rhythm; carousel transitions and hover motion respect reduced-motion settings.

Edit `content.mjs`, then run `node scripts/build-website.mjs` to generate `index.html`,
`en.html` and `docs/AGENT_INSTALL.md`. Both language pages are readable without JavaScript;
`site.js` copies the localized installation prompt and preserves anchors on language switch.
Release URL, filename and SHA-256 are maintained together in `content.mjs`.
Run `python3 scripts/verify-website.py` against the local server to test both languages,
clipboard success/failure, keyboard navigation, FAQ and responsive layout.

Local preview: `python3 -m http.server 8765 --directory website`

Release: push website changes to `main`; GitHub Pages must use GitHub Actions as its build source.
