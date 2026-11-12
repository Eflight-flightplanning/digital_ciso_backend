/**
 * Spectra AI inside the Oracle SaaS dashboard. Every question is sent with scope "oracle_saas", so the
 * backend answers only from Oracle Fusion SaaS findings, identity telemetry and the latest CIS assessment.
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAIAdvisorQuery } from "@/hooks/use-api";

interface Msg {
  role: "user" | "assistant";
  content: string;
  confidence?: number;
  error?: boolean;
}

const STARTERS = [
  "Summarise our CIS Oracle SaaS posture and what to fix first",
  "Which failing CIS controls are high severity?",
  "Explain the dormant account findings and the risk",
  "How do we remediate the segregation-of-duties conflicts?",
];

function errorText(err: unknown): string {
  const e = err as { status?: number; message?: string } | null;
  if (e?.status === 401 || e?.status === 403) return "You don't have access to Spectra AI. Ask an administrator.";
  return "Spectra could not answer right now. Try again in a moment.";
}

export default function Spectra() {
  const advisor = useAIAdvisorQuery();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, advisor.isPending]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || advisor.isPending) return;
    // History: real turns only (never error placeholders), so follow-ups resolve correctly.
    const history = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    try {
      const res = (await advisor.mutateAsync({ question: q, history, scope: "oracle_saas" })) as Record<string, unknown>;
      setMessages((m) => [
        ...m,
        { role: "assistant", content: String(res.answer ?? ""), confidence: typeof res.confidence === "number" ? res.confidence : undefined },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: errorText(err), error: true }]);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <div className="rounded-md border border-oc-line bg-oc-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-oc-ink">Spectra AI for Oracle SaaS</h2>
            <p className="text-sm text-oc-ink-soft">
              Answers only from your Oracle Fusion SaaS data: the latest CIS assessment, scan findings and identity risks.
              Usernames and e-mail addresses are masked before they reach the model.
            </p>
          </div>
          {messages.length > 0 && (
            <button type="button" className="btn-outline btn-small" onClick={() => setMessages([])} disabled={advisor.isPending}>
              New conversation
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-[320px] flex-col gap-3 rounded-md border border-oc-line bg-oc-card p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-oc-ink-soft">Try one of these, or ask your own question:</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  className="rounded-md border border-oc-line px-3 py-1.5 text-left text-sm text-oc-ink hover:bg-oc-bg-alt"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-md bg-oc-bg-alt px-3 py-2 text-sm text-oc-ink">
              {m.content}
            </div>
          ) : (
            <div
              key={i}
              className={`max-w-full rounded-md border px-3 py-2 ${
                m.error ? "border-[var(--chip-fail-line)] bg-[var(--chip-fail-bg)] text-[var(--chip-fail-ink)]" : "border-oc-line"
              }`}
            >
              <div className="ocis-md text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
              {m.confidence !== undefined && m.confidence === 0 && (
                <p className="mt-1 text-xs text-oc-ink-soft">Data-only reply: the language model was not reachable.</p>
              )}
            </div>
          ),
        )}

        {advisor.isPending && <div className="text-sm text-oc-ink-soft">Spectra is reading your Oracle SaaS data…</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex items-end gap-2">
        <label htmlFor="ocis-spectra-q" className="sr-only">
          Ask Spectra about Oracle SaaS
        </label>
        <textarea
          id="ocis-spectra-q"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          maxLength={1000}
          placeholder="Ask about CIS controls, dormant accounts, SoD conflicts, remediation…"
          className="min-h-[44px] flex-1 resize-y rounded-md border border-oc-line bg-oc-card px-3 py-2 text-sm text-oc-ink placeholder:text-oc-ink-soft"
        />
        <button type="submit" className="btn-primary" disabled={!input.trim() || advisor.isPending}>
          Ask
        </button>
      </form>
    </div>
  );
}
