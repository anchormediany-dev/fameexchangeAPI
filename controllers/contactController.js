import contactModel from "../models/contactModel.js";

export const submitContactQuery = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const query = new contactModel({ name, email, subject, message });
    await query.save();

    res.status(201).json({
      success: true,
      message: "Your message has been submitted successfully",
      data: query,
    });
  } catch (error) {
    console.error("Contact form error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// 🆕 GET all contact queries (for admin use)
export const getAllContactQueries = async (req, res) => {
  try {
    const queries = await contactModel.find().sort({ createdAt: -1 }); // newest first
    res.status(200).json({
      success: true,
      data: queries,
    });
  } catch (error) {
    console.error("Error fetching contact queries:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contact queries",
      error: error.message,
    });
  }
};
