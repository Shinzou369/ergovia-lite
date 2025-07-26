const fs = require("fs");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // replace with your actual API key
});

async function uploadAndTrain() {
  try {
    // 1. Upload training file
    const file = await openai.files.create({
      file: fs.createReadStream("training_data.jsonl"),
      purpose: "fine-tune",
    });

    console.log("✅ Uploaded training file:", file.id);

    // 2. Start fine-tuning job
    const fineTune = await openai.fineTuning.jobs.create({
      model: "gpt-3.5-turbo",
      training_file: file.id,
    });

    console.log("🚀 Fine-tuning started");
    console.log("FineTune ID:", fineTune.id);
    console.log("Status:", fineTune.status);
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

uploadAndTrain();
