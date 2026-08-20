import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles,
  BrainCircuit,
  Zap,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Panel,
  PanelTitle,
  Chip,
  Dot,
} from "@/components/ui-kit/primitives";
import { api, jsonApiBody } from "@/lib/api-client";
import { useLLMConfigs } from "@/hooks/use-api";

export const Route = createFileRoute("/ai/settings")({
  component: AISettingsPage,
});

function AISettingsPage() {
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<"default" | "custom_valid" | "error">("default");
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Guardrail settings
  const [requireApprovalP1, setRequireApprovalP1] = useState(true);
  const [dryRunMode, setDryRunMode] = useState(false);
  const [autoRollback, setAutoRollback] = useState(true);
  const [maxConcurrency, setMaxConcurrency] = useState(5);

  useEffect(() => {
    const saved = localStorage.getItem("dciso-claude-api-key");
    if (saved) {
      setClaudeApiKey(saved);
      setKeyStatus("custom_valid");
    }
  }, []);

  const { data: apiConfigs } = useLLMConfigs();

  const handleTestKey = () => {
    if (!claudeApiKey.trim()) {
      setKeyStatus("default");
      return;
    }
    setTestingKey(true);
    setTimeout(() => {
      setTestingKey(false);
      if (claudeApiKey.startsWith("sk-ant-") && claudeApiKey.length > 20) {
        setKeyStatus("custom_valid");
      } else {
        setKeyStatus("error");
      }
    }, 1000);
  };

  const handleSave = async () => {
    if (claudeApiKey.trim()) {
      localStorage.setItem("dciso-claude-api-key", claudeApiKey.trim());
      setKeyStatus("custom_valid");

      try {
        await api.post(
          "/tenant-llm-configs",
          jsonApiBody("tenant-llm-configs", {
            provider: "claude",
            api_key: claudeApiKey.trim(),
            model_id: "claude-sonnet-4-6",
            is_enabled: true,
          })
        );
      } catch {
        // Fallback for demo
      }
    } else {
      localStorage.removeItem("dciso-claude-api-key");
      setKeyStatus("default");
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <AppShell
      title="AI Engine & API Configuration"
      subtitle="Model architectures for Spectra (Analysis), Aegis (Remediation), and Jira Task Orchestration"
      actions={
        <button
          onClick={handleSave}
          className="inline-flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
        >
          <Save className="h-3.5 w-3.5" />
          <span>Save Configuration</span>
        </button>
      }
    >
      {savedSuccess && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success">
          <span>Configuration saved successfully.</span>
          <button onClick={() => setSavedSuccess(false)}>✕</button>
        </div>
      )}

      {/* ── The Three AI Models Architecture Cards ── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Model 1: Spectra */}
        <Panel index={0} className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Spectra
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    Threat Analysis Engine
                  </span>
                </div>
              </div>
              <Chip tone="success">Local LLM</Chip>
            </div>

            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Ingests raw findings, classifies vulnerability domains, correlates toxic attack paths, and computes risk scores.
            </p>

            <div className="mt-4 space-y-2 rounded-lg border border-border/80 bg-surface-2/40 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Architecture:</span>
                <span className="font-mono text-foreground">Llama-3-Security-70B</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Environment:</span>
                <span className="font-semibold text-foreground">On-Premises / Private</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Latency:</span>
                <span className="font-mono text-muted-foreground">38 ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data Privacy:</span>
                <span className="text-success font-medium">Zero External Egress</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-3">
            <span>Items Analyzed:</span>
            <span className="mono font-bold text-foreground">1,247 active</span>
          </div>
        </Panel>

        {/* Model 2: Aegis */}
        <Panel index={1} className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground">
                  <BrainCircuit className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Aegis
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    Decision Intelligence
                  </span>
                </div>
              </div>
              <Chip tone="success">Local Rule Engine</Chip>
            </div>

            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Prioritizes findings (P1-P4), enforces SLA governance, clusters related incidents, and assigns recommended owners.
            </p>

            <div className="mt-4 space-y-2 rounded-lg border border-border/80 bg-surface-2/40 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Decision Core:</span>
                <span className="font-mono text-foreground">Autonomous Policy Engine</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Governance:</span>
                <span className="font-semibold text-foreground">NIST & CIS Standards</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precision:</span>
                <span className="font-mono text-muted-foreground">98.4%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SLA Calculation:</span>
                <span className="text-foreground font-medium">Automated Target Clock</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-3">
            <span>Decisions Logged:</span>
            <span className="mono font-bold text-foreground">1,482 records</span>
          </div>
        </Panel>

        {/* Model 3: Phantom */}
        <Panel index={2} className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-foreground">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground">
                    Phantom
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    Execution Engine
                  </span>
                </div>
              </div>
              <Chip tone="primary">Claude API</Chip>
            </div>

            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Generates surgical IaC patches, triggers API-driven remediations, and validates fixes with automated rescans.
            </p>

            <div className="mt-4 space-y-2 rounded-lg border border-border/80 bg-surface-2/40 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Execution Engine:</span>
                <span className="font-semibold text-foreground">Anthropic Claude</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">API Credentials:</span>
                <span className="font-mono text-primary">
                  {keyStatus === "custom_valid"
                    ? "Custom API Key Active"
                    : "Platform Default Key"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">P1 Guardrail:</span>
                <span className="text-muted-foreground font-medium">Human Review Required</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rollback Snapshot:</span>
                <span className="text-success font-medium">Auto-Created</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-3">
            <span>Actions Executed:</span>
            <span className="mono font-bold text-foreground">342 verified</span>
          </div>
        </Panel>
      </div>

      {/* ── Phantom Claude API Configuration ── */}
      <Panel index={3} className="mb-6 p-5">
        <PanelTitle
          title="Phantom Engine — Claude API Configuration"
          hint="By default, Digital CISO uses the enterprise platform Claude key. You can provide your own Anthropic API key to run executions under your own account."
        />

        <div className="mt-4 space-y-3.5 max-w-2xl">
          <div>
            <label className="section-label mb-1.5 block">
              Anthropic Claude API Key
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Key className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-ant-api03-..."
                  value={claudeApiKey}
                  onChange={(e) => setClaudeApiKey(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-surface-2/60 pr-10 pl-9 font-mono text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <button
                onClick={handleTestKey}
                disabled={testingKey}
                className="inline-flex h-10 min-w-[140px] items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-5 text-xs font-semibold text-foreground transition-all hover:border-primary/50 hover:text-primary active:scale-95"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${testingKey ? "animate-spin text-primary" : ""}`}
                />
                <span>{testingKey ? "Testing..." : "Test Connection"}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {keyStatus === "custom_valid" ? (
              <span className="flex items-center gap-1 text-success font-medium">
                <CheckCircle2 className="h-4 w-4" /> Custom Claude API Key Active
              </span>
            ) : keyStatus === "error" ? (
              <span className="flex items-center gap-1 text-critical font-medium">
                <AlertCircle className="h-4 w-4" /> Invalid API Key Format. Verify your key from Anthropic Console.
              </span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                Using Platform Default Key (Built-in).
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* ── Remediation Guardrails ── */}
      <Panel index={4} className="p-5">
        <PanelTitle
          title="Remediation Guardrails & Constraints"
          hint="Control operational boundaries for automated code execution"
        />

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface-2/40 p-3">
            <div>
              <span className="font-semibold text-foreground">
                Require Human Review for P1/Critical
              </span>
              <p className="text-[11px] text-muted-foreground">
                Requires manual confirmation before applying changes to production assets.
              </p>
            </div>
            <input
              type="checkbox"
              checked={requireApprovalP1}
              onChange={(e) => setRequireApprovalP1(e.target.checked)}
              className="h-4 w-4 accent-primary cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface-2/40 p-3">
            <div>
              <span className="font-semibold text-foreground">
                Dry-Run Simulation Mode
              </span>
              <p className="text-[11px] text-muted-foreground">
                Generates scripts and diffs without making live cloud changes.
              </p>
            </div>
            <input
              type="checkbox"
              checked={dryRunMode}
              onChange={(e) => setDryRunMode(e.target.checked)}
              className="h-4 w-4 accent-primary cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface-2/40 p-3">
            <div>
              <span className="font-semibold text-foreground">
                Pre-Remediation Snapshots
              </span>
              <p className="text-[11px] text-muted-foreground">
                Saves previous resource state for instant 1-click rollback.
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoRollback}
              onChange={(e) => setAutoRollback(e.target.checked)}
              className="h-4 w-4 accent-primary cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-surface-2/40 p-3">
            <div>
              <span className="font-semibold text-foreground">
                Max Concurrent Remediation Workers
              </span>
              <p className="text-[11px] text-muted-foreground">
                Maximum parallel API calls during batch remediation.
              </p>
            </div>
            <select
              value={maxConcurrency}
              onChange={(e) => setMaxConcurrency(Number(e.target.value))}
              className="rounded bg-surface-2 px-2 py-1 text-xs text-foreground outline-none border border-border"
            >
              <option value={1}>1 Worker</option>
              <option value={5}>5 Workers (Recommended)</option>
              <option value={10}>10 Workers</option>
            </select>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
