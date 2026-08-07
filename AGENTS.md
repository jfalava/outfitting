<!-- machine-memory:start -->

## Project memory

Every database-backed command requires exactly one backend flag. Use `--remote` for this repository and do not pass both flags.
Run `machine-memory doctor` during maintenance, not every task. Do not create or rely on a local `machine-memory.db` for this repository.

⚠️ MANDATORY: Complete the memory scan BEFORE any code changes. Skipping it causes rework, regressions, and duplicated decisions.

### Required pre-workflow (DO NOT SKIP)

Before touching code, complete this scan from the repository root. Every database command must include the backend flag shown below:

- Known files: `machine-memory suggest --files "path/a.ts,path/b.ts" --remote --json-min`
- Known topic: `machine-memory query "topic" --remote --json-min`
- Broad audit: `machine-memory list --tags "area:..." --remote --json-min`

If results look relevant, fetch full records before editing: `machine-memory get <id> --remote` or `machine-memory get <id,id,...> --remote`.

### One-sweep workflow (use this every task)

1. Scan relevant context fast. Run exactly one focused `suggest`, `query`, or `list` command before code changes; repeat only if the touched paths or scope materially changes.
2. Verify uncertain context before acting. Use `machine-memory verify <id> "<inferred fact>" --remote` or `machine-memory diff <id> "<proposed updated wording>" --remote` when an inference may conflict with existing memory.
3. Maintain memory while implementing. Prefer `machine-memory update --match "topic query" "new canonical content" --remote`; if no reliable match exists, use `machine-memory add "..." --upsert-match "topic query" --remote`.
4. Write for retrieval. Put commands, API paths, file paths, keys, routes, thresholds, and exact feature keywords in the first sentence.
5. Use path-driven tags. Prefer `--path` and `tag-map`; use scoped tags such as `area:cli,topic:backend,kind:decision` when no mapping exists.
6. Capture third-party quirks. Always add a `--type gotcha` memory for surprising library or tool behavior, leading with the library name, behavior, and fix.
7. Keep status hygiene. Status memories are for transient progress, should include `--expires-after-days`, and should be updated rather than duplicated. Review `doctor` suggestions semantically before applying deprecations or updates.
8. Separate durable and transient facts. Use `decision`, `reference`, or `gotcha` for reusable knowledge; use `status` only for short-lived snapshots.
9. At task end, persist every durable decision, constraint, preference, non-obvious gotcha, and verified status future sessions need. Use `machine-memory add ... --remote` or update the canonical record with `machine-memory update ... --remote`. Do not store obvious code facts, routine test results, temporary progress, or duplicates.

### Checklist (verify before proceeding)

- [ ] I ran `machine-memory suggest`, `query`, or `list` with --remote for the files or feature I will touch
- [ ] I reviewed the returned memory IDs and fetched full records when relevant
- [ ] I considered whether existing memories constrain the planned approach
- [ ] I will document significant findings and decisions after completing the task

Project preference: replace obsolete systems when practical; preserve backwards compatibility only when it is explicitly required.
<!-- machine-memory:end -->
