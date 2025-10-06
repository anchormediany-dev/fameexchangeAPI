import User from "../models/user.js";
import mongoose from "mongoose";
import UserDocument from "../models/userDocuments.js";
import eventModel from "../models/eventModel.js";
import fs from "fs";
import path from "path";
import TalentConfirmation from "../models/talentConfirmationModel.js";
import Session from "../models/sessionModel.js";
import Friend from "../models/friendModel.js";
import Networth from "../models/networth.js";
import fanInverseRequestModel from "../models/fanInverseRequestModel.js";
import TeamMember from "../models/teamMember.js";
import sessionModel from "../models/sessionModel.js";
import sponsorshipModel from "../models/sponsorshipModel.js";
import Notification from "../models/notificationModel.js";
const userProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) {
      return res.status(400).json({ message: "user not found" });
    }
    delete user.password;
    res.status(200).json({ user: user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// export const updateUserProfile = async (req, res) => {
//   try {
//     const userId = req.user._id;

//     // Disallow updates to sensitive fields
//     const disallowedFields = ["password", "otp_code", "_id", "email"];
//     disallowedFields.forEach((field) => delete req.body[field]);

//     const updatedUser = await User.findByIdAndUpdate(
//       userId,
//       { $set: req.body },
//       { new: true, runValidators: true }
//     ).select("-password -otp_code "); // remove sensitive fields from response

//     if (!updatedUser) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     res.status(200).json({ success: true, user: updatedUser });
//   } catch (error) {
//     console.error("Update profile error:", error);
//     res
//       .status(500)
//       .json({ message: "Internal server error", error: error.message });
//   }
// };

export const updateUserProfile = async (req, res) => {
  try {
    // 1. Ensure request is multipart/form-data
    const contentType = req.headers["content-type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return res.status(400).json({
        success: false,
        message: "Request must be of type multipart/form-data",
      });
    }

    const userId = req.user._id;

    // 2. Disallow certain fields from being updated
    const disallowedFields = ["password", "otp_code", "_id", "email"];
    disallowedFields.forEach((field) => delete req.body[field]);

    // 3. Parse JSON fields that may come as strings from form-data
    const fieldsToParse = ["talent", "selected_reps", "representation"];
    fieldsToParse.forEach((field) => {
      if (req.body[field] && typeof req.body[field] === "string") {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (err) {
          return res.status(400).json({
            success: false,
            message: `Invalid JSON format in field: ${field}`,
          });
        }
      }
    });

    // Fetch existing user
    const existingUser = await User.findById(userId);
    // Handle multiple images via file.path
    let updatedImages = existingUser.images || [];

    if (req.files && req.files.length > 0) {
      const uploadedPaths = req.files.map((file) => ({
        // id: new Types.ObjectId(),
        fileUrl: file.path.replace(/\\/g, "/"), // Ensure forward slashes
      })); // uses full path
      updatedImages = [...updatedImages, ...uploadedPaths];
    }

    // 4. Construct update object
    const updateData = { ...req.body, images: updatedImages };

    // // 5. Attach uploaded image if present
    // if (req.file) {
    //   updateData.image = `/uploads/users/${req.file.filename}`;
    // }

    // 6. Perform update
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password -OTP_code");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

//get all users
export const getUserProfile = async (req, res) => {
  try {
    // const { userId } = req.params;

    const userObjectId = new mongoose.Types.ObjectId(req?.user?._id);

    const user = await User.aggregate([
      { $match: { _id: userObjectId } },
      {
        $project: {
          password: 0, // exclude password field
          __v: 0, // exclude version key
        },
      },
    ]);

    if (!user || user.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, user: user[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// get all users

export const getAllUsers = async (req, res) => {
  try {
    // if (req.user.role !== "ADMIN") {
    //   return res.status(403).json({ message: "Access denied" });
    // }

    const users = await User.aggregate([
      {
        $project: {
          user_id: "$_id",
          name: 1,
          full_name: 1,
          email: 1,
          usertype: 1,
          is_active: 1,
          role: 1,
          image: 1,

          created_at: "$createdAt",
        },
      },
      { $sort: { created_at: -1 } },
    ]);

    res.status(200).json({ users });
  } catch (err) {
    console.error("Get all users error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
export const getAllTalentUsers = async (req, res) => {
  try {
    // if (req.user.role !== "ADMIN") {
    //   return res.status(403).json({ message: "Access denied" });
    // }

    const taleUsers = await User.find({ role: "TALENT" });
    console.log(taleUsers);
    res.status(200).json({ taleUsers });
  } catch (err) {
    console.error("Get all users error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

//Fetch own profile or any profile (admin only)

// export const getUserProfile = async (req, res) => {
//   try {
//     const targetUserId = req.params.id;
//     const loggedInUser = req.user;

//     if (
//       loggedInUser.usertype !== "admin" &&
//       loggedInUser._id.toString() !== targetUserId
//     ) {
//       return res.status(403).json({ message: "Unauthorized access" });
//     }

//     const user = await User.aggregate([
//       { $match: { _id: new mongoose.Types.ObjectId(targetUserId) } },
//       {
//         $project: {
//           user_id: "$_id",
//           full_name: 1,
//           email: 1,
//           usertype: 1,
//           is_active: 1,
//           datetime: "$createdAt",
//           is_login_google: 1,
//           is_login_facebook: 1,
//           OTP_code: 1,
//           is_rep_have: 1,
//           rep_type: 1,
//           socia_youtube: 1,
//           social_twitter: 1,
//           social_tiktok: 1,
//           social_facebook: 1,
//           social_insta: 1,
//           social_snap: 1,
//           token_brand_name: 1,
//           token_name: 1,
//           networth: 1,
//         },
//       },
//     ]);

//     if (!user.length) return res.status(404).json({ message: "User not found" });

//     res.status(200).json(user[0]);
//   } catch (err) {
//     console.error("Get user profile error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// GET /api/user/:id
export const getUserById = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById({ _id: userId }).select(
      "-password -OTP_code -__v"
    );

    const userDocument = await UserDocument.findOne({ userId });
    console.log(userDocument);
    if (!user) return res.status(404).json({ error: "User not found" });

    const events = await eventModel.find({ userId });
    res.status(200).json({ success: true, user, userDocument, events });
  } catch (err) {
    console.error("Error getting user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// PUT /api/user/:id
export const updateUserById = async (req, res) => {
  try {
    const allowedFields = [
      "name",
      "usertype",
      "is_active",
      "rep_type",
      "token_brand_name",
      "networth",
    ];
    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const result = await User.updateOne(
      { _id: req.params.id },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found or no changes made" });
    }

    res.status(200).json({ success: true, updatedFields: updateData });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// DELETE /api/user/:id (Soft Delete)
export const deleteUserById = async (req, res) => {
  try {
    const result = await User.updateOne(
      { _id: req.params.id },
      { $set: { is_active: false } }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found or already deleted" });
    }

    res.status(200).json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

//Delete users Profile images

export const deleteUserImage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { imageId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // ✅ Correct comparison
    const imageToDelete = user.images.find(
      (img) => img._id.toString() === imageId
    );
    if (!imageToDelete) {
      return res
        .status(404)
        .json({ success: false, message: "Image not found" });
    }

    // Remove from DB
    user.images = user.images.filter((img) => img._id.toString() !== imageId);
    await user.save();

    // Optional: Delete physical file
    const fullPath = path.join(process.cwd(), imageToDelete.fileUrl);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    res.status(200).json({
      success: true,
      message: "Image deleted successfully",
      images: user.images,
    });
  } catch (error) {
    console.error("Error deleting image:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getTalentOverview = async (req, res) => {
  try {
    const paramId = req.params?.id; // optional: /api/talent/:id/full
    const talentId = paramId || req?.user?._id;

    if (!talentId || !mongoose.Types.ObjectId.isValid(talentId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or missing talent id" });
    }

    // If fetching self (no :id in route), enforce TALENT role
    if (!paramId) {
      const me = await User.findById(talentId).select("role");
      if (!me || String(me.role).toUpperCase() !== "TALENT") {
        return res
          .status(403)
          .json({ success: false, message: "Access denied (not a TALENT)" });
      }
    }

    // Projections
    const privateUserProjection = {
      password: 0,
      OTP_code: 0,
      is_login_google: 0,
      is_login_facebook: 0,
      google_login_id: 0,
      facebook_login_id: 0,
      __v: 0,
    };
    const publicUserProjection = "name full_name email role images stage_name";

    // --- Base queries (profile/sessions/confirmations) ---
    const profileQ = User.findById(talentId)
      .select(privateUserProjection)
      .lean();
    const notificationQ = Notification.find({ userId: talentId })
      .select(privateUserProjection)
      .lean();

    const sessionsQ = Session.find({ createdBy: talentId })
      .sort({ sessionDate: 1, sessionTime: 1 })
      .populate({ path: "createdBy", select: publicUserProjection })
      .lean();

    const confirmationsQ = TalentConfirmation.find({ talentId })
      .sort({ createdAt: -1 })
      .populate({ path: "requestId" })
      .populate({ path: "talentId", select: publicUserProjection })
      .lean();
    const pendingReq = await fanInverseRequestModel
      .find({
        talentId,
        status: "pending",
        // ispaid: true,
      })
      .populate({ path: "fanId" })
      .sort({ createdAt: -1 })
      .lean();

    // console.log("pendingReq", pendingReq);

    // --- Friendships (per your schema: userId, friendId, status) ---
    const friendshipsQ = Friend.find({
      status: "accepted",
      $or: [{ userId: talentId }, { friendId: talentId }],
    })
      .select("userId friendId friendName status notes createdAt updatedAt")
      .lean();

    const sponsershipsQ = await sponsorshipModel
      .find({ sponsoredId: talentId })
      .populate("userId", "name email _id images token_brand_name")
      .populate("sponsoredId", "name email _id images token_brand_name");

    // Wait for profile (used for event matching by stage_name as a fallback)
    const [
      profile,
      sessions,
      confirmations,
      friendships,
      pending,
      sponserships,
      notifications,
    ] = await Promise.all([
      profileQ,
      sessionsQ,
      confirmationsQ,
      friendshipsQ,
      pendingReq,
      sponsershipsQ,
      notificationQ,
    ]);

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Talent not found" });
    }

    // --- Resolve "friends" as user docs (the "other" side of each accepted friendship) ---
    const mine = String(talentId);
    const otherIds = [];
    for (const f of friendships) {
      const a = String(f.userId);
      const b = String(f.friendId);
      const other = a === mine ? b : a;
      if (mongoose.Types.ObjectId.isValid(other)) otherIds.push(other);
    }
    const uniqueFriendIds = [...new Set(otherIds)];
    const friends = uniqueFriendIds.length
      ? await User.find({ _id: { $in: uniqueFriendIds } })
          .select(publicUserProjection)
          .lean()
      : [];

    // --- Events (per your schema) ---
    // Your Event has:
    //  - userId: ObjectId (creator)
    //  - talent: [String] (we'll match either talentId as string OR stage_name)
    //  - prefrences[].users: ObjectId with prefrence_Type ('attending' etc.)
    const talentIdStr = String(talentId);
    const possibleTalentTags = [talentIdStr];
    if (profile?.stage_name) possibleTalentTags.push(profile.stage_name);

    const events = await eventModel
      .find({
        $or: [
          // created by this talent
          { userId: talentId },
          // listed in "talent" (array of strings)
          { talent: { $in: possibleTalentTags } },
          // attending via preferences subdoc
          {
            prefrences: {
              $elemMatch: {
                users: talentId,
                prefrence_Type: "attending",
              },
            },
          },
        ],
      })
      .sort({ datetime: 1, createdAt: -1 })
      .populate({ path: "userId", select: publicUserProjection }) // creator
      .populate({ path: "addedBy", select: publicUserProjection }) // optional
      .populate({ path: "prefrences.users", select: publicUserProjection }) // attendees
      .lean();

    const networth = await Networth.find({ userId: talentId });

    // console.log("networth", networth);

    return res.json({
      success: true,
      data: {
        profile,
        sessions,
        confirmations,
        // Friends as user docs (for UI), and raw edges if you need meta (notes/status)
        friends,
        networth,
        pending,
        sponserships,
        notifications,
        // confirmations,
        // pendingReqs,
        // friendships,
        // Events where this talent is creator, tagged in `talent[]`, or attending
        events,
      },
    });
  } catch (err) {
    console.error("getTalentOverview error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getFanOverview = async (req, res) => {
  try {
    const paramId = req.params?.id; // optional: /api/fan/:id/overview
    const fanId = paramId || req?.user?._id; // self when no :id provided

    if (!fanId || !mongoose.Types.ObjectId.isValid(fanId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or missing fan id" });
    }

    // If fetching self (no :id), enforce role FAN
    if (!paramId) {
      const me = await User.findById(fanId).select("role").lean();
      if (!me || String(me.role).toUpperCase() !== "FAN") {
        return res
          .status(403)
          .json({ success: false, message: "Access denied (not a FAN)" });
      }
    }

    // --- Selects / projections
    const privateUserProjection = {
      password: 0,
      OTP_code: 0,
      is_login_google: 0,
      is_login_facebook: 0,
      google_login_id: 0,
      facebook_login_id: 0,
      __v: 0,
    };
    const publicUserProjection = "name full_name email role images stage_name";

    // (object projection for $project)
    const userProj = {
      name: 1,
      full_name: 1,
      email: 1,
      role: 1,
      images: 1,
      stage_name: 1,
    };
    // --- Sorting helpers (defaults)
    const parseSort = (sortBy, order, fallbackField, fallbackDir = -1) => {
      if (!sortBy) return { [fallbackField]: fallbackDir };
      const dir = String(order || "").toLowerCase() === "asc" ? 1 : -1;
      return { [sortBy]: dir };
    };

    // Query params (optional): ?eventsSortBy=datetime&eventsOrder=asc&reqSortBy=updatedAt&reqOrder=desc
    const {
      eventsSortBy,
      eventsOrder,
      reqSortBy,
      reqOrder,
      eventsLimit,
      eventsSkip,
      reqLimit,
      reqSkip,
    } = req.query;

    const eventsSort = eventsSortBy
      ? parseSort(eventsSortBy, eventsOrder, "datetime", 1) // if user specifies, use it
      : { datetime: 1, createdAt: -1 }; // default: upcoming first, then newest created

    const reqSortField = reqSortBy || "updatedAt";
    const reqSortDir = String(reqOrder || "").toLowerCase() === "asc" ? 1 : -1;

    const evLimit = Math.min(Number(eventsLimit) || 50, 200);
    const evSkip = Math.max(Number(eventsSkip) || 0, 0);
    const rqLimit = Math.min(Number(reqLimit) || 50, 200);
    const rqSkip = Math.max(Number(reqSkip) || 0, 0);

    // --- Profile
    const profileQ = User.findById(fanId).select(privateUserProjection).lean();

    const notificationQ = Notification.find({ userId: fanId })
      .select(privateUserProjection)
      .lean();

    // --- Requests: rescheduled first, then others (populated), paginated & sorted
    const { ObjectId } = mongoose.Types;
    const baseMatch = {
      $or: [
        { fanId: new ObjectId(fanId) },
        { requesterId: new ObjectId(fanId) }, // keep if your schema uses this
      ],
    };

    const rescheduledRequestsQ = fanInverseRequestModel
      .aggregate([
        { $match: baseMatch },
        // Priority flag: rescheduled -> 0 (top), others -> 1
        {
          $addFields: {
            _priority: {
              $cond: [{ $eq: [{ $toLower: "$status" }, "rescheduled"] }, 0, 1],
            },
          },
        },
        // Sort by priority first, then your requested sort field, then _id
        { $sort: { _priority: 1, [reqSortField]: reqSortDir, _id: -1 } },
        // Pagination
        { $skip: rqSkip },
        { $limit: rqLimit },
        // Populate fanId
        {
          $lookup: {
            from: "users",
            let: { uid: "$fanId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
              { $project: userProj },
            ],
            as: "_fan",
          },
        },
        // Populate talentId
        {
          $lookup: {
            from: "users",
            let: { uid: "$talentId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
              { $project: userProj },
            ],
            as: "_talent",
          },
        },
        // Overwrite original refs with populated docs, keep keys the same
        {
          $set: {
            fanId: { $ifNull: [{ $arrayElemAt: ["$_fan", 0] }, "$fanId"] },
            talentId: {
              $ifNull: [{ $arrayElemAt: ["$_talent", 0] }, "$talentId"],
            },
          },
        },
        { $project: { _fan: 0, _talent: 0, _priority: 0 } },
      ])
      .exec();

    // --- Events the fan marked as "interested"
    // Schema: prefrences: [{ users: ObjectId<User>, prefrence_Type: "interested"|"notinterested"|"attending", event_type }]
    const eventsQ = eventModel
      .find({
        status: "active",
        prefrences: {
          $elemMatch: {
            users: new mongoose.Types.ObjectId(fanId),
            prefrence_Type: "interested",
          },
        },
      })
      .populate({ path: "userId", select: publicUserProjection }) // creator
      .populate({ path: "addedBy", select: publicUserProjection }) // optional
      .populate({ path: "prefrences.users", select: publicUserProjection }) // attendees
      .sort(eventsSort)
      .skip(evSkip)
      .limit(evLimit)
      .lean();

    const [profile, rescheduledRequests, interestedEvents, notifications] =
      await Promise.all([
        profileQ,
        rescheduledRequestsQ,
        eventsQ,
        notificationQ,
      ]);

    const sponserships = await sponsorshipModel
      .find({ userId: fanId })
      .populate("userId", "name email _id images token_brand_name")
      .populate("sponsoredId", "name email _id images token_brand_name");

    if (!profile) {
      return res.status(404).json({ success: false, message: "Fan not found" });
    }

    return res.json({
      success: true,
      data: {
        profile,
        rescheduledRequests,
        sponserships,
        notifications,
        interestedEvents, // only "interested" events for this fan
      },
    });
  } catch (err) {
    console.error("fan  error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const adminDashboard = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const events = await eventModel.countDocuments().sort({ createdAt: -1 });
    const teammembers = await TeamMember.find().sort({ createdAt: -1 });
    const sessions = await sessionModel
      .find()
      .populate("createdBy", "name email images biography")
      .sort({ createdAt: -1 });
    return res.json({
      success: true,
      data: {
        users,
        totalEvents: events,
        teamMembers: teammembers,
        sessions,
      },
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
