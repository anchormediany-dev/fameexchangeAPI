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

const createInitialKeyIfNotExists = async () => {
  const predefinedKey = "6800d79f1b5720e55168bc4f"; // or generate dynamically
  const existingKey = await Keys.findOne({ secret_key: predefinedKey });

  if (!existingKey) {
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1); // 1 year from now

    const newKey = new Keys({
      secret_key: predefinedKey,
      title: "web",
      createdBy: "system", // optional fields
      type: "initial",
      purpose: "environment startup key",
      createdAt: new Date(),
      expiry_date: expiryDate,
    });

    await newKey.save();
    console.log("✅ Initial key inserted into DB");
  } else {
    console.log("✅ Initial key already exists in DB");
  }
};

export { create, getAll, deleteKey, createInitialKeyIfNotExists };
