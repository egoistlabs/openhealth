---
title: Sleep duration measure
topic: measure
keywords: [sleep duration, sleep, hours, baseline, measure]
source: Project data contract; B1
authorised_by: Pending team review
added: 2026-11-14
status: active
replaces:
---

Sleep duration is derived from the check-in's reported sleep and wake times,
using the core loop's B1 data shape and calculation. The companion must not
calculate or infer duration. Application code owns the baseline, status,
trend, and suggested action. Ask the core loop for its current result if
available; otherwise say the number is not available.
