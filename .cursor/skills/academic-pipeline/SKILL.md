---
name: academic-pipeline
description: Orchestrates a staged academic writing pipeline chaining deep-research → academic-paper → paper-reviewer with explicit human checkpoints across 10 stages. Use when the user wants end-to-end thesis/journal drafting with disciplined stage gates rather than single-shot generations.
disable-model-invocation: true
---

# Academic Pipeline — staged orchestration（10 stages + checkpoints）

## Pipeline contract

Stages must **advance only** when their **checkpoint checklist** is ✅. If ✅ fails, rewind to minimally sufficient prior stage.

Chained conceptual skills:

- Stage cluster A (`deep-research`) — PRISMA + Socratic
- Stage cluster B (`academic-paper`) — Style calibration
- Stage cluster C (`paper-reviewer`) — Ensemble critique + quantitative scores

Explicitly **load** sibling skills mentally when stepping into clusters (read their SKILL.md semantics).

---

## Ten stages（each prints `STAGE REPORT` snippet）

| # | Stage | Primary skill | Checkpoint（must ✅ before next）|
|---|---|---|---|
| 1 | Intent & scope freeze | Pipeline | Venue/topic/PICOS or CS variant declared; forbid scope creep memo |
| 2 | Retrieval protocol freeze | deep-research A2/A1 | Queries + databases + cutoff date documented |
| 3 | Screening complete | deep-research A4/A5/A3 | Inclusion table + exclusions w reasons |
| 4 | Evidence brief signed | deep-research A13 | Author confirms claims/citations reconcile |
| 5 | Zeroth-draft skeleton | academic-paper G4/G2 | IMRAD-aligned outline w placeholder refs only |
| 6 | Expanded draft pass | academic-paper G7–G11 | **[CITE NEEDED]** list empty or knowingly deferred |
| 7 | Calibration diff | academic-paper G12 + full table | Venue tone applied; glossary consistent |
| 8 | Editorial ensemble | paper-reviewer R0–R6 | Numeric scores logged; Devil list produced |
| 9 | Consolidated revise | Pipeline | Patch list prioritized; regressions guarded |
| 10 | Freeze & appendix pack | Pipeline | Figures/tables captions; reproduc appendix stub |

Human gate recommended at **after 4, 8, and 10** even if ✓ programmatic.

---

## Global checkpoint snippets

Reuse per stage footer:

```
=== STAGE CKPT ===
blocked?: yes/no
blockers?: ...
artifacts produced?: bullets
approval note?: reviewer initials / self-cert
```

---

## Escalation

If stuck in cycles between 7 ↔ 8, insert **narrow experiment**: constrain word delta budget (±10%) focusing only Contribution + Methods.
