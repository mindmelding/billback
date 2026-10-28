/**
 * Billback Cloudflare Worker
 * Handles bill uploads, extraction, and savings calculations
 * 
 * Per CLAUDE.md:
 * - Never store personal data
 * - Process uploads in memory only
 * - Never submit forms or switch providers for customers
 */

import { parseSDGEBillText, stripPersonalInfo, needsManualReview, validateBillingPeriod } from './parser.js';
import { extractBillDataWithLLM, validateBillData } from './extraction.js';
import { generateSavingsReport } from './engine.js';
import * as rates from './rates.js';

// CORS headers for local development
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Handle OPTIONS request for CORS
 */
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

/**
 * Handle bill upload and extraction
 * POST /api/upload
 * Body: multipart/form-data with bill text (pre-extracted via pdftotext or PDF.js)
 */
async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const bills = [];
    const errors = [];

    // Process each uploaded text file
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('bill_text_')) {
        try {
          // **Try deterministic parser first** (cheaper, more private)
          let billData = parseSDGEBillText(value);
          
          // **Validate billing period before proceeding**
          const validation = validateBillingPeriod(billData);
          if (validation && !validation.valid) {
            errors.push({
              file: key,
              rejected: true,
              reason: validation.reason,
              message: validation.message
            });
            continue; // Skip this bill
          }
          
          // If deterministic parser failed or needs review, try LLM
          if (needsManualReview(billData) && env.LLM_API_KEY) {
            // Strip personal info before sending to LLM
            const cleanedText = stripPersonalInfo(value);
            try {
              billData = await extractBillDataWithLLM(cleanedText, env);
              billData = validateBillData(billData);
              billData.method = 'llm-fallback';
              billData._originalText = value; // Store for validation
              
              // Validate LLM-extracted bill too
              const llmValidation = validateBillingPeriod(billData);
              if (llmValidation && !llmValidation.valid) {
                errors.push({
                  file: key,
                  rejected: true,
                  reason: llmValidation.reason,
                  message: llmValidation.message
                });
                continue;
              }
            } catch (llmError) {
              // LLM failed, use deterministic result with manual review flag
              billData.needsManualReview = true;
              billData.llmError = llmError.message;
            }
          }
          
          // Clean up before sending to client
          delete billData._originalText;
          
          bills.push(billData);
        } catch (error) {
          errors.push({
            file: key,
            error: error.message,
            needsManualReview: true
          });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      bills,
      errors,
      message: `Processed ${bills.length} bill(s), ${errors.length} error(s)`
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }
}

/**
 * Calculate savings from extracted bills
 * POST /api/calculate
 * Body: { bills: [...], household: { size, income, renter, hasSolar } }
 */
async function handleCalculate(request, env) {
  try {
    const { bills, household } = await request.json();

    if (!bills || bills.length === 0) {
      throw new Error('No bills provided');
    }

    // Determine current rate plan from first bill
    const firstBill = bills[0];
    let currentPlan;
    
    if (firstBill.provider === 'CEA') {
      // Check tier from parsed data
      if (firstBill.providerTier === 'Clean Impact') {
        currentPlan = rates.CEA_CLEAN_IMPACT;
      } else {
        currentPlan = rates.CEA_CLEAN_IMPACT_PLUS; // default to Plus
      }
    } else if (firstBill.provider === 'SDCP') {
      currentPlan = rates.SDCP_POWER_ON;
    } else {
      currentPlan = rates.SDGE_TOU_DR1;
    }

    // Transform bills into engine format
    const engineBills = bills.map(bill => ({
      date: bill.billingPeriod.start,
      usage: bill.usage,
      cost: bill.totalAmount
    }));

    // Extract NEM YTD data if available (from first bill with solar)
    const solarBill = bills.find(b => b.hasSolar && b.nemYearToDate && b.nemYearToDate.length > 0);
    const nemYearToDate = solarBill?.nemYearToDate || null;
    
    // Extract NEM data for true-up alert
    const nemData = solarBill ? {
      trueUpDate: solarBill.nemTrueUpDate,
      balance: solarBill.nemBalance,
      systemSize: solarBill.systemSize
    } : null;

    // Extract gas usage (from most recent bill)
    const gasUsage = firstBill.gas || null;

    // Generate savings report
    const report = generateSavingsReport(
      engineBills,
      currentPlan,
      household,
      nemYearToDate,
      nemData,
      gasUsage
    );

    return new Response(JSON.stringify({
      success: true,
      report
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }
}

/**
 * Get rate information
 * GET /api/rates
 */
async function handleRates() {
  return new Response(JSON.stringify({
    success: true,
    rates: {
      SDGE_TOU_DR1: rates.SDGE_TOU_DR1,
      CEA_CLEAN_IMPACT: rates.CEA_CLEAN_IMPACT,
      CEA_CLEAN_IMPACT_PLUS: rates.CEA_CLEAN_IMPACT_PLUS,
      SDCP_POWER_ON: rates.SDCP_POWER_ON,
      SDCP_POWER_BASE: rates.SDCP_POWER_BASE,
      CARE_DISCOUNT: rates.CARE_DISCOUNT,
      FERA_DISCOUNT: rates.FERA_DISCOUNT
    },
    lastUpdated: '2026-10-28',
    disclaimer: 'Rates change several times a year. Check provider websites for current rates.'
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

/**
 * Main worker handler
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions();
    }

    // Route requests
    if (path === '/api/upload' && request.method === 'POST') {
      return handleUpload(request, env);
    }

    if (path === '/api/calculate' && request.method === 'POST') {
      return handleCalculate(request, env);
    }

    if (path === '/api/rates' && request.method === 'GET') {
      return handleRates();
    }

    // Serve static files (for local development)
    if (path === '/' || path === '/index.html') {
      // In production, this would be served by Cloudflare Pages
      return new Response('Billback API Server. Use /api/upload, /api/calculate, or /api/rates', {
        headers: {
          'Content-Type': 'text/plain',
          ...CORS_HEADERS
        }
      });
    }

    return new Response('Not Found', {
      status: 404,
      headers: CORS_HEADERS
    });
  }
};
