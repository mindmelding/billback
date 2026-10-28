/**
 * Client-Side Calendar Export
 * Generates .ics files, calendar deep links, and todo exports
 * All processing happens in the browser - no data sent to servers
 * 
 * @module calendar
 */

import { parseLocalDate, formatLocalDate } from './meterReadSchedule.js';

/**
 * Fold a line to 75 UTF-8 octets per RFC 5545 §3.1.
 * Continuation lines are a single SPACE plus content; each physical line
 * (excluding CRLF) is at most 75 octets and never splits a UTF-8 character.
 * @param {string} line - The line to fold
 * @returns {string} Folded line with CRLF + space
 */
export function foldLine(line) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const result = [];
  let offset = 0;
  let first = true;

  while (offset < bytes.length) {
    const max = first ? 75 : 74; // continuation lines include the leading SPACE
    let end = Math.min(offset + max, bytes.length);
    // Do not split a multi-byte UTF-8 sequence
    while (end > offset && (bytes[end] & 0xC0) === 0x80) {
      end--;
    }
    if (end === offset) {
      end = Math.min(offset + 1, bytes.length);
    }
    const chunk = decoder.decode(bytes.slice(offset, end));
    result.push(first ? chunk : ' ' + chunk);
    offset = end;
    first = false;
  }

  return result.join('\r\n');
}

/**
 * Strip live countdown suffixes from calendar text.
 * Page UI may show "(in 16 days)"; .ics files should not.
 */
function stripCountdown(text) {
  return String(text || '')
    .replace(/\s*\(in \d+ days\)/gi, '')
    .replace(/\s*\(NOW\)/g, '')
    .trim();
}

/**
 * Format a step date as ICS VALUE=DATE (YYYYMMDD) in local time.
 */
function toICSDateValue(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    return date.slice(0, 10).replace(/-/g, '');
  }
  return formatLocalDate(date).replace(/-/g, '');
}

/**
 * Generate iCalendar (.ics) file content from action plan
 * @param {Array} actionPlan - Dated action plan from actionPlan.js
 * @param {string} title - Calendar title (default: "Billback Savings Plan")
 * @returns {string} .ics file content
 */
export function generateICSContent(actionPlan, title = "Billback Savings Plan") {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Billback//Savings Action Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${title}`,
    'X-WR-TIMEZONE:America/Los_Angeles',
    'X-WR-CALDESC:Your personalized energy savings action plan'
  ];

  actionPlan.forEach((step, index) => {
    const uid = `billback-${Date.now()}-${index}@billback.com`;
    
    // Convert step date to YYYYMMDD format (local calendar date, not UTC)
    let dtstart;
    if (step.date) {
      dtstart = toICSDateValue(step.date);
    } else {
      const d = parseLocalDate(now);
      d.setDate(d.getDate() + index);
      dtstart = toICSDateValue(d);
    }

    const summaryText = stripCountdown(step.what || step.title || step.action);

    // Build description with sources — no live "(in N days)" countdown
    let description = stripCountdown(step.how || step.description || '');
    if (step.source) {
      description += `\\n\\nSource: ${step.source}`;
    }
    if (step.estimatedSavings) {
      description += `\\n\\nEstimated savings: $${step.estimatedSavings}`;
    }

    // Create VEVENT
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${timestamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
    lines.push(foldLine(`SUMMARY:${escapeICS(summaryText)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeICS(description)}`));
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:TRANSPARENT');

    // Add recurring rule if specified
    if (step.recurring) {
      const rrule = buildRRule(step.recurring);
      if (rrule) {
        lines.push(foldLine(`RRULE:${rrule}`));
      }
    }

    // Add reminders (VALARM)
    // 7 days before
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-P7D');
    lines.push('ACTION:DISPLAY');
    lines.push(foldLine(`DESCRIPTION:Reminder: ${escapeICS(summaryText)} in 7 days`));
    lines.push('END:VALARM');

    // 1 day before
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-P1D');
    lines.push('ACTION:DISPLAY');
    lines.push(foldLine(`DESCRIPTION:Reminder: ${escapeICS(summaryText)} tomorrow`));
    lines.push('END:VALARM');

    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Build RRULE string from recurring config
 * @param {string|Object} recurring - "monthly", "yearly", or { freq, interval, ... }
 * @returns {string} RRULE string (without "RRULE:" prefix)
 */
function buildRRule(recurring) {
  if (typeof recurring === 'string') {
    const freq = recurring.toUpperCase();
    if (freq === 'MONTHLY') return 'FREQ=MONTHLY';
    if (freq === 'YEARLY') return 'FREQ=YEARLY';
    if (freq === 'WEEKLY') return 'FREQ=WEEKLY';
    if (freq === 'DAILY') return 'FREQ=DAILY';
    return null;
  }
  
  if (typeof recurring === 'object') {
    let rrule = `FREQ=${recurring.freq.toUpperCase()}`;
    if (recurring.interval) rrule += `;INTERVAL=${recurring.interval}`;
    if (recurring.until) {
      const until = new Date(recurring.until).toISOString().split('T')[0].replace(/-/g, '');
      rrule += `;UNTIL=${until}`;
    }
    if (recurring.count) rrule += `;COUNT=${recurring.count}`;
    return rrule;
  }
  
  return null;
}

/**
 * Escape special characters for ICS format
 * @param {string} text
 * @returns {string}
 */
function escapeICS(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Download .ics file to user's device
 * @param {string} icsContent - ICS file content
 * @param {string} filename - Filename (default: "billback-savings-plan.ics")
 */
export function downloadICS(icsContent, filename = 'billback-savings-plan.ics') {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate Google Calendar deep link for a single event
 * @param {Object} step - Action plan step
 * @returns {string} Google Calendar URL
 */
export function generateGoogleCalendarLink(step) {
  const baseUrl = 'https://calendar.google.com/calendar/render';
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: step.what || step.title || step.action,
    details: buildEventDetails(step),
    dates: formatGoogleCalendarDate(step.date)
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate Outlook Calendar deep link for a single event
 * @param {Object} step - Action plan step
 * @returns {string} Outlook Calendar URL
 */
export function generateOutlookLink(step) {
  const baseUrl = 'https://outlook.live.com/calendar/0/deeplink/compose';
  
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: step.what || step.title || step.action,
    body: buildEventDetails(step),
    startdt: new Date(step.date).toISOString(),
    enddt: new Date(step.date).toISOString()
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Build event details text with sources and savings
 * @param {Object} step
 * @returns {string}
 */
function buildEventDetails(step) {
  let details = step.how || step.description || '';
  if (step.source) {
    details += `\n\nSource: ${step.source}`;
  }
  if (step.estimatedSavings) {
    details += `\n\nEstimated savings: $${step.estimatedSavings}`;
  }
  return details;
}

/**
 * Format date for Google Calendar (YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ)
 * For all-day events: YYYYMMDD/YYYYMMDD
 * @param {string|Date} date
 * @returns {string}
 */
function formatGoogleCalendarDate(date) {
  const d = new Date(date);
  const start = d.toISOString().split('T')[0].replace(/-/g, '');
  const end = start; // All-day event
  return `${start}/${end}`;
}

/**
 * Generate Markdown todo list from action plan
 * @param {Array} actionPlan - Dated action plan
 * @returns {string} Markdown formatted todo list
 */
export function generateMarkdownTodoList(actionPlan) {
  let md = '# Billback Savings Action Plan\n\n';
  md += '_Your personalized energy bill savings checklist_\n\n';
  
  actionPlan.forEach((step, index) => {
    md += `## ${index + 1}. ${step.what || step.title || step.action}\n\n`;
    
    if (step.date) {
      const d = new Date(step.date);
      md += `**Due:** ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
    }
    
    if (step.estimatedSavings) {
      md += `**Savings:** $${step.estimatedSavings}/year\n\n`;
    }
    
    if (step.how) {
      md += `${step.how}\n\n`;
    }
    
    if (step.source) {
      md += `_Source: ${step.source}_\n\n`;
    }
    
    if (step.recurring) {
      md += `🔁 **Recurring:** ${step.recurring}\n\n`;
    }
    
    md += '---\n\n';
  });
  
  md += '\n_Generated by Billback • Your bill never left your device_\n';
  
  return md;
}

/**
 * Generate plain text todo list from action plan (for Apple Reminders, etc.)
 * @param {Array} actionPlan - Dated action plan
 * @returns {string} Plain text todo list
 */
export function generatePlainTextTodoList(actionPlan) {
  let text = 'BILLBACK SAVINGS ACTION PLAN\n';
  text += '================================\n\n';
  
  actionPlan.forEach((step, index) => {
    text += `${index + 1}. ${step.what || step.title || step.action}\n`;
    
    if (step.date) {
      const d = new Date(step.date);
      text += `   Due: ${d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
    }
    
    if (step.estimatedSavings) {
      text += `   Savings: $${step.estimatedSavings}/year\n`;
    }
    
    if (step.how) {
      text += `   ${step.how}\n`;
    }
    
    if (step.recurring) {
      text += `   Recurring: ${step.recurring}\n`;
    }
    
    text += '\n';
  });
  
  text += '\nGenerated by Billback\n';
  text += 'Your bill never left your device.\n';
  
  return text;
}

/**
 * Copy text to clipboard
 * @param {string} text
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}

/**
 * Download text file to user's device
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} mimeType - MIME type (default: text/plain)
 */
export function downloadTextFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
