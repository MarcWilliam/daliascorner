# Local site fonts

These are the exact WOFF2 files from the last successful local Next.js Google
Fonts build, now checked in so builds and page loads need no Google Fonts access.
`fonts.css` preserves the emitted subsets, weights, swap behavior and Arial
fallback metrics. The layout preloads only Baloo Bhaijaan 2 Arabic and Cairo
Arabic/Latin, matching the previous configuration. Relative font URLs and the
layout's `asset()` helper support both root and subpath deployments.

Families: Baloo 2 (600/700/800), Baloo Bhaijaan 2 (600/700/800), and Cairo
(400/500/600/700). Their SIL Open Font Licenses are included alongside the files,
from https://github.com/google/fonts/tree/main/ofl (baloo2, baloobhaijaan2, cairo).

Keep the CSS variables unchanged when updating fonts; the existing theme uses
`--font-baloo2`, `--font-baloo-bhaijaan2`, and `--font-cairo`.
