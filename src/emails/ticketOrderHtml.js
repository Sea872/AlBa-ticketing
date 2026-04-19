/**
 * HTML email body for ticket delivery.
 * Inline styles only — required for email client compatibility.
 */

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return iso;
  }
}

function ticketCard(row) {
  const date = formatDate(row.date);
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
    style="margin-bottom:16px;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <!-- Card header tab -->
    <tr>
      <td style="background:#0f1419;padding:10px 18px;">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#5b9fd4;">
          Ticket #${esc(String(row.ticketIndex))}
        </span>
      </td>
    </tr>
    <!-- Concert info + QR side by side -->
    <tr>
      <td style="padding:18px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <!-- Left: concert details -->
            <td style="vertical-align:top;padding-right:16px;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0f172a;line-height:1.2;">
                ${esc(row.name)}
              </p>
              ${date ? `<p style="margin:0 0 5px;font-size:13px;color:#475569;">📅 &nbsp;${esc(date)}</p>` : ""}
              ${row.venue ? `<p style="margin:0 0 14px;font-size:13px;color:#475569;">📍 &nbsp;${esc(row.venue)}</p>` : ""}
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;">
                Open the attached PNG to show your QR code at the gate.
              </p>
            </td>
            <!-- Right: QR attachment badge -->
            <td style="vertical-align:top;text-align:center;width:130px;">
              <div style="display:inline-block;background:#f0f9ff;border:1.5px dashed #7dd3fc;
                border-radius:10px;padding:14px 10px;text-align:center;">
                <p style="margin:0 0 4px;font-size:28px;line-height:1;">📎</p>
                <p style="margin:0;font-size:11px;font-weight:600;color:#0369a1;line-height:1.4;">
                  QR code attached<br/>as PNG file
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

/**
 * @param {{
 *   shopifyOrderId: string,
 *   customerEmail: string,
 *   rows: { name: string, date: string, venue: string, ticketIndex: number, cid: string, imageBase64: string }[],
 *   isResend?: boolean
 * }} params
 */
export function buildTicketOrderHtml({ shopifyOrderId, customerEmail, rows, isResend = false }) {
  const cards = rows.map(ticketCard).join("");
  const ticketWord = rows.length === 1 ? "ticket" : "tickets";
  const subjectLine = isResend ? "Here are your tickets again" : "Your tickets are ready";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subjectLine} — AlbaGB</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;">

          <!-- ── Header ── -->
          <tr>
            <td style="background:#0f1419;border-radius:16px 16px 0 0;padding:24px 32px;text-align:center;">
              <span style="font-size:20px;font-weight:800;color:#e7ecf3;letter-spacing:-0.3px;">
                AlbaGB<span style="color:#5b9fd4;font-weight:400;"> Ticketing</span>
              </span>
            </td>
          </tr>

          <!-- ── Hero ── -->
          <tr>
            <td style="background:#1a2332;padding:36px 32px;text-align:center;border-bottom:1px solid #2d3a4d;">
              <p style="margin:0 0 14px;font-size:42px;line-height:1;">🎟️</p>
              <h1 style="margin:0 0 10px;font-size:26px;font-weight:700;color:#e7ecf3;line-height:1.2;">
                ${subjectLine}
              </h1>
              <p style="margin:0;font-size:15px;color:#8b9cb3;line-height:1.6;">
                You have <strong style="color:#e7ecf3;">${rows.length} ${ticketWord}</strong> for the show${rows.length > 1 ? "s" : ""} below.
                Each QR code is attached to this email.
              </p>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="background:#ffffff;padding:32px;">

              <!-- Order summary -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                style="margin-bottom:28px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="font-size:13px;color:#64748b;">Order</td>
                        <td style="font-size:13px;font-weight:600;color:#0f172a;text-align:right;">
                          #${esc(shopifyOrderId)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="font-size:13px;color:#64748b;">Sent to</td>
                        <td style="font-size:13px;color:#0f172a;text-align:right;">${esc(customerEmail)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Ticket cards -->
              <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;
                letter-spacing:0.08em;color:#94a3b8;">
                Your ${ticketWord}
              </p>
              ${cards}

              <!-- Instructions -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                style="margin-top:24px;background:#eff6ff;border-radius:10px;border:1px solid #bfdbfe;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#1e40af;">
                      📱 How to use your tickets
                    </p>
                    <p style="margin:0;font-size:13px;color:#1e3a8a;line-height:1.6;">
                      Your QR codes are attached to this email as PNG files — one file per ticket.
                      Open the attachment on your phone and show it at the gate.
                      Each code is unique and can only be scanned once.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="background:#f8fafc;border-radius:0 0 16px 16px;padding:24px 32px;
              text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#0f172a;">AlbaGB</p>
              <p style="margin:0 0 14px;font-size:12px;color:#94a3b8;line-height:1.6;">
                <a href="https://albaguitarbeads.com" style="color:#5b9fd4;text-decoration:none;">
                  albaguitarbeads.com
                </a>
              </p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;line-height:1.6;">
                Didn't purchase these tickets? You can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}
