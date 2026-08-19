# Croatian Voice Benchmark (30 utterances)

Purpose: repeatable acceptance evidence that the speech pipeline (STT → LLM → TTS)
handles Croatian senior speech acceptably before an evaluator demo. The benchmark
tests the pipeline through the normal `/api/tablet/converse` voice-turn path,
so it exercises exactly what the tablet uses. The speech provider stays behind the
`SpeechProvider` interface (`artifacts/api-server/src/providers/speech.provider.ts`)
— swapping providers does not change this benchmark.

## How to run

1. Ensure `ELEVENLABS_API_KEY` is set and the API server is running.
2. Sign in a demo tablet (see `docs/demo-script.md`).
3. For each utterance below, speak it into the tablet (or play a recording at
   normal room volume ~50 cm from the microphone).
4. Record in the table: the transcription the admin transcript view shows,
   and Accept = YES when the transcript preserves the meaning (exact wording
   not required; medication names and personal names must be recognisably correct).

Acceptance bar: ≥ 26/30 accepted overall, and no crash or stuck state on any
utterance. Failures are logged as defects with severity in
`docs/evaluator-acceptance.md`.

## Utterance set

### A. Standard speech (1–6)
| # | Utterance | Transcription | Accept |
|---|---|---|---|
| 1 | Dobro jutro, kako si danas? | | |
| 2 | Koliko je sati? | | |
| 3 | Što imam danas u rasporedu? | | |
| 4 | Kada mi dolazi liječnik? | | |
| 5 | Podsjeti me da nazovem kćer. | | |
| 6 | Hvala ti, to je sve za sada. | | |

### B. Informal / colloquial speech (7–11)
| # | Utterance | Transcription | Accept |
|---|---|---|---|
| 7 | Ajde mi reci kakvo će vrijeme bit. | | |
| 8 | Ma ništa, samo malo pričam s tobom. | | |
| 9 | Di mi je ono... kad ono imam doktora? | | |
| 10 | Kaj ima novoga danas? | | |
| 11 | Ča si mi tila reć jutros? | | |

### C. Slower / hesitant speech (12–16)
Speak these with pauses of 1–2 seconds between the marked segments.
| # | Utterance | Transcription | Accept |
|---|---|---|---|
| 12 | Htjela bih... znati... što imam sutra. | | |
| 13 | Molim te... ponovi mi... ono zadnje. | | |
| 14 | Ja bih... možda... malo glazbe. | | |
| 15 | Ne sjećam se... jesam li... popila lijek. | | |
| 16 | Čekaj... da razmislim... da, to je to. | | |

### D. Background noise (17–20)
Play radio or TV at conversational volume in the same room.
| # | Utterance | Transcription | Accept |
|---|---|---|---|
| 17 | Kada imam pregled kod doktora? | | |
| 18 | Podsjeti me na lijek navečer. | | |
| 19 | Tko me zvao jučer? | | |
| 20 | Pokaži mi sliku unuka. | | |

### E. Names and places (21–24)
| # | Utterance | Transcription | Accept |
|---|---|---|---|
| 21 | Ivana dolazi u nedjelju iz Zagreba. | | |
| 22 | Luka igra nogomet u Splitu. | | |
| 23 | Idem sutra u Dom zdravlja Centar. | | |
| 24 | Sjećaš li se gospođe Katice iz Osijeka? | | |

### F. Medication names (25–27)
| # | Utterance | Transcription | Accept |
|---|---|---|---|
| 25 | Jesam li popila Amlodipin jutros? | | |
| 26 | Podsjeti me na Andol navečer. | | |
| 27 | Doktor mi je promijenio Concor na pola tablete. | | |

### G. Corrections and repairs (28–30)
| # | Utterance | Transcription | Accept |
|---|---|---|---|
| 28 | U utorak... ne, čekaj, u srijedu imam frizera. | | |
| 29 | Zovi Ivanu... mislim, prvo mi reci koliko je sati. | | |
| 30 | To nije točno, moja kći se zove Ivana, a ne Ana. | | |

## Results log

| Date | Provider | Accepted / 30 | Notes |
|---|---|---|---|
| | | | |
