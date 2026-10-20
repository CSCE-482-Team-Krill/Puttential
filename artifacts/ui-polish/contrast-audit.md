# Rendered UI contrast audit

Chromium, Windows, device scale 1. Colors measured from computed styles with ancestor alpha compositing. Ratios use WCAG relative luminance. Canvas paints are unchanged and are not included in this DOM text audit.

| State | Foreground RGB | Background RGB | Ratio | Minimum |
| --- | --- | --- | --- | --- |
| Body instruction | 83, 103, 91 | 252, 251, 246 | 5.86:1 | 4.5:1 |
| Course label | 36, 54, 47 | 237, 240, 230 | 11.08:1 | 4.5:1 |
| Muted metric label | 83, 103, 91 | 252, 251, 246 | 5.86:1 | 4.5:1 |
| Nav default | 83, 103, 91 | 252, 251, 246 | 5.86:1 | 4.5:1 |
| Play default | 255, 255, 255 | 36, 107, 69 | 6.43:1 | 4.5:1 |
| Play hover | 255, 255, 255 | 28, 84, 54 | 8.86:1 | 4.5:1 |
| OFF field name | 36, 54, 47 | 255, 255, 255 | 12.78:1 | 4.5:1 |
| OFF field state | 83, 103, 91 | 255, 255, 255 | 6.07:1 | 4.5:1 |
| OFF hover state | 83, 103, 91 | 237, 240, 230 | 5.26:1 | 4.5:1 |
| ON field state | 83, 103, 91 | 220, 234, 203 | 4.82:1 | 4.5:1 |
| Selected border | 36, 107, 69 | 220, 234, 203 | 5.11:1 | 3:1 |
| Focus indicator | 36, 107, 69 | 220, 234, 203 | 5.11:1 | 3:1 |
| Disabled ON field name | 36, 54, 47 | 220, 234, 203 | 10.14:1 | 4.5:1 |
| Disabled ON field state | 83, 103, 91 | 220, 234, 203 | 4.82:1 | 4.5:1 |
| Import warning | 183, 86, 56 | 252, 251, 246 | 4.60:1 | 4.5:1 |
| Modal heading | 36, 54, 47 | 237, 240, 230 | 11.08:1 | 4.5:1 |
| Modal unavailable text | 83, 103, 91 | 252, 251, 246 | 5.86:1 | 4.5:1 |
| OFF switch thumb | 83, 103, 91 | 230, 233, 226 | 4.95:1 | 3:1 |
| ON switch thumb | 255, 255, 255 | 36, 107, 69 | 6.43:1 | 3:1 |

Palette tokens were not altered. The API notice uses paper behind warning text; warning on turf-soft would fall below 4.5:1. Existing canvas field-placement keyboard limitations prevent a whole-game accessibility certification.
