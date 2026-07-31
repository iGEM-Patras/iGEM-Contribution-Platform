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

## Configuration

Copy `.env.example` to `.env` and fill in the Airtable and Cloudinary values:

```bash
cp .env.example .env
```

Vite reads `.env` once at startup — restart the dev server after any change.

## Submission flow

1. Files upload to Cloudinary via an unsigned preset ([src/utils/fileUpload.js](src/utils/fileUpload.js))
2. The resulting URLs plus an 8-character verification code are written to
   Airtable with `Status = Pending` ([src/utils/airtable.js](src/utils/airtable.js))
3. The code is shown once on the success screen

Secondary image URLs are stored as a JSON array in a long-text field. `Submitted At`
is an Airtable *Created time* field — computed server-side, never written by this app.

## Deployment note — read before pushing env vars to CI

Vite **inlines** every `VITE_*` variable into the production bundle as a literal
string. Cloudinary's unsigned preset is designed for that and is safe to expose.
`VITE_AIRTABLE_TOKEN` is not: it is a write credential, and publishing it lets
anyone who opens devtools read, insert, or delete records in the base.

So the current setup is safe for local development but **not** for the public
Pages site. Before deploying submissions, move the Airtable call behind a
serverless function (Cloudflare Workers / Netlify / Vercel) that holds the token
server-side, and have the browser POST to that instead. Until then, do not add
`VITE_AIRTABLE_TOKEN` to the GitHub Actions workflow.

If a token is ever committed or deployed, rotate it at
<https://airtable.com/create/tokens> — deleting the commit does not revoke it.
