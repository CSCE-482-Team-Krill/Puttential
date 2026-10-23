# Full-height play area

The bottom details/controls panel is removed. The course name appears at the top left of the course header, and the desktop canvas extends to the bottom of its column. Play and Reset layout are the only buttons moved into the force-block sidebar. Force inventory scrolls independently while the run controls remain available.

Help remains in the main navigation. Local-course import is available from Settings, preserving the editor export/import workflow. Save and interaction announcements remain available to screen readers without reserving a footer row. The Settings focus trap excludes its hidden file input.

## Visual review

- [Desktop before](before-1440.png) / [desktop after](after-1440.png)
- [Mobile before](before-390.png) / [mobile after](after-390.png)
- [Narrow mobile after](after-320.png)
- [Layout measurements](after-checks.json)

Screenshots use a deterministic three-block daily fixture. The review script checks six viewport widths, title placement, absence of the old footer and metrics, exactly two sidebar action buttons, canvas/sidebar bottom alignment, Reset layout, home navigation, and Help. Browser runtime errors are captured in the measurements file.

The frontend/browser suite also covers short laptop heights, empty and long inventories, pointer placement across resizes, saved runs, dialog focus, local imports, text reflow, and contrast. Its output is stored under `checks/` without replacing prior review artifacts.

Validation: all 29 frontend/browser tests passed; the production game build, TypeScript checks, formatting checks, and `git diff --check` passed. The temporary development server was stopped after verification.

Run with the game development server active:

```powershell
node --import tsx artifacts/play-area-layout/review.mjs after
$env:PUTTENTIAL_REVIEW_ARTIFACTS = 'artifacts/play-area-layout/checks'
npx.cmd playwright test --config artifacts/play-area-layout/playwright.config.ts
```
