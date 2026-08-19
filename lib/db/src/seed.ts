import { db } from "./index";
import { companions } from "./schema/companions";
import { users } from "./schema/users";
import { emergencyContacts } from "./schema/emergency_contacts";
import { reminders } from "./schema/reminders";
import { appointments } from "./schema/appointments";
import { memories } from "./schema/memories";
import { and, eq } from "drizzle-orm";
import { computeDemoAppointmentUtc } from "./demo-time";

/**
 * Seed the four COMPANION personas.
 * Run via: pnpm --filter @workspace/db run seed
 * Safe to run repeatedly — skips companions that already exist.
 */
const COMPANIONS = [
  {
    name: "Ana",
    gender: "female",
    tagline: "Warm and supportive — always here to listen",
    personalityConfig: {
      voiceId: "ana-placeholder",
      systemPromptText:
        "You are Ana, a warm and supportive companion. You listen carefully, offer gentle encouragement, and make the person feel heard and valued. You are patient, never rush, and celebrate small victories.",
      traits: ["warm", "supportive", "patient", "empathetic"],
      languageStyle: "gentle, reassuring, uses the person's name often",
    },
  },
  {
    name: "Mia",
    gender: "female",
    tagline: "Energetic and curious — let's explore together",
    personalityConfig: {
      voiceId: "mia-placeholder",
      systemPromptText:
        "You are Mia, an energetic and curious companion. You are enthusiastic about learning new things, ask interesting questions, and bring a sense of adventure to every conversation. You keep the energy positive and engaging.",
      traits: ["energetic", "curious", "enthusiastic", "playful"],
      languageStyle: "lively, asks questions, expresses wonder",
    },
  },
  {
    name: "Luka",
    gender: "male",
    tagline: "Calm and thoughtful — wisdom in every word",
    personalityConfig: {
      voiceId: "luka-placeholder",
      systemPromptText:
        "You are Luka, a calm and thoughtful companion. You take time to reflect before speaking, offer considered perspectives, and create a peaceful atmosphere. You value depth over speed.",
      traits: ["calm", "thoughtful", "wise", "reflective"],
      languageStyle: "measured, uses pauses well, philosophical",
    },
  },
  {
    name: "Ivan",
    gender: "male",
    tagline: "Friendly and humorous — laughter is the best medicine",
    personalityConfig: {
      voiceId: "ivan-placeholder",
      systemPromptText:
        "You are Ivan, a friendly and humorous companion. You bring lightness and laughter to conversations with gentle, age-appropriate humour. You never mock — your humour is warm, self-aware, and always kind.",
      traits: ["friendly", "humorous", "warm", "uplifting"],
      languageStyle: "conversational, uses gentle jokes and wordplay",
    },
  },
];

/**
 * Fictional demo senior for evaluator demonstrations.
 * All data is invented: the person, the contact (Croatian fictional
 * drama-range phone number pattern), medications, and memories are
 * not real. Idempotent — keyed on the display name.
 */
const DEMO_SENIOR = {
  firstName: "Marija",
  lastName: "Horvat",
  displayName: "Marija Horvat (Demo)",
  preferredFormOfAddress: "Baka Marija",
  timezone: "Europe/Zagreb",
  language: "hr" as const,
};

const DEMO_APPOINTMENT_TITLE = "Pregled kod liječnika opće prakse";

async function seedDemoSenior() {
  console.log("Seeding fictional demo senior...");

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.displayName, DEMO_SENIOR.displayName));

  if (existing.length > 0) {
    // Reconcile instead of skipping: keep the demo appointment on TODAY's
    // local date so the tablet Today-list flow always works on demo day.
    const startsAtUtc = computeDemoAppointmentUtc(DEMO_SENIOR.timezone);
    const updated = await db
      .update(appointments)
      .set({ startsAtUtc, isActive: true, updatedAt: new Date() })
      .where(
        and(
          eq(appointments.userId, existing[0].id),
          eq(appointments.title, DEMO_APPOINTMENT_TITLE),
        ),
      )
      .returning({ id: appointments.id });
    if (updated.length === 0) {
      await db.insert(appointments).values({
        userId: existing[0].id,
        title: DEMO_APPOINTMENT_TITLE,
        details: "Redoviti kontrolni pregled (izmišljeni demo termin).",
        location: "Dom zdravlja Centar",
        startsAtUtc,
        reminderMinutesBefore: 60,
        isActive: true,
      });
    }
    console.log(
      `  ✓ ${DEMO_SENIOR.displayName} already exists — demo appointment refreshed to today`,
    );
    return;
  }

  const [ana] = await db
    .select()
    .from(companions)
    .where(eq(companions.name, "Ana"));

  // All demo rows are created atomically: a partial failure rolls back the
  // user row too, so a rerun always starts clean instead of skipping a
  // half-seeded senior.
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        ...DEMO_SENIOR,
        companionId: ana?.id ?? null,
        isActive: true,
      })
      .returning();

    // Placeholder emergency contact — fictional number, never dialable to a
    // real person in the demo (SMS provider is mocked in development).
    await tx.insert(emergencyContacts).values({
      userId: user.id,
      name: "Ivana Horvat (kći — izmišljeni kontakt)",
      phone: "+385000000000",
      relationship: "daughter",
      isPrimary: true,
      isActive: true,
    });

    // Daily medication reminder.
    await tx.insert(reminders).values({
      userId: user.id,
      title: "Lijek za tlak",
      description: "Uzmite tabletu za krvni tlak uz čašu vode.",
      type: "MEDICATION",
      medicationName: "Amlodipin 5 mg (izmišljeni primjer)",
      localTime: "08:30",
      recurrenceDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      isActive: true,
    });

    // Demo appointment on TODAY's Zagreb date (DST-correct) so it always
    // appears in the tablet Today list; see computeDemoAppointmentUtc.
    const startsAtUtc = computeDemoAppointmentUtc(DEMO_SENIOR.timezone);
    await tx.insert(appointments).values({
      userId: user.id,
      title: DEMO_APPOINTMENT_TITLE,
      details: "Redoviti kontrolni pregled (izmišljeni demo termin).",
      location: "Dom zdravlja Centar",
      startsAtUtc,
      reminderMinutesBefore: 60,
      isActive: true,
    });

    // Relationship and preference memories.
    const demoMemories = [
      {
        type: "RELATIONSHIP",
        subject: "Ivana",
        fact: "Kći Ivana živi u Zagrebu i nazove svake nedjelje popodne.",
      },
      {
        type: "RELATIONSHIP",
        subject: "Luka",
        fact: "Unuk Luka ima 8 godina i voli nogomet.",
      },
      {
        type: "PREFERENCE",
        subject: "kava",
        fact: "Najdraža joj je kava s mlijekom, ujutro na balkonu.",
      },
      {
        type: "PREFERENCE",
        subject: "glazba",
        fact: "Voli slušati stare dalmatinske klape.",
      },
    ];
    for (const m of demoMemories) {
      await tx.insert(memories).values({
        userId: user.id,
        type: m.type,
        subject: m.subject,
        fact: m.fact,
        confidence: 0.9,
        sourceType: "admin",
        isActive: true,
      });
    }
  });

  console.log(`  + ${DEMO_SENIOR.displayName} created with demo data`);
  console.log(
    "  (Photos are not seeded — upload legally safe placeholder images via the admin Photos tab.)",
  );
}

async function seed() {
  console.log("Seeding companions...");

  for (const data of COMPANIONS) {
    const existing = await db
      .select()
      .from(companions)
      .where(eq(companions.name, data.name));

    if (existing.length > 0) {
      console.log(`  ✓ ${data.name} already exists — skipping`);
      continue;
    }

    await db.insert(companions).values({
      name: data.name,
      gender: data.gender,
      tagline: data.tagline,
      personalityConfig: data.personalityConfig,
    });
    console.log(`  + ${data.name} created`);
  }

  await seedDemoSenior();

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
