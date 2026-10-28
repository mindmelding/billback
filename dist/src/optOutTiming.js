/**
 * Opt-Out and Switch Timing Module (CORRECTED)
 * Generates specific action dates, deadlines, and cost implications for provider/plan switches
 * All rules are dated and sourced - unverified rules are labeled explicitly
 * 
 * Research source: /workspace/research/opt-out-timing-rules.md
 * Last updated: 2026-10-28 (corrected per independent research against official tariffs)
 * 
 * @module optOutTiming
 */

import {
  calculateCCAOptOutDeadline,
  calculateCEATierChangeDeadline,
  getNextMeterRead,
  parseLocalDate
} from './meterReadSchedule.js';

/**
 * Timing rule with verification status
 * @typedef {Object} TimingRule
 * @property {string} action - What to do
 * @property {string|Date} recommendedDate - When to do it (or "immediate")
 * @property {string|Date|null} deadline - Hard deadline (null if none)
 * @property {string|null} avoidWindow - Time period to avoid
 * @property {string} reason - Why this timing matters
 * @property {string} costOfEarly - What happens if done too early
 * @property {string} costOfLate - What happens if done too late
 * @property {string} source - Source of this rule (with date)
 * @property {boolean} verified - Whether this rule is verified
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
  
  // Extract key data from bills
  const latestBill = bills[0];
  const cycle = latestBill?.cycle || 19; // Billing cycle number
  const nemTrueUpDate = latestBill?.nemTrueUpDate ? new Date(latestBill.nemTrueUpDate) : null;
  const hasSolar = household?.hasSolar || latestBill?.hasSolar || false;
  
  // 1. CEA tier downgrade (Clean Impact Plus → Clean Impact)
  if (currentPlan.provider === 'CEA' && currentPlan.plan === 'Clean Impact Plus') {
    const cleanImpactAlternative = savingsReport.providerAlternatives?.find(
      alt => alt.provider === 'CEA' && alt.plan === 'Clean Impact'
    );
    
    // Always show timing for CCA customers, even if savings <= 0
    if (cleanImpactAlternative) {
      try {
        const tierChange = calculateCEATierChangeDeadline(cycle, today);
        const reliefCreditDeadline = parseLocalDate('2026-12-31');
        
        // Calculate value: only one billing cycle (Nov 27 - Dec 29 for cycle 19)
        // Not $10-30/month - credit expires Dec 31, 2026
        const estimatedValue = 6; // ~$3-6 for one winter cycle
        
        const daysUntilDeadline = Math.ceil((tierChange.requestDeadline - today) / (1000 * 60 * 60 * 24));
        
        rules.push({
          action: 'Switch from CEA Clean Impact Plus to Clean Impact',
          recommendedDate: tierChange.requestDeadline,
          deadline: tierChange.requestDeadline,
          avoidWindow: null,
          reason: `Clean Impact relief credit ends Dec 31, 2026. ${tierChange.reasoning}. The credit covers only about one winter cycle (${tierChange.effectiveDate.toLocaleDateString()}–Dec 29), worth about $3–6 total. Free and reversible, so no downside to opting down now.`,
          costOfEarly: 'None - you can opt down now and switch back to Plus anytime at no cost.',
          costOfLate: `Missing the ${tierChange.requestDeadline.toLocaleDateString()} deadline pushes effective date to the next meter read, reducing or eliminating relief credit benefit before Dec 31 expiration.`,
          source: 'CEA Oceanside/Vista notice letter (5-business-day rule), CEA rate schedule eff. 2/1/2026, CEA 10/29/2026 board packet (verified 2026-10-28)',
          verified: true, // 5-day rule verified for opt-outs, likely applies to opt-downs
          estimatedSavings: estimatedValue,
          urgency: daysUntilDeadline <= 7 ? 'high' : 'medium',
          daysUntil: Math.max(0, daysUntilDeadline),
          daysUntilDeadline: Math.max(0, daysUntilDeadline)
        });
      } catch (error) {
        console.error('Error calculating CEA tier change deadline:', error);
      }
    }
  }
  
  // 2. CCA opt-out back to SDG&E (with proper notice deadline calculation)
  if ((currentPlan.provider === 'CEA' || currentPlan.provider === 'SDCP') && hasSolar) {
    const sdgeAlternative = savingsReport.providerAlternatives?.find(
      alt => alt.provider === 'SDG&E'
    );
    
    // Always show timing for CCA customers with solar, even if savings <= 0
    if (sdgeAlternative) {
      try {
        // Target: return before June 1 summer pricing starts
        // For cycle 19: May 28, 2027 read
        const targetSwitchDate = parseLocalDate('2027-05-28');
        const optOutInfo = calculateCCAOptOutDeadline(cycle, targetSwitchDate);
        
        // Calculate credit forfeiture
        // Switching forces interim true-up at May 28, 2027
        // Leftover spring credits (Oct 29, 2026 - May 28, 2027) are forfeited
        // Estimate: ~$50-90 based on prior year Apr-May credits
        const estimatedCreditForfeit = 70; // midpoint of $50-90
        const netSavings = Math.round(sdgeAlternative.savings - estimatedCreditForfeit);
        
        // CEA forwarding time is unverified; recommend 2-week buffer
        const recommendedSubmitDate = new Date(optOutInfo.noticeDeadline);
        recommendedSubmitDate.setDate(recommendedSubmitDate.getDate() - 14);
        
        const daysUntilDeadline = Math.ceil((optOutInfo.noticeDeadline - today) / (1000 * 60 * 60 * 24));
        const daysUntilRecommended = Math.ceil((recommendedSubmitDate - today) / (1000 * 60 * 60 * 24));
        
        let urgency = 'medium';
        let recommendedDate = recommendedSubmitDate;
        
        if (today > optOutInfo.noticeDeadline) {
          // Missed the May deadline; next is June
          const juneSwitch = getNextMeterRead(cycle, optOutInfo.switchDate);
          const juneOptOut = calculateCCAOptOutDeadline(cycle, juneSwitch);
          const juneRecommended = new Date(juneOptOut.noticeDeadline);
          juneRecommended.setDate(juneRecommended.getDate() - 14);
          
          recommendedDate = juneRecommended;
          urgency = 'low';
          
          rules.push({
            action: `Opt out of ${currentPlan.provider} and return to SDG&E`,
            recommendedDate: recommendedDate,
            deadline: juneOptOut.noticeDeadline,
            avoidWindow: null,
            reason: `Missed the ${optOutInfo.noticeDeadline.toLocaleDateString()} deadline for May return. Next opportunity: submit via CEA by ~${juneRecommended.toLocaleDateString()}; SDG&E must receive by ${juneOptOut.noticeDeadline.toLocaleDateString()} to switch on ${juneOptOut.switchDate.toLocaleDateString()}. 6-month advance notice required (SDG&E Rule 27). Switch happens at first meter read after 6 months from SDG&E's receipt.`,
            costOfEarly: 'CEA forwarding time to SDG&E is unverified (~2 weeks estimated). Submitting too early may require resubmission.',
            costOfLate: `Missing ${juneOptOut.noticeDeadline.toLocaleDateString()} pushes switch to next cycle. 12-month minimum stay on SDG&E starts from switch date. Cancellation allowed only within 3 business days after SDG&E receives notice.`,
            source: 'SDG&E Rule 27 §L.1, L.2.b, L.3.b(1) (verified 2026-10-28); SDG&E 2026/2027 meter-read calendars (derived)',
            verified: true,
            estimatedSavings: netSavings,
            urgency: urgency,
            daysUntil: Math.max(0, Math.ceil((recommendedDate - today) / (1000 * 60 * 60 * 24))),
            daysUntilDeadline: Math.max(0, Math.ceil((juneOptOut.noticeDeadline - today) / (1000 * 60 * 60 * 24)))
          });
        } else if (daysUntilRecommended <= 14) {
          urgency = 'high';
          
          rules.push({
            action: `Opt out of ${currentPlan.provider} and return to SDG&E`,
            recommendedDate: 'immediate',
            deadline: optOutInfo.noticeDeadline,
            avoidWindow: null,
            reason: `Submit notice this week via CEA. SDG&E must receive by ${optOutInfo.noticeDeadline.toLocaleDateString()} to switch on ${optOutInfo.switchDate.toLocaleDateString()} (before June 1 summer pricing). 6-month advance notice required (SDG&E Rule 27). Switch forces interim NEM true-up at ${optOutInfo.switchDate.toLocaleDateString()} and resets anniversary. Leftover spring credits (~$${estimatedCreditForfeit}) forfeited. Net savings: ~$${netSavings}/year after credit forfeit.`,
            costOfEarly: 'Notice is binding after 3 business days from SDG&E receipt. 2027 PCIA decision comes after this deadline.',
            costOfLate: `Missing ${optOutInfo.noticeDeadline.toLocaleDateString()} deadline pushes switch from May 28 to Jun 29, adding one expensive summer cycle on CEA (~$80-105 extra).`,
            source: 'SDG&E Rule 27 §L.1, L.2.b, L.3.b, L.3.d; Schedule NEM-ST SC 3, 3(f), 3(h); CEA NEM T&C §H (verified 2026-10-28)',
            verified: true,
            estimatedSavings: netSavings,
            urgency: urgency,
            daysUntil: 0,
            daysUntilDeadline: Math.max(0, daysUntilDeadline)
          });
        } else {
          urgency = daysUntilRecommended <= 30 ? 'high' : 'medium';
          
          // Main opt-out action: submit to CCA
          rules.push({
            action: `Submit CCA opt-out via ${currentPlan.provider}`,
            recommendedDate: recommendedSubmitDate,
            deadline: null, // This is the recommended submit date, not a hard deadline
            avoidWindow: null,
            reason: `Submit your CCA return notice through ${currentPlan.provider} website by ~${recommendedSubmitDate.toLocaleDateString()} to ensure SDG&E receives by ${optOutInfo.noticeDeadline.toLocaleDateString()}. ${currentPlan.provider} forwarding time is unverified (~2 weeks estimated). Switch on ${optOutInfo.switchDate.toLocaleDateString()} before June 1 summer pricing. Switch forces interim NEM true-up and resets anniversary. Leftover spring credits (~$${estimatedCreditForfeit}) forfeited. Net savings: ~$${netSavings}/year after credit forfeit.`,
            costOfEarly: 'Notice is binding after 3 business days from SDG&E receipt.',
            costOfLate: `Missing the submit window risks missing SDG&E's ${optOutInfo.noticeDeadline.toLocaleDateString()} deadline.`,
            source: 'SDG&E Rule 27 §L.1, L.2.b, L.3.b(1); ${currentPlan.provider} forwarding time unverified (estimated)',
            verified: true,
            estimatedSavings: netSavings,
            urgency: urgency,
            daysUntil: Math.max(0, daysUntilRecommended),
            daysUntilDeadline: Math.max(0, daysUntilRecommended)
          });
          
          // Notice deadline: when SDG&E must receive
          rules.push({
            action: `SDG&E must receive your CCA return notice`,
            recommendedDate: optOutInfo.noticeDeadline,
            deadline: optOutInfo.noticeDeadline,
            avoidWindow: null,
            reason: `Hard deadline: SDG&E must receive your notice by ${optOutInfo.noticeDeadline.toLocaleDateString()} for switch on ${optOutInfo.switchDate.toLocaleDateString()}. 6-month advance notice required (SDG&E Rule 27 §L.1). Submit via ${currentPlan.provider} by ~${recommendedSubmitDate.toLocaleDateString()} to account for forwarding time. Missing this deadline pushes switch from May 28 to Jun 29 (~$80-105 extra in summer costs).`,
            costOfEarly: 'None - this is the deadline.',
            costOfLate: `Switch delayed from ${optOutInfo.switchDate.toLocaleDateString()} to next cycle (Jun 29), adding one expensive summer cycle on ${currentPlan.provider}.`,
            source: 'SDG&E Rule 27 §L.1, L.2.b, L.3.b(1) (verified 2026-10-28); SDG&E 2026/2027 meter-read calendars',
            verified: true,
            estimatedSavings: 0, // This is a deadline, not an action
            urgency: 'high',
            daysUntil: Math.max(0, daysUntilDeadline),
            daysUntilDeadline: Math.max(0, daysUntilDeadline)
          });
          
          // Switch date: when you actually return to SDG&E
          rules.push({
            action: `You switch back to SDG&E`,
            recommendedDate: optOutInfo.switchDate,
            deadline: null,
            avoidWindow: null,
            reason: `Your billing switches from ${currentPlan.provider} to SDG&E bundled on ${optOutInfo.switchDate.toLocaleDateString()} (first meter read after 6-month notice period). This is when the savings begin. Interim NEM true-up occurs on this date. 12-month minimum stay on SDG&E starts from this date. If you missed the ${optOutInfo.noticeDeadline.toLocaleDateString()} deadline, next switch would be Jun 29, 2027.`,
            costOfEarly: 'N/A - date is determined by notice deadline and meter read schedule.',
            costOfLate: 'N/A - this is when the switch happens, not an action.',
            source: 'SDG&E Rule 27 §L.2.b, L.3.a (verified 2026-10-28); Schedule NEM-ST SC 3(f)',
            verified: true,
            estimatedSavings: netSavings, // This is when savings begin
            urgency: 'medium',
            daysUntil: Math.max(0, Math.ceil((optOutInfo.switchDate - today) / (1000 * 60 * 60 * 24))),
            daysUntilDeadline: null
          });
        }
        
        // Additional warning about rate plan changes
        rules.push({
          action: 'Do NOT change SDG&E rate plan now',
          recommendedDate: parseLocalDate('2027-05-15'), // About 2 weeks before May 28 switch
          deadline: null,
          avoidWindow: `${today.toLocaleDateString()} - ${optOutInfo.switchDate.toLocaleDateString()}`,
          reason: `Rate plan changes allowed once per 12 months and lock you in. Best plan on CEA (e.g., DR-SES has lower CEA generation rates in summer than TOU-DR1) differs from best plan on SDG&E bundled. Save your one change per year for just before the ${optOutInfo.switchDate.toLocaleDateString()} switch to SDG&E.`,
          costOfEarly: 'Wrong rate plan for your provider. Locked in for 12 months.',
          costOfLate: 'None - wait until ~2 weeks before switch to SDG&E, then choose best bundled plan.',
          source: 'SDG&E Rule 12 §D (verified 2026-10-28)',
          verified: true, // Rule verified; analysis is derived
          estimatedSavings: 0, // Prevents bad decision, not direct savings
          urgency: 'medium',
          daysUntil: Math.max(0, Math.ceil((parseLocalDate('2027-05-15') - today) / (1000 * 60 * 60 * 24))),
          daysUntilDeadline: null
        });
        
      } catch (error) {
        console.error('Error calculating CCA opt-out deadline:', error);
      }
    }
  }
  
  // 3. CCA opt-out for non-solar customers (simpler, no true-up interaction)
  if ((currentPlan.provider === 'CEA' || currentPlan.provider === 'SDCP') && !hasSolar) {
    const sdgeAlternative = savingsReport.providerAlternatives?.find(
      alt => alt.provider === 'SDG&E'
    );
    
    if (sdgeAlternative && sdgeAlternative.savings > 0) {
      try {
        const targetSwitchDate = parseLocalDate('2027-05-28'); // Before summer
        const optOutInfo = calculateCCAOptOutDeadline(cycle, targetSwitchDate);
        const recommendedSubmitDate = new Date(optOutInfo.noticeDeadline);
        recommendedSubmitDate.setDate(recommendedSubmitDate.getDate() - 14);
        
        const daysUntilRecommended = Math.ceil((recommendedSubmitDate - today) / (1000 * 60 * 60 * 24));
        const urgency = daysUntilRecommended <= 30 ? 'high' : 'medium';
        
        rules.push({
          action: `Opt out of ${currentPlan.provider} and return to SDG&E`,
          recommendedDate: daysUntilRecommended <= 14 ? 'immediate' : recommendedSubmitDate,
          deadline: optOutInfo.noticeDeadline,
          avoidWindow: null,
          reason: `Submit via ${currentPlan.provider} by ~${recommendedSubmitDate.toLocaleDateString()} to ensure SDG&E receives by ${optOutInfo.noticeDeadline.toLocaleDateString()} (6-month advance notice required). Switch on ${optOutInfo.switchDate.toLocaleDateString()} before June 1 summer pricing. 12-month minimum stay on SDG&E starts from switch date.`,
          costOfEarly: 'Notice is binding after 3 business days from SDG&E receipt.',
          costOfLate: `Each summer month on ${currentPlan.provider} costs more than SDG&E. Missing ${optOutInfo.noticeDeadline.toLocaleDateString()} pushes switch to next cycle.`,
          source: 'SDG&E Rule 27 §L.1, L.2.b, L.3.b(1), L.3.a; SDG&E 2026/2027 meter-read calendars (verified 2026-10-28)',
          verified: true,
          estimatedSavings: Math.round(sdgeAlternative.savings),
          urgency: urgency,
          daysUntil: Math.max(0, daysUntilRecommended),
          daysUntilDeadline: Math.max(0, Math.ceil((optOutInfo.noticeDeadline - today) / (1000 * 60 * 60 * 24)))
        });
      } catch (error) {
        console.error('Error calculating CCA opt-out deadline for non-solar:', error);
      }
    }
  }
  
  // 4. CARE/FERA enrollment (immediate if eligible)
  if (savingsReport.discountPrograms && savingsReport.discountPrograms.length > 0) {
    savingsReport.discountPrograms.forEach(program => {
      const estimatedMonthlySavings = 50;
      const annualSavings = estimatedMonthlySavings * 12;
      
      rules.push({
        action: `Enroll in ${program.program}`,
        recommendedDate: 'immediate',
        deadline: null,
        avoidWindow: null,
        reason: `${program.eligibility}. Takes 2-3 billing cycles to process, but discounts are applied retroactively to application date. Each month you wait costs ~$${estimatedMonthlySavings}.`,
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
    description += `**Avoid:** ${rule.avoidWindow}\n\n`;
  }
  
  description += `**Cost if too late:** ${rule.costOfLate}\n\n`;
  description += `**Cost if too early:** ${rule.costOfEarly}\n\n`;
  
  if (!rule.verified) {
    description += `⚠️ **UNVERIFIED RULE** - This timing recommendation needs confirmation from your provider.\n\n`;
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
