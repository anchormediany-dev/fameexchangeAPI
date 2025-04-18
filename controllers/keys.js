import Keys from "../models/keys.js";
import mongoose from "mongoose";

const create = async (req, res) => {
  try {
    if (!req.body.title) {
      return res.status(401).json({ error: "title is required" });
    }

    const exist = await Keys.findOne({ title: req.body.title });
    if (exist) {
      return res.status(401).json({ error: "title already exist" });
    }

    req.body.secret_key = new mongoose.Types.ObjectId();

    const currentDate = new Date();
    currentDate.setFullYear(currentDate.getFullYear() + 1);
    req.body.expiry_date = currentDate;

    const newKey = await Keys.create(req.body);
    res
      .status(201)
      .json({ message: "New Key Created successfully", key: newKey });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAll = async (req, res) => {
  try {
    const keys = await Keys.find();
    res.status(200).json({ keys: keys });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteKey = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedKey = await Keys.findByIdAndDelete(id);
    if (!deletedKey) {
      return res.status(404).json({ message: "key not found" });
    }
    res.status(200).json({ message: "Key Deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { create, getAll, deleteKey };
