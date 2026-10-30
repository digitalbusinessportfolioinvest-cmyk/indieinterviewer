import { db } from "./db";
import { getAnswers, getMessages, getQuestions, type Interview } from "./interview";

export type FounderState = {
  founderName: string;
  status: string;
  messages: { id: number; role: string; kind: string; content: string }[];
  atClosing: boolean;
  openQuestion: { id: number; layer: string } | null;
  progress: { answered: number; total: number; layer: string };
  review: { questionId: number; layer: string; section: string | null; prompt: string; text: string; skipped: boolean }[];
  uploads: { id: number; filename: string; size: number }[];
};

export async function founderState(i: Interview): Promise<FounderState> {
  const [questions, messages, answers, uploads] = await Promise.all([
    getQuestions(i.questionnaire_id),
    getMessages(i.id),
    getAnswers(i.id),
    db()`SELECT id, filename, size_bytes FROM uploads WHERE interview_id = ${i.id} ORDER BY id`,
  ]);
  const last = questions[questions.length - 1];
  const atClosing = Boolean(last) && i.current_position > last.position;
  const open = questions.find((q) => q.position === i.current_position) ?? null;
  const answeredCount = questions.filter((q) => q.position < i.current_position).length;
  return {
    founderName: i.founder_name,
    status: i.status,
    messages: messages.map((m) => ({ id: m.id, role: m.role, kind: m.kind, content: m.content })),
    atClosing,
    openQuestion: open ? { id: open.id, layer: open.layer } : null,
    progress: { answered: answeredCount, total: questions.length, layer: open?.layer ?? "done" },
    review: atClosing
      ? questions.map((q) => {
          const a = answers.find((x) => x.question_id === q.id);
          return { questionId: q.id, layer: q.layer, section: q.section, prompt: q.prompt, text: a?.text ?? "", skipped: a?.skipped ?? false };
        })
      : [],
    uploads: (uploads as unknown as { id: number; filename: string; size_bytes: number }[]).map((u) => ({ id: u.id, filename: u.filename, size: u.size_bytes })),
  };
}
