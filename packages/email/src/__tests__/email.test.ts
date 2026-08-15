import { describe, expect, it } from "vitest";
import { renderInvitationEmail } from "../emails/invitation.js";
import { renderPasswordResetEmail } from "../emails/password-reset.js";
import { escapeHtml } from "../render.js";

describe("escapeHtml", () => {
  it("neutralises HTML-significant characters", () => {
    expect(escapeHtml(`<script>"&'`)).toBe("&lt;script&gt;&quot;&amp;&#39;");
  });
});

describe("renderInvitationEmail", () => {
  const base = {
    inviterName: "Michelle Dela Rosa",
    workspaceName: "Emergetech",
    acceptUrl: "https://crm.emergeautomation.tech/accept-invite?token=abc123"
  };

  it("returns subject, html and text", () => {
    const r = renderInvitationEmail(base);
    expect(r.subject).toBe("Michelle Dela Rosa invited you to Emergetech on Emerge CRM");
    expect(r.html).toContain("<!DOCTYPE html");
    expect(r.text).toContain("You've been invited to join Emerge CRM.");
  });

  it("includes the invitation content, CTA, expiry and fallback link", () => {
    const r = renderInvitationEmail(base);
    expect(r.html).toContain("You&#39;ve been invited to join Emerge CRM");
    expect(r.html).toContain("Accept Invitation");
    expect(r.html).toContain(base.acceptUrl);
    expect(r.html).toContain("expires in");
    expect(r.html).toContain("Copy and paste this link"); // fallback
    expect(r.html).toContain("emergeautomation.tech"); // footer
  });

  it("shows workspace + inviter in the info card and heading strongly", () => {
    const r = renderInvitationEmail(base);
    expect(r.html).toContain("Workspace");
    expect(r.html).toContain("Invited by");
    expect(r.html).toContain("Emergetech");
    expect(r.html).toContain("Michelle Dela Rosa");
  });

  it("respects a custom expiry", () => {
    const r = renderInvitationEmail({ ...base, expiresInDays: 14 });
    expect(r.html).toContain("14 days");
    expect(r.text).toContain("expires in 14 days");
  });

  it("escapes hostile inviter/workspace names (no raw HTML injected)", () => {
    const r = renderInvitationEmail({
      ...base,
      inviterName: `<img src=x onerror=alert(1)>`,
      workspaceName: `Evil & "Co" <b>`
    });
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&lt;img src=x");
    expect(r.html).toContain("Evil &amp; &quot;Co&quot; &lt;b&gt;");
  });

  it("has a preheader for the inbox preview", () => {
    const r = renderInvitationEmail(base);
    expect(r.html).toContain("invited you to the Emergetech workspace");
  });

  it("includes a VML round-rect button for Outlook", () => {
    const r = renderInvitationEmail(base);
    expect(r.html).toContain("v:roundrect");
    expect(r.html).toContain("[if mso]");
  });
});

describe("renderPasswordResetEmail", () => {
  const r = renderPasswordResetEmail({
    resetUrl: "https://crm.emergeautomation.tech/reset-password?token=xyz"
  });
  it("reuses the design system with reset-specific copy", () => {
    expect(r.subject).toBe("Reset your Emerge CRM password");
    expect(r.html).toContain("Reset your password");
    expect(r.html).toContain("Reset Password");
    expect(r.html).toContain("expires in");
    expect(r.html).toContain("1 hour");
    expect(r.html).toContain("https://crm.emergeautomation.tech/reset-password?token=xyz");
  });
  it("pluralises hours correctly", () => {
    const many = renderPasswordResetEmail({ resetUrl: "https://x", expiresInHours: 3 });
    expect(many.html).toContain("3 hours");
  });
});
