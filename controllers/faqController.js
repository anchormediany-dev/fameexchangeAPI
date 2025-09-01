import Faq from "../models/faqModel.js";

// Create FAQ
export const createFaq = async (req, res) => {
  try {
    const faq = await Faq.create({
      ...req.body,
      createdBy: req.user?._id || null,
    });
    res.status(201).json({ success: true, data: faq });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Get all FAQs (only non-deleted)
export const getFaqs = async (req, res) => {
  try {
    const faqs = await Faq.find({ isDeleted: false }).sort({ createdAt: -1 });
    res.json({ success: true, data: faqs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get single FAQ
export const getFaq = async (req, res) => {
  try {
    const faq = await Faq.findOne({ _id: req.params.id, isDeleted: false });
    if (!faq)
      return res.status(404).json({ success: false, message: "FAQ not found" });
    res.json({ success: true, data: faq });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Update FAQ
export const updateFaq = async (req, res) => {
  try {
    const faq = await Faq.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { ...req.body, updatedBy: req.user?._id || null },
      { new: true, runValidators: true }
    );
    if (!faq)
      return res.status(404).json({ success: false, message: "FAQ not found" });
    res.json({ success: true, data: faq });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Soft Delete FAQ
export const deleteFaq = async (req, res) => {
  try {
    const faq = await Faq.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );
    if (!faq)
      return res.status(404).json({ success: false, message: "FAQ not found" });
    res.json({ success: true, message: "FAQ deleted" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
