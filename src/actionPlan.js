/**
 * Dated Action Plan Generator
 * Creates timeline of concrete steps with dates, sources, and instructions
 * Per CLAUDE.md: customer gives final click/signature
 */

import { 
  calculateOptOutTiming, 
  formatTimingRuleAsAction 
} from './optOutTiming.js';

/**
 * Generate dated action plan from savings report
 * @param {Object} report - Savings report from engine
 * @param {Object} bills - Parsed bill data (for dates, provider info)
 * @param {Object} household - Household info (for timing calculations)
 * @returns {Object} { steps: [...], recurringReminders: [...] }
 */
export function generateDatedActionPlan(report, bills, household = {}) {
  const steps = [];
  const recurringReminders = [];
  const today = new Date();
  
  // Get opt-out/switch timing recommendations first (these are time-sensitive)
  const currentBill = bills && bills.length > 0 ? bills[0] : null;
  if (currentBill && report) {
    const currentPlan = {
      provider: currentBill.provider || report.currentPlan?.provider,
      plan: currentBill.providerTier || report.currentPlan?.plan
    };
    
    const timingRules = calculateOptOutTiming(currentPlan, bills, report, household);
    
    // Convert timing rules to action steps and add to steps array
    timingRules.forEach(rule => {
      const action = formatTimingRuleAsAction(rule);
      steps.push({
        id: action.id,
        title: action.what,
        description: action.how,
        doByDate: action.date instanceof Date ? action.date.toISOString().split('T')[0] : null,
        doByDateSource: action.source,
        urgency: action.urgency,
        category: action.category || 'Provider',
        estimatedSavings: action.estimatedSavings ? `$${action.estimatedSavings}/year` : null,
        verified: action.verified,
        howTo: {
          type: 'action',
          instructions: [action.how]
        },
        completionTime: '5-10 minutes',
        renterOk: true
      });
    });
  }
  
  // Helper to create step object
  const createStep = (config) => ({
    id: config.id,
    title: config.title,
    description: config.description,
    doByDate: config.doByDate,
    doByDateSource: config.doByDateSource,
    urgency: config.urgency || 'normal', // urgent, high, normal, low
    category: config.category,
    estimatedSavings: config.estimatedSavings,
    howTo: config.howTo, // { type: 'link'|'call'|'form', details, instructions }
    completionTime: config.completionTime, // e.g., "3 minutes"
    renterOk: config.renterOk !== false
  });

  // 1. NEM True-Up (if urgent)
  if (report.nemTrueUpProjection && !report.nemTrueUpProjection.isPast) {
    const projection = report.nemTrueUpProjection;
    if (projection.isUrgent || projection.daysUntil <= 90) {
      steps.push(createStep({
        id: 'nem-trueup-prep',
        title: `Prepare for Solar True-Up: $${Array.isArray(projection.projectedBalance) ? Math.round(projection.projectedBalance[1]) : Math.round(projection.currentBalance)}`,
        description: projection.message,
        doByDate: projection.trueUpDate,
        doByDateSource: `SDG&E NEM billing cycle (${projection.basis})`,
        urgency: projection.daysUntil <= 30 ? 'urgent' : 'high',
        category: 'Solar',
        estimatedSavings: null,
        howTo: {
          type: 'action',
          instructions: [
            `Set aside $${Array.isArray(projection.projectedBalance) ? Math.round(projection.projectedBalance[1]) : Math.round(projection.currentBalance)}`,
            'Review if you want to switch providers AFTER this true-up',
            'Consider changing rate plan before next NEM year starts'
          ]
        },
        completionTime: '15 minutes'
      }));
    }
  }

  // Note: CEA tier changes and CCA opt-out timing now handled by optOutTiming module above

  // 1. CPUC SDG&E Rate Hike Hearings (Nov 10, Dec 9-10, 2026)
  const nov10 = new Date('2026-11-10');
  const dec9 = new Date('2026-12-09');
  
  if (nov10 > today) {
    steps.push(createStep({
      id: 'cpuc-hearing-nov10',
      title: 'Submit Comment on SDG&E Rate Hike (In-Person Hearing Nov 10)',
      description: 'CPUC public hearing on SDG&E\'s 2028 rate increase proposal (+8.1% in 2028, ~$14/mo). Submit your comment with your bill\'s numbers. Hearing at Santee City Hall, 6 pm.',
      doByDate: '2026-11-10',
      doByDateSource: 'CPUC Notice of Public Participation Hearing, A.26-06-015',
      urgency: Math.ceil((nov10 - today) / (1000 * 60 * 60 * 24)) <= 7 ? 'high' : 'normal',
      category: 'Advocacy',
      estimatedSavings: null,
      howTo: {
        type: 'link',
        url: 'https://apps.cpuc.ca.gov/c/A2606015',
        instructions: [
          'Submit online at apps.cpuc.ca.gov/c/A2606015',
          'Or attend in person: Santee City Hall, 10601 Magnolia Ave, Santee, 6 pm',
          'Use your bill\'s actual numbers (more weight than generic comments)',
          'Mention application A.26-06-015'
        ]
      },
      completionTime: '2-5 minutes'
    }));
  }
  
  if (dec9 > today && dec9 > nov10) {
    steps.push(createStep({
      id: 'cpuc-hearing-dec9',
      title: 'Submit Comment on SDG&E Rate Hike (Virtual Hearing Dec 9-10)',
      description: 'CPUC virtual public hearing on SDG&E\'s 2028 rate increase. Phone/webcast participation. Submit comment with your bill\'s numbers.',
      doByDate: '2026-12-10',
      doByDateSource: 'CPUC Notice of Public Participation Hearing, A.26-06-015',
      urgency: Math.ceil((dec9 - today) / (1000 * 60 * 60 * 24)) <= 7 ? 'high' : 'normal',
      category: 'Advocacy',
      estimatedSavings: null,
      howTo: {
        type: 'link',
        url: 'https://apps.cpuc.ca.gov/c/A2606015',
        instructions: [
          'Submit online before or during the hearing',
          'Virtual participation: check CPUC website for dial-in/webcast info',
          'Dec 9-10, 2026 (times TBD)',
          'Use your actual bill numbers for more impact'
        ]
      },
      completionTime: '2-5 minutes'
    }));
  }

  // 2. Summer thermostat schedule (before TOU summer season starts Jun 1)
  const jun1Next = new Date(today.getFullYear(), 5, 1); // June 1
  if (jun1Next < today) {
    jun1Next.setFullYear(jun1Next.getFullYear() + 1);
  }
  const mayStart = new Date(jun1Next);
  mayStart.setDate(mayStart.getDate() - 14); // 2 weeks before June 1
  
  if (mayStart > today && report.electricActions) {
    const thermostatAction = report.electricActions.find(a => a.id === 'thermostat');
    if (thermostatAction) {
      steps.push(createStep({
        id: 'summer-thermostat-setup',
        title: 'Set Summer Pre-Cool Thermostat Schedule',
        description: `Cool the home while power is cheaper (before 4 pm), then coast through 4-9 pm peak pricing. Saves $${thermostatAction.annualSavingsRange ? Math.round(thermostatAction.annualSavingsRange[0]) + '–' + Math.round(thermostatAction.annualSavingsRange[1]) : '25-55'}/summer.`,
        doByDate: jun1Next.toISOString().split('T')[0],
        doByDateSource: 'SDG&E TOU-DR1 summer season starts June 1 (Schedule TOU-DR1)',
        urgency: Math.ceil((mayStart - today) / (1000 * 60 * 60 * 24)) <= 30 ? 'normal' : 'low',
        category: 'Seasonal',
        estimatedSavings: thermostatAction.annualSavingsRange 
          ? `$${Math.round(thermostatAction.annualSavingsRange[0])}–${Math.round(thermostatAction.annualSavingsRange[1])}/year`
          : null,
        howTo: {
          type: 'action',
          instructions: [
            'In your thermostat app, set up a cooling schedule',
            '12:30 pm: 73°F (start cooling)',
            '2:00 pm: 72°F (pre-cool)',
            '4:00 pm: 78°F (peak starts, coast)',
            '9:00 pm: 76°F (peak ends)',
            'Close west-facing blinds by 1 pm',
            'Run fans in evening for comfort'
          ],
          links: [
            { text: 'Full schedule details', url: '/app/index.html#actions' }
          ]
        },
        completionTime: '5 minutes'
      }));
    }
  }

  // Note: CARE/FERA enrollment now handled by optOutTiming module above

  // 3. Electric actions (ongoing/immediate)
  if (report.electricActions) {
    report.electricActions.slice(0, 3).forEach((action, i) => {
      if (action.id !== 'thermostat') { // already handled as seasonal
        steps.push(createStep({
          id: action.id,
          title: action.action,
          description: action.basis,
          doByDate: addDays(today, 7 + i * 3), // stagger over next few weeks
          doByDateSource: 'Start soon for immediate savings',
          urgency: 'normal',
          category: 'Electric',
          estimatedSavings: action.annualSavingsRange 
            ? `$${Math.round(action.annualSavingsRange[0])}–${Math.round(action.annualSavingsRange[1])}/year`
            : null,
          howTo: {
            type: 'action',
            instructions: getActionInstructions(action)
          },
          completionTime: getActionTime(action)
        }));
      }
    });
  }

  // 4. Gas actions (heating season)
  if (report.gasActions && report.gasActions.length > 0) {
    const novStart = new Date(today.getFullYear(), 10, 1); // Nov 1 (winter TOU starts)
    if (novStart < today) {
      novStart.setFullYear(novStart.getFullYear() + 1);
    }
    
    report.gasActions.forEach((action, i) => {
      steps.push(createStep({
        id: action.id,
        title: action.action,
        description: action.basis,
        doByDate: i === 0 ? addDays(today, 7) : novStart.toISOString().split('T')[0],
        doByDateSource: i === 0 ? 'Immediate savings' : 'SDG&E winter season starts Nov 1',
        urgency: i === 0 ? 'normal' : 'low',
        category: 'Gas',
        estimatedSavings: action.annualSavingsRange 
          ? `$${Math.round(action.annualSavingsRange[0])}–${Math.round(action.annualSavingsRange[1])}/year`
          : null,
        howTo: {
          type: 'action',
          instructions: getActionInstructions(action)
        },
        completionTime: getActionTime(action),
        renterOk: action.renterOk
      }));
    });
  }

  // 5. Recurring reminders
  recurringReminders.push({
    id: 'monthly-bill-check',
    title: 'Review Monthly Bill',
    description: 'Check for errors, rate changes, or unexpected charges',
    frequency: 'monthly',
    estimatedTime: '2 minutes',
    instructions: [
      'Compare kWh usage to prior month',
      'Verify rate plan is correct',
      'Check for unexpected fees',
      'Confirm CARE/FERA discount if enrolled'
    ]
  });

  if (report.nemTrueUpProjection && !report.nemTrueUpProjection.isPast) {
    recurringReminders.push({
      id: 'trueup-balance-check',
      title: 'Check NEM True-Up Balance',
      description: 'Track your running balance to avoid surprises',
      frequency: 'monthly',
      estimatedTime: '1 minute',
      instructions: [
        'Check "Net Metering YTD Balance" on bill',
        `Next true-up: ${report.nemTrueUpProjection.trueUpDate}`,
        'Set aside money monthly to spread the cost'
      ]
    });
  }

  // Sort steps by date
  steps.sort((a, b) => new Date(a.doByDate) - new Date(b.doByDate));

  return {
    steps,
    recurringReminders,
    generatedAt: new Date().toISOString()
  };
}

// Helper functions
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

function getActionInstructions(action) {
  const instructions = {
    'dryer': [
      'Run dryer before 2 pm on weekends',
      'Or after 9 pm on weekdays',
      'Avoid 4-9 pm (89¢/kWh on CEA, 67¢ on SDG&E)',
      '~3 kWh per load = $1.50+ savings per load shifted'
    ],
    'dishwasher': [
      'Use delay start feature',
      'Set to start after midnight',
      'Use air dry setting',
      '~1.2 kWh per cycle saved from peak pricing'
    ],
    'fans': [
      'Use ceiling/floor fans 4-9 pm',
      'Close west-facing blinds by 1 pm',
      'Raise thermostat 2-4°F with fans running',
      'Fan uses 30-60W vs AC compressor 3,000W+'
    ],
    'plugs': [
      'Identify devices that run 4-9 pm',
      'Put on smart plugs or timers',
      'Auto-off dehumidifiers, chargers, PC monitors',
      'Schedule to turn off 4 pm, on again 9 pm'
    ],
    'led': [
      'Replace bulbs used 4-9 pm first',
      'Each bulb saves ~40-60W',
      'At 67-89¢/kWh peak, that\'s $5-10/mo per bulb'
    ],
    'gas_thermostat': [
      'Lower by 2-3°F when sleeping',
      'Lower by 5°F+ when away 8+ hours',
      'Use programmable schedule',
      'Saves ~10-15% of heating costs'
    ],
    'water_heater': [
      'Lower water heater to 120°F (most set too high)',
      'Check current temp with thermometer',
      'Adjust dial on gas water heater',
      'Saves ~$20-60/year on gas'
    ],
    'weatherstrip': [
      'Apply weatherstripping to doors/windows',
      'Check for drafts with incense smoke',
      'Seal gaps with foam tape or door sweeps',
      'Reduces heating costs by ~5-10%'
    ]
  };
  
  return instructions[action.id] || [action.basis];
}

function getActionTime(action) {
  const times = {
    'dryer': '1 minute',
    'dishwasher': '1 minute',
    'fans': '10 minutes setup',
    'plugs': '15 minutes',
    'led': '5 minutes per bulb',
    'gas_thermostat': '5 minutes',
    'water_heater': '10 minutes',
    'weatherstrip': '30-60 minutes'
  };
  
  return times[action.id] || '10 minutes';
}
