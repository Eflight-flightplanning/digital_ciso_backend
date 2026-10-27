import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
import { CrossIcon, InfoIcon, TickIcon } from "./icons";
import { fmtDate } from "./status";
import { useSession } from "./context";
import type { ConnField, ConnSecret, ConnectionsView } from "./types";

type Target = "idcs" | "fusion";

const secretHint = (f: ConnSecret) =>
  f.source === "provider" ? "Saved (hidden). Type to replace" : f.source === "env" ? "Set in the server .env (hidden). Type to override" : "";

function Source({ f }: { f: ConnField | ConnSecret }) {
  const label = f.source === "provider" ? "Saved on provider" : f.source === "env" ? "From server .env" : "Not set";
  return <span className={`badge ${f.source ? "" : "opacity-70"}`}>{label}</span>;
}

function Field({
  id, label, hint, value, onChange, field, type = "text", placeholder, disabled,
}: {
  id: string; label: string; hint?: string; value: string; onChange: (v: string) => void;
  field: ConnField | ConnSecret; type?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <Source f={field} />
      </div>
      <input
        id={id}
        className="field"
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={type === "password" ? "new-password" : "off"}
        spellCheck={false}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-oc-ink-soft">{hint}</p>}
    </div>
  );
}

function TestResult({ result }: { result?: { ok: boolean; message: string } }) {
  if (!result) return null;
  return (
    <p className={`flex items-start gap-1.5 text-sm ${result.ok ? "text-[var(--chip-pass-ink)]" : "text-[var(--chip-fail-ink)]"}`} role="status">
      {result.ok ? <TickIcon className="mt-0.5 shrink-0" /> : <CrossIcon className="mt-0.5 shrink-0" />}
      {result.message}
    </p>
  );
}

export default function Connections() {
  const { perms } = useSession();
  const qc = useQueryClient();
  const conn = useQuery({ queryKey: ["oracle-cis", "connections"], queryFn: api.connections });
  const [form, setForm] = useState({
    idcs_base: "", idcs_client_id: "", idcs_client_secret: "",
    fusion_pod_url: "", fusion_username: "", fusion_password: "",
  });
  const [tests, setTests] = useState<Partial<Record<Target, { ok: boolean; message: string }>>>({});
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fill = (d: ConnectionsView) =>
    setForm({
      idcs_base: d.idcs.base_url.value, idcs_client_id: d.idcs.client_id.value, idcs_client_secret: "",
      fusion_pod_url: d.fusion.pod_url.value, fusion_username: d.fusion.username.value, fusion_password: "",
    });
  useEffect(() => {
    if (conn.data) fill(conn.data);
  }, [conn.data]);

  const save = useMutation({
    mutationFn: (body: Record<string, string | boolean>) => api.saveConnections(body),
    onSuccess: (d) => {
      qc.setQueryData(["oracle-cis", "connections"], d);
      qc.invalidateQueries({ queryKey: ["oracle-cis", "health"] });
      setTests({});
      fill(d);
    },
  });
  const test = useMutation({
    mutationFn: (target: Target) => api.testConnection(target),
    onSuccess: (r, target) => setTests((t) => ({ ...t, [target]: r })),
  });

  const d = conn.data;
  const readOnly = !perms.manage_providers;
  const submit = (e: React.FormEvent, keys: (keyof typeof form)[]) => {
    e.preventDefault();
    save.mutate(Object.fromEntries(keys.map((k) => [k, form[k]])));
  };

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 py-5">
      <div>
        <h1 className="text-xl">Connection</h1>
        <p className="mt-1 text-sm text-oc-ink-soft">
          Where the assessment reads from. The details are saved, encrypted, on your organisation's Oracle SaaS provider (Providers page), so the
          Prowler Oracle SaaS scan and this assessment share one connection. Secrets are never shown again; leave a secret blank to keep the saved one.
        </p>
        {d?.provider && (
          <p className="mt-1 text-xs text-oc-ink-soft">
            Provider <span className="font-semibold text-oc-ink">{d.provider.alias}</span> ({d.provider.uid})
            {d.updated_at ? ` · last changed ${fmtDate(d.updated_at)}` : ""}.
          </p>
        )}
        {d && !d.provider && <p className="mt-1 text-xs text-oc-ink-soft">No Oracle SaaS provider yet: saving creates one.</p>}
      </div>

      {conn.error && <p className="font-semibold text-oc-red">{(conn.error as Error).message}</p>}
      {d && d.unreadable_secrets && (
        <p className="flex gap-2 rounded-md border border-[var(--chip-fail-line)] bg-[var(--chip-fail-bg)] p-3 text-sm text-[var(--chip-fail-ink)]">
          <InfoIcon className="mt-0.5 shrink-0" />
          The provider's saved secret can no longer be read (the platform's encryption key changed). Enter the details again.
        </p>
      )}
      {readOnly && <p className="text-sm text-oc-ink-soft">Changing the connection needs the manage providers permission.</p>}

      {d && (
        <>
          <form className="card flex flex-col gap-4 p-4" onSubmit={(e) => submit(e, ["idcs_base", "idcs_client_id", "idcs_client_secret"])}>
            <div>
              <h2 className="text-sm">Identity domain (IDCS)</h2>
              <p className="text-xs text-oc-ink-soft">Used by the identity checks (1.1–1.14, 2.1, 2.2, 3.1). A confidential app with the client-credentials grant and read-only admin roles.</p>
            </div>
            <Field id="idcs_base" label="Identity domain URL" field={d.idcs.base_url} value={form.idcs_base} onChange={set("idcs_base")}
              placeholder="https://idcs-xxxxxxxx.identity.oraclecloud.com" disabled={readOnly} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="idcs_client_id" label="Client ID" field={d.idcs.client_id} value={form.idcs_client_id} onChange={set("idcs_client_id")} disabled={readOnly} />
              <Field id="idcs_client_secret" label="Client secret" type="password" field={d.idcs.client_secret} value={form.idcs_client_secret}
                onChange={set("idcs_client_secret")} placeholder={secretHint(d.idcs.client_secret)} disabled={readOnly} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!readOnly && <button type="submit" className="btn-primary" disabled={save.isPending}>Save</button>}
              <button type="button" className="btn-outline" disabled={test.isPending} onClick={() => test.mutate("idcs")}>
                {test.isPending && test.variables === "idcs" ? "Testing..." : "Test connection"}
              </button>
              {!readOnly && d.idcs.client_secret.source === "provider" && (
                <button type="button" className="text-sm font-medium text-oc-ink-soft hover:text-oc-ink" onClick={() => save.mutate({ clear_idcs_client_secret: true })}>
                  Remove saved secret
                </button>
              )}
            </div>
            <TestResult result={tests.idcs} />
          </form>

          <form className="card flex flex-col gap-4 p-4" onSubmit={(e) => submit(e, ["fusion_pod_url", "fusion_username", "fusion_password"])}>
            <div>
              <h2 className="text-sm">Fusion pod (HCM)</h2>
              <p className="text-xs text-oc-ink-soft">Used for dormant accounts (Inactive Users Report), IT superuser roles (4.3), ghost employees (5.3.7) and remediation. Basic Auth with a user that can run ESS jobs and read user accounts.</p>
            </div>
            <Field id="fusion_pod_url" label="Pod URL" field={d.fusion.pod_url} value={form.fusion_pod_url} onChange={set("fusion_pod_url")}
              placeholder="https://fa-xxxx.oraclecloud.com" disabled={readOnly} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="fusion_username" label="Username" field={d.fusion.username} value={form.fusion_username} onChange={set("fusion_username")} disabled={readOnly} />
              <Field id="fusion_password" label="Password" type="password" field={d.fusion.password} value={form.fusion_password}
                onChange={set("fusion_password")} placeholder={secretHint(d.fusion.password)} disabled={readOnly} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!readOnly && <button type="submit" className="btn-primary" disabled={save.isPending}>Save</button>}
              <button type="button" className="btn-outline" disabled={test.isPending} onClick={() => test.mutate("fusion")}>
                {test.isPending && test.variables === "fusion" ? "Testing..." : "Test connection"}
              </button>
              {!readOnly && d.fusion.password.source === "provider" && (
                <button type="button" className="text-sm font-medium text-oc-ink-soft hover:text-oc-ink" onClick={() => save.mutate({ clear_fusion_password: true })}>
                  Remove saved password
                </button>
              )}
            </div>
            <TestResult result={tests.fusion} />
          </form>

          {save.error && <p className="text-sm font-semibold text-oc-red" role="alert">{(save.error as Error).message}</p>}
          {save.isSuccess && !save.isPending && <p className="text-sm text-[var(--chip-pass-ink)]" role="status">Saved. The next assessment run uses these details.</p>}
        </>
      )}
    </div>
  );
}
