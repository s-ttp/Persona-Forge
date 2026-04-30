"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, BarChart2, Users, FileText, Activity, ArrowRight, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Project {
  id: string;
  name: string;
  project_type: string;
  status: string;
  created_at: string;
  persona_count: number;
  interview_total: number;
  interview_completed: number;
  interview_running: number;
}

function projectStatus(p: Project): "draft" | "running" | "completed" {
  if (p.interview_total === 0) return "draft";
  if (p.interview_completed === p.interview_total && p.interview_total > 0) return "completed";
  if (p.interview_running > 0 || p.interview_completed > 0) return "running";
  return "draft";
}

function projectHref(p: Project): string {
  const status = projectStatus(p);
  if (status === "completed") return `/projects/${p.id}/output`;
  if (status === "running") return `/monitor?project_id=${p.id}`;
  return `/monitor?project_id=${p.id}`;
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
    questionnaire_upload: "Questionnaire",
    background_research: "Research Brief",
    ml_dataset: "ML Dataset",
  };
  return map[t] ?? t;
}

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalPersonas, setTotalPersonas] = useState<number | null>(null);
  const [username, setUsername] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try { setUsername(JSON.parse(stored).email ?? ""); } catch { /* */ }
    }

    const token = localStorage.getItem("token");
    const auth = { "Authorization": `Bearer ${token}` };

    fetch("/api/projects", { headers: auth })
      .then(r => r.ok ? r.json() : [])
      .then(setProjects)
      .catch(() => {});

    fetch("/api/personas", { headers: auth })
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown[]) => setTotalPersonas(data.length))
      .catch(() => {});
  }, []);

  const displayName = username.includes("@") ? username.split("@")[0] : username;

  const totalProjects = projects.length;
  const completedProjects = projects.filter(p => projectStatus(p) === "completed").length;
  const activeProjects = projects.filter(p => projectStatus(p) === "running").length;

  const stats = [
    { label: "Total Projects", value: totalProjects, icon: <FileText className="w-5 h-5 text-indigo-400" /> },
    { label: "Completed", value: completedProjects, icon: <BarChart2 className="w-5 h-5 text-emerald-400" /> },
    { label: "Active Sims", value: activeProjects, icon: <Activity className="w-5 h-5 text-blue-400" /> },
    { label: "Library Personas", value: totalPersonas ?? "—", icon: <Users className="w-5 h-5 text-purple-400" /> },
  ];

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in zoom-in duration-500">

      {/* Header */}
      <div className="flex justify-between items-center w-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
            Welcome back{displayName ? `, ${displayName}` : ""}
          </h1>
          <p className="text-white/60">Manage your synthetic survey projects and active AI interviews.</p>
        </div>
        <Link href="/projects/new">
          <Button className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-6 h-11 rounded-xl transition-all">
            <Plus className="w-4 h-4 mr-2" /> New Project
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
        {stats.map((stat, i) => (
          <Card key={i} className="glass-card border-none bg-white/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-white/70">{stat.label}</CardTitle>
              {stat.icon}
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => router.push("/personas")}
          className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 hover:border-white/15 transition-all text-left">
          <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">Persona Library</p>
            <p className="text-white/40 text-xs">Manage reusable personas</p>
          </div>
          <ArrowRight className="w-4 h-4 text-white/20 ml-auto" />
        </button>
        <button onClick={() => router.push("/projects/new")}
          className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 hover:border-white/15 transition-all text-left">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">ML from Dataset</p>
            <p className="text-white/40 text-xs">Upload data → auto-generate personas</p>
          </div>
          <ArrowRight className="w-4 h-4 text-white/20 ml-auto" />
        </button>
      </div>

      {/* Projects table */}
      <Card className="glass-card border-none bg-white/5 w-full">
        <CardHeader>
          <CardTitle className="text-xl text-white">Recent Projects</CardTitle>
          <CardDescription className="text-white/50">Your active and past research simulations.</CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center gap-4">
              <FileText className="w-10 h-10 text-white/20" />
              <div>
                <p className="text-white/50 text-sm font-medium">No projects yet</p>
                <p className="text-white/30 text-xs mt-1">Create your first synthetic survey simulation to get started.</p>
              </div>
              <Link href="/projects/new">
                <Button className="bg-indigo-600 hover:bg-indigo-500 text-white mt-2">
                  <Plus className="w-4 h-4 mr-2" /> New Project
                </Button>
              </Link>
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b [&_tr]:border-white/10">
                  <tr>
                    {["Project Name", "Type", "Status", "Personas", "Interviews", "Date", "Action"].map(h => (
                      <th key={h} className={`h-12 px-4 align-middle font-medium text-white/50 ${h === "Action" ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {projects.map((p) => {
                    const status = projectStatus(p);
                    return (
                      <tr key={p.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                        <td className="p-4 align-middle font-medium text-white/90 max-w-[220px] truncate">{p.name}</td>
                        <td className="p-4 align-middle text-white/50 text-xs">{typeLabel(p.project_type)}</td>
                        <td className="p-4 align-middle">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold
                            ${status === "completed" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                              status === "running"   ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                              "bg-white/10 text-white/50 border border-white/10"}`}>
                            {status}
                          </span>
                        </td>
                        <td className="p-4 align-middle text-white/70 text-center">
                          {p.persona_count > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 text-xs font-medium">{p.persona_count}</span>
                          ) : (
                            <span className="text-white/25">—</span>
                          )}
                        </td>
                        <td className="p-4 align-middle text-white/70">
                          {p.interview_total > 0 ? (
                            <span>
                              <span className="text-emerald-400 font-medium">{p.interview_completed}</span>
                              <span className="text-white/30">/{p.interview_total}</span>
                            </span>
                          ) : (
                            <span className="text-white/25">—</span>
                          )}
                        </td>
                        <td className="p-4 align-middle text-white/40 text-xs">
                          {p.created_at ? new Date(p.created_at).toISOString().split("T")[0] : "—"}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <Link href={projectHref(p)}
                            className="inline-flex items-center text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 h-8 px-3 rounded-lg text-sm font-medium transition-colors">
                            {status === "completed" ? "Results" : status === "running" ? "Monitor" : "View"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
