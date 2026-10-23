# Force direction hint review

The planning preview now uses only the first half second of simulation, even if a course requests a longer prediction. It shows the initial direction with three black, 6px dots and a short arrow, placed beyond the body's edge. It does not trace later bounces or the route to the goal.

- [Before: practice course with the full route](practice-before.png)
- [After: short hint on desktop](black-dots-desktop.png)
- [After: short hint on mobile](black-dots-mobile.png)

The screenshots use the Bar Around Corner practice course with both force fields enabled at their authored positions, at 1500×1050 and 390×844 viewports. They were inspected at native size.

Validation:

- Production build, TypeScript, Prettier and `git diff --check` passed.
- All three direction hint regression tests passed, covering slow movement, body-edge clearance, display scale, route concealment and stationary/disabled previews.
- Browser checks confirmed exactly three visible black dots with 3px radius on desktop and mobile. The horizontal-force layout was also checked, and disabling the preview hides the hint.
- The full Node suite passed 31 of 32 tests. The unchanged repository persistence test fails when creating a file symlink with Windows `EPERM`, including outside the sandbox.
