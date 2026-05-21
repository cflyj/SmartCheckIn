---
name: deep-research
description: Runs a structured multi-agent systematic review workflow using PRISMA reporting and Socratic-guided evidence synthesis (13 simulated agent roles). Use when the user needs literature reviews, systematic review drafts, PICOS refinement, inclusion/exclusion traceability, or evidence-gap analysis before academic writing.
disable-model-invocation: true
---

# Deep Research — PRISMA + Socratic（13 Agents）

## When this skill loads

Assume the goal is **reproducible** literature synthesis suitable for dissertation background / related-work / Discussion anchoring—not casual Googling.

## Global rules

- Maintain a **living PRISMA trail**: counts at each sieve step, reasons for exclusion, duplication handling.
- **Socratic loop**: alternate *expansion* (what might we miss?) and *stress-test* (what would falsify this claim?).

## Checkpoint（before writing any “Evidence says…” sentence）

1. Identify **PICOS** (Population, Intervention/Issue, Comparator/Context, Outcomes, Study design—or adapt for non-medical HCI/CS contexts).
2. Pre-register **ineligibility traps** you will refuse (blogs, unchecked preprints-only claims, citation chains without primary read).
3. Keep a master table linking **included studies → claim → citation**.

---

## Team of 13（single operator runs these roles sequentially; each produces a boxed output）

| Agent | Responsibility | Outputs |
|---|---|---|
| A1 Librarian | Databases/strings, synonyms, multilingual hooks | Search workbook |
| A2 Registrar | Freeze PICOS/inclusion/exclusion/version date | Frozen protocol |
| A3 Deduper | Duplicate detection rules (DOI/title/year) | Dedup log |
| A4 Title/Abstract screener | Fast reject with reasons | Screening sheet |
| A5 Full-text screener | Final include/exclude with codes | Inclusion set |
| A6 Extractor (methods) | Design, dataset, validity threats | Methods matrix |
| A7 Extractor (results) | Main numbers/findings/novelty deltas | Evidence table |
| A8 ROB / quality | Risk of bias / study quality heuristic for domain | ROB notes |
| A9 Narrative synthesizer | Thematic storyline + disagreements | Synthesis prose |
| A10 Evidence cartographer | “What converges vs conflicts” diagram | Divergence map |
| A11 Socratic challenger (logic) | Hidden assumptions & alternative explanations | QA log |
| A12 Socratic challenger (coverage) | Grey literature, negatives, contradictory studies | Coverage probe |
| A13 EiC Reporter | Consolidated report + limitation paragraph | Deliverable |

## PRISMA minimum artifacts

Produce or update:

```text
- Identification: databases + dates + queries
- Screening: screened n, duplicates removed, exclusions with reasons at abstract vs full-text
- Included: final k studies; optional PRISMA-style flow bullets if no diagram tool
```

## Final deliverable template

Use this scaffold:

```markdown
# Evidence Brief

## Frozen PICOS (vX.Y, date)
...

## Search & sources
...

## Screening log (counts + exclusions)
...

## Included studies overview (table)

## Contradictions & robustness risks
...

## Socratic stress-test conclusions
...

## Practical claims you may defend in thesis (each with ≥1 citation)
...
```

---

## Supporting reference

Optional extended checklist: see [reference.md](reference.md) if splitting human vs AI screening.
