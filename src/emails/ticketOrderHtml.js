/**
 * HTML email body for ticket delivery (inline styles for client compatibility).
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * @param {{ shopifyOrderId: string, customerEmail: string, rows: { label: string, ticketIndex: number }[] }} params
 */
export function buildTicketOrderHtml({ shopifyOrderId, customerEmail, rows }) {
  const listItems = rows
    .map(
      (r) =>
        `<li style="margin:8px 0;"><strong>${escapeHtml(r.label)}</strong> — ticket #${r.ticketIndex}</li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f5;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td>
          <p style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#71717a;">Alba GB</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">Your concert tickets</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#3f3f46;">
            Thank you for your purchase. Your QR tickets are attached to this email. Show each code at the venue entrance.
          </p>
          <p style="margin:0 0 8px;font-size:14px;"><strong>Order</strong> #${escapeHtml(shopifyOrderId)}</p>
          <p style="margin:0 0 20px;font-size:14px;"><strong>Sent to</strong> ${escapeHtml(customerEmail)}</p>
          <p style="margin:0 0 8px;font-size:14px;font-weight:600;">Tickets</p>
          <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.45;color:#3f3f46;">
            ${listItems}
          </ul>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
            If you did not place this order, contact us with your order number.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
