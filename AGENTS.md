## Project memory

This project uses `machine-memory` for persistent agent context stored at `.agents/memory.db`.

### One-sweep workflow (use this every task)

1. **Scan relevant context fast (compact mode)**
   - `machine-memory suggest --files "<paths you'll touch>" --brief`
   - `machine-memory query "<feature/topic>" --brief`
   - `machine-memory list --tags "<domain>" --brief`
   - Use `machine-memory get <id>` only when you need full detail.

2. **If your inference may conflict, verify before editing memory**
   - `machine-memory verify <id> "<inferred fact>"`
   - `machine-memory diff <id> "<proposed updated wording>"`

3. **Maintain memories while implementing**
   - Prefer one canonical memory per feature thread:
     - `machine-memory update --match "topic query" "new canonical content"`
     - If no reliable match exists, create with `machine-memory add ... --upsert-match "topic query"` so repeated writes update instead of duplicating.
   - Add new durable knowledge:
     - `machine-memory add "..." --tags "area:...,topic:...,kind:..." --context "why it matters" --type "decision|reference|status|..." --certainty "verified|inferred|speculative"`
   - Update stale memories:
     - `machine-memory update <id> "new content"`
     - `machine-memory update <id1,id2,id3> "new content"` (multi-ID)
     - `machine-memory update --match "topic" --from-file ./notes.md`
   - Deprecate replaced memories:
     - `machine-memory deprecate <id> --superseded-by <new_id>`
     - `machine-memory deprecate <id1,id2,id3> --superseded-by <new_id>` (multi-ID)
   - Delete invalid memories:
     - `machine-memory delete <id>` or `machine-memory delete <id1,id2,id3>`

4. **Use tight tag taxonomy (recommended)**
   - Prefer scoped tags: `area:*`, `topic:*`, `kind:*` (for example: `area:cli,topic:vendor-aws,kind:status`)
   - `machine-memory tag-map set "sdk/src/schema.ts" "area:sdk,topic:schema,kind:reference"`
   - `machine-memory tag-map suggest "sdk/src/schema.ts"`
   - `machine-memory add "..." --path "sdk/src/schema.ts"` (auto-merges mapped tags)

5. **Status hygiene**
   - When adding `--type status`, the CLI may return `status_cascade` with a suggested deprecate command for older overlapping status memories. Run that command to keep one source of truth.
   - Short-lived status should include expiry: `--expires-after-days <n>`.
   - Run `machine-memory doctor` and apply suggested `deprecate`/`update` commands for stale overlap, taxonomy drift, status expiry, and type-boundary issues.

6. **Write for retrieval**
   - Put key anchors in the first sentence when possible: command names, API paths, file paths, and exact feature keywords.

7. **Separate durable vs transient facts**
   - Use `--type decision` for durable rules/architecture.
   - Use `--type status` for progress snapshots/current state.

8. **Task-end persistence rule**
   - Always persist non-obvious outcomes future sessions need (decisions, references, status snapshots, gotchas, tooling notes, user preferences).
   - Do **not** store obvious code facts, temporary notes, or duplicates.