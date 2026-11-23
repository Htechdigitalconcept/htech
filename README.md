# Htech portfolio

Static futuristic portfolio for Ademola Habeeb / Htech Digital Concepts. No build step or backend is required. The existing typography, colors, copy, mockups, particles, magnetic buttons, tilt, and animated desktop project track are retained.

## Local development

Use Node.js 22 or later:

```sh
npm ci
npm start
```

Open http://localhost:4173. The server binds to all interfaces for hosted previews. Development dependencies are not needed in production.

## Checks

```sh
npm test                         # source, content, links, and vendored asset checks
npx playwright install chromium  # first run only
npm run test:browser             # desktop/mobile, reduced motion, script failures
```

GitHub Actions runs both suites. Browser installation requires access to Playwright's download hosts. Before release, also check keyboard navigation, the contact links, and visual appearance on desktop and a real mobile device. Automated tests do not replace visual review.

## Content and styling

- `index.html`: all copy and styles, followed by progressive-enhancement JavaScript.
- `#track .case`: the five project articles, in their original order. Edit these directly; project content is no longer duplicated in a JavaScript template.
- `h1 .l`: keep visible text and its `data-t` scramble-animation text identical.
- `.proof [data-n]`: keep visible final values consistent with `data-n` and `data-s`.
- `images/`: existing optimized WebP previews and PNG favicon. Keep relative references intact.

Normal desktop sessions retain the pinned horizontal project animation. Without JavaScript, either animation library, or with reduced motion enabled, projects use the same styled cards in a readable vertical layout. System motion preference changes are handled without reloading. Reduced motion also disables smooth anchor scrolling. No new visible controls or copy have been added.

## Runtime dependencies

GSAP and ScrollTrigger 3.12.5 are served locally from `vendor/gsap/`, eliminating the runtime CDN dependency. Upstream copyright/license notices remain in the scripts; see their headers and the vendored upstream README for license information. Google Fonts remains optional; existing system-font fallbacks are unchanged.

To update GSAP deliberately, update its exact version and lockfile, run `npm run vendor:gsap`, review upstream licensing and release notes, then run both test suites. Commit the regenerated vendor assets together with the lockfile. Do not hand-edit vendor files.

## Deployment

Publish `index.html`, `images/`, and `vendor/` together to a static host over HTTPS. Preserve their directory structure. No routing rewrites or secret environment variables are required. Do not publish `node_modules`, tests, or development tooling. No deployment provider/domain is prescribed by this repository.
