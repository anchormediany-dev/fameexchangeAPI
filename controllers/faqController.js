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

// Get all FAQs (only non-deleted) - grouped by type
export const getFaqs = async (req, res) => {
  try {
    const faqs = await Faq.find({ isDeleted: false }).sort({ createdAt: -1 });

    // Define the order of types
    const typeOrder = [
      "GENERAL QUESTIONS ABOUT THE FAME EXCHANGE",
      "FANS / INVESTORS",
      "TALENT / ATHLETES / INFLUENCERS",
      "BUSINESS / PARTNERSHIPS",
      "SECURITY / LEGAL / COMPLIANCE",
      "SUPPORT & CONTACT",
    ];

    // Group FAQs by type using for loop
    const groupedByType = {};

    for (const faq of faqs) {
      const type = faq.type || "Uncategorized";

      if (!groupedByType[type]) {
        groupedByType[type] = [];
      }

      groupedByType[type].push({
        _id: faq._id,
        question: faq.question,
        answer: faq.answer,
        type: faq.type,
        createdAt: faq.createdAt,
        updatedAt: faq.updatedAt,
      });
    }

    // Convert to array format with type as key in specific order
    const result = [];

    // First, add types in the defined order
    for (const type of typeOrder) {
      if (groupedByType[type]) {
        result.push({
          type: type,
          questions: groupedByType[type],
          count: groupedByType[type].length,
        });
      }
    }

    // Then add any remaining types not in the order list
    for (const type in groupedByType) {
      if (!typeOrder.includes(type)) {
        result.push({
          type: type,
          questions: groupedByType[type],
          count: groupedByType[type].length,
        });
      }
    }

    res.json({
      success: true,
      result,
      totalFaqs: faqs.length,
      totalTypes: result.length,
    });
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
