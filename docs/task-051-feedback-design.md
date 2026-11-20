# Independent feedback implementation design

Review scope is this design only. No user records, account details, operational data, repository-wide inspection, database commands or deployment actions are required.

The existing application uses Express 4, Sequelize 6 and React 18. Feedback is independent of classes and sparring. The approved UI has entry points on home, recall and the class header. Class entry is navigation only: feedback starts with today's date and blank fields. Existing class editors and the shared clip detail modal remain authoritative.

## Persistence and concurrency

A new feedback table stores an owner id, DATEONLY date, optional situation/technique, original text, selected clip ids, conversation JSON, practice results JSON, summary JSON, integer revision and AI generation metadata. JSON is stored in TEXT and serialized through one DTO. Every read and write is owner-scoped.

The conversation stores active turns, a cursor and archived branches. A turn has a server id, one question, an answer or null, a draft answer and skipped status. Revising an earlier answer archives its old descendant path and removes that path from active evidence. Re-entering an unchanged answer reuses subsequent turns. Navigation and drafts must not silently erase submitted evidence. Prompt construction uses only the current original context, active submitted answers and validated clip metadata.

Writes use optimistic revision compare-and-set. Concurrent updates return 409 rather than overwrite another client. A generation is marked pending with a unique token and start time. The database lock ends before invoking the CLI. Completion is conditional on the generation token and snapshot revision, so delayed or retried results cannot overwrite a revised record. Pending recovery uses an explicit lease timeout, not process identity, to support overlapping deployment instances. Provider failures are persisted and retryable.

Summaries retain an input snapshot hash. Original context, current evidence, clip changes or practice results mark a prior summary stale. Old content remains visible with its stale status until regenerated. Draft-only changes and archived branches are excluded from summary evidence. A record remains usable when a linked clip is deleted; the UI marks that reference unavailable.

## AI integration

All AI calls use the existing runClaude wrapper, gym-master persona loader and per-user model selection. The wrapper must pass an explicit empty tools argument; undefined preserves current callers. There are no file, shell, browsing or arbitrary MCP tools available to this feature. Input records and clip metadata are untrusted data, not executable instructions.

The question response is schema-validated JSON containing one question or a readiness signal. There is no fixed question count. The user may summarize at any time, return to an earlier question, or request an additional question after readiness. The summary response is validated JSON containing title, overview, correction points with valid evidence turn ids, practice methods with concrete steps and observation checks, and unresolved points. It must integrate clarifications from active answers into the actual correction and practice text, not merely append a transcript.

The original text is preserved. Unclear points remain unresolved. Selected clip titles/descriptions/tags are usable metadata, but the model must not claim to have watched an unprocessed video. Prompt length is budgeted explicitly; exceeding the supported budget produces a clear error rather than silently dropping earlier evidence. Complete sensitive prompts and provider payloads are not logged.

## API and UI

The authenticated feedback router provides owner-scoped list/create/get/update, answer, ask, summarize and practice-result operations. All mutations require revision. Long AI operations return pending DTOs and the UI polls the record, retaining drafts if the panel is closed or reloaded. Existing pending operations are not duplicated by a retry. Invalid ids, dates, malformed JSON state, foreign clip ids and cross-user feedback ids are rejected.

The shared feedback panel renders input, one-question dialogue, history and the integrated summary. Video selection reuses existing filter semantics and paginates after filtering, five items per page. Search/filter changes return to page one, while selection and popup navigation preserve state. Existing ClipDetailModal is directly reused in the application.

Recall has one applied period: all, calendar week starting Monday, calendar month by default, or an inclusive custom range. Feedback, failure records and practice evidence use that period consistently. Existing callers without period parameters preserve their current behavior. Technical mastery is not automatically increased by feedback or AI summaries.

## Migration and validation boundary

The additive schema is prepared in a dedicated script with dry-run as default, explicit apply and schema existence checks. It is not added to startup migrations. Shared/production DB migration requires separate user approval. Missing schema produces a feature-specific unavailable response without preventing the existing application from booting.

Validation covers owner isolation, malformed inputs, date boundaries, optimistic conflicts, concurrent AI generations, delayed completions, retry/lease recovery, branch archival, active-evidence hashing, JSON output validation, tool-disable argv regression, pagination/selection, integrated summary prompt evidence, and existing class editor/modal reuse. An isolated MariaDB container may be used with synthetic data. No production database writes or deployments are authorized by this design review.

## Review questions

1. Can stale AI output, concurrent answer edits or lease recovery overwrite newer evidence or execute duplicate mutations?
2. Can foreign clip/feedback ids, archived answers or draft-only answers reach another user's data or current summary?
3. Are migration isolation, pending recovery and prompt budgeting sufficient to preserve the existing application and user records?
