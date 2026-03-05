# Project memory

This project uses `machine-memory` for persistent agent context stored at `.agents/memory.db`.

## One-sweep workflow (use this every task)

1. **Scan relevant context fast (compact mode)**
   - `machine-memory suggest --files "<paths you'll touch>" --brief`
   - `machine-memory query "<feature/topic>" --brief`
   - `machine-memory list --tags "<domain>" --brief`
   - Run this sweep once per task; repeat only if touched paths or scope materially change.
   - Use `machine-memory get <id>` only when you need full detail.

2. **If your inference may conflict, verify before editing memory**
   - `machine-memory verify <id> "<inferred fact>"`
   - `machine-memory diff <id> "<proposed updated wording>"`

3. **Maintain memories while implementing**
   - Prefer one canonical memory per feature thread:
     - `machine-memory update --match "topic query" "new canonical content"`
     - If no reliable match exists, create with `machine-memory add ... --upsert-match "topic query"` so repeated writes update instead of duplicating.
   - Add new durable knowledge (prefer path-driven tagging):
     - `machine-memory add "..." --path "documentation/content/docs/guides/example.mdx" --context "why it matters" --type "decision|reference|status|..." --certainty "verified|inferred|speculative"`
     - If path mapping is unavailable, use `--tags "area:...,topic:...,kind:..."`.
   - Update stale memories:
     - `machine-memory update <id> "new content"`
     - `machine-memory update <id1,id2,id3> "new content"` (multi-ID)
     - `machine-memory update --match "topic" --from-file ./notes.md`
   - Deprecate replaced memories:
     - `machine-memory deprecate <id> --superseded-by <new_id>`
     - `machine-memory deprecate <id1,id2,id3> --superseded-by <new_id>` (multi-ID)
   - Delete invalid memories:
     - `machine-memory delete <id>` or `machine-memory delete <id1,id2,id3>`

4. **Use tight tag taxonomy via path mapping (recommended)**
   - Prefer scoped tags: `area:*`, `topic:*`, `kind:*` (for example: `area:cli,topic:vendor-aws,kind:status`)
   - `machine-memory tag-map set "documentation/content/docs/guides/example.mdx" "area:docs,topic:guides,kind:reference"`
   - `machine-memory tag-map suggest "documentation/content/docs/guides/example.mdx"`
   - `machine-memory add "..." --path "documentation/content/docs/guides/example.mdx"` (preferred over manual tag strings)

5. **Status hygiene**
   - When adding `--type status`, `status_cascade` suggestions are candidates, not auto-actions.
   - Before any deprecate from `status_cascade`, run `machine-memory get <id>` and `machine-memory verify <id> "<replacement claim>"` (or `diff`) to confirm semantic overlap.
   - Keep one active status memory per task thread; prefer updating it over adding same-task status memories unless scope materially changes.
   - Short-lived status should include expiry: `--expires-after-days <n>`.
   - Run `machine-memory doctor` and review suggested `deprecate`/`update` commands semantically before applying.

6. **Write for retrieval**
   - Put key anchors in the first sentence when possible: command names, API paths, file paths, and exact feature keywords.

7. **Separate durable vs transient facts**
   - Use `--type reference` for durable implementation facts, reusable docs notes, and non-obvious gotchas.
   - Use `--type decision` for durable rules/architecture.
   - Use `--type status` for progress snapshots/current state.

8. **Task-end persistence rule**
   - Always persist non-obvious outcomes future sessions need (decisions, references, status snapshots, gotchas, tooling notes, user preferences).
   - Do **not** store obvious code facts, temporary notes, or duplicates.
