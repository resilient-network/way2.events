# Totem Grid → Way2 Migration Checklist

## Domain & Infrastructure
- [ ] CNAME: Change `totemgrid.io` → new Way2 domain
- [ ] Update `src/config.ts` website URL
- [ ] Update any hardcoded totemgrid.io links

## Branding Assets (public/brand/)
- [ ] Replace `logotype.svg` with Way2 logo
- [ ] Replace `logoshape.svg` with Way2 symbol
- [ ] Replace `totem-logotype.png`
- [ ] Update or remove `we-are-all-connected-totem-grid-manifesto.pdf`
- [ ] Replace `festival-totem-card.png` in public/media/

## Config & Meta
- [ ] `src/config.ts`: Update site name, author, social links
- [ ] `src/config.ts`: Rename `totemGrid` config object → `way2`

## Page Titles & Descriptions
Files needing title/meta updates:
- [ ] `src/pages/index.astro` — main homepage
- [ ] `src/pages/404.astro`
- [ ] `src/pages/getapp.astro`
- [ ] `src/pages/mission.astro`
- [ ] `src/pages/join.astro`
- [ ] `src/pages/partner-up.astro`
- [ ] `src/pages/attendees.astro`
- [ ] `src/pages/child-safety.astro`
- [ ] `src/pages/privacy-policy.astro`
- [ ] `src/pages/requestingAccountRemoval.astro`
- [ ] `src/pages/dry-run.astro`
- [ ] `src/pages/nye.astro`
- [ ] `src/pages/amplitude-2025.astro`

## Components with Totem References
- [ ] `src/components/layout/Footer.astro` — logo alt text, aria labels
- [ ] `src/components/layout/BaseHead.astro` — meta tags
- [ ] `src/components/widgets/Hero.astro`
- [ ] `src/components/widgets/CTASection.astro`
- [ ] `src/components/widgets/VideoDemo.astro`

## Copy & Messaging
- [ ] Review all page copy for "Totem Grid" mentions
- [ ] Update taglines if needed (current: "Lose Yourself, Not Your Friends")
- [ ] Update CTA button labels and aria-labels
- [ ] Update form links (Google Forms beta signup)

## Styles
- [ ] `src/styles/global.css` — any Totem-specific class names
- [ ] `src/styles/colors.css` — review color palette against Way2/Resilient
- [ ] `src/styles/fonts.css` — align with Fabric typography

## Legal Pages
- [ ] Privacy policy — company name references
- [ ] Child safety policy — company name references
- [ ] Account removal page — company name references

## External Links
- [ ] App store links (if applicable)
- [ ] Social media links
- [ ] Google Form URLs

## Design Alignment
- [ ] Apply Resilient color palette
- [ ] Apply Fabric typography scales
- [ ] Match mission-critical design aesthetic

---
Total files with "totem" references: 21
Total occurrences: ~106
