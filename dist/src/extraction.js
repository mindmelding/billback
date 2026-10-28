/**
 * Bill Extraction Module
 * Extracts structured data from SDG&E bill PDFs using LLM
 * 
 * Per CLAUDE.md: Never commit secrets. API key comes from environment.
 */

/**
 * Schema for bill extraction
 */
export const BILL_SCHEMA = {
  accountNumber: 'string (12 digits)',
  billingPeriod: {
    start: 'YYYY-MM-DD',
    end: 'YYYY-MM-DD'
  },
  provider: 'SDG&E | CEA | SDCP',
  ratePlan: 'string (e.g., TOU-DR1)',
  hasSolar: 'boolean',
  nemStatus: 'NEM 2.0 | NEM 3.0 | null',
  totalKwh: 'number',
  usage: {
    onPeak: 'number (kWh)',
    offPeak: 'number (kWh)',
    superOffPeak: 'number (kWh)',
    season: 'summer | winter'
  },
  charges: [
    {
      description: 'string',
      amount: 'number (dollars)'
    }
  ],
  totalAmount: 'number (dollars)',
  serviceAddress: {
    zip: 'string (5 digits)'
  }
};

/**
 * Extract data from bill PDF text using LLM
 * @param {string} pdfText - Raw text extracted from PDF
 * @param {Object} env - Environment with LLM_API_KEY, LLM_PROVIDER, LLM_MODEL
 * @returns {Promise<Object>} Extracted bill data
 */
export async function extractBillDataWithLLM(pdfText, env) {
  const provider = env.LLM_PROVIDER || 'openai';
  const model = env.LLM_MODEL || 'gpt-4';
  const apiKey = env.LLM_API_KEY;

  if (!apiKey) {
    throw new Error('LLM_API_KEY not configured. Set via wrangler secret put LLM_API_KEY');
  }

  const systemPrompt = `You are a bill parser for SDG&E (San Diego Gas & Electric) bills.
Extract the following information from the bill text and return ONLY valid JSON matching the schema.

Schema:
${JSON.stringify(BILL_SCHEMA, null, 2)}

Rules:
- Account number is 12 digits (if you see 13 digits, drop the last digit)
- Provider is one of: SDG&E, CEA (Clean Energy Alliance), SDCP (San Diego Community Power)
- For CEA or SDCP bills, look for "CCA" or community choice aggregator mentions
- TOU periods: on-peak is 4-9 pm daily, super off-peak is weekdays 12-6 am & 10 am-2 pm plus weekends 12 am-2 pm
- Season: summer is Jun-Oct, winter is Nov-May
- If a value cannot be found, use null
- Return ONLY the JSON object, no other text`;

  const userPrompt = `Extract bill data from this SDG&E bill text:\n\n${pdfText.slice(0, 8000)}`;

  let response;
  if (provider === 'openai') {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })
    });
  } else if (provider === 'anthropic') {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1
      })
    });
  } else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  
  let extractedText;
  if (provider === 'openai') {
    extractedText = data.choices[0].message.content;
  } else if (provider === 'anthropic') {
    extractedText = data.content[0].text;
  }

  // Parse JSON from response
  const billData = JSON.parse(extractedText);
  
  // Validate required fields
  const required = ['accountNumber', 'billingPeriod', 'provider', 'totalKwh', 'totalAmount'];
  for (const field of required) {
    if (!billData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Add metadata
  billData.extractedAt = new Date().toISOString();
  billData.confidence = 'llm-extracted';
  
  return billData;
}

/**
 * Parse PDF and extract bill data
 * @param {ArrayBuffer} pdfBuffer - PDF file as ArrayBuffer
 * @param {Object} env - Environment with LLM credentials
 * @returns {Promise<Object>} Extracted bill data
 */
export async function parseBillPDF(pdfBuffer, env) {
  // Note: pdf-parse doesn't work in Cloudflare Workers
  // For local development, use pdf-parse
  // For production, use a PDF parsing service or extract text server-side before upload
  
  try {
    // In a real implementation, you would:
    // 1. Use a PDF parsing service (e.g., pdf.co, Adobe PDF Extract API)
    // 2. Or pre-process PDFs server-side to extract text
    // 3. Or use Cloudflare's R2 + Workers to process in batches
    
    // For now, we'll assume text is extracted elsewhere
    throw new Error('PDF parsing not implemented in Workers. Extract text before calling this function.');
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
}

/**
 * Validate and clean extracted bill data
 * @param {Object} billData - Extracted bill data
 * @returns {Object} Validated and cleaned bill data
 */
export function validateBillData(billData) {
  const cleaned = { ...billData };
  
  // Clean account number
  if (cleaned.accountNumber) {
    cleaned.accountNumber = cleaned.accountNumber.replace(/\D/g, '').slice(0, 12);
  }
  
  // Validate provider
  const validProviders = ['SDG&E', 'CEA', 'SDCP'];
  if (!validProviders.includes(cleaned.provider)) {
    cleaned.provider = 'SDG&E'; // default
    cleaned.providerConfidence = 'low';
  }
  
  // Validate season based on billing period
  if (cleaned.billingPeriod?.start) {
    const month = new Date(cleaned.billingPeriod.start).getMonth(); // 0-11
    cleaned.usage.season = (month >= 5 && month <= 9) ? 'summer' : 'winter';
  }
  
  // Ensure usage numbers are positive
  if (cleaned.usage) {
    cleaned.usage.onPeak = Math.max(0, cleaned.usage.onPeak || 0);
    cleaned.usage.offPeak = Math.max(0, cleaned.usage.offPeak || 0);
    cleaned.usage.superOffPeak = Math.max(0, cleaned.usage.superOffPeak || 0);
  }
  
  // Flag for manual review if confidence is low
  cleaned.needsReview = !!(
    cleaned.providerConfidence === 'low' ||
    !cleaned.usage ||
    cleaned.totalKwh === 0 ||
    !cleaned.accountNumber
  );
  
  return cleaned;
}

/**
 * Manual correction interface data structure
 * Used when extraction fails or needs review
 */
export function getManualCorrectionForm(partialData = {}) {
  return {
    fields: [
      {
        name: 'accountNumber',
        label: 'SDG&E Account Number',
        type: 'text',
        required: true,
        pattern: '[0-9]{12}',
        value: partialData.accountNumber || '',
        help: '12 digits (drop last digit if you see 13)'
      },
      {
        name: 'provider',
        label: 'Power Provider',
        type: 'select',
        required: true,
        options: ['SDG&E', 'CEA', 'SDCP'],
        value: partialData.provider || 'SDG&E'
      },
      {
        name: 'ratePlan',
        label: 'Rate Plan',
        type: 'text',
        required: false,
        value: partialData.ratePlan || 'TOU-DR1',
        help: 'e.g., TOU-DR1, EV-TOU-5'
      },
      {
        name: 'hasSolar',
        label: 'Has Solar?',
        type: 'checkbox',
        value: partialData.hasSolar || false
      },
      {
        name: 'totalKwh',
        label: 'Total kWh',
        type: 'number',
        required: true,
        value: partialData.totalKwh || 0
      },
      {
        name: 'totalAmount',
        label: 'Total Bill Amount',
        type: 'number',
        required: true,
        value: partialData.totalAmount || 0,
        help: 'Dollars'
      },
      {
        name: 'billingPeriodStart',
        label: 'Billing Period Start',
        type: 'date',
        required: true,
        value: partialData.billingPeriod?.start || ''
      },
      {
        name: 'billingPeriodEnd',
        label: 'Billing Period End',
        type: 'date',
        required: true,
        value: partialData.billingPeriod?.end || ''
      }
    ]
  };
}
