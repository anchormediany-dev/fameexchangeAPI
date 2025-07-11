import Review from "../models/reviewModel.js";
import User from "../models/user.js";

// Create a new review
export const createReview = async (req, res) => {
  try {
    const { customerName, starsRating, reviewDetail, status } = req.body;

    const { _id: addedBy } = req.user;
    const user = await User.findById(addedBy);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (!customerName || !starsRating || !reviewDetail) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const review = new Review({
      customerName,
      starsRating,
      reviewDetail,
      status,
      addedBy,
    });

    await review.save();
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    console.error("Create Review Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get all reviews
export const getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate("addedBy", "name email")
      .sort({ datetime: -1 });
    res.json({ success: true, data: reviews });
  } catch (err) {
    console.error("Get Reviews Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update review
export const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Review.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    }).populate("addedBy", "name email");

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error("Update Review Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Delete review
export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Review.findByIdAndDelete(id);

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    res.json({ success: true, message: "Review deleted" });
  } catch (err) {
    console.error("Delete Review Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
