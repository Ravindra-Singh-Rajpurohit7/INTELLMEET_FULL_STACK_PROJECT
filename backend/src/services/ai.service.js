// src/services/ai.service.js
import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import Meeting from "../models/Meeting.js";
import Task from "../models/Task.js";
import { ApiError } from "../utils/ApiError.js";

// ─── API Key Validation ───────────────────────────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY
  ? process.env.GEMINI_API_KEY.trim().replace(/['"'"' "]/g, "")
  : "";

if (!apiKey ) {
  console.error("❌ CRITICAL: Invalid or missing GEMINI_API_KEY in .env file!");
}

// ─── Client Initialization ────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(apiKey);
const MODEL = "gemini-2.5-flash";
const model = genAI.getGenerativeModel({ model: MODEL });

// ─── Startup Diagnostics ──────────────────────────────────────────────────────

console.log("Gemini Key Loaded:", !!apiKey);
console.log("Model:", MODEL);

// ─── Prompt Templates ─────────────────────────────────────────────────────────

const PROMPTS = {
  MEETING_ANALYSIS: (transcript, title) => `
You are an expert meeting analyst for enterprise teams at IntellMeet.
Analyze the following meeting transcript and extract structured insights.

Meeting Title: "${title}"

Transcript:
${transcript}

IMPORTANT: Respond with ONLY valid JSON. No markdown, no explanation, just JSON.

{
  "summary": "2-3 paragraph executive summary of the meeting",
  "keyDecisions": [],
  "actionItems": [
    {
      "task": "",
      "assignee": "",
      "dueDate": "YYYY-MM-DD or null",
      "priority": "high|medium|low",
      "context": ""
    }
  ],
  "topics": [],
  "sentiment": "positive|neutral|negative|mixed",
  "meetingEfficiency": 1,
  "keyQuotes": [],
  "risks": [],
  "followUpDate": "YYYY-MM-DD or null"
}
`,

  SMART_NOTES: (transcript) => `
You are a professional note-taker.

Transcript:
${transcript}

Create Markdown notes:
- Attendees
- Objective
- Discussion
- Decisions
- Action Items
- Next Steps
`,

  TASK_BREAKDOWN: (taskTitle, taskDescription) => `
You are a project manager.

Task: "${taskTitle}"
Context: "${taskDescription}"

Respond ONLY JSON:
{
  "subtasks": [
    {
      "title": "",
      "estimatedHours": 0,
      "priority": "high|medium|low"
    }
  ],
  "totalEstimatedHours": 0,
  "suggestedStartDate": null,
  "dependencies": []
}
`,
};

// ─── Safe JSON Parser ─────────────────────────────────────────────────────────

const safeJSON = (text) => {
  // Step 1: Strip markdown code fences if present
  // Handles ```json ... ``` and ``` ... ``` blocks
  let cleaned = text.trim();

  const codeFenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeFenceMatch) {
    cleaned = codeFenceMatch[1].trim();
  }

  // Step 2: Attempt direct parse on cleaned text
  try {
    return JSON.parse(cleaned);
  } catch {
    // Step 3: Fallback — extract first {...} block from the raw text
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error(
        `Invalid JSON from AI — no JSON object found. Raw response: ${text.substring(0, 200)}`
      );
    }
    try {
      return JSON.parse(objectMatch[0]);
    } catch (err) {
      throw new Error(
        `Invalid JSON from AI — parse failed after extraction: ${err.message}. Raw: ${text.substring(0, 200)}`
      );
    }
  }
};

// ─── Mark Meeting as Failed (Safety Helper) ───────────────────────────────────

const markMeetingFailed = async (meetingId, reason) => {
  try {
    await Meeting.findByIdAndUpdate(meetingId, {
      aiStatus: "failed",
      "aiMetadata.failedAt": new Date(),
      "aiMetadata.failureReason": reason || "Unknown error",
    });
    console.error(
      `[AI] ❌ Meeting ${meetingId} marked as FAILED. Reason: ${reason}`
    );
  } catch (updateErr) {
    console.error(
      `[AI] ❌ CRITICAL: Failed to update meeting status to 'failed' for ${meetingId}:`,
      updateErr.message
    );
  }
};

// ─── Audio Transcription ──────────────────────────────────────────────────────

const transcribeAudio = async (audioFilePath) => {
  if (!audioFilePath || !fs.existsSync(audioFilePath)) {
    throw new ApiError(400, "Audio file not found for transcription");
  }

  console.log("🎙️ Starting audio transcription...");

  const audioBytes = fs.readFileSync(audioFilePath).toString("base64");

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "audio/mp3",
              data: audioBytes,
            },
          },
          { text: "Please provide accurate transcript." },
        ],
      },
    ],
  });

  const response = await result.response;

  return {
    text: response.text(),
    duration: 0,
    segments: [],
    language: "en",
  };
};

// ─── Meeting Analysis ─────────────────────────────────────────────────────────

const analyzeMeetingTranscript = async (transcript, meetingTitle) => {
  if (!transcript || transcript.trim().length < 20) {
    throw new ApiError(
      400,
      `Transcript too short for analysis (minimum 20 characters, got ${transcript?.trim().length ?? 0})`
    );
  }

  console.log("[AI] Sending transcript to Gemini for analysis...");

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: PROMPTS.MEETING_ANALYSIS(transcript, meetingTitle) }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  });

  const response = await result.response;
  const rawText = response.text();

  console.log(
    "[AI] Raw analysis response received, length:",
    rawText.length
  );

  return safeJSON(rawText);
};

// ─── Smart Notes ──────────────────────────────────────────────────────────────

const generateSmartNotes = async (transcript) => {
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: PROMPTS.SMART_NOTES(transcript) }],
      },
    ],
    generationConfig: { temperature: 0.3 },
  });

  const response = await result.response;
  return response.text();
};

// ─── Full Meeting Processing Pipeline ────────────────────────────────────────

const processMeetingAI = async (meetingId, audioFilePath = null) => {
  // ── STEP 1: Load Meeting ─────────────────────────────
  console.log(`\n[AI] ── STEP 1: Loading meeting ${meetingId} from DB...`);

  const meeting = await Meeting.findById(meetingId).populate(
    "host",
    "name email"
  );

  if (!meeting) {
    throw new ApiError(404, "Meeting not found");
  }

  console.log(
    `[AI] ✅ STEP 1 Complete: Meeting loaded — "${meeting.title}" | host: ${meeting.host?.email || meeting.host?._id}`
  );

  try {
    // ── STEP 2: Resolve Transcript ───────────────────────
    console.log("[AI] ── STEP 2: Resolving transcript...");

    let transcript;

    if (audioFilePath && fs.existsSync(audioFilePath)) {
      console.log("[AI] Audio file found. Running transcription...");
      const transcriptionResult = await transcribeAudio(audioFilePath);
      transcript = transcriptionResult.text;
    } else if (meeting.transcript && meeting.transcript.trim().length > 0) {
      transcript = meeting.transcript;
      console.log("[AI] Using existing transcript from meeting document.");
    } else {
      throw new ApiError(
        400,
        "No audio file or existing transcript available for processing"
      );
    }

    console.log(
      `[AI] ✅ STEP 2 Complete: Transcript ready — length: ${transcript.length} characters`
    );

    // ── STEP 3: Run Analysis ─────────────────────────────
    console.log(
      "[AI] ── STEP 3: Running meeting transcript analysis with Gemini..."
    );

    const analysis = await analyzeMeetingTranscript(
      transcript,
      meeting.title
    );

    console.log("[AI] ✅ STEP 3 Complete: Analysis generated.");
    console.log("[AI] Analysis object:", JSON.stringify(analysis, null, 2));

    // ── STEP 4: Generate Smart Notes ─────────────────────
    console.log("[AI] ── STEP 4: Generating smart notes...");

    const smartNotes = await generateSmartNotes(transcript);

    console.log(
      `[AI] ✅ STEP 4 Complete: Smart notes generated — length: ${smartNotes.length} characters`
    );

    // ── STEP 5: Create Tasks from Action Items ───────────
    console.log(
      `[AI] ── STEP 5: Creating tasks from ${analysis.actionItems?.length || 0} action items...`
    );

    const createdTasks = [];

    if (analysis.actionItems?.length) {
      for (const item of analysis.actionItems) {
        try {
          const task = await Task.create({
            title: item.task,
            description: item.context,
            priority: item.priority,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            status: "todo",
            project: meeting.project,
            team: meeting.team,
            createdBy: meeting.host._id,
            aiGenerated: true,
            sourceMeeting: meetingId,
          });

          createdTasks.push(task);
          console.log(`[AI] ✅ Task created: "${task.title}"`);
        } catch (taskErr) {
          console.warn(
            `[AI] ⚠️ Task creation failed for "${item.task}":`,
            taskErr.message
          );
        }
      }
    }

    console.log(
      `[AI] ✅ STEP 5 Complete: ${createdTasks.length} tasks created.`
    );

    // ── STEP 6: Persist Results to DB ───────────────────
    console.log("[AI] ── STEP 6: Updating meeting document in DB...");

    const updatedMeeting = await Meeting.findByIdAndUpdate(
      meetingId,
      {
        transcript,
        summary: analysis.summary,
        smartNotes,
        actionItems: analysis.actionItems,
        aiStatus: "completed",
        aiMetadata: {
          keyDecisions: analysis.keyDecisions,
          topics: analysis.topics,
          sentiment: analysis.sentiment,
          efficiency: analysis.meetingEfficiency,
          risks: analysis.risks,
          followUpDate: analysis.followUpDate
            ? new Date(analysis.followUpDate)
            : null,
          processedAt: new Date(),
          failedAt: null,
          failureReason: "",
        },
      },
      { new: true }
    );

    console.log(
      `[AI] ✅ STEP 6 Complete: Meeting DB updated. aiStatus = "${updatedMeeting.aiStatus}"`
    );
    console.log(
      `\n[AI] 🎉 Pipeline COMPLETE for meeting "${meeting.title}" | Tasks created: ${createdTasks.length}\n`
    );

    return {
      meeting: updatedMeeting,
      tasksCreated: createdTasks.length,
      actionItems: analysis.actionItems?.length || 0,
      summary: analysis.summary,
    };
  } catch (err) {
    // ── FAILURE RECOVERY ─────────────────────────────────
    console.error(
      `\n[AI] ❌ Pipeline FAILED for meeting ${meetingId} at some step.`
    );
    console.error(`[AI] Error: ${err.message}`);

    await markMeetingFailed(meetingId, err.message);

    throw err;
  } finally {
    // ── AUDIO FILE CLEANUP ────────────────────────────────
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      try {
        fs.unlinkSync(audioFilePath);
        console.log(
          `[AI] 🗑️ Local audio file cleaned up: ${audioFilePath}`
        );
      } catch (cleanupErr) {
        console.warn(
          "[AI] ⚠️ Could not delete local audio file:",
          cleanupErr.message
        );
      }
    }
  }
};

// ─── Task Breakdown ───────────────────────────────────────────────────────────

const breakdownTask = async (taskTitle, taskDescription = "") => {
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: PROMPTS.TASK_BREAKDOWN(taskTitle, taskDescription) },
        ],
      },
    ],
    generationConfig: { temperature: 0.3 },
  });

  const response = await result.response;
  return safeJSON(response.text());
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  transcribeAudio,
  analyzeMeetingTranscript,
  generateSmartNotes,
  processMeetingAI,
  breakdownTask,
};