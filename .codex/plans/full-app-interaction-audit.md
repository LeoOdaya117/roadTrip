# RoadTrip Full-App Interaction Audit and Repair

**Status:** In progress

**Started:** 2026-10-10

**Owner:** Main task orchestrator
**Scope:** Every routed page, visible action, primary form, modal/sheet, keyboard path, and responsive/theme state in the current web app. External APIs and native-only behavior are stubbed or recorded as unverified where this repository cannot prove them.

## Baseline

- Existing route surface: Home, ride setup, lobby, live ride map, Account, Ride History, Ride Summary/Stats, Share Image, Replay.
- Integrated current checks: lint, unit/component suite (30 files / 154 tests), production build/typecheck, focused interaction Cypress (10 specs), and isolated responsive route slices. Evidence is recorded below; platform/device and external-backend behavior remain unverified.
- Existing working-tree changes are user-approved context and must be preserved.

## Page/action inventory

- **Home:** profile navigation, history navigation, resume, hide-for-now, start ride, ride code, focus-code action, join, inline validation/loading/errors.
- **Ride setup:** Solo/Group radio selection, cancel/back/Escape/Android back, search input/results/retry/no-results, map pin, location retry, map tile retry, route selection/retry/offline continuation, destination edit, final create/start.
- **Lobby:** copy invite, host start, non-host waiting state, clipboard failure, participants/realtime status.
- **Live map:** locate, zoom, map style/layer, overlays, marker style, photo open/cancel/capture/save/failure, pause/resume, end/cancel/confirm, details expansion, crew topics/flags, message composer/send/close, navigation/guidance/destination/clear/download/retry, tile/offline states.
- **Account:** back, avatar selection/removal, display name editing, System/Light/Dark, save and error/success states.
- **Ride History:** back, Solo/Group filters, ride row, pagination, delete swipe, confirmation cancel/delete, empty state.
- **Stats/summary:** back, route replay control, Replay ride, Create Share Image, gallery actions, loading/error/not-found.
- **Share Image:** back, title/from/to fields, weather/manual location, upload and ride-photo selection, clear background, overlay/color controls, Generate, Download, Share, generation/network failures.
- **Replay:** back, restart, play/pause, skip, speed/position sliders, photo marker and thumbnails, gallery open/close/previous/next, empty/one-point cases.

## Prioritized task list

### P0 — Lifecycle and saved-data integrity

- [x] **RT-001 Pause/resume persistence failures:** Keep UI/session state coherent when stopover or session writes fail; show actionable recovery. Add regression coverage for pause/resume failures and happy paths.
- [x] **RT-002 End-ride persistence failure:** Do not clear ride state or navigate as if complete when the ended session was not saved. Keep retry/cancel recovery and test records/history/photos.
- [x] **RT-003 Home resume behavior:** Cypress verifies solo→map and group→lobby routing, Home-local Hide for now, reload restoration, and persisted records remaining intact.

### P1 — Broken core actions and misleading outcomes

- [x] **RT-004 Stats replay action:** Cypress verifies both summary-page Replay entry buttons navigate to the saved ride’s replay, then exercises playback, speed, photo selection, gallery, and share entry.
- [x] **RT-005 Replay photo actions:** Review journey covers replay/photo selection/gallery; two-photo component test verifies Previous/Next boundary states, both directions, and close returning to replay.
- [x] **RT-006 Invalid ride identifiers:** Unknown summary, replay, and share IDs now show truthful not-found/error states. Replay requires an actual saved session before presenting session content.
- [x] **RT-007 Group messaging semantics:** The client clearly discloses local-only group messages and does not imply remote delivery. Remote delivery and host start broadcast remain blocked on an external backend event/API contract.
- [x] **RT-008 Home/setup end-to-end actions:** Cypress covers join validation/loading/API error/recovery, delayed group creation until review, create failure, solo/group resume routing, selection retention on Back, Escape/focus restoration, and Home resume dismissal. Component and browser tests cover setup stages, location/search/routing availability, and web guidance notice; not every external failure permutation is E2E-stubbed.
- [x] **RT-009 Lobby actions:** Cover copy success/clipboard denial and host/non-host start behavior with deterministic API/session fixtures.
- [x] **RT-010 Live-map actions:** Cypress covers map style/layer/overlay/marker, photo cancel/save/failure and caption recovery, pause/resume/end confirmation and persistence, visible action controls, and web-only guidance notice. Native Android guidance/device interactions are unverified.
- [x] **RT-011 History pagination and deletion:** Prevent page reset when `hasMore` changes; add pagination/filter/detail/delete/cancel/error tests.

### P2 — Recovery feedback and accessible interaction

- [x] **RT-012 Account avatar/save feedback:** Reset stale success state when avatar changes; test avatar upload/remove, name save, theme persistence, and errors.
- [x] **RT-013 Share generation feedback:** Component coverage verifies visible generation error and retry states; browser review journey verifies share entry. Successful native share/download is not verified in a browser.
- [ ] **RT-014 Keyboard semantics:** Setup keyboard navigation/focus and visible controls have targeted checks. Full keyboard-only and focus behavior across share/gallery routes remains incomplete.
- [x] **RT-015 History data failures:** Add visible loading/error/retry behavior and handle async track/photo prefetch and deletion failures.

### P3 — Full visual/responsive sweep

- [x] **RT-016 All-page viewport/theme audit:** All 8 routed pages passed isolated Cypress slices across 360×640, 390×844, 844×390, and 1280×800 in System/Light/Dark (96 combinations). Replay’s matrix checks its honest not-found state; the seeded review journey covers real playback controls. The automated check verifies content/action bounds and horizontal overflow, with separate map hit tests; it is not a full manual contrast, attribution, safe-area, or sheet inspection.
- [ ] **RT-017 Keyboard/accessibility sweep:** Setup keyboard behavior and select focused component labels/states are covered. Full route-by-route keyboard-only, focus containment/return, enlarged text, screen-reader announcements, and contrast audit remain open.
- [x] **RT-018 Final polish and independent review:** Read-only code review found no actionable correctness issue in history deletion/replay fixes. QA gaps for multi-photo navigation and unknown replay/share IDs were resolved and rerun. Device, backend, and full manual accessibility verification remain explicitly outside the browser evidence.
- [x] **RT-019 Web destination location:** Destination flow requests browser location independently of Android turn-by-turn support; setup component/browser checks cover location available/unavailable handling. Physical permission UX remains device-unverified.
- [x] **RT-020 Search freshness:** Stale results are cleared/query-bound; focused setup tests cover replaced queries and candidate selection behavior.
- [x] **RT-021 Photo save recovery:** Cypress verifies failed save keeps the draft available and retry persists the caption; saving is guarded against duplicate submission.
- [x] **RT-022 Photo dismiss cleanup:** Cypress verifies Escape dismissal clears the unsaved caption before the next capture.
- [x] **RT-023 History page retry:** Component tests cover later-page retry while retaining prior accumulated entries.

## Confirmed findings and current execution status

- **Resolved visual bug — map attribution/control collision:** At 390×844, Leaflet attribution was covered by the map action rail and crowded by the metrics dock. Layout was adjusted; map-controls Cypress check passes.
- **Resolved data bug — photo caption:** Caption is now persisted with the photo; lifecycle Cypress verifies caption survives a failed save and retry.
- **Resolved UI bug — setup failure visibility:** Group-create failure feedback is surfaced in the setup flow and covered by action tests.
- **Resolved accessibility bug — setup heading focus:** Setup transitions focus the current heading; Cypress verifies focus on open/back and restoration to Start a ride after Escape.
- **Resolved unreachable action — focus ride-code shortcut:** Shortcut is available at phone sizes and browser-tested.
- **Resolved logic bug — Web location lookup:** Destination setup requests browser location without requiring Android guidance support.
- **Resolved stale-result bug — destination search:** Results are cleared/bound to the current query to prevent selecting an older result.
- **Resolved photo recovery bugs:** Failed save retains the draft for retry, Escape clears abandoned caption state, and save submission is guarded.
- **Resolved history recovery bug — later-page retry:** Retry preserves earlier accumulated history entries; component regression covers it.
- **Resolved replay clipping bug:** Replay screen controls now live in a scrollable page shell. All 12 replay viewport/theme combinations pass.
- **Resolved missing-session replay bug:** An unknown ride no longer renders as an empty replay. Unit and Cypress checks cover unknown replay IDs; valid replay actions remain covered with a seeded ride.
- **Resolved gallery coverage gap:** Two-photo navigation verifies Previous/Next state at both boundaries and returns to replay on close.
- **Resolved history deletion flow bug:** Alert remount and destructive-role handling support cancel → reopen → confirm; Cypress verifies cancellation preserves records and confirmation deletes session, track, and photos.
- **Coverage gap — accessibility and native behavior:** Full route-by-route keyboard-only usage, focus return/containment, enlarged text, screen-reader status/error announcements, and Android safe areas/rotation/physical-back/GPS/photo/share behavior remain unverified on a physical device.
- **External contract blocker — group messaging/start event:** Current message/topic writes are local Zustand state; the realtime client only consumes rider-location events. Lobby start is navigation-only and does not broadcast. Keep this disclosed until a backend event/API contract is defined.
- **Completed with focused tests:** RT-001/002 lifecycle persistence; RT-003 Home resume; RT-004 review-to-replay; RT-005 gallery navigation; RT-006 unknown IDs; RT-007 local-only messaging disclosure; RT-008 core setup journeys; RT-009 lobby clipboard/host behavior; RT-010 web map actions/lifecycle/photo recovery; RT-011/015 history pagination, retry, deletion and recovery; RT-012 account feedback/avatar behavior; RT-013 share error/retry feedback; RT-016 automated viewport/theme route matrix; RT-019/020 location and search freshness; RT-021/022 photo save/dismiss recovery; RT-023 history retry.

## Evidence and completion rules

For each checked control, record route, fixture, viewport/theme, action, expected result, observed result, and test evidence. Classify findings as **confirmed bug**, **visual/accessibility issue**, **coverage gap**, or **external/device blocker**. Each confirmed code bug needs a regression test. External group-backend delivery and physical Android behavior remain explicitly unverified when their dependencies are unavailable.

### Integrated validation evidence (2026-10-10)

- `npm.cmd run lint` — passed with no lint findings.
- `npm.cmd run test.unit -- --run` — passed: 30 test files / 156 tests, no unhandled errors. A sandboxed attempt failed during Vite setup with `EPERM` on `src/setupTests.ts`; the same command passed with workspace filesystem access. The lobby test stubs Ionic’s deferred `IonApp` bootstrap so teardown does not leave a late timer rejection.
- `npm.cmd run build` — passed: TypeScript check and production Vite build (433 modules).
- Cypress interaction selection — passed: 10 specs / 37 tests. Covers account, history deletion, Home/setup, map settings and lifecycle, review/replay/share including both summary replay actions and unknown IDs, setup edge cases, and the existing shell regression. After adding the second summary replay assertion, `review-actions.cy.ts` was rerun separately and passed 3/3.
- `all-pages-visual-smoke.cy.ts` — all 8 route slices passed separately: 12 combinations each (4 viewport sizes × System/Light/Dark), 96 combinations total. Running the entire matrix in one Electron process exceeded available memory, so slices were isolated. Replay matrix checks not-found state; the review journey separately verifies controls on a seeded ride.
- `git diff --check` — passed; Git reported only expected LF-to-CRLF working-copy warnings.
- Independent code review — no actionable correctness findings in the history deletion confirmation and replay scroll fixes. QA review noted remaining gaps listed above.

Completion gates: `npm.cmd run lint`; `npm.cmd run test.unit -- --run`; `npm.cmd run build`; focused Cypress interaction suite and page-by-page visual slices; `git diff --check`; final responsive/theme and keyboard sweep. Preserve existing user changes. Add no backend/schema/native configuration changes without a separate contract/plan. Device-only Android behavior, remote group event delivery, and exhaustive route-by-route assistive-technology verification remain open. Do not claim those checks passed.
