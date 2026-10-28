/**
 * Opt-Out and Switch Timing Module
 * Generates specific action dates, deadlines, and cost implications for provider/plan switches
 * All rules are dated and sourced - unverified rules are labeled explicitly
 * 
 * Research source: /workspace/research/opt-out-timing-rules.md
 * Last updated: 2026-10-28
 * 
 * @module optOutTiming
 */

/**
 * Timing rule with verification status
 * @typedef {Object} TimingRule
 * @property {string} action - What to do
 * @property {string|Date} recommendedDate - When to do it (or "immediate")
 * @property {string|Date|null} deadline - Hard deadline (null if none)
 * @property {string|null} avoidWindow - Time period to avoid (e.g. "6-8 months before true-up")
 * @property {string} reason - Why this timing matters
 * @property {string} costOfEarly - What happens if done too early
 * @property {string} costOfLate - What happens if done too late
 * @property {string} source - Source of this rule (with date)
 * @property {boolean} verified - Whether this rule is verified (false = hypothesis/needs research)
 * @property {number} estimatedSavings - Annual savings if action is taken (dollars)
 * @property {string} urgency - "high", "medium", "low"
 */

/**
 * Calculate opt-out and switch timing recommendations for a household
 * @param {Object} currentPlan - Current provider and plan info
 * @param {Array} bills - Parsed bill data
 * @param {Object} savingsReport - Output from engine.js
 * @param {Object} household - Household info
 * @returns {Array<TimingRule>} List of timing recommendations
 */
export function calculateOptOutTiming(currentPlan, bills, savingsReport, household) {
  const rules = [];
  const today = new Date();
  
  // Extract key dates from bills
  const latestBill = bills[0]; // Assume sorted by date descending
  const nemTrueUpDate = latestBill?.nemTrueUpDate ? new Date(latestBill.nemTrueUpDate) : null;
  const hasSolar = household?.hasSolar || latestBill?.hasSolar || false;
  
  // 1. CEA tier downgrade (Clean Impact Plus → Clean Impact)
  if (currentPlan.provider === 'CEA' && currentPlan.plan === 'Clean Impact Plus') {
    const cleanImpactAlternative = savingsReport.providerAlternatives?.find(
      alt => alt.provider === 'CEA' && alt.plan === 'Clean Impact'
    );
    
    if (cleanImpactAlternative && cleanImpactAlternative.savings > 0) {
      const reliefCreditDeadline = new Date('2026-12-31');
      const recommendedActionDate = new Date('2026-11-01');
      const daysUntilDeadline = Math.ceil((reliefCreditDeadline - today) / (1000 * 60 * 60 * 24));
      
      rules.push({
        action: 'Switch from CEA Clean Impact Plus to Clean Impact',
        recommendedDate: recommendedActionDate,
        deadline: reliefCreditDeadline,
        avoidWindow: null,
        reason: `Clean Impact relief credit ends Dec 31, 2026. Requesting by Nov 1 ensures your December billing cycle captures the last month of the credit (worth ~$10-30). After Jan 1, 2027, Clean Impact rates increase $0.01-0.02/kWh.`,
        costOfEarly: 'None - you can switch down anytime and still benefit from current lower rates.',
        costOfLate: `Missing each month of relief credit costs ~$10-30. After Dec 31, 2026, Clean Impact becomes more expensive.`,
        source: 'CEA 2026 rate announcement (verified 2026-10-28)',
        verified: true,
        estimatedSavings: Math.round(cleanImpactAlternative.savings),
        urgency: daysUntilDeadline < 60 ? 'high' : 'medium',
        daysUntil: Math.max(0, Math.ceil((recommendedActionDate - today) / (1000 * 60 * 60 * 24))),
        daysUntilDeadline: Math.max(0, daysUntilDeadline)
      });
    }
  }
  
  // 2. CCA opt-out back to SDG&E (for solar customers - coordinate with true-up)
  if ((currentPlan.provider === 'CEA' || currentPlan.provider === 'SDCP') && hasSolar && nemTrueUpDate) {
    const sdgeAlternative = savingsReport.providerAlternatives?.find(
      alt => alt.provider === 'SDG&E'
    );
    
    if (sdgeAlternative && sdgeAlternative.savings > 0) {
      // Calculate optimal window: 60 days after true-up
      const optimalStart = new Date(nemTrueUpDate);
      optimalStart.setDate(optimalStart.getDate() + 1);
      
      const optimalEnd = new Date(nemTrueUpDate);
      optimalEnd.setDate(optimalEnd.getDate() + 60);
      
      // Avoid window: 6-8 months before true-up
      const avoidStart = new Date(nemTrueUpDate);
      avoidStart.setMonth(avoidStart.getMonth() - 8);
      
      const avoidEnd = new Date(nemTrueUpDate);
      avoidEnd.setMonth(avoidEnd.getMonth() - 6);
      
      let recommendedDate;
      let urgency = 'medium';
      let reason;
      
      if (today >= optimalStart && today <= optimalEnd) {
        // We're in the optimal window now
        recommendedDate = 'immediate';
        urgency = 'high';
        reason = `You're in the optimal 60-day window after your true-up (${nemTrueUpDate.toLocaleDateString()}). Switching now minimizes disruption to your NEM cycle and avoids a mid-cycle interim true-up.`;
      } else if (today < optimalStart) {
        // True-up hasn't happened yet
        const daysUntilTrueUp = Math.ceil((nemTrueUpDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilTrueUp < 30) {
          recommendedDate = optimalStart;
          urgency = 'medium';
          reason = `Wait until after your true-up on ${nemTrueUpDate.toLocaleDateString()} to switch. Switching now would trigger an interim true-up and restart your NEM cycle early. Optimal window: ${optimalStart.toLocaleDateString()} - ${optimalEnd.toLocaleDateString()}.`;
        } else {
          recommendedDate = optimalStart;
          urgency = 'low';
          reason = `Plan to switch in the 60-day window after your true-up (${optimalStart.toLocaleDateString()} - ${optimalEnd.toLocaleDateString()}). Switching mid-cycle triggers an interim true-up and can cost you summer solar credits.`;
        }
      } else {
        // We're past the optimal window - calculate next true-up
        const nextTrueUp = new Date(nemTrueUpDate);
        nextTrueUp.setFullYear(nextTrueUp.getFullYear() + 1);
        
        const nextOptimalStart = new Date(nextTrueUp);
        nextOptimalStart.setDate(nextOptimalStart.getDate() + 1);
        
        recommendedDate = nextOptimalStart;
        urgency = 'low';
        reason = `You're past this year's optimal window. Next safe window is after your ${nextTrueUp.getFullYear()} true-up (${nextOptimalStart.toLocaleDateString()}). Switching mid-cycle triggers interim true-up.`;
      }
      
      rules.push({
        action: `Opt out of ${currentPlan.provider} and return to SDG&E`,
        recommendedDate: recommendedDate,
        deadline: null,
        avoidWindow: `${avoidStart.toLocaleDateString()} - ${avoidEnd.toLocaleDateString()} (6-8 months before true-up)`,
        reason: reason,
        costOfEarly: 'Switching mid-cycle triggers interim true-up, restarting your NEM billing cycle early. You may lose summer generation credits that would offset winter usage.',
        costOfLate: 'Each month on the more expensive CCA costs you money. Balance this against avoiding mid-cycle disruption.',
        source: 'SDG&E Electric Rule 27 Section 5.3 (verified 2026-10-28)',
        verified: true,
        estimatedSavings: Math.round(sdgeAlternative.savings),
        urgency: urgency,
        daysUntil: recommendedDate === 'immediate' ? 0 : Math.max(0, Math.ceil((new Date(recommendedDate) - today) / (1000 * 60 * 60 * 24))),
        daysUntilDeadline: null
      });
    }
  }
  
  // 3. CCA opt-out for non-solar customers (before summer)
  if ((currentPlan.provider === 'CEA' || currentPlan.provider === 'SDCP') && !hasSolar) {
    const sdgeAlternative = savingsReport.providerAlternatives?.find(
      alt => alt.provider === 'SDG&E'
    );
    
    if (sdgeAlternative && sdgeAlternative.savings > 0) {
      // Recommend switching by May 1 to avoid high summer rates
      const summerDeadline = new Date(today.getFullYear(), 4, 1); // May 1
      if (summerDeadline < today) {
        summerDeadline.setFullYear(summerDeadline.getFullYear() + 1);
      }
      
      const daysUntilSummer = Math.ceil((summerDeadline - today) / (1000 * 60 * 60 * 24));
      let urgency = 'low';
      let recommendedDate = summerDeadline;
      
      // Adjust recommendation based on current month
      const currentMonth = today.getMonth();
      if (currentMonth >= 5 && currentMonth <= 8) {
        // June-September: already in summer
        urgency = 'medium';
        recommendedDate = 'immediate';
      } else if (currentMonth === 3 || currentMonth === 4) {
        // April-May: approaching summer
        urgency = 'high';
        recommendedDate = 'immediate';
      }
      
      rules.push({
        action: `Opt out of ${currentPlan.provider} and return to SDG&E`,
        recommendedDate: recommendedDate,
        deadline: null,
        avoidWindow: 'June - September (high summer rates during CCA enrollment processing)',
        reason: daysUntilSummer < 90 
          ? `Switch by May 1 to avoid ${currentPlan.provider}'s higher summer peak rates (June-Sept). CCA opt-out takes ~6 months to process (unverified), so act early.`
          : `${currentPlan.provider} has higher rates than SDG&E for your usage. Plan to switch by May to avoid processing delay into summer.`,
        costOfEarly: 'None - switching in winter/spring is optimal timing.',
        costOfLate: `Each summer month on ${currentPlan.provider} costs ~$30-60 more than SDG&E (varies by usage). Processing delays mean you could be stuck through summer.`,
        source: 'CCA 6-month processing estimate (UNVERIFIED - needs confirmation from CEA/SDCP)',
        verified: false, // This rule is unverified
        estimatedSavings: Math.round(sdgeAlternative.savings),
        urgency: urgency,
        daysUntil: recommendedDate === 'immediate' ? 0 : Math.max(0, daysUntilSummer),
        daysUntilDeadline: null
      });
    }
  }
  
  // 4. CARE/FERA enrollment (immediate if eligible)
  if (savingsReport.discountPrograms && savingsReport.discountPrograms.length > 0) {
    savingsReport.discountPrograms.forEach(program => {
      // Estimate annual savings: assume $50/month average (30-35% off bills)
      const estimatedMonthlySavings = 50;
      const annualSavings = estimatedMonthlySavings * 12;
      
      rules.push({
        action: `Enroll in ${program.program}`,
        recommendedDate: 'immediate',
        deadline: null,
        avoidWindow: null,
        reason: `${program.eligibility}. Takes 2-3 billing cycles to process, but discounts are applied retroactively to your application date. Each month you wait costs ~$${estimatedMonthlySavings}.`,
        costOfEarly: 'None - apply immediately if eligible. Self-attestation allowed.',
        costOfLate: `~$${estimatedMonthlySavings} per month in lost discounts for each month you delay.`,
        source: 'SDG&E CARE/FERA page, CA PUC D.20-07-032 (verified 2026-10-28)',
        verified: true,
        estimatedSavings: annualSavings,
        urgency: 'high',
        daysUntil: 0,
        daysUntilDeadline: null
      });
    });
  }
  
  // 5. SDG&E rate plan changes (if beneficial)
  // This would require deeper analysis of which rate plan is optimal
  // Placeholder for future enhancement
  
  return rules.sort((a, b) => {
    // Sort by urgency, then by days until action
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    }
    
    const aDays = a.daysUntil === null ? Infinity : a.daysUntil;
    const bDays = b.daysUntil === null ? Infinity : b.daysUntil;
    return aDays - bDays;
  });
}

/**
 * Format a timing rule as a human-readable action step
 * @param {TimingRule} rule
 * @returns {Object} Formatted action step for actionPlan.js
 */
export function formatTimingRuleAsAction(rule) {
  let dateDisplay;
  if (rule.recommendedDate === 'immediate') {
    dateDisplay = 'As soon as possible';
  } else if (rule.recommendedDate instanceof Date) {
    dateDisplay = rule.recommendedDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  } else {
    dateDisplay = rule.recommendedDate;
  }
  
  let title = rule.action;
  if (rule.daysUntil === 0) {
    title += ' (NOW)';
  } else if (rule.daysUntil && rule.daysUntil <= 30) {
    title += ` (in ${rule.daysUntil} days)`;
  }
  
  let description = `**When:** ${dateDisplay}\n\n`;
  description += `**Why:** ${rule.reason}\n\n`;
  
  if (rule.deadline) {
    const deadlineStr = rule.deadline instanceof Date 
      ? rule.deadline.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : rule.deadline;
    description += `**Deadline:** ${deadlineStr}\n\n`;
  }
  
  if (rule.avoidWindow) {
    description += `**Avoid switching during:** ${rule.avoidWindow}\n\n`;
  }
  
  description += `**Cost if too late:** ${rule.costOfLate}\n\n`;
  description += `**Cost if too early:** ${rule.costOfEarly}\n\n`;
  
  if (!rule.verified) {
    description += `⚠️ **UNVERIFIED RULE** - This timing recommendation is based on preliminary research and needs confirmation from your provider.\n\n`;
  }
  
  description += `**Source:** ${rule.source}`;
  
  return {
    id: `opt_out_${rule.action.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    what: title,
    how: description,
    date: rule.recommendedDate === 'immediate' ? new Date() : rule.recommendedDate,
    deadline: rule.deadline,
    estimatedSavings: rule.estimatedSavings,
    urgency: rule.urgency,
    verified: rule.verified,
    source: rule.source,
    category: 'opt-out',
    recurring: null
  };
}

/**
 * Get countdown text for a timing rule
 * @param {TimingRule} rule
 * @returns {string} Human-readable countdown
 */
export function getCountdownText(rule) {
  if (rule.daysUntil === 0) {
    return 'Act now';
  }
  
  if (rule.daysUntil === null) {
    return 'No deadline';
  }
  
  if (rule.daysUntil <= 7) {
    return `${rule.daysUntil} days`;
  }
  
  if (rule.daysUntil <= 30) {
    const weeks = Math.ceil(rule.daysUntil / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''}`;
  }
  
  if (rule.daysUntil <= 365) {
    const months = Math.ceil(rule.daysUntil / 30);
    return `${months} month${months > 1 ? 's' : ''}`;
  }
  
  const years = Math.floor(rule.daysUntil / 365);
  return `${years} year${years > 1 ? 's' : ''}`;
}

/**
 * Check if action is time-sensitive (needs attention soon)
 * @param {TimingRule} rule
 * @returns {boolean}
 */
export function isTimeSensitive(rule) {
  if (rule.urgency === 'high') return true;
  if (rule.daysUntil !== null && rule.daysUntil <= 30) return true;
  if (rule.daysUntilDeadline !== null && rule.daysUntilDeadline <= 60) return true;
  return false;
}
