# Packdora artwork pipeline

Server-side pipeline that replaces the single full-dieline Gemini call with a
panel-aware one: each box is a structured SVG dieline, artwork is generated
**per panel** at that panel's bleed-box size, and code (not the model) owns cut,
fold, bleed and safe zone. This branch delivers **phases 0–2** of the developer
brief (`packdora-artwork-pipeline-brief.md`, held by the VibgyorArts PM). The
existing studio and `/api/artwork` route are unchanged in behaviour.

## Modules (`lib/artwork/`)

| Module | What it does |
| --- | --- |
| `types.ts` | Section 4 contract: `Box`, `Panel`, `Job`, `JobBrief`, `Generation`, `Asset`. |
| `config.ts` | Env config and the brief's defaults (3 mm bleed, 3 mm safe, 300 DPI, `CutContour`/`Crease`, FOGRA39). |
| `storage/` | `ObjectStorage` port with Firebase Storage (Admin SDK), local-folder and in-memory adapters. |
| `records/` | `ArtworkRepository` port; v1 stores each record as JSON in object storage. |
| `dieline/` | SVG parser and validator, `registerDieline` (upsert by SKU), geometry helpers, and a draft converter from the studio's Pacdora scene. |
| `prompt/` | Section 6 template (verbatim), role layout map, default logo/text slots, strict renderer. |
| `generate/` | `ImageGenerator` port, Gemini adapter, fake generator, 300 DPI sizing, job runner with retries and a concurrency cap. |
| `brief.ts`, `assets.ts`, `jobs.ts` | Brief validation, vector logo intake, job creation. |

Compose, QA gates and exports (`compose`, `qa`, `export`) are phases 3–5 and are not built yet.

## Dieline SVG conventions

- `viewBox="0 0 {boardWidthMm} {boardHeightMm}"` and `width`/`height` in `mm`. No `transform` attributes.
- One `<g id="panel-{name}">` per panel, containing `#cut-{name}`, `#bleed-{name}`, `#safe-{name}` and any `#fold-{name}-*`.
- Bleed must be `bleedMm` beyond the cut and safe `safeMm` inside it (±0.1 mm; bounding-box test).
- Panel attributes: `data-role`, `data-unprinted="true"`, `data-print-facing`, `data-bleed-mm`, `data-safe-mm`,
  `data-rotation` (0/90/180/270), `data-neighbour-{top|right|bottom|left}="{panel}"` and optional `…-notes`.
- Box attributes on `<svg>`: `data-sku`, `data-name`, `data-style`, `data-finished-{width|depth|height}-mm`.
- Neighbours, roles and the like can also come from a sidecar JSON (`DielineSidecar`).

See `fixtures/artwork/tuck-end.svg`.

## Running it

```bash
npm test                 # vitest; no network, fake image generator
npm run typecheck        # next typegen + tsc --noEmit
npm run artwork -- register fixtures/artwork/tuck-end.svg
npm run artwork -- inspect VA-FIXTURE-TE-70x30x120
npm run artwork -- logo fixtures/artwork/logo.svg
npm run artwork -- generate VA-FIXTURE-TE-70x30x120 fixtures/artwork/sample-brief.json --logo <assetId>
# add --gemini to call Gemini for real (needs GEMINI_API_KEY)
```

Scripts write to `.artwork-data/` (git-ignored) unless a Firebase bucket is configured.

### Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Server only. Same key as `/api/artwork`. |
| `ARTWORK_GEMINI_MODEL` | `gemini-3-pro-image` | TODO(Q2). |
| `ARTWORK_STORAGE` | `firebase` if a bucket is set, else `local` | `firebase`, `local` or `memory`. |
| `ARTWORK_STORAGE_BUCKET` | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | |
| `ARTWORK_STORAGE_PREFIX` | `artwork` | Key prefix inside the bucket. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Application Default Credentials | Admin SDK credentials for Storage. Never commit. |
| `ARTWORK_MAX_ATTEMPTS` / `ARTWORK_CONCURRENCY` | 3 / 2 | TODO(Q9). |

## Open-question defaults (`TODO(Q#)` in code)

- **Q1** Lives in this Next.js/TypeScript repo; assets and records in Firebase Storage under `artwork/`.
- **Q2** `gemini-3-pro-image` via the Interactions API, aspect ratio + 1K/2K/4K tier (no exact pixel sizes); smallest tier reaching 300 DPI.
- **Q3** Dielines are supplied, cleaned SVGs; the Pacdora converter only makes drafts.
- **Q4** Single approver (`approvedBy`); review UI is phase 6.
- **Q6** Default logo slots: front top centre, lid/top centre, back bottom centre; type set later in vector.
- **Q7** `CutContour`, `Crease`, FOGRA39 (used from phase 5).
- **Q8** Illustrations stay 300 DPI raster; panels beyond 4K are flagged `upscaleRequired`.
- **Q9** 3 attempts per panel, 2 panels in parallel, linear back-off; no cost ceiling yet.
- **Q10** Finishing is validated for consistency only; plates are phase 5.
