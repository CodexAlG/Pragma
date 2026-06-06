import { TimelineItem } from "./supabase";

// Keywords definitions for categorization
const DEV_KEYWORDS = ["código", "codigo", "pr", "review", "branch", "deploy", "refactor", "desarrollo", "programar"];
const BUG_KEYWORDS = ["bug", "fix", "error", "fallo", "investigar", "resolución", "resolucion"];
const MEETING_KEYWORDS = ["reunión", "reunion", "meeting", "standup", "sincro", "equipo", "practicantes"];
const CLIENT_KEYWORDS = ["cliente", "acme", "externo", "llamada", "call"];
const IDEA_KEYWORDS = ["idea", "pensar en", "explorar", "bóveda", "boveda"];

/**
 * Detects presence of flags for showing real-time chips
 */
export function detectFlags(text: string): string[] {
  const lowercase = text.toLowerCase();
  const flags: string[] = [];

  // Check Dev keywords (includes bugs for the general dev chip classification)
  const hasDev = DEV_KEYWORDS.some(k => lowercase.includes(k)) || BUG_KEYWORDS.some(k => lowercase.includes(k));
  // Check Meeting keywords (includes client calls for general meeting chip classification)
  const hasMeeting = MEETING_KEYWORDS.some(k => lowercase.includes(k)) || CLIENT_KEYWORDS.some(k => lowercase.includes(k));
  // Check Idea keywords
  const hasIdea = IDEA_KEYWORDS.some(k => lowercase.includes(k));

  if (hasDev) flags.push("dev");
  if (hasMeeting) flags.push("meeting");
  if (hasIdea) flags.push("idea");

  return flags;
}

/**
 * Helper to extract time format (e.g. 09:00, 15:30, 9 a 10) from a sentence
 */
function extractTime(sentence: string): string {
  const lowercase = sentence.toLowerCase();
  // Match standard HH:MM
  const hhmmMatch = sentence.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (hhmmMatch) {
    const hours = hhmmMatch[1].padStart(2, "0");
    const minutes = hhmmMatch[2];
    return `${hours}:${minutes}`;
  }

  // Match "de X a Y" or "a las X"
  const aLasMatch = lowercase.match(/\ba las (\d{1,2})\b/);
  if (aLasMatch) {
    const hours = aLasMatch[1].padStart(2, "0");
    return `${hours}:00`;
  }

  const deXaYMatch = lowercase.match(/\bde (\d{1,2}) a (\d{1,2})\b/);
  if (deXaYMatch) {
    const hours = deXaYMatch[1].padStart(2, "0");
    return `${hours}:00`;
  }

  // Generic digits detection as fallback for time (e.g. "a las 9", "las 11")
  const numMatch = sentence.match(/\b(\d{1,2})\s*(?:am|pm|hs|h)\b/i);
  if (numMatch) {
    const hours = numMatch[1].padStart(2, "0");
    return `${hours}:00`;
  }

  return "";
}

/**
 * Clean up title text by removing leading prepositions, IDEA headers, and times
 */
function cleanTitle(sentence: string): string {
  let cleaned = sentence
    .replace(/^[\s,.:;•\-*]+/g, "") // remove bullet points & punctuation
    .replace(/^(idea|investigar el bug de la|investigar el bug|investigar|reunión de equipo a las|reunión a las|reunión|meeting|standup|llamada con)\s+/i, "")
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Parse a raw text paragraph into sorted timeline items
 */
export function parseBrainDump(text: string, answers: Record<string, any> = {}): TimelineItem[] {
  if (!text.trim()) return [];

  // Split by periods, semicolons, or newlines
  const sentences = text
    .split(/[.;\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  const items: TimelineItem[] = [];

  sentences.forEach((sentence, index) => {
    const lowercase = sentence.toLowerCase();
    let type: TimelineItem["type"] = "dev";
    let matched = false;

    // Detect type based on keywords
    if (IDEA_KEYWORDS.some(k => lowercase.includes(k))) {
      type = "idea";
      matched = true;
    } else if (BUG_KEYWORDS.some(k => lowercase.includes(k))) {
      type = "bug";
      matched = true;
    } else if (CLIENT_KEYWORDS.some(k => lowercase.includes(k))) {
      type = "client";
      matched = true;
    } else if (MEETING_KEYWORDS.some(k => lowercase.includes(k))) {
      type = "meeting";
      matched = true;
    } else if (DEV_KEYWORDS.some(k => lowercase.includes(k))) {
      type = "dev";
      matched = true;
    }

    // Default to dev if no keywords matched but sentence exists
    if (!matched) {
      type = "dev";
    }

    let time = extractTime(sentence);
    let title = cleanTitle(sentence);

    // Apply context answers updates
    if (type === "dev" && answers.branch_or_pr) {
      title = `${title} [${answers.branch_or_pr}]`;
    }
    if (type === "meeting" && !time && answers.meeting_time) {
      time = answers.meeting_time;
    }
    if (type === "bug" && answers.bug_duration) {
      title = `${title} (${answers.bug_duration})`;
    }

    // Default times if still empty
    if (!time) {
      if (type === "idea") {
        time = ""; // Ideas don't need a specific time
      } else {
        // Fallback default times based on index to keep chronological sequencing
        const hour = 9 + index;
        time = `${hour.toString().padStart(2, "0")}:00`;
      }
    }

    items.push({
      id: `${Date.now()}-${index}`,
      time,
      title,
      type,
      status: "pending",
    });
  });

  // Sort by dependency logic:
  // 1. dev
  // 2. meeting
  // 3. client
  // 4. bug
  // 5. idea
  const typeOrder: Record<TimelineItem["type"], number> = {
    dev: 1,
    meeting: 2,
    client: 3,
    bug: 4,
    idea: 5,
  };

  return items.sort((a, b) => {
    // Primary sort: priority type order
    if (typeOrder[a.type] !== typeOrder[b.type]) {
      return typeOrder[a.type] - typeOrder[b.type];
    }
    // Secondary sort: time (ascending) for tasks with time values
    if (a.time && b.time) {
      return a.time.localeCompare(b.time);
    }
    return 0;
  });
}

/**
 * Calculates effort distribution percentages based on priority groups
 */
export function calculateEffort(timeline: TimelineItem[]): { dev: number; meeting: number; idea: number } {
  if (timeline.length === 0) {
    return { dev: 40, meeting: 40, idea: 20 }; // Neutral baseline if empty
  }

  // Weight weights
  const weights: Record<TimelineItem["type"], number> = {
    dev: 3,
    bug: 2,
    meeting: 1,
    client: 2,
    idea: 1,
  };

  let devWeight = 0;
  let meetingWeight = 0;
  let ideaWeight = 0;

  timeline.forEach(item => {
    const w = weights[item.type] || 1;
    if (item.type === "dev" || item.type === "bug") {
      devWeight += w;
    } else if (item.type === "meeting" || item.type === "client") {
      meetingWeight += w;
    } else if (item.type === "idea") {
      ideaWeight += w;
    }
  });

  const total = devWeight + meetingWeight + ideaWeight;
  if (total === 0) {
    return { dev: 0, meeting: 0, idea: 0 };
  }

  // Calculate percentages
  const devPercent = Math.round((devWeight / total) * 100);
  const meetingPercent = Math.round((meetingWeight / total) * 100);
  const ideaPercent = 100 - (devPercent + meetingPercent); // Ensure it sums to exactly 100%

  return {
    dev: devPercent,
    meeting: meetingPercent,
    idea: ideaPercent,
  };
}

/**
 * Helper to auto-tag an idea text
 */
export function autoTagIdea(text: string): string {
  const lowercase = text.toLowerCase();
  if (lowercase.includes("react") || lowercase.includes("hook") || lowercase.includes("component")) {
    return "#react";
  }
  if (lowercase.includes("db") || lowercase.includes("postgres") || lowercase.includes("supabase") || lowercase.includes("sql")) {
    return "#database";
  }
  if (lowercase.includes("performance") || lowercase.includes("cache") || lowercase.includes("slow") || lowercase.includes("optim")) {
    return "#performance";
  }
  if (lowercase.includes("css") || lowercase.includes("design") || lowercase.includes("ui") || lowercase.includes("ux") || lowercase.includes("style")) {
    return "#ux";
  }
  if (lowercase.includes("auth") || lowercase.includes("login") || lowercase.includes("security") || lowercase.includes("token")) {
    return "#security";
  }
  return "#dev";
}
