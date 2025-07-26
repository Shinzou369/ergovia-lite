require("dotenv").config(); // Load .env variables
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Using environment variable for the API key
});

async function uploadAndFineTune() {
  try {
    const filePath = path.join(__dirname, "ergo2training_data.jsonl");

    // Upload training file
    console.log("Uploading training data...");
    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: "fine-tune",
    });

    console.log("Uploaded training file:", file.id);

    // Start fine-tuning
    console.log("Starting fine-tuning...");
    const fineTune = await openai.fineTuning.jobs.create({
      training_file: file.id,
      model: "gpt-3.5-turbo", // or use another model like "gpt-4" if preferred
    });

    console.log("Fine-tuning started:");
    console.log("FineTune ID:", fineTune.id);
    console.log("Status:", fineTune.status);
  } catch (error) {
    console.error("Error during the process:", error);
  }
}

uploadAndFineTune();
