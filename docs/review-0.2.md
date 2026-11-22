# Review 0.2 — correctness and practical use

Date: 21 November 2026 (Asia/Bangkok)

## Numerical findings and corrections

| Finding | Correction | Verification |
| --- | --- | --- |
| Wall lateral surcharge did not express a separate vertical load above the heel. Its effect on bearing could be missed. | Added independent heel surcharge with its actual force and centroid; report separates the two load definitions. | Regression checks force, moment and unchanged lateral pressure. A test case changes qmax from 27.82 to 147.63 kPa when the missing 100 kPa heel load is included. Existing defaults stay unchanged because heel surcharge defaults to zero. |
| An overturning ratio could appear to pass even with net uplift and no compressive foundation reaction. | Sliding and overturning FS are unassessed in that condition; uplift failure remains explicit. | A case with negative net normal force and a raw overturn ratio of 2.173 no longer produces a passing indicator. |
| Canal lining used a thin-layer approximation without a thickness validity bound. | Use explicitly defined inner/outer offset geometry and include corner concrete. | Independent polygon-area benchmarks cover zero thickness, thick lining and steep slopes. Default concrete is 76.188820 m³ and outer excavation is 713.688820 m³. |
| A permissive weight-sum tolerance could create a monetary adjustment under unchanged indices. | Accept only floating-point roundoff in the weight sum and compute price change directly from index changes. | Neutral indices give exactly zero change, including a large-value benchmark. |
| Failed check text could still show a fixed passing inequality, or rounding could make a failure look contradictory. | Print the actual inequality direction and extra precision near boundaries. | Failure and near-boundary regression tests. |

These are corrections within the documented model scope. They do not expand the app into complete structural, geotechnical or official cost-form certification. Equations, assumptions and primary references are in [engineering-models.md](engineering-models.md).

## Reliability findings and corrections

- Imported null/Boolean/object numeric values are no longer silently replaced by plausible defaults. Oversized workflow arrays are rejected rather than truncated.
- Invalid BOQ, planning and inspection data blocks report generation. Image data must pass raster signature, dimension, size and browser-decoding checks; stored dimensions cannot silently distort calibration.
- A clean saved project resumes through a small pointer instead of retaining redundant copies of image-heavy data in draft storage.
- Drafts track the saved version and writer. A stale draft cannot shadow a newer saved project. Conflicting saves create a separate project, and cleanup removes only the relevant writer's draft.
- Report data is regenerated before printing. Modal focus is contained and restored; the skip link no longer changes the current tool route.

## Improvements delivered

- All nine calculators support an input snapshot A, live comparisons, changed-input lists, status transitions and restore. Snapshots store inputs and recalculate answers. Reports and JSON preserve comparisons.
- The project library supports search, sorting, copies and draft badges. Home shows recently used tools.
- BOQ and price book support copy/reorder/delete with one-step undo; later cell edits clear undo to protect those edits.
- Planning shows assessment-date planned versus actual weighted progress, percentage-point variance, connected critical paths and a Gantt assessment marker.
- Image takeoff supports 1×–4× zoom, linked shape/table selection, separate dimensional totals and restore-last-delete.
- Quiz users can focus on wrong/unanswered questions after grading; an unanswered printed quiz includes its choices.
- Responsive layouts, clearer invalid-field indicators and keyboard shortcuts improve everyday use.

## Browser verification

Performed against the local application in a real browser:

- All 20 routes loaded without an application alert after the second-review changes.
- Beam comparison: d = 500 → 600 mm changed φMn = 210.27 → 255.51 kN·m, with the independent difference +45.239 kN·m. The reference restored correctly. Saving, copying and refreshing preserved the reference and current inputs.
- Report preview included input values, the current 255.51 kN·m result, an engineering diagram and the A/current comparison. Closing the modal restored the interactive page.
- Project search narrowed the saved list to one matching review project.
- Two-tab conflict: the original project retained Mu = 200 kN·m, while the stale tab's pending Mu = 110 kN·m was saved as a separate copy; both values survived refresh.
- BOQ copied a 1,500 baht direct-cost row, increasing the total from 479,745.20 to 481,510.70 baht. Move, delete and undo worked; a blank quantity did not open a printable report.
- Planning at 10 December 2026 showed 24.83% planned, 16% entered and a shortfall of 8.83 percentage points, with path T1 → T2 → T3 → T5 → T6.
- At 4× zoom, the existing image measurements remained 8 m and 32 m²; highlighting and restoring a deleted measurement preserved values.
- Phone (390 px) and tablet (768 px) iframe checks showed no body horizontal overflow after content loaded. The report preview also fit the phone viewport.
- Wall UI separated lateral and heel surcharge, while canal UI displayed 76.19 m³ concrete and 713.69 m³ outer-profile excavation for its defaults.

Native operating-system print/PDF dialogs were not automated. This review does not claim live market-price feeds, PDF/OCR takeoff, full-code design or multi-user server synchronization.

## Release checks

- `npm run check`: JavaScript syntax checks.
- `npm test`: 89 numerical, import, persistence and workflow regressions.
- `npm run build`: static production output, without dependencies.

The exact commit and CI result are recorded on PR #2. Changes remain on its feature branch for human review; no automatic merge or deployment is included.
