const mongoose = require("mongoose");

const deliverableSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Deliverable title is required."],
      trim: true,
      maxlength: [140, "Title must be at most 140 characters."],
    },
    module: {
      type: String,
      enum: ["Frontend UI", "REST API", "Database", "AI Integration", "Security & QA"],
      default: "Full-Stack",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["backlog", "in-progress", "completed"],
      default: "backlog",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be at most 1000 characters."],
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const Deliverable =
  mongoose.models.Deliverable || mongoose.model("Deliverable", deliverableSchema);

module.exports = Deliverable;
