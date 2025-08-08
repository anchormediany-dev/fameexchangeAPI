import FanInverseRequest from "../models/fanInverseRequestModel.js";
import Notification from "../models/notificationModel.js";
import User from "../models/user.js";
import { sendMail } from "../utils/mailer.js";

export const createFanRequest = async (req, res) => {
  try {
    const { talentName, date, time, location, paymentMethod } = req.body;
    const fanId = req.user._id;

    const checkUser = await User.findOne({ _id: fanId });
    if (!checkUser) {
      return res.status(400).json({
        success: false,
        message: "Fan not found",
      });
    }

    if (checkUser.role !== "FAN") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only fans can perform this action.",
      });
    }
    if (!fanId) {
      return res.status(400).json({
        success: false,
        message: "Missing Fan Details",
      });
    }

    if (!talentName || !date || !time || !location || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: talentName,location, date, time, paymentMethod",
      });
    }

    const talentUser = await User.findOne({ name: talentName });
    if (talentUser?.name !== talentName) {
      return res
        .status(400)
        .json({ success: false, error: "Talent not Found" });
    }

    if (talentUser !== talentName && talentUser?.role !== "TALENT") {
      return res
        .status(400)
        .json({ success: false, error: "Talent not exists" });
    }

    const submittedDateTime = new Date(`${date}T${time}`);
    const currentDateTime = new Date();

    if (submittedDateTime < currentDateTime) {
      return res.status(400).json({
        success: false,
        message: "Date and time must be today or a future time",
      });
    }

    const data = {
      ...req.body,
      fanId,
      talentId: talentUser && talentUser?._id,
    };

    const newRequest = await FanInverseRequest.create(data);

    // Store notification for fan
    await Notification.create({
      userId: checkUser._id,
      description: `You have sent a new session request from ${talentName} for ${date} at ${time}.`,
      category: "session",
      referenceModel: "FanInverseRequest",
      referenceId: newRequest._id,
    });
    // Store notification for talent
    await Notification.create({
      userId: talentUser._id,
      description: `You have sent a new session request from ${checkUser.name} for ${date} at ${time}.`,
      category: "session",
      referenceModel: "FanInverseRequest",
      referenceId: newRequest._id,
    });

    // Compose message based on status
    let subject = "Your Talent Session ";
    let message = "";

    message = `
        <p>Hi ${checkUser.name},</p>
        <p>Your session has been <strong>sent</strong> to the talent.</p>
        <p><strong>Date:</strong> ${date}<br>
        <strong>Time:</strong> ${time}<br>
        <strong>Location:</strong> ${location}</p>
        <p>Thanks,<br/>Fame Exchange Team</p>
      `;

    // Send email to fan
    await sendMail(checkUser.email, subject, message);
    res.status(201).json({ success: true, data: newRequest });
  } catch (error) {
    console.error("Error confirming request:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// GET ALL
export const getAllRequests = async (req, res) => {
  try {
    const fanId = req.user?._id;

    if (!fanId) {
      return res.status(400).json({
        success: false,
        message: "Missing fan ID from token",
      });
    }

    const requests = await FanInverseRequest.find({ fanId })
      .populate("fanId")
      .populate("talentId");
    if (!requests) {
      return res
        .status(404)
        .json({ success: false, message: "Fan data not found" });
    }
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
export const getOverAllRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const requests = await FanInverseRequest.find({
      $or: [{ talentId: userId }],
    })
      .populate("fanId")
      .populate("talentId");
    if (!requests) {
      return res
        .status(404)
        .json({ success: false, message: "Fan data not found" });
    }
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET BY ID
export const getRequestById = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res
      .status(404)
      .json({ success: false, message: "Fan request Id not found" });
  }
  try {
    const request = await FanInverseRequest.findById(req.params.id)
      .populate("fanId")
      .populate("talentId");
    if (!request) {
      return res
        .status(404)
        .json({ success: false, message: "Fan request not found" });
    }
    res.json({ success: true, data: request });
  } catch (error) {
    console.error("Fetch by ID Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// UPDATE
export const updateFanRequest = async (req, res) => {
  try {
    const submittedDateTime = new Date(`${req.body.date}T${req.body.time}`);
    const currentDateTime = new Date();

    if (submittedDateTime < currentDateTime) {
      return res.status(400).json({
        success: false,
        message: "Date and time must be today or a future time",
      });
    }

    const updated = await FanInverseRequest.findByIdAndUpdate(
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
        .json({ success: false, message: "Fan request not found" });
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// DELETE
export const deleteFanRequest = async (req, res) => {
  try {
    const deleted = await FanInverseRequest.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Fan request not found" });
    }
    res.json({ success: true, message: "Fan request deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//Reschedule Date
export const rescheduleFanRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, location } = req.body;

    const fanId = req?.user?._id;

    if (!fanId) {
      return res.status(400).json({
        success: false,
        message: "Missing Fan Details",
      });
    }

    const checkUser = await User.findOne({ _id: fanId });
    if (!checkUser) {
      return res.status(400).json({
        success: false,
        message: "Fan not found",
      });
    }

    if (checkUser?.role !== "FAN") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only fans can perform this action.",
      });
    }

    if (!date || !time) {
      return res.status(400).json({
        success: false,
        message: "New date and time are required for rescheduling",
      });
    }

    const newDateTime = new Date(`${date}T${time}`);
    const now = new Date();

    if (newDateTime < now) {
      return res.status(400).json({
        success: false,
        message: "New date and time must be today or in the future",
      });
    }

    const request = await FanInverseRequest.findById(id);

    const talentUser = await User.findOne({ _id: request?.talentId });
    // console.log("talentUser", talentUser);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (request?.status === "accepted") {
      return res.status(404).json({
        success: false,
        message: "Cannot rescheduled the already accepted request",
      });
    }
    request.date = date;
    request.time = time;
    if (location) request.location = location;
    request.rescheduledStatus = "rescheduled";

    // Store notification for fan
    await Notification.create({
      userId: checkUser._id,
      description: `Fan ${
        checkUser.name || "A fan"
      } rescheduled the session to ${
        request.talentName
      } for ${date} at ${time}.`,
      category: "session",
      referenceModel: "FanInverseRequest",
      referenceId: request._id,
    });
    // Store notification for talent
    await Notification.create({
      userId: talentUser._id,
      description: `Fan ${
        checkUser.name || "A fan"
      } rescheduled the session to ${checkUser.name} for ${date} at ${time}.`,
      category: "session",
      referenceModel: "FanInverseRequest",
      referenceId: request._id,
    });

    // Compose message based on status
    let subject = "Rescheduled Talent Session ";
    let message = "";

    message = `
        <p>Hi ${checkUser.name},</p>
        <p>You have <strong>Rescheduled </strong> the session.</p>
        <p><strong>Date:</strong> ${date}<br>
        <strong>Time:</strong> ${time}<br>
        <strong>Location:</strong> ${location}</p>
        <p>Thanks,<br/>Fame Exchange Team</p>
      `;

    // Send email to fan
    await sendMail(checkUser.email, subject, message);

    await request.save();

    res.json({
      success: true,
      message: "Request rescheduled successfully",
      data: request,
    });
  } catch (error) {
    console.error("Reschedule Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
