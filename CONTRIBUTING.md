# Contributing

Contributions are welcome. Open a pull request with a focused change, explain
the user-visible effect, and include the checks relevant to the files changed.
Do not submit secrets, private data, proprietary source material, or content
whose redistribution rights are unclear.

## Content and source requirements

For each change to `data/`:

1. Cite the primary source, exact edition or effective date, and relevant
   section or page. Include the official source URL where the data format allows.
2. Keep questions, explanations, and flashcards original. Paraphrasing a rule
   for study is preferable to copying long passages; citations do not grant
   permission to reproduce text, figures, tables, charts, or standards.
3. Inspect the full source document for copyright notices and incorporated
   third-party material before adding extracted text or figures. Follow
   [the source and content notices](THIRD_PARTY_NOTICES.md). If rights are
   uncertain, add the official catalog link and metadata only, and leave the
   source text or asset out.
4. Preserve upstream notices and attribution. Do not describe government or
   third-party source material as project-owned or MIT-licensed.

For changes to scripts that refresh public source data, include a check that
prevents known excluded material from re-entering the offline dataset. A source
update is not a rights review.

## Development checks

Use Node.js 22 or later with the repository's pinned pnpm version, and use `uv`
for Python scripts. Install dependencies from the lockfiles:

```bash
cd web
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

For Python scripts:

```bash
cd scripts
uv sync --frozen
uv run ruff check .
uv run pytest -q
```

Run the complete repository check when your environment supports all platforms:

```bash
./test.sh
```

If a check cannot run, state why and identify the checks you did run. For data
changes, regenerate search indexes with `node scripts/build_inverted_index.js`
and sync mobile data with `./scripts/sync-data.sh all` when needed.

## License for contributions

By submitting a contribution, you agree that original work you own or are
authorized to contribute may be distributed under this repository's MIT
License. This does not grant permission to include material owned by another
party. Identify and document any exception before submitting it.
