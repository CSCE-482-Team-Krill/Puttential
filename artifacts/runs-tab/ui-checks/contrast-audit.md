# Rendered UI contrast audit

Chromium, Windows, device scale 1. Colors measured from computed styles with ancestor alpha compositing. Ratios use WCAG relative luminance. Canvas paints are not included in this DOM text audit.

| State | Foreground RGB | Background RGB | Ratio | Minimum |
| --- | --- | --- | --- | --- |
| Body instruction | 86, 103, 104 | 238, 242, 235 | 5.24:1 | 4.5:1 |
| Course label | 45, 58, 58 | 238, 242, 235 | 10.43:1 | 4.5:1 |
| Toolkit note | 86, 103, 104 | 238, 242, 235 | 5.24:1 | 4.5:1 |
| Nav default | 86, 103, 104 | 248, 249, 244 | 5.61:1 | 4.5:1 |
| Play default | 255, 255, 255 | 46, 125, 50 | 5.13:1 | 4.5:1 |
| Play hover | 255, 255, 255 | 37, 104, 42 | 6.79:1 | 4.5:1 |
| OFF field name | 45, 58, 58 | 255, 255, 255 | 11.81:1 | 4.5:1 |
| OFF field state | 86, 103, 104 | 255, 255, 255 | 5.94:1 | 4.5:1 |
| OFF hover state | 86, 103, 104 | 238, 242, 235 | 5.24:1 | 4.5:1 |
| ON field state | 86, 103, 104 | 223, 243, 217 | 5.08:1 | 4.5:1 |
| Selected border | 46, 125, 50 | 223, 243, 217 | 4.39:1 | 3:1 |
| Focus indicator | 46, 125, 50 | 223, 243, 217 | 4.39:1 | 3:1 |
| Disabled ON field name | 45, 58, 58 | 223, 243, 217 | 10.10:1 | 4.5:1 |
| Disabled ON field state | 86, 103, 104 | 223, 243, 217 | 5.08:1 | 4.5:1 |
| Import warning | 166, 63, 63 | 248, 249, 244 | 5.83:1 | 4.5:1 |
| Modal heading | 45, 58, 58 | 238, 242, 235 | 10.43:1 | 4.5:1 |
| Modal unavailable text | 45, 58, 58 | 248, 249, 244 | 11.16:1 | 4.5:1 |
| OFF switch thumb | 86, 103, 104 | 228, 233, 226 | 4.82:1 | 3:1 |
| ON switch thumb | 255, 255, 255 | 46, 125, 50 | 5.13:1 | 3:1 |

The reference palette uses darker muted and coral companions for readable text. Existing canvas field-placement keyboard limitations prevent a whole-game accessibility certification.
