export const newsletters = [
  {
    slug: "indie-hustle",
    name: "Indie Hustle",
    publisher: "Founders Courier",
    website: "https://indiehustle.co",
  },
];

export const questionnaires = [
  {
    newsletter: "indie-hustle",
    version: "v2",
    welcome:
      "Welcome, and thanks for taking part in Indie Hustle. You'll receive the questions one at a time, and at the end you'll be able to review and edit all your answers. You can pause the interview at any time: everything you write is saved as you go, and you can pick up where you left off. If the system detects that an answer is short or incomplete, it may ask you to clarify or expand on it.",
    deepDiveIntro:
      "That's the end of the public interview. The next questions are for the newsletter's paid subscribers, where founders usually share (voluntarily) more complete information. This part is optional: you can skip any or all of the questions by replying \"skip\". That said, I really appreciate it when founders do answer, because it helps me give my most loyal readers more detailed information. When a founder doesn't answer these questions, I write an analysis instead, which is also sent to them for review before publication.",
    closing:
      "Thank you, that's the whole interview. If you'd like to add photos, logos or any other visual elements, you can upload them right here. Once you click Finish, if you answered the Deep Dive questions, you'll receive a copy of your interview for your approval in about 24 hours. If you skipped them, please allow us three or four days to include the analysis. Once you approve it, we'll send you the estimated publication date.",
    rightsClause:
      "By clicking Approve, you confirm that this interview reflects your answers and you assign to Founders Courier, publisher of Indie Hustle, all rights in this interview (including authorization to use your name, photo, logo and any images provided together with the interview). Founders Courier may publish, edit, adapt and reproduce it, in whole or in part, in its newsletter, website, social media and any other format, including compilations, reports and books, provided that it respects the integrity of the original message and does not manipulate or misrepresent it. You may republish your interview anywhere, as long as you credit Indie Hustle as the original source.",
    questions: [
      { layer: "public", prompt: "Who are you and what are you building?", helper: "Brief and direct. Your name, what you do, one line about the business. No life story." },
      { layer: "public", prompt: "What was the original problem, and what made you confident it was worth solving?", helper: "We want to hear about validation, not just inspiration. What signal told you this was real?" },
      { layer: "public", prompt: "What almost killed the business in the early days?", helper: "The first real friction. The moment things got uncomfortable. Be specific." },
      { layer: "public", prompt: "How did you get your first 100 customers?", helper: "Channel + action + result. Not theory, what you actually did." },
      { layer: "public", prompt: "What tools or systems run your business today?", helper: "Tech stack, AI tools, automations, platforms. What would break if you lost access to them?" },
      { layer: "public", prompt: "How are you using AI in your workflow right now?", helper: "Be honest. If you're barely using it, say so. If it's core to your operations, walk us through it." },
      { layer: "public", prompt: "At what point did this stop feeling fragile?", helper: "Was it an MRR number? A specific milestone? When did you start sleeping better?" },
      { layer: "public", prompt: "Current Snapshot", helper: "Give us the numbers:\n- Current MRR\n- Growth rate (last 3 months)\n- Business model (subscription / ads / product sales / hybrid)\n- Team size" },
      { layer: "public", prompt: "Since launch, what marketing strategies or channels have moved the needle most?", helper: "What's working now? Any channel that surprised you? Anything that looked promising but flopped?" },
      { layer: "public", prompt: "Where can readers learn more about you and your business?", helper: "Drop your links: website, X, newsletter, YouTube, whatever matters." },

      { layer: "deep", section: "Inflection Points", prompt: "What single decision changed the growth curve?" },
      { layer: "deep", section: "Inflection Points", prompt: "What metric told you something real was happening, beyond vanity numbers?" },
      { layer: "deep", section: "Inflection Points", prompt: "When did growth start feeling predictable instead of lucky?" },
      { layer: "deep", section: "Acquisition System", prompt: "Walk us through how customers actually find you today.", helper: "- Main acquisition channel and why it works for you\n- Rough % breakdown by channel\n- CAC estimate (even ballpark helps)\n- Conversion rate: visitor to customer\n- A channel that looked promising but didn't pan out" },
      { layer: "deep", section: "Unit Economics", prompt: "The numbers that actually matter. Share what you're comfortable with.", helper: "- ARPU (average revenue per user)\n- LTV (lifetime value)\n- Churn rate\n- Margin\n- How long did it take to reach profitability?" },
      { layer: "deep", section: "How It Actually Runs", prompt: "How many hours a week does this take you right now?" },
      { layer: "deep", section: "How It Actually Runs", prompt: "What's systemized vs. what still needs your hands on it?" },
      { layer: "deep", section: "How It Actually Runs", prompt: "If you disappeared for 30 days, what would break first?" },
      { layer: "deep", section: "AI & Tools Deep Dive", prompt: "What AI tool has had the biggest ROI impact on your business?" },
      { layer: "deep", section: "AI & Tools Deep Dive", prompt: "Is there a workflow you've automated with AI that you'd never go back to doing manually?" },
      { layer: "deep", section: "AI & Tools Deep Dive", prompt: "What's one AI tool or trend you're watching closely for the next 6 months?" },
      { layer: "deep", section: "Risk Reassessment", prompt: "What risk did you overestimate early on?" },
      { layer: "deep", section: "Risk Reassessment", prompt: "What risk do you see clearly now that you didn't before?" },
      { layer: "deep", section: "Risk Reassessment", prompt: "What could realistically hurt your growth in the next 12 months?" },
      { layer: "deep", section: "Strategic Outlook", prompt: "Is this a lifestyle business or are you building to scale?" },
      { layer: "deep", section: "Strategic Outlook", prompt: "Does this have exit potential? Have you thought about it?" },
      { layer: "deep", section: "Strategic Outlook", prompt: "What would double the valuation?" },

      { layer: "closing", prompt: "Give one tactical move someone building today could implement this week.", helper: "No theory, something they can start on Monday." },
    ],
  },
];
