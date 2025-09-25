import User from "../models/user.js";
import Session from "../models/sessionModel.js";

import {
  getTicketReminderEmail,
  sendSessionReminderEmail,
} from "../utils/emailFormats.js";
import FanInverseRequest from "../models/fanInverseRequestModel.js";

// tiny helpers (no TZ math)
const pick = (...vals) =>
  vals.find((v) => v !== undefined && v !== null && v !== "");
const displayTime = (timeStr = "") => {
  const s = String(timeStr).trim();
  if (!s) return "";
  if (/(am|pm)$/i.test(s)) return s.toUpperCase(); // already 12h
  const m = /^(\d{1,2}):(\d{2})$/.exec(s); // HH:mm
  if (!m) return s;
  let [, hh, mm] = m;
  let h = Number(hh);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mm} ${ampm}`;
};
const whenText = (date, time) =>
  `${date ? new Date(date).toISOString().slice(0, 10) : ""}${
    time ? ` at ${displayTime(time)}` : ""
  }`.trim();

function fmtName(u) {
  return (
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
    u?.userName ||
    "there"
  );
}

/**
 * POST /api/reminders/fan-request
 * Body (choose ONE strategy):
 *  A) { "fanRequestId": "<ObjectId>" }
 *  B) { "talentId": "<ObjectId>", "fanId": "<ObjectId>" }  // picks the first accepted match by date asc
 *
 * Optional: { "target": "fan" | "talent" }  // if provided, send only to that side
 */
export async function sendSessionReminder(req, res) {
  try {
    const { fanRequestId, talentId, fanId, target } = req.body || {};

    // 1) Resolve the fan request
    let fr = null;

    if (fanRequestId) {
      fr = await FanInverseRequest.findById({ _id: fanRequestId }).lean();
    } else if (talentId && fanId) {
      fr = await FanInverseRequest.findOne({
        talentId,
        fanId,
        status: "accepted",
      })
        .sort({ date: 1, time: 1 })
        .lean();
    } else {
      return res.status(400).json({
        success: false,
        message: "Provide fanRequestId OR (talentId and fanId).",
      });
    }

    if (!fr) {
      return res.status(404).json({
        success: false,
        message: "No accepted fan request found for the given input.",
      });
    }

    // 2) Load both users
    const [fanUser, talentUser] = await Promise.all([
      User.findById(fr.fanId)
        .select("firstName lastName userName email")
        .lean(),
      User.findById(fr.talentId)
        .select("firstName lastName userName email")
        .lean(),
    ]);

    if (!fanUser || !fanUser.email) {
      return res
        .status(404)
        .json({ success: false, message: "Fan user/email not found." });
    }
    if (!talentUser || !talentUser.email) {
      return res
        .status(404)
        .json({ success: false, message: "Talent user/email not found." });
    }

    // 3) Build the shared "when" and "location" from FanInverseRequest
    const when = whenText(fr.date, fr.time);
    const location = pick(fr.location, "Online / Onsite");

    // 4) Build payloads (same template, personalized name & title)
    const fanPayload = {
      brand: "elementTrade",
      userName: fmtName(fanUser),
      sessionTitle: `Confirmed Session with ${fmtName(talentUser)}`,
      when,
      location,
      // joinLink / notes if you add them later:
      // joinLink: fr.joinLink,
      // notes: fr.notes,
    };

    const talentPayload = {
      brand: "elementTrade",
      userName: fmtName(talentUser),
      sessionTitle: `Confirmed Session with ${fmtName(fanUser)}`,
      when,
      location,
    };

    // 5) Send emails
    const results = { fan: null, talent: null };

    if (!target || target === "fan") {
      await sendSessionReminderEmail(fanUser.email, fanPayload);
      results.fan = { to: fanUser.email, ok: true };
    }

    if (!target || target === "talent") {
      await sendSessionReminderEmail(talentUser.email, talentPayload);
      results.talent = { to: talentUser.email, ok: true };
    }

    return res.json({
      success: true,
      message: `Reminder email(s) sent${target ? ` to ${target}` : ""}.`,
      request: {
        id: fr._id,
        talentName: fr.talentName,
        status: fr.status,
        date: fr.date,
        time: fr.time,
        location: fr.location,
      },
      results,
    });
  } catch (e) {
    console.error("sendFanRequestReminder:", e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

/** POST /api/reminders/ticket
 * Body (no model): {
 *   "to": "user@example.com",
 *   "eventName": "PetCare Expo",
 *   "date": "2025-10-02",
 *   "time": "12:00 PM",
 *   "timeZone": "Asia/Karachi",          // optional
 *   "venue": "Expo Center Hall B",       // optional
 *   "seat": "Block A, Row 3, Seat 12",   // optional
 *   "ticketNo": "PCX-784213",            // optional
 *   "manageLink": "https://...",         // optional
 *   "qrUrl": "https://..."               // optional
 * }
 */
export async function sendTicketReminder(req, res) {
  try {
    const {
      to,
      eventName,
      date,
      time,
      timeZone,
      venue,
      seat,
      ticketNo,
      manageLink,
      qrUrl,
    } = req.body || {};

    if (!to)
      return res
        .status(400)
        .json({ success: false, message: "`to` (email) is required" });
    if (!eventName)
      return res
        .status(400)
        .json({ success: false, message: "`eventName` is required" });
    if (!date)
      return res
        .status(400)
        .json({ success: false, message: "`date` is required" });

    // (Optional) ensure user exists; remove this block if you don't want the lookup
    const user = await getUserByEmail(to);
    const userName = user?.firstName || "there";

    const payload = {
      userName,
      eventName,
      when: whenText(date, time, timeZone),
      venue,
      seat,
      ticketNo,
      manageLink,
      qrUrl,
    };

    const ok = await getTicketReminderEmail(to, "ticketReminder", payload);
    if (!ok)
      return res
        .status(502)
        .json({ success: false, message: "Failed to send ticket reminder" });

    return res.json({
      success: true,
      message: "Ticket reminder sent",
      sentTo: to,
      event: { eventName, date, time, timeZone, venue, seat, ticketNo },
    });
  } catch (e) {
    console.error("sendTicketReminderNoModel:", e);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
