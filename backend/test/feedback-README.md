# task-052 feedback backend validation

Never source `.env`, run `src/index.js`, or use the shared NAS DB for these tests. No actual AI/Claude execution occurs: generation is injected. The HTTP test starts a loopback-only ephemeral Express server with synthetic auth middleware and an in-memory ORM. Production route mounting remains below the existing authentication middleware.

From the isolated validation root (backend/ below it, dependencies in root/node_modules):

```sh
node --test backend/test/feedback.test.js backend/test/feedback.library.test.js
BJJ_FEEDBACK_TEST_DB=1 DB_HOST=127.0.0.1 DB_PORT=9002 DB_NAME=bjj_task052 DB_USER=root DB_PASS='' node --test backend/test/feedback.integration.test.js
```

The integration test accepts only the Leader-owned task-052 disposable MariaDB on Ubuntu `home_ubuntu`, with database `bjj_task052` bound to `127.0.0.1:9002`. It creates synthetic users, videos, classes, sparring, research and feedback records, verifies actual DDL/foreign key/CAS/transactions, and removes its own rows. It leaves fixture tables for repeat runs. Run the SQL suite on a fresh task-052 DB before starting the browser fixture to exercise a populated migration from the task-051 schema. Run these checks serially. The existing task-051 preview retains its own checkout, DB and process. `sync()` calls are limited to the guarded synthetic fixture environment.

Meaningful cases include current versus archived evidence, question reuse, draft persistence, ownership, date validation/boundaries, pagination, stale async generations, retry/expired durable lease, schema missing 503, reference metadata versus activity counts, task source idempotency, current-task precondition, closed-task reassignment, replaced-task history, rollback, and task races.

Task-052 SQL checks cover legacy text/summary/revision preservation and migration idempotence, structured situation and technique ownership, favorites during a pending summary, combined filters before pagination, and result edit/delete preserving other results. They also verify that the displayed status follows the current assignment and remaining outcomes.

## Schema operator separation

```sh
# Offline preview (default, no connection or environment required):
node backend/scripts/task-051-feedback-schema.js
node backend/scripts/task-052-feedback-schema.js
# Metadata-only verification using an explicit read account/environment:
node backend/scripts/task-051-feedback-schema.js --verify
# DDL-capable operator only; the user's schema approval is still required on a shared DB:
node backend/scripts/task-051-feedback-schema.js --apply --confirm-database "$DB_NAME"
```

Connected modes require all DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASS explicitly, including an empty test password. No dotenv/default credentials. Apply checks information_schema before CREATE and validates columns, InnoDB/utf8mb4, owner/date index and owner FK afterwards. An existing incompatible table is refused without ALTER/DROP. Runtime accounts need only SELECT/INSERT/UPDATE/DELETE, while CREATE/REFERENCES permissions belong to the schema operator. Existing table/application data are never copied or rewritten by the schema script. Approval to implement or test on the isolated container does not authorize shared-schema application.

The task-052 migration adds the favorite and structured situation columns after verifying the task-051 schema. The guarded fixtures apply and verify both versions on the task-052 disposable DB.

## API expected behavior

All routes return `{success:true,data,message}` or an HTTP error with `{success:false,message}`.
- POST `/api/feedback` with date/original plus optional situation/technique/clipIds creates a draft; unknown or foreign videos return 404.
- GET `/api/feedback?from&to&page&limit` returns `{items,total,page,limit}`. Limit is 1–100. Invalid calendar dates return 400.
- GET/PATCH `/api/feedback/:id` use per-user ownership. Content mutations require current integer revision; races return 409.
- PUT `/:id/star` sets `{starred:boolean}` independently of content revision and pending AI work. PATCH and DELETE `/:id/results/:resultId` use content revision and affect the selected result.
- GET `/api/feedback` applies `filter`, `search` (`q` alias) and `technique` before paginating. `includeTechniqueOptions=1` returns the owner's stored technique labels, including legacy labels.
- POST `/:id/answer` saves a turn. A changed past answer archives its former branch and removes later active turns; unchanged answers preserve them.
- POST `/:id/ask` or `/:id/summarize` starts durable pending work and returns immediately; poll GET. Request text never includes archived/draft answers. Async completions compare revision and random generation token. Pending work older than 30 minutes is recovered to failed on record GET/write, including after process restart; retry is explicit. An expired job cannot publish after retry.
- PATCH cursor/draftAnswer persists navigation and unsubmitted writing; it never becomes summary evidence.
- POST `/:id/results` stores date/outcome/context/note. No mastery writes occur.
- GET `/recap?from&to` returns `{from,to,items,results,failures,summary:{feedbackCount,resultCount,failureCount}}`. Feedback cards use their own date; results/failures use result date regardless of parent card date. This failureCount counts feedback outcome `tried_failed`; actual sparring failure count is `/holes` summary.failItems.
- POST `/:id/task` requires `{revision,expectedTaskId:null|id,replace:boolean}`. Uses a fresh nonpending summary only. Owner→feedback→current-task locks, atomic existing research helpers, and current-task precondition protect concurrent requests. Existing tasks are closed as not_tried when explicitly replaced, retaining history. A task snapshot contains the bounded title, first selected practice, check and source feedback ID; the complete summary remains on feedback.
- DTO taskBinding is assignment history `{sourceHash,taskId,nodeId,projectId}`. `summarySourceHash` identifies current summary content AND its evidence. Frontend must compare binding.taskId with GET `/research/task` current task id before saying it is currently assigned. Closed/deleted tasks may be reassigned with an explicit new click; stale revision retries receive 409.
- `/holes`, `/recall/stale`, `/techniques/positions` accept optional real-calendar `from`/`to`; unfiltered callers retain previous behavior. Position tech/clip counters remain the whole saved reference inventory; drill/spar counters use the selected activity period. Legacy drills without their own date are preserved with date:null in unbounded analytics and excluded by bounded activity filters; class dates are not substituted. Filtered position rows expose `activityRange` and `referenceScope:'all'`.

Not verified here: real subscription CLI behavior, full authenticated browser flow, production/shared-schema compatibility or deployment. AI output uses manual structural/evidence validation and `runClaude` with an explicit empty tool list plus empty strict MCP config. The CLI argv regression test verifies legacy options are preserved.

## Follow-up: fact provenance and practice proposal boundary

Correction points now additionally contain `sourceQuotes:[{source:'original'|'turn',turnId:null|string,quote:string}]`. Every quote must be an exact contiguous substring of the current original or a non-skipped, submitted active answer. The set of quoted answer ids must equal `evidenceTurnIds`. Questions, draft text, skipped answers, archived branches and video metadata cannot be quote sources. Missing, invented or cross-answer quotes fail generation and preserve the previous summary. Practice titles visibly say `연습 제안`; future checks/counts must be proposals, never invented past results. The same fact-only policy applies to overview and all correction fields, and is appended to the runtime persona as well as the task prompt. Unstated causal mechanisms, past repetition/failure, psychology or execution results go only into additional clarification questions in unresolved.

This structural provenance check verifies exact source text and ids; it does **not** prove semantic faithfulness of a paraphrased detail/overview or that a causal claim follows from a valid quote. That remains a distinct real-provider QA evaluation. Developer follow-up tests use stubs only. The earlier real-provider QA found unsupported causal/history claims and failed; the follow-up provider retest belongs to QA after Reviewer verification.

## Browser fixture server (test-only)

```sh
# Ubuntu validation root with the healthy task-052 disposable MariaDB container.
BJJ_FEEDBACK_TEST_DB=1 DB_HOST=127.0.0.1 DB_PORT=9002 DB_NAME=bjj_task052 DB_USER=root DB_PASS='' node backend/test/feedback.browser-server.js
# Separate terminal; same explicit environment guard:
BJJ_FEEDBACK_TEST_DB=1 DB_HOST=127.0.0.1 DB_PORT=9002 DB_NAME=bjj_task052 DB_USER=root DB_PASS='' node backend/test/feedback.browser-smoke.js
node --test backend/test/feedback.browser-server.test.js
```

Server binds **127.0.0.1:9016 only**. All settings are checked before Express/models/DB imports. Guard tests intercept `require` and include the prior task-051 tuple and mixed task-051/task-052 settings. Start/stop and container lifecycle belong to Leader. Health `/__fixture/health` returns fixture identity, PID, synthetic user id, seven clips and seed dates. The fixture creates tables for synthetic rows and the actual feedback/research path after checking information_schema. Feedback drafts and task bindings survive fixture restart.

**Real path:** /api/feedback CRUD/list/recap, persisted dialogue/cursor/draft/archives/revision CAS, pending generation/error/retry, structural sourceQuotes validation, results and research task assignment all use the production feedback service/router plus Sequelize and actual isolated MariaDB. Only generate() is a deterministic synthetic test double (two test questions, literal current input source quote, future practice proposal). This does not test the production model's adaptive questions or semantic fidelity.

**UI support fixtures:** auth login/me, profile/belts/memberships, calendar classes, techniques/positions, clip list/full usage, coach reports, master chat list, research current task, chains/gameplans and date-only recall support responses exist only to let the real frontend render. Auth injects one synthetic owned user into requests and returns a non-JWT test token. This is not real login/OAuth/session verification. Clip usage is synthetic memory state and resets after fixture restart; it is not existing clip CRUD coverage. Existing ClassEditor display can be observed; existing class saves are unsupported (501). Video URLs are example.invalid placeholders and are not playback/download verification. Unsupported APIs explicitly return 501 rather than fake success.

Synthetic login uses `synthetic-browser-task052@test.invalid` and `synthetic-only-password`. GET /auth/me returns the user object. Seeded rows belong to that synthetic user and include seven clips/techniques, class+drill+spar records on 2026-10-31, 2026-11-04, 2026-11-20 and 2026-12-01, and one belt entry. Browser HTTP smoke checks structured situation/technique, favorites, list filters and result edits through the real router, then leaves a labeled synthetic feedback/result for UI inspection. It assigns a weekly task only if the slot is empty.

Deterministic test control: POST `/__fixture/ai` with `{delayMs:0..3000,failNext:boolean}`. Default delay is 700ms; failNext is consumed once and causes the real feedback output-validation/failure path. Use it to inspect pending save/close/reopen, failed retry and previous-summary preservation. This control is test/loopback only and never exists in product routes.

Source-scope disclosure: while confirming the existing usage DTO, Developer read backend/src/services/clipUsage.js lines 1–145 before obtaining that additional named-file permission, then disclosed it to Leader. There was no modification, service execution, or external transmission of that file. Permission was subsequently expanded for related fixture reference, without rewriting the earlier event as preapproved. Runtime fixture imports no clipUsage service; it uses a documented synthetic usage map.

### Existing-feature support corrections

The fixture explicitly returns 501 for POST `/api/clips/:id/recommend`, any `/api/recall/search` request with a nonempty q or pos, and GET `/api/research/projects`. It does not claim existing AI recommendation, text/position search or research-list absence. Date-only recall returns a marked fixture list, not production search evidence. A research project created by the real feedback task API remains in the isolated DB and current weekly-task lookup; research project browsing is not supported by this fixture. Empty coach/chat lists are synthetic UI scaffolding. New feedback endpoints continue to use the actual service/router/DB.

With the fixture running and the smoke case completed, execute the support regressions:

```sh
BJJ_FEEDBACK_TEST_DB=1 DB_HOST=127.0.0.1 DB_PORT=9002 DB_NAME=bjj_task052 DB_USER=root DB_PASS='' node --test backend/test/feedback.browser-support.test.js
```

Those tests first verify the loopback health fixture identity and only inspect existing records or unsupported endpoints. Do not run the separate schema integration suite against a browser QA session while it is active.

The browser fixture's `/api/research/task` now projects the existing production taskView shape from owned synthetic DB rows: nested `node` and `project`, camelCase ids/dates, outcome label and elapsed days, plus recent closed tasks. This fixes the fixture-only `(이름없음)` display from previously returning raw joined fields. Support regression confirms the current id and nested label/project match the actual feedback taskBinding. It reads data without resetting tables or creating tasks; run the browser smoke once if no synthetic task exists. Research project browsing remains explicit 501.
