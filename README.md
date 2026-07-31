# iGEM Contribution Platform

A submission form where iGEM teams upload their game to the community gallery:
team details, a main image, up to three additional images, and a rules PDF.

Built with React 19, Vite and Tailwind CSS v4.

## Getting started

```bash
npm install
npm run dev
```

| Script            | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Start the dev server with HMR                 |
| `npm run build`   | Production build into `dist/`                 |
| `npm run preview` | Serve the production build locally            |
| `npm run lint`    | Run ESLint over the project                   |

## Styling

Tailwind v4 is wired in through the `@tailwindcss/vite` plugin and configured
from CSS in [src/index.css](src/index.css) — there is no `tailwind.config.js`.
To customise the theme, use `@theme` in that file.

## Deployment

Pushes to `main` build and publish to GitHub Pages via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). The site is served
from a subpath, so `base` in [vite.config.js](vite.config.js) must match the
repository name.

## Status

Submissions are validated client-side but not yet persisted — `handleSubmit` in
[src/App.jsx](src/App.jsx) simulates the request. Wiring it to Airtable is the
next step (`axios` is already installed for it).
