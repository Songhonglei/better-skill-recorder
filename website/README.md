# Project website

Static Chinese-first download and onboarding page, deployed by `.github/workflows/pages.yml`.
No application credentials, analytics or API calls are used. Google Fonts provides Noto
Sans SC and Noto Serif SC; local serif/sans fallbacks keep the page usable if unavailable.

Design: restrained editorial product guide, pale sage / deep teal with a coral recording
point. DFII: impact 4 + fit 5 + feasibility 5 + performance 4 − consistency risk 4 = 14.
The pulse symbol and asymmetric recording panel connect the site to the app identity.
Spacing follows an 8px rhythm; typography distinguishes reading instructions from the
display headline; motion is limited to button hover and respects reduced-motion settings.

Update version-specific download URLs in `index.html` when publishing a new preview.
Test at 1440px, 390px and 320px: no horizontal overflow, working FAQ, and valid links.

Local preview: `python3 -m http.server 8765 --directory website`

Release: push website changes to `main`; GitHub Pages must use GitHub Actions as its build source.
