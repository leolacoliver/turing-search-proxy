### Cool Off Rule Implementation

- Legal requirement to establish contractors as truly independent (not misclassified employees)
  - Risk: Back taxes, benefits, additional fees if misclassified
  - Solution: Break economic dependence after continuous work
- Rule: 10 months continuous work → mandatory 6 weeks break
  - Applies to all jurisdictions, one-size-fits-all approach
  - Clock started October 2025 when talent moved to Flex platform
  - August 1, 2026 deadline approaching for first cohort

### Rule Mechanics & Edge Cases

- Cumulative counting system
  - Running timer per talent (not per contract)
  - Part-time vs full-time doesn’t matter
  - Multiple simultaneous contracts count as overlapping time only
- Break handling
  1. Less than 6 weeks: Timer pauses, resumes when returning
  2. 6+ weeks: Timer fully resets
  3. One-week break extends 10-month period by one week
- Contract types
  - Short-term contracts: Count toward timer
  - AHT (hourly): Count toward timer
  - PPT (pay-per-task): Excluded for now (not fully implemented)

### Implementation & Alternatives

- System integration needed
  - Surface timer info in TalentBridge and AIS
  - Automated offboarding when cool-off triggered
  - 1-month advance warning to delivery managers
- Alternative to cool-off: Convert to FTE
  - Resolves legal risk permanently
  - Not preferred by most talent (tax implications, lower pay)
  - Creates new risk if FTEs do same work as contractors

### Next Steps

- Henrique: Lead implementation across talent lifecycle systems
- Share meeting notes in team channel for review
- Connect with TalentBridge and AIS teams for system updates
- Keep team posted on progress via channel
