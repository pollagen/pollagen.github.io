# Brand assets

The Poll-A-Gen logo: a circular wordmark (**POLL·A·GEN** / *A CENTURY OF
GENOMICS*) around a bee, flanked by two DNA double helices, in the site's
botanical-ink style.

| File | Use |
|------|-----|
| `logo.svg`     | Primary, scalable logo — used for the header mark and the favicon. |
| `logo.png`     | 512×512 transparent raster — social/`og:image` and anywhere a bitmap is needed. |
| `favicon.png`  | 180×180 transparent raster — `apple-touch-icon` / PNG favicon fallback. |

Where it's used on the site:

- **Favicon / touch icon** and **`og:image`** — declared in `index.html` `<head>`.
- **Header** — next to the Poll-A-Gen wordmark (`.brand-logo`).

`logo.svg` is monochrome (`#1c2620`, the site ink colour) on a transparent
background, so it sits cleanly on the warm paper background. To regenerate the
PNGs from the SVG, render `logo.svg` at the desired size with a transparent
background (any SVG rasteriser, e.g. headless Chromium or `rsvg-convert`).

> Note: this SVG is a clean recreation of the supplied logo in the site's line
> style. If you have the original artwork, drop it in here as `logo.png`/`logo.svg`
> (same filenames) and the site will pick it up with no other changes.
