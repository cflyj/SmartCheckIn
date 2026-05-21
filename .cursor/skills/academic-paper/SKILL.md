---
name: academic-paper
description: Multi-agent journal-style prose calibration (“Style Calibration toward venue”) across IMRAD-aligned sections without inventing citations (12 simulated roles). Use when polishing thesis chapters, drafts for journals, abstracts, introductions, methods, contributions, limitations, or when the user names a venue or style guide.
disable-model-invocation: true
---

# Academic Paper — Style Calibration（12 Agents）

## Purpose

Elevate drafts toward **journal/dissertation register**: density, causal language discipline, novelty framing, reproducibility wording—**without fabricated references**.

---

## Calibration loop

1. **Venue sniff pass**: infer target rhetorical package (IEEE-style crispness vs ACM narrative vs APA psychology hedging)—or obey user-specified venue.
2. Fix **truth budget**: explicitly mark hypotheses vs empirical claims vs folklore.
3. Run the 12 roles below → merge into a **`CALIBRATED PATCH`** list (replace paragraph X with Y rationale).

---

## Twelve agents（run in order）

| Agent | Focus | Calibration moves |
|---|---|---|
| G1 Venue gatekeeper | Fit & forbidden moves | Venue tone + taboo phrases |
| G2 Contribution laser | Contribution sentence | Sharpen 1-line claim |
| G3 Novelty scaler | Claims vs stakes | Narrow/broad to match evidence |
| G4 IMRAD carpenter | Skeleton | Heading order & redundancy cuts |
| G5 Methods auditor | Repeatability | Add missing reproducibility kernels |
| G6 Statistical voice | Inference hygiene | Hedge where needed; forbid overclaim |
| G7 Evidence linker | Paragraph logic | premise→support→implication arcs |
| G8 Definitions curator | Terms | glossary consistency |
| G9 Hedging tuner | Credibility optics | modality audit (might/may/suggest) |
| G10 Boilerplate remover | Density | purge filler & circular intros |
| G11 Paragraph rhythm | Readability | average sentence variety w/o slang |
| G12 Bibliography sentinel | Integrity | warn on missing cites; never invent DOI/arbitrary metadata |

---

## Output contract

Produce:

```markdown
## Calibration Report

### Venue targets
- Venue / style hypotheses: ...

### Patch list（apply top-down）
1. [Section/path] OLD → NEW (reason)
...

### Forbidden patterns removed
...

### Contribution line（≤40 words）

### Limitations paragraph tightened

### Open questions flagged for citations
...
```

---

## Guardrails

- If user lacks citations where claims need them, emit **`[CITE NEEDED]`** tags instead of hallucinating titles.
- For Chinese thesis mixed with English terms, unify **terms per chapter** Table.
