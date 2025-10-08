import UserDocument from "../models/userDocuments.js";
import mongoose from "mongoose";
import fs from "fs";
import User from "../models/user.js";

// Utilities
const getRawFiles = (req) => {
  // Supports multer single/array/fields
  const arr = Array.isArray(req.files)
    ? req.files
    : req.files
    ? Object.values(req.files).flat()
    : [];
  return Array.isArray(arr) ? arr : [];
};

const mapAttachment = (f) => ({
  fileUrl: f.path || f.location || f.url, // local or S3
  fileType: (f.mimetype || "").split("/")[1] || "",
  fileName: f.originalname || "",
  mime: f.mimetype || "",
  size: typeof f.size === "number" ? f.size : null,
});

const splitAttachments = (raw) => {
  const images = [];
  const others = [];
  for (const f of raw) {
    if ((f.mimetype || "").startsWith("image/")) images.push(mapAttachment(f));
    else others.push(mapAttachment(f));
  }
  return { images, others };
};

//upload documents
export const uploadUserDocuments = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId)
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const { docId, docType, text = "" } = req.body;

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    const rawFiles = getRawFiles(req);
    const { images, others } = splitAttachments(rawFiles);
    const role = user?.isAdmin ? "admin" : "user";

    // Helper: mark pending everywhere
    const markPending = async (doc) => {
      doc.status = "PENDING";
      // Use the SAME canonical key on the document, too (optional, if you track it here)
      doc.isKYCVerified = false;
      // Also mark user as not verified (canonical key)
      // doc.userId.KYC_Verified = false;

      // 2) User-level flag — works whether userId is populated or just an ObjectId
      const uid = doc.userId && doc.userId._id ? doc.userId._id : doc.userId;

      // CHANGE THIS to your real user flag name
      const userUpdate = User.updateOne(
        { _id: uid },
        { $set: { KYC_Verified: false } }
      );
      await Promise.all([doc.save(), userUpdate]);
    };
    // Append message to existing document thread
    if (docId) {
      const doc = await UserDocument.findById(docId).populate("userId");

      if (!doc)
        return res
          .status(404)
          .json({ success: false, error: "UserDocument not found" });

      // add message
      doc.messages.push({
        sender: user._id,
        role,
        text,
        images,
        files: others,
        sentAt: new Date(),
      });
      // keep uploads log as well (optional: only when files exist)
      if (rawFiles.length) {
        doc.uploads.push(
          ...rawFiles
            .map(mapAttachment)
            .map((u) => ({ ...u, verification: { status: "PENDING" } }))
        );
      }
      // mark everything pending + set user.isKYCVerified=false (canonical)
      await markPending(doc);
      return res
        .status(200)
        .json({ success: true, mode: "message_appended", data: doc });
    }

    // Create new document thread
    const uploads = rawFiles
      .map(mapAttachment)
      .map((u) => ({ ...u, verification: { status: "PENDING" } }));
    const doc = await UserDocument.create({
      userId,
      docType: docType || "other",
      uploads,
      messages:
        text || rawFiles.length
          ? [
              {
                sender: user._id,
                role,
                text,
                images,
                files: others,
                sentAt: new Date(),
              },
            ]
          : [],
      status: "PENDING",
    });
    // set initial meta/unreads, then save once
    doc.touchMessageMeta(role);
    await doc.save();

    return res.status(201).json({ success: true, mode: "created", data: doc });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyOrRejectUserDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const adminId = req.user._id;

    const { action, rejectionReason = "" } = req.body;

    const document = await UserDocument.findById(documentId);
    console.log("document status check", document);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const isApprove = action === "VERIFIED";
    const isReject = action === "REJECTED";

    if (document.status === "VERIFIED") {
      return res.status(200).json({ message: "Already VERIFIED " });
    }
    if (!isApprove && !isReject) {
      return res
        .status(400)
        .json({ message: "Invalid action. Use VERIFIED or REJECT." });
    }

    if (isReject && !rejectionReason.trim()) {
      return res.status(400).json({ message: "Rejection reason is required." });
    }

    const updateData = {
      status: isApprove ? "VERIFIED" : "REJECTED",

      verifiedBy: adminId,
      verifiedAt: new Date(),
      isKYCVerified: true,
      rejectionReason: isReject ? rejectionReason : "",
    };

    Object.assign(document, updateData);
    await document.save();

    await User.findByIdAndUpdate(document.userId, {
      is_verified: isApprove,
      KYC_Verified: true,
    });
    return res.status(200).json({
      message: `Document ${isApprove ? "verified" : "rejected"} successfully.`,
      document,
    });
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserDocumentsByUserId = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const userDoc = await UserDocument.findOne({ userId });

    if (!userDoc) {
      return res
        .status(404)
        .json({ success: false, message: "No documents found for this user" });
    }

    return res.status(200).json({
      success: true,
      documents: userDoc.documents,
    });
  } catch (error) {
    console.error("Get user documents error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
export const getKycId = async (req, res) => {
  try {
    const kycId = req.params.id;

    if (!kycId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const userDoc = await UserDocument.findOne({ _id: kycId });

    if (!userDoc) {
      return res
        .status(404)
        .json({ success: false, message: "No documents found for this user" });
    }

    return res.status(200).json({
      success: true,
      documents: userDoc,
    });
  } catch (error) {
    console.error("Get user documents error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

export const getAllUserDocuments = async (req, res) => {
  try {
    const documents = await UserDocument.find()
      .populate("userId", "name email userRole") // Include user details
      .lean();

    if (!documents || documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No documents found",
      });
    }

    return res.status(200).json({
      success: true,
      data: documents,
    });
  } catch (error) {
    console.error("Get all user documents error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
//delete the specific document
export const deleteRejectedUserDocument = async (req, res) => {
  try {
    const userId = req.user._id; // from auth middleware
    const { documentId } = req.params; // ID of the document inside the array

    const userDocument = await UserDocument.findOne({ userId });

    if (
      !userDocument ||
      !userDocument.documents ||
      userDocument.documents.length === 0
    ) {
      return res.status(404).json({ message: "No user documents found." });
    }

    // Find the document
    const docIndex = userDocument.documents.findIndex(
      (doc) => doc._id.toString() === documentId
    );

    if (docIndex === -1) {
      return res
        .status(404)
        .json({ message: "Document not found in your documents." });
    }

    const targetDoc = userDocument.documents[docIndex];

    // Check if status is REJECTED
    if (targetDoc.status !== "REJECTED") {
      return res
        .status(400)
        .json({ message: "Only rejected documents can be deleted." });
    }

    // Remove the document
    userDocument.documents.splice(docIndex, 1);
    await userDocument.save();

    return res.status(200).json({
      message: "Rejected document deleted successfully.",
      updatedDocuments: userDocument.documents,
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
