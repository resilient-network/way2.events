# Lighthouse performance plan

## Summary and goals

- Current scores: FCP 0.07, LCP 0, Speed Index 0, TTI 0.14; TBT, FID, and CLS are strong.
- Goal: Improve FCP, LCP, Speed Index, and TTI on slow networks by reducing payload, optimizing LCP, and shortening critical request chains.

## Root causes (from audit)

- **LCP (11.6 s):** `embrace.webp` is the LCP element; about 10.6 s load duration; LCP request discovery and render-blocking audits failed.
- **Payload:** `tg-proto-sizzle.webm` about 3.15 MB, `demo-walkthrough-loop.webm` about 0.32 MB; total byte weight score 0.5.
- **JavaScript:** Main Astro bundle (`index.astro_astro_type_script_index_0_lang.*.js`) about 413 ms CPU time, about 20 KiB unused (44.82%); render-blocking resources score 0.5; critical request chains score 0 (long chain including main JS and `cdn-cgi/rum`).
- **Caching:** Long cache lifetime audit score 0.5 (repeat visits).
- **Fonts:** InstrumentSans and InclusiveSans variable fonts noted for layout shifts; `font-display: swap` already in [`src/components/layout/BaseHead.astro`](src/components/layout/BaseHead.astro); consider size adjustment and optional font metric overrides.
- **Third party:** Cloudflare beacon and rum are in the critical path (`static.cloudflareinsights.com`, `cdn-cgi/rum`).

## Recommended actions (prioritized)

### P0 - LCP (use existing image pipeline)

- **Use the Astro image pipeline for the hero image.** The project already has an image optimization pipeline: Sharp via [`astro.config.ts`](astro.config.ts) and [`src/utils/image-config.ts`](src/utils/image-config.ts) (webp and avif, quality 85), and [`src/components/ui/ImageOptimizer.astro`](src/components/ui/ImageOptimizer.astro) which uses `astro:assets` `<Image>` with `priority`, `format`, `quality`, and `sizes`.
- Astro does **not** process images in `public/`; only imported assets (for example from `src/assets/`) are transformed. Move or import the hero image into `src/assets/`, then render it with `ImageOptimizer` (or `astro:assets` `<Image>` / `<Picture>`) with `priority={true}` so the build outputs optimized, responsive variants (`srcset`, webp/avif) and correct `fetchpriority="high"` and `loading="eager"`.
- Update the LCP preload in [`src/components/layout/BaseHead.astro`](src/components/layout/BaseHead.astro) to match the optimized image URL (or use Astro's built-in preload behavior if emitted by the component).
- Ensure the LCP image is discoverable from HTML (no JS-dependent loading).

### P1 - Video payload

- Defer loading of below-the-fold videos so they do not compete with LCP: in [`src/pages/index.astro`](src/pages/index.astro), `tg-proto-sizzle.webm` and `demo-walkthrough-loop.webm` are currently loaded eagerly. Use `preload="none"` and set `src` (or use poster/placeholder) only when the video enters viewport (Intersection Observer).
- Re-encode or replace `tg-proto-sizzle.webm` (3.15 MB) with a much smaller variant (shorter clip, lower resolution, lower bitrate) or use a static image/GIF for slow connections when appropriate.

### P2 - JavaScript and critical path

- Reduce main-thread work: trim or code-split inline scripts in [`src/pages/index.astro`](src/pages/index.astro) (scroll-reveal, network transition, GSAP stacking cards).
- Consider loading GSAP and ScrollTrigger only when sections that need them are near viewport, or replacing with lighter CSS and Intersection Observer patterns where possible.
- Address critical request chains: defer or async-load non-critical JS so the main document and LCP resource are not blocked by long chains (including Cloudflare rum). Keep only essential scripts in the critical path.
- Review Astro build output for the main bundle: ensure tree-shaking and no duplicate or unnecessary dependencies to reduce unused JS (about 20 KiB indicated).

### P3 - Caching

- Configure cache headers for static assets (fonts, media, JS, CSS) on the `gh-pages` deployment (for example via Cloudflare Pages or GitHub Pages configuration) so repeat visits benefit from long TTLs.

### P4 - Third party and fonts

- Cloudflare beacon and rum: if controlled by hosting config, defer or move to after load so it does not extend the critical chain; document any platform constraints.
- Fonts: `font-display: swap` is already in place. Optionally add `size-adjust` and related metric overrides in `@font-face` to reduce CLS, and consider loading only one variable font initially if both are not needed above the fold.

## Verification

- Re-run Lighthouse on desktop with slow 4G (or equivalent slow profile) for the same URL after each major change.
- Compare FCP, LCP, Speed Index, TTI, and these audits:
  - LCP request discovery
  - Critical request chains
  - Render-blocking resources

## References

- Key files:
  - [`src/pages/index.astro`](src/pages/index.astro)
  - [`src/components/layout/BaseHead.astro`](src/components/layout/BaseHead.astro)
  - [`src/components/ui/ImageOptimizer.astro`](src/components/ui/ImageOptimizer.astro)
  - [`src/utils/image-config.ts`](src/utils/image-config.ts)
  - [`astro.config.ts`](astro.config.ts)
- Astro docs:
  - [Images](https://docs.astro.build/en/guides/images)
  - [astro:assets](https://docs.astro.build/en/reference/modules/astro-assets)
- Lighthouse audit context: desktop, slow Wi-Fi; Lighthouse 13.0.1.
