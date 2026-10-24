import { NextResponse } from "next/server";
import {
  diffBasedFeedback,
  type PronunciationFeedback,
  type PronunciationRequest,
} from "@/lib/pronunciation";

// ---------------------------------------------------------------------------
// POST /api/pronunciation
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  let body: PronunciationRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { target, transcript } = body;

  if (typeof target !== "string" || typeof transcript !== "string") {
    return NextResponse.json(
      { error: "Both 'target' and 'transcript' must be strings" },
      { status: 400 },
    );
  }

  if (target.trim().length === 0) {
    return NextResponse.json(
      { error: "'target' must not be empty" },
      { status: 400 },
    );
  }

  // -----------------------------------------------------------------------
  // If no API key, return basic diff-based feedback
  // -----------------------------------------------------------------------
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    const feedback = diffBasedFeedback(target, transcript);
    return NextResponse.json(feedback);
  }

  // -----------------------------------------------------------------------
  // Call Claude API for detailed pronunciation analysis
  // -----------------------------------------------------------------------
  try {
    const systemPrompt = `You are a pronunciation analysis assistant for a Japanese language shadowing app.
You compare a target sentence with what the user actually said (transcript from speech recognition).
Analyze pronunciation accuracy and provide feedback in Japanese.

Always respond with valid JSON in exactly this format:
{
  "score": <number 0-100>,
  "feedback": "<brief tips in Japanese>",
  "details": {
    "missed": ["<words in target that were missed or mispronounced>"],
    "added": ["<words the user said that were not in the target>"],
    "correct": ["<words correctly spoken>"]
  }
}

Guidelines for scoring:
- 100: Perfect match
- 80-99: Minor differences (particles, small words)
- 50-79: Several words missed or mispronounced
- 0-49: Significant differences

Provide encouraging, constructive feedback in Japanese. Focus on specific pronunciation tips.`;

    const userMessage = `Target sentence: "${target}"
User's transcript: "${transcript}"

Compare these and provide pronunciation feedback as JSON.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
        system: systemPrompt,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Anthropic API error:", res.status, errorText);
      // Fall back to diff-based feedback on API error
      const feedback = diffBasedFeedback(target, transcript);
      return NextResponse.json(feedback);
    }

    const apiResponse = await res.json();

    // Extract the text content from Claude's response
    const textBlock = apiResponse.content?.find(
      (block: { type: string }) => block.type === "text",
    );

    if (!textBlock?.text) {
      // Fall back to diff-based feedback if response is unexpected
      const feedback = diffBasedFeedback(target, transcript);
      return NextResponse.json(feedback);
    }

    // Parse the JSON from Claude's response
    // Strip markdown code fences if present
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed: PronunciationFeedback = JSON.parse(jsonText);

    // Validate the shape of the response
    if (
      typeof parsed.score !== "number" ||
      typeof parsed.feedback !== "string" ||
      !Array.isArray(parsed.details?.missed) ||
      !Array.isArray(parsed.details?.added) ||
      !Array.isArray(parsed.details?.correct)
    ) {
      throw new Error("Invalid response shape from Claude API");
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Pronunciation API error:", err);
    // Fall back to diff-based feedback on any error
    const feedback = diffBasedFeedback(target, transcript);
    return NextResponse.json(feedback);
  }
}
