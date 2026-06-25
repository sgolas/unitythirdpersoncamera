import type { Handler, HandlerEvent } from '@netlify/functions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$', MXN: 'MX$',
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Email not configured — add RESEND_API_KEY to Netlify environment variables.' }),
    };
  }

  try {
    const { userEmail, expense, currency } = JSON.parse(event.body ?? '{}');
    const symbol  = CURRENCY_SYMBOLS[currency as string] ?? '$';
    const amount  = `${symbol}${Number(expense.amount).toFixed(2)}`;
    const catLabel = (expense.category as string).charAt(0) + (expense.category as string).slice(1).toLowerCase().replace(/_/g, ' ');
    const expDate = new Date(expense.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const addedDate = expense.createdAt
      ? new Date(expense.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : null;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0077B6,#00B4D8);padding:28px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">✈️</div>
      <h1 style="margin:0;color:white;font-size:22px;font-weight:700;">Expense Receipt</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${expense.name}</p>
    </div>

    <!-- Amount highlight -->
    <div style="background:#fff7ed;border-bottom:1px solid #fed7aa;padding:20px 24px;text-align:center;">
      <p style="margin:0;color:#9a3412;font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;">Total Amount</p>
      <p style="margin:4px 0 0;color:#FF6B35;font-size:36px;font-weight:800;">${amount}</p>
      <span style="display:inline-block;margin-top:8px;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${expense.paid ? '#dcfce7' : '#fef9c3'};color:${expense.paid ? '#15803d' : '#a16207'};">
        ${expense.paid ? '✓ Paid' : '⏳ Unpaid'}
      </span>
    </div>

    <!-- Details -->
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:12px 0;color:#64748b;font-size:13px;">Category</td>
          <td style="padding:12px 0;text-align:right;font-size:13px;font-weight:600;color:#1e293b;">${catLabel}</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:12px 0;color:#64748b;font-size:13px;">Date</td>
          <td style="padding:12px 0;text-align:right;font-size:13px;color:#1e293b;">${expDate}</td>
        </tr>
        ${expense.location ? `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:12px 0;color:#64748b;font-size:13px;">Location</td>
          <td style="padding:12px 0;text-align:right;font-size:13px;color:#1e293b;">${expense.location}</td>
        </tr>` : ''}
        ${expense.notes ? `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:12px 0;color:#64748b;font-size:13px;">Notes</td>
          <td style="padding:12px 0;text-align:right;font-size:13px;color:#1e293b;font-style:italic;">${expense.notes}</td>
        </tr>` : ''}
        ${addedDate ? `
        <tr>
          <td style="padding:12px 0;color:#64748b;font-size:13px;">Logged</td>
          <td style="padding:12px 0;text-align:right;font-size:13px;color:#94a3b8;">${addedDate}</td>
        </tr>` : ''}
      </table>
    </div>

    ${expense.receiptUrl ? `
    <!-- Receipt image -->
    <div style="padding:0 24px 24px;">
      <p style="margin:0 0 12px;color:#64748b;font-size:13px;font-weight:600;">Receipt Photo</p>
      <a href="${expense.receiptUrl}" target="_blank" style="display:block;">
        <img src="${expense.receiptUrl}" alt="Receipt" style="width:100%;border-radius:12px;border:1px solid #e2e8f0;display:block;" />
      </a>
      <a href="${expense.receiptUrl}" target="_blank" style="display:inline-block;margin-top:8px;font-size:12px;color:#0077B6;">View full size ↗</a>
    </div>` : ''}

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 24px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">Sent from your <strong>Vacation Budget App</strong> · budget.sgolas.com</p>
    </div>
  </div>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Vacation Budget <onboarding@resend.dev>',
        to: [userEmail],
        subject: `Receipt: ${expense.name} — ${amount}`,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error((result as { message?: string }).message ?? 'Email send failed');

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('send-receipt error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to send email' }),
    };
  }
};
