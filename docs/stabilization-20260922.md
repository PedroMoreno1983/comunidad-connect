# Stabilization evidence — 22 September 2026

## Applied to production

- Added `supermarket_products_reconciliation_counts_idx`: Tottus count query changed from a bitmap heap scan (~4456 ms) to a covering index scan (~143 ms) in the measured samples. This is not a benchmark or proof of full-job success.
- Increased only the service-only `finalize_supermarket_catalog_refresh` RPC budget to 60 seconds. The coverage guard, permissions and atomic stock/history transaction are unchanged. The index alone did not fix the full job.
- Removed the duplicate package-notification trigger, keeping one canonical trigger. Existing notification records were not deleted.

## Verification

- Production profile-boundaries QA passed after the notification fix: private package delivery, resident isolation, staff publication and mediation privacy/agreement.
- Production training-learning-operations QA: 21 checks passed, including course creation/versioning, assignment, persisted answers, server-verified completion, authenticated PDF and administrator completion dashboard. Temporary QA fixtures were cleaned up by the scripts.
- Unit tests: 513 passed, 2 skipped. Worker tests: 28 passed.
- Build and TypeScript passed. Lint: no errors, one pre-existing warning in admin maintenance.
- Training integrity: 32 static checks passed.

## Not yet closed

- Proxy credentials: removed tracked defaults and added a regression test. Rotate the exposed provider credential and install it securely before considering the incident closed. Removing the value does not remove it from Git history. Do not deploy the compose configuration without both required variables.
- Lider: no real successful end-to-end cart confirmed in this stabilization pass. Do not describe the installed adapter as proof of success or bypass human verification.
- Full Tottus retry completed successfully: https://github.com/PedroMoreno1983/comunidad-connect/actions/runs/35679661785. Production reconciliation recorded 14,701 observed products and 799 marked out of stock on 2026-09-22 at 02:35:48 UTC.
- Professional visual/pedagogical review of both role-specific courses and multiagent answers remains separate from functional QA.

## Workspace preservation

- Fast-forwarded local master from `1c2eaee` to `d2873f7`.
- Preserved the pre-existing local automation change in Git stash named `preserve-local-cart-before-stabilization-20260921`. It overlaps the upstream cart changes and was not silently reapplied or discarded.
