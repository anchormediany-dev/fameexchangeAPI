// utils/emailer.js
import nodemailer from "nodemailer";

/* ===================== Transport (env-driven) ===================== */
// Required env (pick one style):
//  - Gmail-style:   SMTP_SERVICE=gmail, SMTP_USER=you@gmail.com, SMTP_PASS=app_password
//  - Generic SMTP:  SMTP_HOST=smtp.example.com, SMTP_PORT=587, SMTP_USER=user, SMTP_PASS=pass, SMTP_SECURE=false
// Optional:
//  - MAIL_FROM_EMAIL (default: SMTP_USER)
//  - MAIL_FROM_NAME  (default: brand passed into sender)

let _cachedTx = null;
export function getTransporter() {
  if (_cachedTx) return _cachedTx;

  const user = process.env.NODEMAILER_EMAIL;
  const pass = process.env.NODEMAILER_PASSCODE;
  if (!user || !pass) {
    throw new Error("Missing NODEMAILER_EMAIL or NODEMAILER_PASSCODE env.");
  }

  _cachedTx = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  return _cachedTx;
}

/* ===================== Small utils ===================== */
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );

// very light URL guard (prevents javascript: etc.)
const safeHref = (url) => {
  const s = String(url || "");
  return /^https?:\/\//i.test(s) ? s : "#";
};

const baseStyles =
  "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;line-height:1.6;";
const cardStyles =
  "padding:16px 20px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;";

/* ===================== EMAIL FORMATS ===================== */
/** SESSION REMINDER (subject, preheader, text, html) */
export function getSessionReminderEmail({
  brand = "elementTrade",
  userName = "there",
  sessionTitle = "your session",
  when, // pre-formatted string (e.g., "Wed, 25 Sep 2025 at 3:30 PM PKT" or "2025-10-02 at 12:00 PM")
  hostName, // optional
  location, // optional
  joinLink, // optional URL
  notes, // optional
}) {
  const _when = when || "the scheduled time";
  const subject = `Reminder: Your ${sessionTitle} on ${_when}`;
  const preheader = `Heads up: ${sessionTitle} is scheduled for ${_when}.`;

  const text = `Hi ${userName},

This is a friendly reminder for your confirmed session.

Session: ${sessionTitle}
When: ${_when}${hostName ? `\nHost: ${hostName}` : ""}${
    location ? `\nLocation: ${location}` : ""
  }${joinLink ? `\nJoin link: ${joinLink}` : ""}${
    notes ? `\nNotes: ${notes}` : ""
  }

If you need to reschedule, please do so ahead of time.

${brand} Team`;

  const html = `
<div style="${baseStyles}">
  <!-- preheader -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${esc(
    preheader
  )}</div>

  <p>Hi ${esc(userName)},</p>
  <p>This is a friendly reminder for your confirmed session:</p>

  <div style="${cardStyles}">
    <p style="margin:0 0 6px;"><strong>Session:</strong> ${esc(
      sessionTitle
    )}</p>
    <p style="margin:0 0 6px;"><strong>When:</strong> ${esc(_when)}</p>
    ${
      hostName
        ? `<p style="margin:0 0 6px;"><strong>Host:</strong> ${esc(
            hostName
          )}</p>`
        : ""
    }
    ${
      location
        ? `<p style="margin:0 0 6px;"><strong>Location:</strong> ${esc(
            location
          )}</p>`
        : ""
    }
    ${
      joinLink
        ? `<p style="margin:0 0 6px;"><strong>Join link:</strong> <a href="${safeHref(
            joinLink
          )}">${esc(joinLink)}</a></p>`
        : ""
    }
    ${
      notes
        ? `<p style="margin:8px 0 0;"><strong>Notes:</strong> ${esc(notes)}</p>`
        : ""
    }
  </div>

  
  <p>See you soon!<br/>${esc(brand)} Team</p>
</div>`.trim();

  return { subject, preheader, text, html };
}

/** TICKET REMINDER (subject, preheader, text, html) */
export function getTicketReminderEmail({
  brand = "elementTrade",
  userName = "there",
  eventName = "your event",
  when, // pre-formatted string
  venue, // optional
  seat, // optional
  ticketNo, // optional
  manageLink, // optional URL
  qrUrl, // optional URL
}) {
  const _when = when || "the event date";
  const subject = `Reminder: Your ticket for ${eventName} on ${_when}`;
  const preheader = `${eventName} is coming up on ${_when}.`;

  const text = `Hi ${userName},

Just a reminder for your confirmed ticket.

Event: ${eventName}
When: ${_when}${venue ? `\nVenue: ${venue}` : ""}${
    seat ? `\nSeat: ${seat}` : ""
  }${ticketNo ? `\nTicket #: ${ticketNo}` : ""}${
    manageLink ? `\nManage ticket: ${manageLink}` : ""
  }

Arrive a bit early for check-in. Enjoy the event!

${brand} Team`;

  const html = `
<div style="${baseStyles}">
  <!-- preheader -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${esc(
    preheader
  )}</div>

  <p>Hi ${esc(userName)},</p>
  <p>Just a reminder for your confirmed ticket:</p>

  <div style="${cardStyles}">
    <p style="margin:0 0 6px;"><strong>Event:</strong> ${esc(eventName)}</p>
    <p style="margin:0 0 6px;"><strong>When:</strong> ${esc(_when)}</p>
    ${
      venue
        ? `<p style="margin:0 0 6px;"><strong>Venue:</strong> ${esc(venue)}</p>`
        : ""
    }
    ${
      seat
        ? `<p style="margin:0 0 6px;"><strong>Seat:</strong> ${esc(seat)}</p>`
        : ""
    }
    ${
      ticketNo
        ? `<p style="margin:0 0 6px;"><strong>Ticket #:</strong> ${esc(
            ticketNo
          )}</p>`
        : ""
    }
    ${
      manageLink
        ? `<p style="margin:0 0 6px;"><strong>Manage ticket:</strong> <a href="${safeHref(
            manageLink
          )}">${esc(manageLink)}</a></p>`
        : ""
    }
    ${
      qrUrl
        ? `<div style="margin-top:10px;"><img src="${safeHref(
            qrUrl
          )}" alt="Ticket QR" style="width:140px;height:140px;object-fit:contain;" /></div>`
        : ""
    }
  </div>

  <p style="margin-top:16px;">Arrive a bit early for check-in. Enjoy the event!</p>
  <p>Cheers,<br/>${esc(brand)} Team</p>
</div>`.trim();

  return { subject, preheader, text, html };
}

/** KYC SUBMITTED (subject, preheader, text, html) */
export function getKycSubmittedEmail({ brand = "The Fame Exchange", userName = "there" } = {}) {
  const subject = "Your Fame Exchange Verification is Under Review";
  const preheader = "We've received your identity verification submission.";

  const text = `Hi ${userName},

We've received your identity verification (KYC) submission. Our team typically
reviews applications within 48-72 hours. We'll email you as soon as a decision
has been made — no action is needed from you in the meantime.

${brand} Team`;

  const html = `
<div style="${baseStyles}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${esc(preheader)}</div>
  <p>Hi ${esc(userName)},</p>
  <p>We've received your identity verification (KYC) submission.</p>
  <div style="${cardStyles}">
    <p style="margin:0;">Our team typically reviews applications within <strong>48-72 hours</strong>. We'll email you as soon as a decision has been made — no action is needed from you in the meantime.</p>
  </div>
  <p>Thanks for your patience,<br/>${esc(brand)} Team</p>
</div>`.trim();

  return { subject, preheader, text, html };
}

/** KYC APPROVED (subject, preheader, text, html) */
export function getKycApprovedEmail({ brand = "The Fame Exchange", userName = "there", profileLink } = {}) {
  const subject = "You're Verified! Your Shares Are Now Live on The Fame Exchange";
  const preheader = "Your identity has been verified and your shares are now tradeable.";

  const text = `Hi ${userName},

Congratulations — your identity verification is complete! Your Branded Talent
Shares are now live and tradeable on The Fame Exchange.${
    profileLink ? `\n\nView your profile: ${profileLink}` : ""
  }

${brand} Team`;

  const html = `
<div style="${baseStyles}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${esc(preheader)}</div>
  <p>Hi ${esc(userName)},</p>
  <p>Congratulations — your identity verification is complete! Your Branded Talent Shares are now <strong>live and tradeable</strong> on The Fame Exchange.</p>
  ${
    profileLink
      ? `<div style="${cardStyles}"><p style="margin:0;"><a href="${safeHref(profileLink)}">View your profile →</a></p></div>`
      : ""
  }
  <p>Welcome aboard,<br/>${esc(brand)} Team</p>
</div>`.trim();

  return { subject, preheader, text, html };
}

/** KYC REJECTED (subject, preheader, text, html) */
export function getKycRejectedEmail({ brand = "The Fame Exchange", userName = "there", rejectionReason, resubmitLink } = {}) {
  const subject = "Action Needed: Verification Update";
  const preheader = "Your identity verification needs attention before it can be approved.";

  const text = `Hi ${userName},

Your identity verification (KYC) submission could not be approved as-is.${
    rejectionReason ? `\n\nReason: ${rejectionReason}` : ""
  }

Please review the issue and resubmit your documents.${
    resubmitLink ? `\n\nResubmit here: ${resubmitLink}` : ""
  }

${brand} Team`;

  const html = `
<div style="${baseStyles}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;">${esc(preheader)}</div>
  <p>Hi ${esc(userName)},</p>
  <p>Your identity verification (KYC) submission could not be approved as-is.</p>
  ${
    rejectionReason
      ? `<div style="${cardStyles}"><p style="margin:0;"><strong>Reason:</strong> ${esc(rejectionReason)}</p></div>`
      : ""
  }
  <p>Please review the issue above and resubmit your documents.${
    resubmitLink ? ` <a href="${safeHref(resubmitLink)}">Resubmit here →</a>` : ""
  }</p>
  <p>${esc(brand)} Team</p>
</div>`.trim();

  return { subject, preheader, text, html };
}

/* ===================== SEND HELPERS ===================== */
async function sendMail({ brand, to, subject, html, text, replyTo, headers }) {
  try {
    const tx = getTransporter();
    const fromEmail =
      process.env.MAIL_FROM_EMAIL || process.env.NODEMAILER_EMAIL;
    const fromName = process.env.MAIL_FROM_NAME || brand || "elementTrade";

    await tx.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text,
      replyTo,
      headers,
    });
    return true;
  } catch (err) {
    console.error("sendMail error:", err?.message || err);
    return false;
  }
}

/** Send: Confirmed Session Reminder */
export async function sendSessionReminderEmail(to, payload) {
  const { subject, html, text } = getSessionReminderEmail(payload);
  return sendMail({
    brand: payload?.brand,
    to,
    subject,
    html,
    text,
  });
}

/** Send: Confirmed Ticket Reminder */
export async function sendTicketReminderEmail(to, payload) {
  const { subject, html, text } = getTicketReminderEmail(payload);
  return sendMail({
    brand: payload?.brand,
    to,
    subject,
    html,
    text,
  });
}

/** Send: KYC Submitted */
export async function sendKycSubmittedEmail(to, payload) {
  const { subject, html, text } = getKycSubmittedEmail(payload);
  return sendMail({ brand: payload?.brand, to, subject, html, text });
}

/** Send: KYC Approved */
export async function sendKycApprovedEmail(to, payload) {
  const { subject, html, text } = getKycApprovedEmail(payload);
  return sendMail({ brand: payload?.brand, to, subject, html, text });
}

/** Send: KYC Rejected */
export async function sendKycRejectedEmail(to, payload) {
  const { subject, html, text } = getKycRejectedEmail(payload);
  return sendMail({ brand: payload?.brand, to, subject, html, text });
}

// default export if you prefer one import point
export default {
  getTransporter,
  getSessionReminderEmail,
  getTicketReminderEmail,
  sendSessionReminderEmail,
  sendTicketReminderEmail,
  getKycSubmittedEmail,
  getKycApprovedEmail,
  getKycRejectedEmail,
  sendKycSubmittedEmail,
  sendKycApprovedEmail,
  sendKycRejectedEmail,
};
