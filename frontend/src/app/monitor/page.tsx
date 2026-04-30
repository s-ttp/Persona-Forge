"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Activity, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp, ArrowRight, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  queued:    { icon: <Clock className="w-4 h-4" />,         color: "text-yellow-400",             label: "Queued"    },
  running:   { icon: <Activity className="w-4 h-4" />,      color: "text-blue-400 animate-pulse",  label: "Running"   },
  completed: { icon: <CheckCircle2 className="w-4 h-4" />,  color: "text-emerald-400",             label: "Completed" },
  failed:    { icon: <AlertCircle className="w-4 h-4" />,   color: "text-red-400",                 label: "Failed"    },
};

interface Turn { question: string; answer: string; has_reasoning: boolean; }
interface Interview { id: string; persona_id: string; status: string; interviewer_model: string; respondent_model: string; turn_count: number; }

function MonitorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("project_id");

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, Turn[]>>({});
  const [isRequeuing, setIsRequeuing] = useState(false);

  const completedCount = interviews.filter(i => i.status === "completed").length;
  const failedCount = interviews.filter(i => i.status === "failed").length;
  const allDone = interviews.length > 0 && (completedCount + failedCount) === interviews.length;
  const progress = interviews.length > 0 ? Math.round((completedCount / interviews.length) * 100) : 0;

  // Auto-redirect to most recent project when no project_id in URL
  useEffect(() => {
    if (projectId) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch("/api/projects", { headers: { "Authorization": `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((projects: { id: string; created_at: string }[]) => {
        if (!projects.length) return;
        const sorted = [...projects].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        router.replace(`/monitor?project_id=${sorted[0].id}`);
      })
      .catch(() => {});
  }, [projectId, router]);

  useEffect(() => {
    if (!projectId) return;

    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/interviews/status/${projectId}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) setInterviews(await res.json());
      } catch (_) {}
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [projectId]);

  const stuckCount = interviews.filter(i => i.status === "queued" || i.status === "running" || i.status === "failed").length;

  const requeueStuck = async () => {
    if (!projectId) return;
    setIsRequeuing(true);
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/interviews/requeue/${projectId}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
    } catch (_) {}
    finally { setIsRequeuing(false); }
  };

  const loadTranscript = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!transcripts[id]) {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/interviews/transcript/${id}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTranscripts(prev => ({ ...prev, [id]: data }));
        }
      } catch (_) {}
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in zoom-in duration-500">

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Execution Monitor</h1>
          <p className="text-white/60">
            {projectId ? "Live view of synthetic interview progress. Updates every 3 seconds." : "Select a project from the dashboard to monitor its interviews."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stuckCount > 0 && projectId && (
            <Button onClick={requeueStuck} disabled={isRequeuing}
              variant="outline"
              className="bg-white/5 border-white/10 text-white hover:bg-white/10 px-4 h-10 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 mr-2 ${isRequeuing ? "animate-spin" : ""}`} />
              {isRequeuing ? "Retrying..." : `Retry ${stuckCount}`}
            </Button>
          )}
          {allDone && projectId && (
            <Button onClick={() => router.push(`/projects/${projectId}/output`)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 px-5 h-10">
              View Results <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>

      {!projectId ? (
        <Card className="glass-card border-none bg-white/5">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <Activity className="w-12 h-12 text-white/20 mb-4" />
            <p className="text-white/40">No project selected. Start a new simulation from the dashboard.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Progress overview */}
          <Card className="glass-card border-none bg-white/5">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg text-white">Overall Progress</CardTitle>
                <span className="text-white font-bold text-2xl">{progress}%</span>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={progress} className="h-2 bg-white/10" />
              <div className="flex gap-6 mt-4 text-sm">
                <span className="text-emerald-400 font-medium">{interviews.filter(i => i.status === "completed").length} Completed</span>
                <span className="text-blue-400 font-medium">{interviews.filter(i => i.status === "running").length} Running</span>
                <span className="text-yellow-400 font-medium">{interviews.filter(i => i.status === "queued").length} Queued</span>
                <span className="text-red-400 font-medium">{interviews.filter(i => i.status === "failed").length} Failed</span>
              </div>
            </CardContent>
          </Card>

          {/* Interview cards */}
          {interviews.length === 0 ? (
            <Card className="glass-card border-none bg-white/5">
              <CardContent className="py-12 flex flex-col items-center text-center">
                <Clock className="w-10 h-10 text-white/20 mb-3" />
                <p className="text-white/40 text-sm">Loading interview status...</p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {interviews.map((iv) => {
                const s = statusConfig[iv.status] || statusConfig.queued;
                const isOpen = expanded === iv.id;
                const turns = transcripts[iv.id] || [];
                return (
                  <div key={iv.id} className="glass-card rounded-xl overflow-hidden">
                    <div
                      className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => loadTranscript(iv.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-1.5 ${s.color} text-sm font-medium`}>
                          {s.icon} {s.label}
                        </div>
                        <span className="text-white/80 font-medium text-sm">Persona #{iv.persona_id.slice(-4)}</span>
                        <span className="text-white/40 text-xs">Interviewer: {iv.interviewer_model} · Respondent: {iv.respondent_model || "pending"}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-white/50 text-xs">{iv.turn_count} turns</span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t border-white/5 px-5 py-4 flex flex-col gap-4 max-h-96 overflow-y-auto">
                        {turns.length === 0 ? (
                          <p className="text-white/40 text-sm italic">No transcript yet — interview may still be generating.</p>
                        ) : turns.map((t, i) => (
                          <div key={i} className="flex flex-col gap-2">
                            <div className="flex gap-3">
                              <span className="text-indigo-400 text-xs font-semibold uppercase tracking-wider mt-0.5 shrink-0">Q{i + 1}</span>
                              <p className="text-white/80 text-sm">{t.question}</p>
                            </div>
                            <div className="flex gap-3 ml-6">
                              <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mt-0.5 shrink-0">Ans</span>
                              <p className="text-white/60 text-sm leading-relaxed">{t.answer}</p>
                            </div>
                            {t.has_reasoning && (
                              <div className="ml-6 px-3 py-1 rounded bg-amber-500/10 border border-amber-500/20">
                                <span className="text-amber-400 text-xs">⚡ Reasoning trace available (Kimi K2.5)</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Monitor() {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-8 w-full">
        <div className="h-12 bg-white/5 rounded-xl animate-pulse w-64" />
        <div className="h-32 bg-white/5 rounded-xl animate-pulse" />
      </div>
    }>
      <MonitorContent />
    </Suspense>
  );
}
