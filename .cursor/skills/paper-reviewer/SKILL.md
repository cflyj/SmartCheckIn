---
name: paper-reviewer
description: Simulates a journal editorial board review with EIC, three heterogeneous reviewers plus a Devil's Advocate reviewer, culminating in quantitative numeric scores and ranked revision priorities (7 roles). Use when the user submits a manuscript or thesis chapter for adversarial critique or desk-reject resilience testing.
disable-model-invocation: true
---

# Paper Reviewer — EiC + 3 + Devil's Advocate（7 Agents）

## Inputs required from author

Paste or point to manuscript + optionally **venue**.

If omitted, reviewer stack assumes **engineering / HCI-style empirical software paper** heuristic.

---

## Seven roles（each outputs independent review）

| Role | Stance |
|---|---|
| R0 EiC Desk | Acceptance likelihood & desk drivers; skim ethics/compliance |
| R1 Reviewer A — Methods/Reproducibility | Design threats; leakage; benchmark fairness |
| R2 Reviewer B — Contributions/Novelty | Incrementality vs rebranding jargon |
| R3 Reviewer C — Presentation/Related work | Narrative cohesion; vagueness-reduction |
| R4 Statistical / Inference hawk | Statistical abuse & inferential leaps |
| R5 Devil's Advocate | Maximally hostile stress-test—even if asymmetric |
| R6 Quant consolidate + numeric scoring clerk | Harmonize scores; forbid premature smoothing |

---

## Quantitative scoring (0–10, two decimals optional)

Evaluate dimensions independently:

| Dimension | Guidance |
|---|---|
| novelty | originality vs incremental |
| correctness | methodological soundness claims |
| clarity | exposition & structure |
| significance | plausible impact footprint |
| ethics | misuse risk, overstated biometric claims |

Then compute **`composite = 0.30*novelty + 0.25*correctness + 0.20*clarity + 0.20*significance + 0.05*ethics`** (adjust weights openly if mismatch domain).

Produce both **Reviewer-wise vector** AND **overall interval** (best/worst).

---

## Output template

```markdown
# Review Ensemble

## EiC Recommendation
Desk: ...
Bar decision drivers: ...

## Reviewer matrices
| reviewer | novelty | corr | clarify | significance | ethics | weighted |
|---|---|---|---|---|---|---|

## Ranked actionable revisions (severity-tagged)

## Devil's Advocate must-address list

## If only 72h revise order
...
```
