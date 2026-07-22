import UserDocument from "../models/userDocuments.js";
import mongoose from "mongoose";
import fs from "fs";
import User from "../models/user.js";
import {
  sendKycSubmittedEmail,
  sendKycApprovedEmail,
  sendKycRejectedEmail,
} from "../utils/emailFormats.js";
import { FRONTEND_PUBLIC_URL } from "../config/socialAuthConfig.js";

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

// Structured KYC wizard fields arrive as named file fields (not the generic
// "images"/"files" used by the message-thread reply flow below).
const KYC_NAMED_FIELDS = ["govIdFront", "govIdBack", "selfie", "proofOfAddress"];
const byField = (raw, fieldname) => raw.find((f) => f.fieldname === fieldname);

//upload documents
export const uploadUserDocuments = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId)
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const {
      docId,
      docType,
      text = "",
      govIdType,
      dateOfBirth,
      taxId,
      address,
    } = req.body;

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    const rawFiles = getRawFiles(req);
    const genericRawFiles = rawFiles.filter(
      (f) => !KYC_NAMED_FIELDS.includes(f.fieldname)
    );
    const { images, others } = splitAttachments(genericRawFiles);
    const role = user?.isAdmin ? "admin" : "user";

    // Named KYC wizard fields (only meaningful on the initial submission,
    // not the docId message-append path below).
    const govIdFront = byField(rawFiles, "govIdFront");
    const govIdBack = byField(rawFiles, "govIdBack");
    const selfieFile = byField(rawFiles, "selfie");
    const proofFile = byField(rawFiles, "proofOfAddress");
    const govIdImages = [govIdFront, govIdBack].filter(Boolean).map(mapAttachment);
    let parsedAddress = null;
    if (address) {
      try {
        parsedAddress = JSON.parse(address);
      } catch {
        parsedAddress = null;
      }
    }

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
    const uploads = genericRawFiles
      .map(mapAttachment)
      .map((u) => ({ ...u, verification: { status: "PENDING" } }));
    const doc = await UserDocument.create({
      userId,
      docType: docType || "other",
      govIdType: govIdType || null,
      govIdImages,
      selfieImage: selfieFile ? mapAttachment(selfieFile) : null,
      proofOfAddress: proofFile ? mapAttachment(proofFile) : null,
      taxId: taxId || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      address: parsedAddress,
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

    // Best-effort — a failed notification email should never block the
    // submission itself from succeeding.
    sendKycSubmittedEmail(user.email, { userName: user.name }).catch((err) =>
      console.error("sendKycSubmittedEmail failed:", err?.message || err)
    );

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
      // Mirrors the real outcome, not unconditionally true — a rejected
      // submission must not read back as verified (same fix as the
      // User.KYC_Verified update just below).
      isKYCVerified: isApprove,
      rejectionReason: isReject ? rejectionReason : "",
    };

    Object.assign(document, updateData);
    await document.save();

    const kycUser = await User.findByIdAndUpdate(document.userId, {
      is_verified: isApprove,
      KYC_Verified: isApprove,
    });

    // Best-effort — a failed notification email should never block the
    // approve/reject action itself from succeeding.
    if (kycUser) {
      const emailPromise = isApprove
        ? sendKycApprovedEmail(kycUser.email, {
            userName: kycUser.name,
            profileLink: `${FRONTEND_PUBLIC_URL}/`,
          })
        : sendKycRejectedEmail(kycUser.email, {
            userName: kycUser.name,
            rejectionReason,
            resubmitLink: `${FRONTEND_PUBLIC_URL}/verify-id`,
          });
      emailPromise.catch((err) =>
        console.error("KYC status email failed:", err?.message || err)
      );
    }

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
      documents: userDoc,
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
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);

    const [documents, total] = await Promise.all([
      UserDocument.find(filter)
        .populate("userId", "name email role") // Include user details
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      UserDocument.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: documents,
      pagination: { page: pageNum, limit: limitNum, total },
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
    const { documentId } = req.params; // ID of the UserDocument thread

    const userDocument = await UserDocument.findOne({
      _id: documentId,
      userId,
    });

    if (!userDocument) {
      return res.status(404).json({ message: "No user documents found." });
    }

    // Only the specific rejected upload(s) are removed, so the talent can
    // re-submit just the bad document without losing an approved one.
    const beforeCount = userDocument.uploads.length;
    userDocument.uploads = userDocument.uploads.filter(
      (u) => u.verification?.status !== "REJECTED"
    );

    if (userDocument.uploads.length === beforeCount) {
      return res
        .status(400)
        .json({ message: "No rejected documents found to delete." });
    }

    await userDocument.save();

    return res.status(200).json({
      message: "Rejected document(s) deleted successfully.",
      updatedDocuments: userDocument.uploads,
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
