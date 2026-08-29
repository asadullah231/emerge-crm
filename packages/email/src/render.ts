/**
 * The reusable email design system: primitives (escape, button, headings,
 * cards, dividers) + the page layout. Every email is composed from these, so
 * new emails inherit the same branding, spacing and cross-client hardening.
 *
 * Cross-client strategy:
 *  - Table-based, single 600px column, every style inlined (Gmail strips most
 *    <style> selectors; inline styles are the source of truth).
 *  - Outlook (Word engine): XHTML doctype, VML round-rect buttons, MSO
 *    conditionals, explicit bgcolor on cells, mso-line-height-rule.
 *  - Mobile: a small <style> @media block for fluid width + larger tap targets.
 *  - No web fonts, no background-image reliance, no SVG.
 */
import { brand, company, CONTENT_WIDTH, fontStack } from "./tokens.js";

/** Escape a string for safe interpolation into HTML text or an attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Brand lockup for the header: the official EmergeTech mark (a hosted PNG, since
 * Gmail/Outlook do not reliably render SVG) next to the "EmergeTech" wordmark.
 * The `alt` text carries the brand name so it still reads if images are blocked.
 */
export function logoLockup(): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td width="44" style="width:44px;vertical-align:middle;line-height:0;">
        <img src="${company.logoUrl}" width="44" height="44" alt="${escapeHtml(company.brand)}"
          style="display:block;width:44px;height:44px;border:0;outline:none;text-decoration:none;border-radius:11px;" />
      </td>
      <td style="padding-left:12px;vertical-align:middle;">
        <span style="font-family:${fontStack};font-size:19px;font-weight:700;letter-spacing:-0.2px;color:${brand.navy};">Emerge</span><span style="font-family:${fontStack};font-size:19px;font-weight:700;letter-spacing:-0.2px;color:${brand.teal};">Tech</span>
      </td>
    </tr>
  </table>`;
}

/** Small uppercase eyebrow label above the heading. */
export function eyebrow(text: string): string {
  return `<p style="margin:0 0 12px 0;font-family:${fontStack};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${brand.teal};">${escapeHtml(
    text
  )}</p>`;
}

/** Page-level heading (H1). */
export function heading(text: string): string {
  return `<h1 class="h1" style="margin:0 0 16px 0;font-family:${fontStack};font-size:26px;line-height:34px;font-weight:700;letter-spacing:-0.4px;color:${brand.text};">${escapeHtml(
    text
  )}</h1>`;
}

/** Body paragraph. `html` may contain pre-escaped inline markup (e.g. <strong>). */
export function paragraph(html: string): string {
  return `<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:16px;line-height:26px;color:${brand.textMuted};">${html}</p>`;
}

/** Bold inline value, escaped. */
export function strong(text: string): string {
  return `<strong style="color:${brand.text};font-weight:600;">${escapeHtml(text)}</strong>`;
}

/**
 * A bordered info card that lists key/value rows (workspace, inviter, ...).
 * Values are escaped here; keys are trusted literals.
 */
export function infoCard(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map(
      (r, i) => `
      <tr>
        <td style="padding:${i === 0 ? "0" : "10px"} 0 0 0;font-family:${fontStack};font-size:13px;color:${brand.textSubtle};width:120px;vertical-align:top;">${escapeHtml(
          r.label
        )}</td>
        <td style="padding:${i === 0 ? "0" : "10px"} 0 0 0;font-family:${fontStack};font-size:15px;font-weight:600;color:${brand.text};vertical-align:top;">${escapeHtml(
          r.value
        )}</td>
      </tr>`
    )
    .join("");
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="background-color:${brand.navySoft};border:1px solid ${brand.border};border-radius:12px;margin:0 0 26px 0;">
    <tr><td style="padding:20px 22px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}</table>
    </td></tr>
  </table>`;
}

/** Bulletproof primary CTA button (VML for Outlook, padded anchor elsewhere). */
export function button(opts: { href: string; label: string }): string {
  const href = escapeHtml(opts.href);
  const label = escapeHtml(opts.label);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="btn" style="margin:6px 0 20px 0;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr><td align="center" bgcolor="${brand.navy}" style="border-radius:12px;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
            href="${href}" style="height:58px;v-text-anchor:middle;width:320px;" arcsize="21%" strokecolor="${brand.navy}" fillcolor="${brand.navy}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:${fontStack};font-size:17px;font-weight:600;">${label}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${href}" target="_blank"
            style="display:inline-block;padding:17px 56px;font-family:${fontStack};font-size:17px;font-weight:600;line-height:22px;color:#ffffff;text-decoration:none;border-radius:12px;background-color:${brand.navy};mso-padding-alt:0;"><span style="color:#ffffff;text-decoration:none;">${label}</span></a>
          <!--<![endif]-->
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

/** Muted helper line (expiry note, "ignore this email", etc.). */
export function subtle(html: string): string {
  return `<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:14px;line-height:22px;color:${brand.textSubtle};">${html}</p>`;
}

/** A thin horizontal rule. */
export function divider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding:8px 0 22px 0;"><div style="height:1px;background-color:${brand.border};line-height:1px;font-size:0;">&nbsp;</div></td></tr></table>`;
}

/** "Button not working?" fallback with the raw URL for copy/paste. */
export function fallbackLink(url: string): string {
  const safe = escapeHtml(url);
  return `
  <p style="margin:0 0 4px 0;font-family:${fontStack};font-size:12px;line-height:18px;color:${brand.textSubtle};text-align:center;">
    Button not working? Copy and paste this link into your browser:
  </p>
  <p style="margin:0;font-family:${fontStack};font-size:12px;line-height:18px;word-break:break-all;text-align:center;">
    <a href="${safe}" target="_blank" style="color:${brand.teal};text-decoration:underline;">${safe}</a>
  </p>`;
}

/**
 * Compose a full, cross-client HTML document from a content block.
 * `contentHtml` is the pre-built inner HTML (built from the helpers above).
 */
export function layout(opts: { previewText: string; contentHtml: string }): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${escapeHtml(company.product)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style type="text/css">
    html, body { margin:0 !important; padding:0 !important; height:100% !important; width:100% !important; }
    * { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    a { color:${brand.teal}; }
    .email-body { background-color:${brand.pageBg}; }
    @media only screen and (max-width:620px) {
      .container { width:100% !important; }
      .px { padding-left:24px !important; padding-right:24px !important; }
      .card-px { padding-left:24px !important; padding-right:24px !important; }
      .h1 { font-size:22px !important; line-height:30px !important; }
      .btn a { display:block !important; width:auto !important; }
    }
    @media (prefers-color-scheme: dark) {
      /* We intentionally stay light; force our palette so clients don't invert. */
      .email-body { background-color:${brand.pageBg} !important; }
      .card { background-color:${brand.card} !important; }
    }
  </style>
</head>
<body class="email-body" style="margin:0;padding:0;background-color:${brand.pageBg};">
  <!-- Preheader: shown as the inbox preview line, hidden in the body. -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${brand.pageBg};opacity:0;">
    ${escapeHtml(opts.previewText)}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-body" style="background-color:${brand.pageBg};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${CONTENT_WIDTH}" class="container" style="width:${CONTENT_WIDTH}px;max-width:${CONTENT_WIDTH}px;">
          <!-- Header -->
          <tr><td class="px" style="padding:4px 8px 22px 8px;">${logoLockup()}</td></tr>
          <!-- Card -->
          <tr><td>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="card"
              style="background-color:${brand.card};border:1px solid ${brand.border};border-radius:16px;">
              <tr><td class="card-px" style="padding:40px 40px 36px 40px;">
                ${opts.contentHtml}
              </td></tr>
            </table>
          </td></tr>
          <!-- Footer -->
          <tr><td class="px" style="padding:26px 8px 8px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td style="padding:0 0 8px 0;font-family:${fontStack};font-size:14px;font-weight:600;color:${brand.text};">
                ${escapeHtml(company.brand)}
              </td></tr>
              <tr><td style="padding:0 0 14px 0;font-family:${fontStack};font-size:13px;line-height:20px;">
                <a href="${company.website}" target="_blank" style="color:${brand.teal};text-decoration:none;">${escapeHtml(
                  company.websiteLabel
                )}</a>
              </td></tr>
              <tr><td style="padding:0;font-family:${fontStack};font-size:12px;line-height:18px;color:${brand.textSubtle};">
                You received this email because someone invited you to or requested access on ${escapeHtml(
                  company.product
                )}. If this wasn't you, you can safely ignore it.
                <br />&copy; ${year} ${escapeHtml(company.brand)}.
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
