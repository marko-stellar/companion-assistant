/**
 * Tool definitions — what the LLM sees when it decides whether to call a tool.
 * Each definition is included in the system prompt when the conversation route
 * is ready to accept tool calls.
 *
 * Security note: userId is NEVER a tool argument. It is always taken from the
 * authenticated device session by the executor.
 */

import type { ToolDefinition } from "./types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "create_reminder",
    description:
      "Create a reminder for the user. Use this when the user asks to be reminded of something at a specific time. " +
      "Resolve relative time expressions (tomorrow, Friday, next week) to a concrete date using the current local date/time from the system prompt. " +
      "If the time is ambiguous (e.g. 'until lunch' with no lunch time defined), ask the user for the exact time instead of guessing.",
    parameters: {
      type: "object",
      required: ["title", "localTime"],
      additionalProperties: false,
      properties: {
        title: {
          type: "string",
          description: "Short description of what to remember (max 120 chars).",
        },
        type: {
          type: "string",
          enum: ["GENERAL", "MEDICATION"],
          description: "GENERAL for regular reminders, MEDICATION for medicine reminders.",
        },
        medicationName: {
          type: "string",
          description: "Name of the medication. Required when type is MEDICATION.",
        },
        localTime: {
          type: "string",
          pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
          description: "Wall-clock time in the user's timezone, format HH:MM (e.g. '09:00').",
        },
        recurrenceDays: {
          type: "array",
          items: { type: "string", enum: ["MON","TUE","WED","THU","FRI","SAT","SUN"] },
          description: "Days of the week to repeat. Omit or send empty array for a one-time reminder.",
        },
        localDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Date for a one-time reminder in user's timezone, format YYYY-MM-DD. Required when recurrenceDays is empty or omitted.",
        },
        details: {
          type: "string",
          description: "Optional extra information about the reminder.",
        },
      },
    },
  },

  {
    name: "create_appointment",
    description:
      "Create a calendar appointment for the user. Use this when the user mentions a scheduled event " +
      "(doctor visit, dentist, family call, etc.) with a specific date and time. " +
      "Resolve relative dates ('this Friday', 'next Tuesday') using the current local date from the system prompt.",
    parameters: {
      type: "object",
      required: ["title", "localDate", "localTime"],
      additionalProperties: false,
      properties: {
        title: {
          type: "string",
          description: "Name or short description of the appointment (max 120 chars).",
        },
        localDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Date of the appointment in the user's timezone, format YYYY-MM-DD.",
        },
        localTime: {
          type: "string",
          pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
          description: "Start time in the user's timezone, format HH:MM.",
        },
        endLocalTime: {
          type: "string",
          pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
          description: "Optional end time in the user's timezone, format HH:MM.",
        },
        location: {
          type: "string",
          description: "Optional location or address.",
        },
        details: {
          type: "string",
          description: "Optional extra notes about the appointment.",
        },
      },
    },
  },

  {
    name: "set_temporary_dnd",
    description:
      "Set a temporary Do-Not-Disturb period so the companion will not speak proactively until the given time. " +
      "The user can still press Talk to start a conversation at any time. " +
      "Use this when the user says they don't want to be disturbed, need quiet, or are busy until a specific time. " +
      "Do not guess an end time — ask the user if they haven't specified one.",
    parameters: {
      type: "object",
      required: ["endsAtLocalTime"],
      additionalProperties: false,
      properties: {
        endsAtLocalTime: {
          type: "string",
          pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
          description: "Local time HH:MM when the DND period ends. Resolve 'until 3pm' to '15:00'.",
        },
        reason: {
          type: "string",
          description: "Optional reason (e.g. 'napping', 'reading').",
        },
      },
    },
  },

  {
    name: "get_today_schedule",
    description:
      "Retrieve the user's full schedule for today (reminders, medication reminders, appointments). " +
      "Call this when the user asks what they have today, what's planned, or if they want to review their schedule.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },

  {
    name: "confirm_medication",
    description:
      "Record the user's YES / NO / UNKNOWN answer to a medication reminder. " +
      "Call this when the user confirms or denies having taken a medication after a reminder fired. " +
      "The occurrenceId is provided in the TODAY'S SCHEDULE section of the system prompt for pending medication items.",
    parameters: {
      type: "object",
      required: ["occurrenceId", "response"],
      additionalProperties: false,
      properties: {
        occurrenceId: {
          type: "string",
          format: "uuid",
          description: "UUID of the reminder_occurrence to confirm.",
        },
        response: {
          type: "string",
          enum: ["YES", "NO", "UNKNOWN"],
          description: "YES = medication taken, NO = not taken, UNKNOWN = user is unsure.",
        },
      },
    },
  },

  {
    name: "correct_memory",
    description:
      "Correct or update an existing memory about the user. " +
      "Use this when the user explicitly corrects something the companion knows — " +
      "e.g. 'Ana, actually Petra is my daughter, not my sister'. " +
      "The old memory is deactivated and a new corrected one is stored with an audit trail.",
    parameters: {
      type: "object",
      required: ["subject", "correctedFact"],
      additionalProperties: false,
      properties: {
        subject: {
          type: "string",
          description: "Who or what the memory is about (e.g. 'Petra', 'coffee', 'work').",
        },
        correctedFact: {
          type: "string",
          description: "The new, correct factual statement in the same language as the user.",
        },
        supersedesFactLike: {
          type: "string",
          description:
            "Optional fragment of the incorrect fact to help find it (e.g. 'sister'). " +
            "Omit if you don't know what the wrong fact said.",
        },
      },
    },
  },
];

/** Build the tool section injected into the system prompt. */
export function buildToolsPromptSection(language: string): string {
  const isHR = language === "hr";

  const toolList = TOOL_DEFINITIONS.map(t => {
    const required = (t.parameters as { required?: string[] }).required ?? [];
    const props = (t.parameters as { properties?: Record<string, { description?: string }> }).properties ?? {};
    const paramLines = Object.entries(props)
      .map(([k, v]) => `    - ${k}${required.includes(k) ? " (required)" : " (optional)"}: ${v.description ?? ""}`)
      .join("\n");
    return `• ${t.name}: ${t.description}\n${paramLines}`;
  }).join("\n\n");

  return `
TOOLS:
You have access to the following structured tools. Use them when the user's request clearly maps to one.
${isHR ? "Razgovor je na hrvatskom — argumenti alata uvijek na engleskom (stringovi, datumi, vremena)." : "Always use English for tool argument values (strings, dates, times), even in Croatian conversations."}

${toolList}

When you want to call a tool, output ONLY this block (nothing else in that message):
<tool_call>
{"tool": "<name>", "args": {<arguments>}}
</tool_call>

Rules:
- Resolve ALL relative dates/times to absolute values (YYYY-MM-DD / HH:MM) before calling a tool.
- If the user's time reference is ambiguous, ask a clarifying question instead of calling the tool.
- Never guess a userId — it is handled automatically by the server.
- One tool call per message. If multiple actions are needed, do the most important one first.
- For medication confirmation, the occurrenceId appears in the TODAY'S SCHEDULE section as "occurrenceId: <uuid>".
`;
}
