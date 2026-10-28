/**
 * Tests for ICS generation: local dates, RFC 5545 octet folding, no countdown.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateICSContent, foldLine } from './calendar.js';

describe('ICS calendar export', () => {
  const steps = [
    { what: 'Submit CCA opt-out via CEA (in 16 days)', how: 'Submit via CEA (in 16 days)', date: '2026-11-13', source: 'SDG&E Rule 27' },
    { what: 'Switch from CEA Clean Impact Plus to Clean Impact', how: 'Request by deadline', date: '2026-11-19' },
    { what: 'SDG&E must receive your CCA return notice', how: 'Hard deadline', date: '2026-11-27' },
    { what: 'You switch back to SDG&E', how: 'Switch date', date: '2027-05-28' }
  ];

  it('emits VEVENTs on local calendar dates, not UTC-shifted', () => {
    const ics = generateICSContent(steps);
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20261113'));
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20261119'));
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20261127'));
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20270528'));
    assert.ok(!ics.includes('DTSTART;VALUE=DATE:20261112'));
    assert.ok(!ics.includes('DTSTART;VALUE=DATE:20261118'));
    assert.ok(!ics.includes('DTSTART;VALUE=DATE:20261126'));
    assert.ok(!ics.includes('DTSTART;VALUE=DATE:20270527'));
  });

  it('adds 7-day and 1-day VALARMs on each event', () => {
    const ics = generateICSContent(steps);
    const events = ics.split('BEGIN:VEVENT').slice(1);
    assert.strictEqual(events.length, 4);
    for (const event of events) {
      assert.ok(event.includes('TRIGGER:-P7D'), '7-day alarm');
      assert.ok(event.includes('TRIGGER:-P1D'), '1-day alarm');
      const alarmCount = (event.match(/BEGIN:VALARM/g) || []).length;
      assert.strictEqual(alarmCount, 2);
    }
  });

  it('strips (in N days) countdown from SUMMARY and DESCRIPTION', () => {
    const ics = generateICSContent(steps);
    assert.ok(!/\(in \d+ days\)/i.test(ics), 'no countdown in ICS body');
    assert.ok(ics.includes('SUMMARY:Submit CCA opt-out via CEA'));
    assert.ok(!ics.includes('SUMMARY:Submit CCA opt-out via CEA (in 16 days)'));
  });

  it('folds lines by UTF-8 octets, not JS characters', () => {
    const ascii = 'A'.repeat(75);
    assert.strictEqual(foldLine(ascii), ascii);

    // U+2212 MINUS SIGN is 3 UTF-8 bytes. 73 ASCII + minus = 76 octets.
    const minus = '\u2212';
    const over = 'B'.repeat(73) + minus;
    const folded = foldLine(over);
    assert.ok(folded.includes('\r\n '), 'should fold with CRLF+space');
    const first = folded.split('\r\n')[0];
    assert.ok(new TextEncoder().encode(first).length <= 75, 'first line ≤ 75 octets');
    for (const physical of folded.split('\r\n')) {
      assert.ok(new TextEncoder().encode(physical).length <= 75, `line ≤ 75 octets: ${physical.length}`);
    }
  });
});
