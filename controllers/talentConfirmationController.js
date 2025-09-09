import FanInverseRequestModel from "../models/fanInverseRequestModel.js";
import Notification from "../models/notificationModel.js";
import TalentConfirmation from "../models/talentConfirmationModel.js";
import User from "../models/user.js";
import { sendMail } from "../utils/mailer.js";

export const confirmRequest = async (req, res) => {
  try {
    const { requestId, confirmedDate, time, location, fanName, status } =
      req.body;

    const talentId = req.user._id;

    const talentUser = await User.findById({ _id: talentId });

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

    if (
      !requestId ||
      !confirmedDate ||
      !time ||
      !location ||
      !fanName ||
      !status
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: fanRequestId, confirmedDate, time, location, fanName, status",
      });
    }

    // Find fan user
    const fanUser = await User.findOne({ name: fanName });
    console.log(fanUser);
    if (!fanUser || fanUser.role !== "FAN") {
      return res.status(400).json({
        success: false,
        error: "Fan with the provided name does not exist or is not a FAN",
      });
    }

    // Validate that the request exists
    const fanRequest = await FanInverseRequestModel.findById(requestId);
    if (!fanRequest) {
      return res.status(404).json({
        success: false,
        message: "Fan request not found",
      });
    }

    // console.log("fanRequest", fanRequest);

    // 🔐 Ensure the confirming talent owns this request
    if (!fanRequest.talentId.equals(talentId)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to confirm this request",
      });
    }

    // Get the actual fan from the request
    const fanUserData = await User.findById(fanRequest.fanId);
    if (!fanUser || fanUser.role !== "FAN") {
      return res.status(400).json({
        success: false,
        error: "Fan in the request is invalid or not a FAN",
      });
    }

    console.log(fanUserData.name, fanName);
    // ✅ Compare provided fanName with the actual fan's name in the request
    if (
      fanUserData.name.trim().toLowerCase() !== fanName.trim().toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        error: "Provided fan name does not match the fan in the request",
      });
    }
    // console.log("fanRequest", fanRequest);
    // console.log("fanUser", fanUser);
    // const fanUser = await User.findById(fanRequest.fanId);
    const data = {
      talentId: talentId,
      ...req.body,
    };
    const confirmation = await TalentConfirmation.create(data);
    fanRequest.status = "accepted";
    await fanRequest.save();
    // console.log("fanUser", fanUser._id);
    // console.log("talentId", talentId);
    await Notification.create([
      {
        userId: fanUser._id,
        description: `Your session was confirmed by ${talentUser.name} for ${confirmedDate} at ${time}.`,
        category: "session",
        referenceModel: "TalentConfirmation",
        referenceId: confirmation._id,
      },
      {
        userId: talentId,
        description: `You confirmed a session with ${fanUser.name}.`,
        category: "session",
        referenceModel: "TalentConfirmation",
        referenceId: confirmation._id,
      },
    ]);

    await sendMail(
      fanUser.email,
      "Session Confirmed",
      `
        <p>Hi ${fanUser.name},</p>
        <p>Your session with ${talentUser.name} has been <strong>confirmed</strong>.</p>
        <p><strong>Date:</strong> ${confirmedDate}<br><strong>Time:</strong> ${time}<br><strong>Location:</strong> ${location}</p>
      `
    );

    res.status(201).json({ success: true, data: confirmation });
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
    const { confirmedDate, time, location } = req.body;

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
    console.log("fan test", fan);
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
        confirmedDate,
        time,
        location,
        status: "rescheduled",
        confirmedAt: newDateTime,
        fanName: fan.name,
      });
    } else {
      confirmation.confirmedDate = confirmedDate;
      confirmation.time = time;
      fanName: fan.name;
      confirmation.location = location;
      confirmation.status = "rescheduled";
      confirmation.confirmedAt = newDateTime;
      await confirmation.save();
    }

    fanRequest.status = "accepted";
    fanRequest.rescheduledStatus = "rescheduled-by-talent";
    await fanRequest.save();

    // Store notification for fan
    await Notification.create({
      userId: fanUser._id,
      description: `Talent <strong>${talentUser.name}</strong> rescheduled your session to ${confirmedDate} at ${time}.`,
      category: "session",
      referenceModel: "TalentConfirmation",
      referenceId: confirmation._id,
    });

    // Store notification for talent
    await Notification.create({
      userId: talentUser._id,
      description: `You rescheduled the session with <strong>${fanUser.name}</strong> to ${confirmedDate} at ${time}.`,
      category: "session",
      referenceModel: "TalentConfirmation",
      referenceId: confirmation._id,
    });

    // Send email to fan
    const subject = "Talent Rescheduled Your Session";
    const message = `
      <p>Hi ${fanUser.name},</p>
      <p>Your session has been <strong>rescheduled</strong> by ${talentUser.name}.</p>
      <p><strong>Date:</strong> ${confirmedDate}<br>
      <strong>Time:</strong> ${time}<br>
      <strong>Location:</strong> ${location}</p>
      <p>Thanks,<br/>Fame Exchange Team</p>
    `;

    await sendMail(fanUser.email, subject, message);

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
