import FanInverseRequestModel from "../models/fanInverseRequestModel.js";
import Notification from "../models/notificationModel.js";
import TalentConfirmation from "../models/talentConfirmationModel.js";
import User from "../models/user.js";
import { sendMail } from "../utils/emailFormats.js";

export const confirmRequest = async (req, res) => {
  try {
    const {
      requestId,
      confirmedDate,
      time,
      location,
      fanName,
      status,
      declineReason,
      accessType,
    } = req.body;
    const talentId = req.user._id;

    // Basic checks
    const talentUser = await User.findById(talentId);
    if (!talentUser) {
      return res
        .status(400)
        .json({ success: false, error: "Talent User not found" });
    }
    if (talentUser.role !== "TALENT") {
      return res
        .status(400)
        .json({ success: false, error: "Talent not exists" });
    }

    // Require common fields
    if (!requestId || !fanName || !status) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: requestId, fanName, status",
      });
    }

    // Normalize status
    const raw = String(status).toLowerCase().trim();
    const normalizedStatus =
      raw === "accepted" ? "accepted" : raw === "declined" ? "declined" : null;

    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        error: "Invalid status. Use 'accepted' or 'declined'.",
      });
    }

    // If accepting, we need the date/time/location
    if (normalizedStatus === "accepted") {
      if (!confirmedDate || !time || !location) {
        return res.status(400).json({
          success: false,
          message:
            "For accepted status, confirmedDate, time, and location are required",
        });
      }
    }

    // Find fan by provided name (soft validation)
    const fanUserByName = await User.findOne({ name: fanName });
    if (!fanUserByName || fanUserByName.role !== "FAN") {
      return res.status(400).json({
        success: false,
        error: "Fan with the provided name does not exist or is not a FAN",
      });
    }

    // Validate the request exists and belongs to this talent
    const fanRequest = await FanInverseRequestModel.findById(requestId);
    if (!fanRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Fan request not found" });
    }
    if (!fanRequest.talentId.equals(talentId)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to confirm this request",
      });
    }

    // Get the actual fan from the request (hard validation)
    const fanUserData = await User.findById(fanRequest.fanId);
    if (!fanUserData || fanUserData.role !== "FAN") {
      return res.status(400).json({
        success: false,
        error: "Fan in the request is invalid or not a FAN",
      });
    }

    // Ensure provided fanName matches the request's fan
    if (
      fanUserData.name.trim().toLowerCase() !== fanName.trim().toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        error: "Provided fan name does not match the fan in the request",
      });
    }

    // Build decision payload (we'll create a record for either outcome)
    const decisionPayload = {
      talentId,
      fanId: fanUserData._id,
      requestId: fanRequest._id,
      fanName: fanUserByName.name,
      accessType: accessType,
      status: normalizedStatus, // 'accepted' | 'declined'
      confirmedDate:
        normalizedStatus === "accepted" ? confirmedDate : undefined,
      time: normalizedStatus === "accepted" ? time : undefined,
      location: normalizedStatus === "accepted" ? location : undefined,
      declineReason:
        normalizedStatus === "decline" ? declineReason || null : undefined,
    };

    const confirmation = await TalentConfirmation.create(decisionPayload);

    // Update request status
    fanRequest.status = normalizedStatus; // 'accepted' or 'declined'
    await fanRequest.save();

    // Notifications + Emails
    if (normalizedStatus === "accepted") {
      // Fan notification
      await Notification.create([
        {
          userId: fanUserData._id,
          description: `Your Request was confirmed by ${talentUser.name} for ${confirmedDate} at ${time}.`,
          category: "session",
          referenceModel: "TalentConfirmation",
          referenceId: confirmation._id,
        },
        {
          userId: talentId,
          description: `You confirmed a Request with ${fanUserData.name} for ${confirmedDate} at ${time}.`,
          category: "session",
          referenceModel: "TalentConfirmation",
          referenceId: confirmation._id,
        },
      ]);

      // Fan email
      await sendMail({
        to: fanUserData.email,
        subject: "Session Confirmed",
        html: `
          <p>Hi ${fanUserData.name},</p>
          <p>Your request with ${talentUser.name} has been <strong>confirmed</strong>.</p>
          <p><strong>Date:</strong> ${confirmedDate}<br><strong>Time:</strong> ${time}<br><strong>Location:</strong> ${location}</p>
        `,
      });
    } else {
      // Declined scenario
      const declineMsg = declineReason ? ` Reason: ${declineReason}` : "";

      // Notifications
      await Notification.create([
        {
          userId: fanUserData._id,
          description: `Your request was declined by ${talentUser.name}.${
            declineMsg ? declineMsg : ""
          }`,
          category: "session",
          referenceModel: "TalentConfirmation",
          referenceId: confirmation._id,
        },
        // {
        //   userId: talentId,
        //   description: `You declined the session request from ${fanUserData.name}.`,
        //   category: "session",
        //   referenceModel: "TalentConfirmation",
        //   referenceId: confirmation._id,
        // },
      ]);

      // Email
      await sendMail({
        to: fanUserData.email,
        subject: "Session Declined",
        html: `
          <p>Hi ${fanUserData.name},</p>
          <p>Your request with ${
            talentUser.name
          } has been <strong>declined</strong>.</p>
          ${
            declineReason
              ? `<p><strong>Reason:</strong> ${declineReason}</p>`
              : ""
          }
          <p>You may request a different time or choose another talent.</p>
        `,
      });
    }

    return res.status(201).json({ success: true, data: confirmation });
  } catch (error) {
    console.error("Error confirming request:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// GET ALL
export const getConfirmations = async (req, res) => {
  try {
    const userId = req.user._id;
    const confirmations = await TalentConfirmation.find({
      $or: [
        { talentId: userId }, // If the logged-in user is the talent
        { requesterId: userId }, // If you have a requester field
      ],
    })
      .populate("requestId")
      .populate("talentId");
    res.json({ success: true, data: confirmations });
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET BY ID
export const getConfirmationById = async (req, res) => {
  try {
    const confirmation = await TalentConfirmation.findById(req.params.id)
      .populate("requestId")
      .populate("talentId");
    if (!confirmation) {
      return res
        .status(404)
        .json({ success: false, message: "Talent confirmation not found" });
    }
    res.json({ success: true, data: confirmation });
  } catch (error) {
    console.error("Fetch by ID Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// UPDATE
export const updateConfirmation = async (req, res) => {
  try {
    const updated = await TalentConfirmation.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );
    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Talent confirmation not found" });
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// DELETE
export const deleteConfirmation = async (req, res) => {
  try {
    const deleted = await TalentConfirmation.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Talent confirmation not found" });
    }
    res.json({
      success: true,
      message: "Talent confirmation deleted successfully",
    });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const rescheduleTalentConfirmation = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const { confirmedDate, time, location, accessType } = req.body;

    const talentId = req?.user?._id;

    if (!talentId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing talent user details" });
    }

    const talentUser = await User.findById(talentId);
    if (!talentUser || talentUser.role !== "TALENT") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only talents can perform this action.",
      });
    }

    if (!confirmedDate || !time || !location) {
      return res.status(400).json({
        success: false,
        message: "Missing date, time, or location for reschedule.",
      });
    }

    const newDateTime = new Date(`${confirmedDate}T${time}`);
    const now = new Date();
    if (newDateTime < now) {
      return res.status(400).json({
        success: false,
        message: "New date and time must be today or in the future.",
      });
    }

    // --- Load the fan request and ownership check
    const fanRequest = await FanInverseRequestModel.findById(requestId);
    if (!fanRequest) {
      return res
        .status(404)
        .json({ success: false, message: "Fan request not found" });
    }
    // console.log("fanRequest", fanRequest);

    const fan = await User.findOne(fanRequest.fanId);

    // console.log(fanRequest.talentId, talentId);
    // Ensure this request is for the logged-in talent
    if (fanRequest.talentId?.toString() !== talentId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to modify this request.",
      });
    }

    // --- Load fan user
    const fanUser = await User.findById(fanRequest.fanId).select("name email");
    if (!fanUser) {
      return res.status(404).json({ success: false, message: "Fan not found" });
    }

    let confirmation = await TalentConfirmation.findOne({
      requestId: fanRequest._id,
    });

    if (!confirmation) {
      confirmation = await TalentConfirmation.create({
        requestId: fanRequest._id,
        fanId: fanRequest.fanId,
        talentId,
        accessType,
        confirmedDate,
        time,
        location,
        status: "rescheduled",
        confirmedAt: newDateTime,
        fanName: fan.name,
      });
      fanRequest.status = "rescheduled";
      fanRequest.rescheduledStatus = "rescheduled-by-talent";
      fanRequest.rescheduled = true;
      fanRequest.telentConfirmationId = confirmation._id;
      await fanRequest.save();
    } else {
      confirmation.confirmedDate = confirmedDate;
      confirmation.time = time;

      confirmation.location = location;
      confirmation.status = "rescheduled";
      confirmation.confirmedAt = newDateTime;
      await confirmation.save();

      fanRequest.status = "rescheduled";
      fanRequest.rescheduledStatus = "rescheduled-by-talent";
      fanRequest.rescheduled = true;
      fanRequest.telentConfirmationId = confirmation._id;
      await fanRequest.save();
    }

    // Store notification for fan
    await Notification.create({
      userId: fanUser._id,
      description: `${talentUser.name} has rescheduled your request to ${confirmedDate} on ${time}.`,
      category: "session",
      referenceModel: "TalentConfirmation",
      referenceId: confirmation._id,
    });

    // Store notification for talent
    await Notification.create({
      userId: talentUser._id,
      description: `You rescheduled the request with ${fanUser.name} for ${confirmedDate} at ${time}.`,
      category: "session",
      referenceModel: "TalentConfirmation",
      referenceId: confirmation._id,
    });

    // Send email to fan
    const subject = "Talent Rescheduled Your Session";
    const message = `
      <p>Hi ${fanUser.name},</p>
      <p>Your request has been <strong>rescheduled</strong> by ${talentUser.name}.</p>
      <p><strong>Date:</strong> ${confirmedDate}<br>
      <strong>Time:</strong> ${time}<br>
      <strong>Location:</strong> ${location}</p>
      <p>Thanks,<br/>Fame Exchange Team</p>
    `;

    await sendMail({ to: fanUser.email, subject, html: message });

    res.json({
      success: true,
      message: "Session rescheduled successfully",
      data: confirmation,
    });
  } catch (error) {
    console.error("Talent Reschedule Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
