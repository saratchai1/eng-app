Latest release: Engineering Studio 0.8 — **ห้องทบทวนโครงการ / Project Review Room**. The full local suite passed **304/304 tests**, including 48 new core, view, report and exact-source navigation tests. Browser checks confirmed restoration of the exact source and pending editor, addressed → closed → changed-input needs-review behavior, source metadata navigation without automatic declarations, and preserved filters on return. A 21-document package produced 38 findings over 20/18-row pages; an actual CSV downloaded from page two contained all 38 unique findings plus its scope row. The original six-document package and order were restored afterward. A three-finding agenda produced a rectangular 37-column CSV and a 335,176-byte standalone HTML with nine indexed sections, no scripts, external resources or duplicate IDs. The report retained captured Mu = 350 while another tab changed the live source to 360; the room refreshed the live value separately. Phone/tablet workspace and report checks used 390/768 px browser iframes, with contained table scrolling and no horizontal page overflow. All 20 tool routes loaded their expected headings. Published-commit CI is recorded on [PR #2](https://github.com/saratchai1/eng-app/pull/2). See [studio-0.8.md](studio-0.8.md) for the detailed behavior, evidence, screenshots and limits.

Previous release: Engineering Studio 0.7 — **ฉบับอ้างอิงและการเปลี่ยนแปลง**. The full local suite passed **256/256 tests**, including 21 new history-core, six storage and eight report/UI tests. Browser checks confirmed an unchanged six-document initial capture, recoverable form text, duplicate-code rejection, an unsaved beam edit producing one changed/five unchanged records, cross-tab capture/remove/undo behavior, and separate membership/order/cover changes. Historical JSON downloads before/after the edit were byte-identical: 33,680 bytes, SHA-256 `869bf8bd4d48a9bfc79dd47d3c7724c9cd28529aa03a94dd8baae420049eacbc`. The 307,510-byte comparison HTML had 11 indexed sections and no scripts, external resource URLs, CSS imports or duplicate IDs. The reference workspace and report reader were checked at 390/768 px iframe widths without page/report-pane overflow, and all 20 catalog routes loaded their expected headings. Published-commit CI evidence is recorded on [PR #2](https://github.com/saratchai1/eng-app/pull/2). See [studio-0.7.md](studio-0.7.md) for detailed evidence, actual screenshots and limits.

Earlier releases: [Project Handover 0.6](studio-0.6.md) records 221 tests, the six-document bundle round trip and its responsive checks. [Review & Revision 0.5](studio-0.5.md), [Design Review 0.4](studio-0.4.md) and [Studio 0.3](studio-0.3.md) retain their own evidence. The record below remains as version history.

# Verification record

Date: 21 November 2026 (Asia/Bangkok)

Initial release checks passed 55 tests. The second review expands the suite to 89 tests; its release commands and UI checks are recorded in [review-0.2.md](review-0.2.md).

## Numerical and workflow checks

The Node test suite independently checks physical equilibrium and hand-computable benchmarks, not only matching displayed output to the implementation. Covered cases include:

- Full-contact and partial-contact footing force/moment equilibrium, both moment signs, kern continuity and loss of contact.
- Independent integration of dry and submerged Rankine pressures, hydrostatic pressure without multiplying by Ka, footing-underside datum and uplift centroid.
- RC reference section capacity 210.270603 kN·m for b=300 mm, d=500 mm, f′c=28 MPa, fy=400 MPa and four 20 mm bars; no usable capacity outside the tension-controlled scope.
- Slab steel per metre, shoring tributary-load scaling and user-specified WLL.
- Geometric volume/area unit consistency, weighted indices and invalid inputs.
- BOQ order of overhead/VAT, CPM branching/cycles/date rollover/progress weighting, checklist states and bounded image imports.
- Polygon geometry/calibration, invalid image payloads, quiz scoring and CSV formula escaping.
- Project identity after refresh, independent per-tool and per-project drafts, stale-draft protection, reset/delete scope, legacy migration and explicit persistence failures.

## Browser checks

Performed in a real browser against the local app:

- All 20 catalog routes load their expected tool without a load error.
- Thai search narrows “กำแพง” to the retaining-wall tool.
- Changing wall friction/water changes the force and FS output; blank height suppresses results and shows an actionable error.
- Editable BOQ quantity and added material/labor row produce a hand-verified total: 402,100 baht direct cost × 1.10 × 1.07 = 473,271.70 baht.
- Saving, editing, refreshing and saving the same project preserves its identity instead of creating a duplicate. The edited quantity remains 22 and the saved-project count remains one.
- Two saved RC-beam projects retain independent unsaved edits: A keeps Mu = 111 kN·m and B keeps Mu = 222 kN·m after switching between both projects; B also retains its name and value after refresh.
- An actual JSON download and file-picker reimport preserve all six BOQ rows and the edited total of 479,745.20 baht.
- The image-measurement UI preserves manually entered coordinates between points. On an 800 × 500 px image at 0.02 m/px, a 400 px segment measures 8 m and a 400 × 200 px rectangle measures 32 m².
- The report preview includes the project name, units, image measurements and declared scope. Native print/PDF system dialogs were not automated.
- Two correct quiz answers show 2/12 and explain unanswered questions separately.
- Phone (390 px iframe) and tablet (768 px iframe) render responsive layouts without body horizontal overflow. Toolbars and category strips remain accessible.

This is model and application verification within the documented scope. It is not professional certification of complete structural designs, official government forms, manufacturer capacities or live market data. Browser-specific print dialogs and device camera behavior can vary.
