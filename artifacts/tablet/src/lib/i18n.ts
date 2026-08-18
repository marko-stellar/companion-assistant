export type Lang = "hr" | "en";

const strings = {
  hr: {
    goodMorning: "Dobro jutro",
    goodAfternoon: "Dobar dan",
    goodEvening: "Dobra večer",
    goodNight: "Laku noć",
    listening: "Slušam…",
    thinking: "Razmišljam…",
    speaking: "Govorim…",
    dndTitle: "Ne smetaj",
    dndSubtitle: "Tihi sat je aktivan.",
    offlineTitle: "Nema interneta",
    offlineSubtitle: "Provjerite Wi-Fi vezu.",
    todayLabel: "Danas",
    noItemsToday: "Ništa za danas.",
    talkButton: "Razgovaraj",
    stopListening: "Zaustavi",
    reminder: "Podsjetnik",
    appointment: "Termin",
    medTaken: "Uzeto",
    medNotSure: "Nisam siguran",
    medNotTaken: "Nije uzeto",
    setupTitle: "Postavljanje uređaja",
    setupSubtitle: "Unesite kôd koji ste dobili od skrbnika.",
    setupCodePlaceholder: "XXXXXX",
    setupButton: "Aktiviraj",
    setupLoading: "Aktiviram…",
    setupError: "Nevažeći ili istekli kôd. Pokušajte ponovo.",
    connecting: "Spajanje…",
    lastSeen: "Zadnji put viđen",
    // Appointment pre-alert
    reminderSoon: "za",
    reminderMinutes: "minuta",
    // Voice error messages — senior-friendly, non-alarming
    errorMicDenied: "Molim dozvolite pristup mikrofonu u postavkama.",
    errorMicUnavailable: "Mikrofon nije dostupan. Provjerite uređaj.",
    errorTranscriptionEmpty: "Nisam razumio. Pokušajte ponovo.",
    errorLlm: "Trenutno nedostupno. Pokušajte za koji trenutak.",
    errorNetwork: "Nema veze s internetom.",
  },
  en: {
    goodMorning: "Good morning",
    goodAfternoon: "Good afternoon",
    goodEvening: "Good evening",
    goodNight: "Good night",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
    dndTitle: "Do Not Disturb",
    dndSubtitle: "Quiet time is active.",
    offlineTitle: "No internet",
    offlineSubtitle: "Please check your Wi-Fi.",
    todayLabel: "Today",
    noItemsToday: "Nothing scheduled for today.",
    talkButton: "Talk to me",
    stopListening: "Stop",
    reminder: "Reminder",
    appointment: "Appointment",
    medTaken: "Taken",
    medNotSure: "Not sure",
    medNotTaken: "Not taken",
    setupTitle: "Device Setup",
    setupSubtitle: "Enter the code your caregiver gave you.",
    setupCodePlaceholder: "XXXXXX",
    setupButton: "Activate",
    setupLoading: "Activating…",
    setupError: "Invalid or expired code. Please try again.",
    connecting: "Connecting…",
    lastSeen: "Last seen",
    // Appointment pre-alert
    reminderSoon: "in",
    reminderMinutes: "minutes",
    // Voice error messages — senior-friendly, non-alarming
    errorMicDenied: "Please allow microphone access in your settings.",
    errorMicUnavailable: "Microphone not available. Please check your device.",
    errorTranscriptionEmpty: "Didn't catch that. Please try again.",
    errorLlm: "Unavailable right now. Please try again in a moment.",
    errorNetwork: "No internet connection.",
  },
} as const;

export type Strings = {
  readonly [K in keyof typeof strings.en]: string;
};

export function getStrings(lang: Lang | string | undefined): Strings {
  if (lang === "hr") return strings.hr;
  return strings.en;
}

export function getGreeting(lang: Lang | string | undefined, name: string): string {
  const t = getStrings(lang);
  const hour = new Date().getHours();
  let base: string;
  if (hour >= 5 && hour < 12) base = t.goodMorning;
  else if (hour >= 12 && hour < 17) base = t.goodAfternoon;
  else if (hour >= 17 && hour < 22) base = t.goodEvening;
  else base = t.goodNight;
  return `${base}, ${name}.`;
}
