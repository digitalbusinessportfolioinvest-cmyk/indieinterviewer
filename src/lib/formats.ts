// Editorial format of each publication's edition intro.
export type IntroFormat = {
  /** Labels of the three intro bullets, in order. */
  bullets: [string, string, string];
  /** What each bullet should say (guidance for the model). */
  bulletGuide: [string, string, string];
  snapshot: boolean;
  /** One teaser line about the Deep Dive, starting "Besides, in the Deep Dive learn". */
  deepTeaser: boolean;
};

const FORMATS: Record<string, IntroFormat> = {
  "indie-hustle": {
    bullets: ["Why it matters", "Worth your time if", "The thing to steal"],
    bulletGuide: [
      "the broader lesson this story proves for builders",
      "the kind of reader who will get the most out of it",
      "one concrete, copyable practice from this founder",
    ],
    snapshot: false,
    deepTeaser: false,
  },
  "founders-struggles": {
    bullets: ["The struggle", "The bet", "What to watch"],
    bulletGuide: [
      "the main problem the founder is facing right now",
      "what the founder is betting on to get through it",
      "the open question only time will answer, useful for a follow-up later",
    ],
    snapshot: true,
    deepTeaser: true,
  },
};

export function introFormat(slug: string): IntroFormat {
  return FORMATS[slug] ?? FORMATS["indie-hustle"];
}
