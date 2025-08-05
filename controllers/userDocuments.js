import UserDocument from "../models/userDocuments.js";
import mongoose from "mongoose";
import fs from "fs";
import User from "../models/user.js";

//upload documents
export const uploadUserDocuments = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const newDocs = req.files.map((file) => ({
      fileUrl: file.path,
      fileType: file.mimetype.split("/")[1],
    }));

    // ✅ Additional Check: If newDocs is empty
    if (newDocs.length === 0) {
      return res.status(400).json({ message: "No valid documents to upload" });
    }

    let userDoc = await UserDocument.findOne({ userId });

    if (userDoc) {
      // Add new docs to existing user's document array
      userDoc.documents.push(...newDocs);
      await userDoc.save();
    } else {
      // Create new document with uploaded files
      userDoc = await UserDocument.create({
        userId,
        documents: newDocs,
      });
    }

    return res.status(200).json({
      message: "Documents uploaded and saved successfully",
      userDocument: userDoc,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyOrRejectUserDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const adminId = req.user._id;
    console.log(req.user);
    const { action, rejectionReason = "" } = req.body;

    const document = await UserDocument.findById(documentId);
    console.log("document status check", document);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    const isApprove = action === "VERIFIED";
    const isReject = action === "REJECT";

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
      isVerified: isApprove,
      verifiedBy: adminId,
      verifiedAt: new Date(),
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
