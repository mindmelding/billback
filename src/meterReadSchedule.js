/**
 * SDG&E Meter Read Schedule
 * Published billing cycle calendars for computing opt-out notice deadlines
 * 
 * Source: https://www.sdge.com/billing-cycle-schedule
 * - 2026: https://www.sdge.com/sites/default/files/Calendar%20-%202026%20%28Approved%29-3%201.pdf
 * - 2027: https://www.sdge.com/sites/default/files/Calendar%20-%202027%20%28Approved%29.pdf
 * 
 * Last updated: 2026-10-28
 * 
 * @module meterReadSchedule
 */

/**
 * Meter read dates by billing cycle
 * Format: 'YYYY-MM-DD' strings
 * 
 * SDG&E has ~38 billing cycles. Customers are assigned to one cycle.
 * Read dates are published ~2 years in advance.
 */
export const METER_READ_SCHEDULE = {
  // Cycle 19 (fixture household's cycle)
  19: [
    // 2026
    '2026-01-28',
    '2026-02-26',
    '2026-03-27',
    '2026-04-28',
    '2026-05-28',
    '2026-06-29',
    '2026-07-29',
    '2026-08-27',
    '2026-09-28',
    '2026-10-28',  // Fixture true-up date
    '2026-11-27',
    '2026-12-29',
    // 2027
    '2027-01-28',
    '2027-03-01',
    '2027-03-30',
    '2027-04-29',
    '2027-05-28',
    '2027-06-29',
    '2027-07-29',
    '2027-08-27',
    '2027-09-28',
    '2027-10-28',
    '2027-11-29',
    '2027-12-29'
  ],
  
  // Add other cycles as needed for broader support
  // For MVP, cycle 19 is sufficient for fixture testing
};

/**
 * Parse a date string as a local calendar date (not UTC midnight).
 * `new Date('YYYY-MM-DD')` is UTC, so getDate() is one day early in US timezones.
 * @param {string|Date} dateStr - 'YYYY-MM-DD' string or Date
 * @returns {Date} Local date at midnight
 */
export function parseLocalDate(dateStr) {
  if (dateStr instanceof Date) {
    return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  }
  if (dateStr == null || dateStr === '') {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  const s = String(dateStr).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    let year = Number(mdy[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return new Date(year, Number(mdy[1]) - 1, Number(mdy[2]));
  }
  const d = new Date(s);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Format a Date as YYYY-MM-DD in local time (never toISOString, which is UTC).
 * @param {string|Date} date
 * @returns {string}
 */
export function formatLocalDate(date) {
  const d = date instanceof Date ? date : parseLocalDate(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get meter read dates for a specific cycle
 * @param {number} cycle - Billing cycle number (e.g., 19)
 * @param {Date} startDate - Start date to filter from
 * @param {Date} endDate - End date to filter to
 * @returns {Date[]} Array of meter read dates
 */
export function getMeterReadDates(cycle, startDate = null, endDate = null) {
  const dates = METER_READ_SCHEDULE[cycle];
  if (!dates) {
    throw new Error(`Meter read schedule not available for cycle ${cycle}`);
  }
  
  let result = dates.map(d => parseLocalDate(d));
  
  if (startDate) {
    result = result.filter(d => d >= startDate);
  }
  
  if (endDate) {
    result = result.filter(d => d <= endDate);
  }
  
  return result;
}

/**
 * Get the next meter read date after a given date
 * @param {number} cycle - Billing cycle number
 * @param {Date} afterDate - Date to find next read after
 * @returns {Date|null} Next meter read date, or null if none found
 */
export function getNextMeterRead(cycle, afterDate) {
  const dates = getMeterReadDates(cycle, afterDate);
  return dates.length > 0 ? dates[0] : null;
}

/**
 * Get the previous meter read date before a given date
 * @param {number} cycle - Billing cycle number
 * @param {Date} beforeDate - Date to find previous read before
 * @returns {Date|null} Previous meter read date, or null if none found
 */
export function getPreviousMeterRead(cycle, beforeDate) {
  const dates = getMeterReadDates(cycle, null, beforeDate);
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/**
 * Calculate CCA opt-out notice deadline
 * For returning to SDG&E bundled service without transitional rate
 * 
 * @param {number} cycle - Billing cycle number
 * @param {Date} targetSwitchDate - Desired switch date (meter read)
 * @returns {Object} { noticeDeadline, switchDate, reasoning }
 */
export function calculateCCAOptOutDeadline(cycle, targetSwitchDate) {
  // SDG&E must receive notice 6 months before the switch date
  const sixMonthsBefore = new Date(targetSwitchDate);
  sixMonthsBefore.setMonth(sixMonthsBefore.getMonth() - 6);
  
  // Find the meter read date on or before sixMonthsBefore
  const noticeDeadline = getPreviousMeterRead(cycle, sixMonthsBefore);
  
  if (!noticeDeadline) {
    throw new Error(`Cannot calculate notice deadline: no meter read found before ${sixMonthsBefore.toISOString()}`);
  }
  
  // Find the actual switch date (first read after 6 months from notice)
  const sixMonthsAfterNotice = new Date(noticeDeadline);
  sixMonthsAfterNotice.setMonth(sixMonthsAfterNotice.getMonth() + 6);
  const actualSwitchDate = getNextMeterRead(cycle, sixMonthsAfterNotice);
  
  if (!actualSwitchDate) {
    throw new Error(`Cannot calculate switch date: no meter read found after ${sixMonthsAfterNotice.toISOString()}`);
  }
  
  return {
    noticeDeadline,
    switchDate: actualSwitchDate,
    reasoning: `SDG&E must receive notice by ${noticeDeadline.toLocaleDateString()} to switch on ${actualSwitchDate.toLocaleDateString()} (first read after 6 months from notice)`
  };
}

/**
 * Calculate CEA tier change (opt-down) deadline
 * Request must arrive ≥5 business days before meter read
 * 
 * @param {number} cycle - Billing cycle number
 * @param {Date} today - Current date
 * @returns {Object} { requestDeadline, effectiveDate, reasoning }
 */
export function calculateCEATierChangeDeadline(cycle, today) {
  // Find next meter read after today
  const nextRead = getNextMeterRead(cycle, today);
  
  if (!nextRead) {
    throw new Error(`No upcoming meter read found for cycle ${cycle}`);
  }
  
  // Calculate 5 business days before the read
  // Use subtractBusinessDays helper
  const requestDeadline = subtractBusinessDays(nextRead, 5);
  
  // If today is past the deadline, find the next read
  if (today > requestDeadline) {
    const readAfterNext = getNextMeterRead(cycle, new Date(nextRead.getTime() + 86400000)); // +1 day
    if (!readAfterNext) {
      throw new Error(`No meter read found after ${nextRead.toISOString()}`);
    }
    
    const newDeadline = subtractBusinessDays(readAfterNext, 5);
    
    return {
      requestDeadline: newDeadline,
      effectiveDate: readAfterNext,
      reasoning: `Request must arrive ≥5 business days before meter read. Too late for ${nextRead.toLocaleDateString()}; request by ${newDeadline.toLocaleDateString()} for ${readAfterNext.toLocaleDateString()} effective date`
    };
  }
  
  return {
    requestDeadline,
    effectiveDate: nextRead,
    reasoning: `Request must arrive ≥5 business days before meter read. Request by ${requestDeadline.toLocaleDateString()} for ${nextRead.toLocaleDateString()} effective date`
  };
}

/**
 * Check if a date is a major US holiday that affects SDG&E/CEA business days
 * @param {Date} date
 * @returns {boolean}
 */
function isHoliday(date) {
  const month = date.getMonth();
  const dayOfMonth = date.getDate();
  const year = date.getFullYear();
  
  // Thanksgiving: 4th Thursday of November
  if (month === 10) { // November
    const firstDay = new Date(year, 10, 1);
    const firstThursday = (11 - firstDay.getDay()) % 7 || 7;
    const fourthThursday = firstThursday + 21;
    if (dayOfMonth === fourthThursday) return true;
  }
  
  // Christmas
  if (month === 11 && dayOfMonth === 25) return true;
  
  // New Year's Day
  if (month === 0 && dayOfMonth === 1) return true;
  
  // Independence Day
  if (month === 6 && dayOfMonth === 4) return true;
  
  // Memorial Day: last Monday of May
  // Labor Day: first Monday of September
  // etc. - can expand as needed
  
  return false;
}

/**
 * Subtract business days from a date (skip weekends and major holidays)
 * @param {Date} date - Starting date
 * @param {number} businessDays - Number of business days to subtract
 * @returns {Date} Result date
 */
function subtractBusinessDays(date, businessDays) {
  const result = new Date(date);
  let daysSubtracted = 0;
  
  while (daysSubtracted < businessDays) {
    result.setDate(result.getDate() - 1);
    const dayOfWeek = result.getDay();
    
    // Skip weekends (0 = Sunday, 6 = Saturday) and holidays
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday(result)) {
      daysSubtracted++;
    }
  }
  
  return result;
}

/**
 * Add business days to a date (skip weekends and major holidays)
 * @param {Date} date - Starting date
 * @param {number} businessDays - Number of business days to add
 * @returns {Date} Result date
 */
export function addBusinessDays(date, businessDays) {
  const result = new Date(date);
  let daysAdded = 0;
  
  while (daysAdded < businessDays) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    
    // Skip weekends (0 = Sunday, 6 = Saturday) and holidays
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday(result)) {
      daysAdded++;
    }
  }
  
  return result;
}
