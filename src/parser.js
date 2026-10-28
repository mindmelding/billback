/**
 * Deterministic Bill Parser for SDG&E Text Bills
 * Extracts data using regex patterns on pdftotext -layout output
 * Per CLAUDE.md: Cheaper and more private than LLM. Use LLM only as fallback.
 */

/**
 * Parse SDG&E bill from text (pdftotext -layout output)
 * @param {string} text - Raw bill text
 * @returns {Object} Parsed bill data with confidence scores
 */
export function parseSDGEBillText(text) {
  const result = {
    accountNumber: null,
    billingPeriod: { start: null, end: null },
    provider: 'SDG&E', // default
    providerTier: null,
    ratePlan: null,
    hasSolar: false,
    nemStatus: null,
    nemTrueUpDate: null,
    nemBalance: null,
    systemSize: null,
    totalKwh: null,
    climateZone: null,
    usage: {
      onPeak: 0,
      offPeak: 0,
      superOffPeak: 0,
      season: null
    },
    gas: null,
    charges: [],
    totalAmount: null,
    serviceAddress: { zip: null },
    nemYearToDate: [], // Array of monthly usage from NEM table
    confidence: {},
    warnings: []
  };

  // Account number (12 digits from CCA Account Number, or 13-digit with last dropped)
  const ccaAcctMatch = text.match(/CCA Account Number:\s*(\d+)/);
  if (ccaAcctMatch) {
    result.accountNumber = ccaAcctMatch[1].slice(0, 12);
    result.confidence.accountNumber = 'high';
  } else {
    const acctMatch = text.match(/ACCOUNT NUMBER\s+([\d\s]+)/);
    if (acctMatch) {
      const digits = acctMatch[1].replace(/\s/g, '');
      result.accountNumber = digits.length === 13 ? digits.slice(0, 12) : digits;
      result.confidence.accountNumber = 'medium';
    }
  }

  // Billing period
  const periodMatch = text.match(/Billing Period[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (periodMatch) {
    result.billingPeriod.start = normalizeDate(periodMatch[1]);
    result.billingPeriod.end = normalizeDate(periodMatch[2]);
    result.confidence.billingPeriod = 'high';
    
    // Determine season from start date
    const month = new Date(result.billingPeriod.start).getMonth();
    result.usage.season = (month >= 5 && month <= 9) ? 'summer' : 'winter';
  }

  // Provider detection (CCA section)
  if (text.includes('CLEAN ENERGY ALLIANCE')) {
    result.provider = 'CEA';
    result.confidence.provider = 'high';
    
    // Detect tier (Clean Impact vs Clean Impact Plus)
    const tierMatch = text.match(/Clean Impact (Plus)?\s+\d+\s*kWh/i);
    if (tierMatch) {
      result.providerTier = tierMatch[1] ? 'Clean Impact Plus' : 'Clean Impact';
    }
  } else if (text.match(/San Diego Community Power|SDCP/i)) {
    result.provider = 'SDCP';
    result.confidence.provider = 'high';
  }

  // Rate plan
  const rateMatch = text.match(/Rate:\s*(?:Time of Use\s*-\s*)?(TOU-[A-Z0-9-]+?)(?:-Residential|-Commercial|Residential|\s)/i);
  if (rateMatch) {
    result.ratePlan = rateMatch[1];
    result.confidence.ratePlan = 'high';
  }

  // Climate zone
  const zoneMatch = text.match(/Climate Zone:\s*(\w+)/);
  if (zoneMatch) {
    result.climateZone = zoneMatch[1];
  }

  // Solar / NEM detection
  if (text.includes('Net Energy Metering') || text.includes('NEM')) {
    result.hasSolar = true;
    
    // NEM version
    const versionMatch = text.match(/Version:\s*(\d+\.\d+)/);
    if (versionMatch) {
      result.nemStatus = `NEM ${versionMatch[1]}`;
    }
    
    // System size
    const sizeMatch = text.match(/System Size:\s*([\d.]+)\s*kW/);
    if (sizeMatch) {
      result.systemSize = parseFloat(sizeMatch[1]);
    }
    
    // True-up date
    const trueUpMatch = text.match(/True-Up Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (trueUpMatch) {
      result.nemTrueUpDate = normalizeDate(trueUpMatch[1]);
    }
    
    // Current NEM balance
    const balanceMatch = text.match(/(?:NEM Year-to-Date Balance|Current Account Balance)\s+\$?([\d,]+\.?\d*)/);
    if (balanceMatch) {
      result.nemBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));
    }
  }

  // Total kWh (from usage history or summary)
  const kwhMatch = text.match(/(\d+)\s+kWh used/) || text.match(/Total Usage:\s*(\d+)/);
  if (kwhMatch) {
    result.totalKwh = parseInt(kwhMatch[1]);
    result.confidence.totalKwh = 'high';
  }

  // TOU usage (current month) - handle rate changes by summing all periods
  // Look for pattern like: SUMMER USAGE On-Peak Off-Peak Super Off-Peak
  //                        kWh used    355      193        76
  let onPeak = 0;
  let offPeak = 0;
  let superOffPeak = 0;
  let foundUsage = false;
  
  // More flexible regex to handle varying whitespace
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    
    if (/(SUMMER|WINTER)\s+USAGE/.test(line) && /kWh\s+used/.test(nextLine)) {
      const season = line.match(/(SUMMER|WINTER)/i)[1].toLowerCase();
      
      // Extract numbers from next line
      const numbers = nextLine.match(/([-−\d]+)/g);
      if (numbers && numbers.length >= 3) {
        // Skip the first match if it's just "kWh" related, look for actual numbers
        const vals = numbers.filter(n => /^[-−]?\d+$/.test(n)).map(n => parseInt(n.replace('−', '-')));
        if (vals.length >= 3) {
          onPeak += vals[0];
          offPeak += vals[1];
          superOffPeak += vals[2];
          foundUsage = true;
          
          if (!result.usage.season) {
            result.usage.season = season;
          }
        }
      }
    }
  }
  
  if (foundUsage) {
    result.usage.onPeak = onPeak;
    result.usage.offPeak = offPeak;
    result.usage.superOffPeak = superOffPeak;
    result.confidence.usage = 'high';
  }

  // Gas usage
  const gasMatch = text.match(/(\d+)\s+Therms/i);
  if (gasMatch) {
    const therms = parseInt(gasMatch[1]);
    // Prefer "Total Gas Service" which includes taxes/fees
    let gasCostMatch = text.match(/Total Gas Service\s+\$?([\d.]+)/);
    if (!gasCostMatch) {
      gasCostMatch = text.match(/Total Gas (?:Charges)\s+\$?([\d.]+)/);
    }
    result.gas = {
      therms,
      cost: gasCostMatch ? parseFloat(gasCostMatch[1]) : null,
      rate: 'GR' // default residential gas rate
    };
  }

  // Total amount
  const totalMatch = text.match(/Total Current Charges\s+\$?([\d,]+\.?\d*)/);
  if (totalMatch) {
    result.totalAmount = parseFloat(totalMatch[1].replace(/,/g, ''));
    result.confidence.totalAmount = 'high';
  }

  // ZIP code
  const zipMatch = text.match(/\b(\d{5})\b/);
  if (zipMatch) {
    result.serviceAddress.zip = zipMatch[1];
  }

  // **CRITICAL: Parse Net Metering YTD table for full year of usage**
  result.nemYearToDate = parseNEMYearToDateTable(text);
  if (result.nemYearToDate.length > 0) {
    result.confidence.nemYearToDate = 'high';
  }

  // Validation
  if (!result.accountNumber) {
    result.warnings.push('Could not extract account number');
  }
  if (!result.totalKwh) {
    result.warnings.push('Could not extract total kWh');
  }
  if (!result.totalAmount) {
    result.warnings.push('Could not extract total amount');
  }

  result.extractedAt = new Date().toISOString();
  result.method = 'deterministic-parser';
  
  return result;
}

/**
 * Parse Net Metering Year-to-Date table
 * This table shows 10-12 months of TOU usage from a single bill!
 * @param {string} text - Bill text
 * @returns {Array<Object>} Array of { date, onPeak, offPeak, superOffPeak, total, nemCharges }
 */
function parseNEMYearToDateTable(text) {
  const months = [];
  
  // Find the NEM table section
  const tableStart = text.indexOf('Net Energy Metering Summary');
  if (tableStart === -1) return months;
  
  const tableSection = text.slice(tableStart, tableStart + 5000);
  
  // Pattern for each row: MM/DD/YYYY   onPeak  offPeak  superOffPeak  total  nemCharges
  // Example: 11/26/2025    83      −139     28           −28      28.27
  const rowPattern = /(\d{1,2}\/\d{1,2}\/\d{4})\s+([-−\d]+)\s+([-−\d]+)\s+([-−\d]+)\s+([-−\d]+)\s+([\d.]+)/g;
  
  let match;
  while ((match = rowPattern.exec(tableSection)) !== null) {
    const date = normalizeDate(match[1]);
    
    // Skip if date is in the future (malformed)
    if (new Date(date) > new Date()) continue;
    
    months.push({
      date,
      onPeak: parseInt(match[2].replace('−', '-')),
      offPeak: parseInt(match[3].replace('−', '-')),
      superOffPeak: parseInt(match[4].replace('−', '-')),
      total: parseInt(match[5].replace('−', '-')),
      nemCharges: parseFloat(match[6])
    });
  }
  
  return months;
}

/**
 * Normalize date from MM/DD/YYYY or M/D/YY to YYYY-MM-DD
 */
function normalizeDate(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  
  let [month, day, year] = parts;
  
  // Handle 2-digit years
  if (year.length === 2) {
    year = parseInt(year) < 50 ? `20${year}` : `19${year}`;
  }
  
  // Pad month and day
  month = month.padStart(2, '0');
  day = day.padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Strip personal information before sending to LLM
 * Per CLAUDE.md: Never send personal details in repo, memory, or chat
 */
export function stripPersonalInfo(text) {
  let cleaned = text;
  
  // Replace account numbers with placeholder
  cleaned = cleaned.replace(/ACCOUNT NUMBER\s+[\d\s]+/gi, 'ACCOUNT NUMBER [REDACTED]');
  cleaned = cleaned.replace(/CCA Account Number:\s*\d+/gi, 'CCA Account Number: [REDACTED]');
  
  // Replace names (lines with all caps followed by address)
  cleaned = cleaned.replace(/([A-Z][\sA-Z]+)\n\s+(\d+\s+[A-Z\s]+)\n\s+([A-Z\s]+,\s*CA\s+\d{5})/g, 
    '[NAME REDACTED]\n[ADDRESS REDACTED]\n$3');
  
  // Replace meter numbers
  cleaned = cleaned.replace(/Meter Number:\s*\d+/gi, 'Meter Number: [REDACTED]');
  
  // Replace specific addresses but keep ZIP
  cleaned = cleaned.replace(/\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:ST|AVE|BLVD|DR|RD|LN|CT)/gi, '[ADDRESS]');
  
  return cleaned;
}

/**
 * Check if parsed data needs manual review
 */
export function needsManualReview(parsedData) {
  return !!(
    !parsedData.accountNumber ||
    !parsedData.totalKwh ||
    !parsedData.totalAmount ||
    !parsedData.billingPeriod.start ||
    parsedData.warnings.length > 2
  );
}
