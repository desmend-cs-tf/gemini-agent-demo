# Gemini Classroom

A basic two-file teaching demo for Google Gemini API keys, system prompts, user prompts, and generation settings.

## Classroom demo

- The complete standalone application is `artifacts/gemini-classroom/server.mjs` and `artifacts/gemini-classroom/index.html`. Copy just these two files into a folder and run `node server.mjs` with Node.js 22+; no packages needed.
- Set `GEMINI_API_KEY` using Replit Secrets, then restart `artifacts/gemini-classroom: web`. The page works as a teaching guide without a key; generation explicitly requires a real key.
- Run the managed classroom workflow for preview. The template's shared API server and database are unused.
- Keep this teaching example small: the user requested one or two files, not a complex app.
- The server makes real requests to Google's Gemini API, not the Replit AI proxy, because obtaining and using a Google API key is the lesson.
- This unauthenticated demo is for a controlled classroom, not public use with a shared billable key. It has a modest shared request limit, not production authentication.
- Prompts and results are not saved by this app. Google processes the submitted content; avoid personal student data and review Google's current terms, eligibility, pricing, and quotas.

## Run & Operate

- Managed preview: `artifacts/gemini-classroom: web`.
- Standalone: `cd artifacts/gemini-classroom && node server.mjs`.
- Syntax check: `node --check artifacts/gemini-classroom/server.mjs`.
- The default standalone port is 3000; the managed workflow supplies `PORT` and `BASE_PATH`.
- No database is needed. Only `GEMINI_API_KEY` is required for generation.

## Stack

- Classroom application: Node.js built-in HTTP and fetch, vanilla HTML/CSS/JavaScript. No installation or build step needed for the two-file standalone version.
- The repository includes unused Replit template scaffolding; it is not part of the teaching example.
