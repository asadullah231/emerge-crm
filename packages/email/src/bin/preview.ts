/**
 * Dev-only: render sample emails to HTML files for visual QA. Not shipped.
 *   tsx src/bin/preview.ts <out-dir>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { renderInvitationEmail } from "../emails/invitation.js";
import { renderPasswordResetEmail } from "../emails/password-reset.js";

const outDir = process.argv[2] ?? ".";

const inv = renderInvitationEmail({
  inviterName: "Michelle Dela Rosa",
  workspaceName: "Emergetech",
  acceptUrl: "https://crm.emergeautomation.tech/accept-invite?token=demo-abc-123"
});
const rst = renderPasswordResetEmail({
  resetUrl: "https://crm.emergeautomation.tech/reset-password?token=demo-xyz-789"
});

writeFileSync(path.join(outDir, "invitation-email.html"), inv.html);
writeFileSync(path.join(outDir, "reset-email.html"), rst.html);
console.log("invitation subject:", inv.subject);
console.log("reset subject:", rst.subject);
console.log("written to", outDir);
