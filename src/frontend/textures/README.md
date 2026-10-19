# Liquid textures

`water-tile.png` and `lava-tile.png` are 256 × 256 PNG assets shared by the editor and game. They were adapted from the user's original blue and orange reference images using the built-in imagegen tool, then resized and PNG-compressed for runtime use. The renderer builds a mirrored 2 × 2 atlas from each source so every repeating boundary joins exactly. Patterns are world-anchored, cached, clipped to the object outline, and rendered beneath bodies and as a light surface overlay above them.

The images are opaque; the renderer controls transparency so submerged bodies remain readable. Reduced motion pauses surface drift.

## Final lava prompt

Use case: precise-object-edit. Asset type: seamless repeating 2D game lava surface texture. Edit the supplied tiny orange lava texture into a clean square seamless tile with matching left/right and top/bottom edges. Preserve the original flat orange base and brighter yellow-orange irregular wavy cellular vein motif, soft simple line work and low-detail playful game appearance. Straight top-down, uniform lighting, no borders, no perspective, no objects, no text. Tile must repeat without visible seams. Keep this a small simple texture, not realistic lava and not elaborate painting. Opaque texture; transparency will be controlled by the game renderer. Save the edited texture as a PNG.

## Final water prompt

Use case: precise-object-edit. Asset type: seamless repeating 2D game water surface texture. Edit the supplied tiny blue water texture into a clean square seamless tile with matching left/right and top/bottom edges. Preserve the original saturated medium blue base and brighter blue irregular wavy cellular ripple motif, simple soft lines and low-detail playful game appearance. Straight top-down uniform lighting, no borders, no perspective, no objects, no text. Tile must repeat without visible seams. Keep it a small simple texture, not realistic water and not an elaborate painting. Opaque texture; translucency will be controlled by the game renderer. Save the edited texture as a PNG.
