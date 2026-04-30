"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud, File, ArrowRight, Loader2, Sparkles,
  ChevronDown, ChevronUp, Play, Brain, FileQuestion,
  UserPlus, Trash2, CheckCircle2, User, BookUser,
  Database, Layers, AlertTriangle, Check, X, Edit2,
  BarChart2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Step = "info" | "upload" | "persona_source" | "personas" | "dataset_upload" | "ml_running" | "ml_review" | "queued";
type UploadMode = "generate" | "extract";
type PersonaSource = "manual" | "ml";

interface Question { question_id: string; question_text: string; question_type: string; }
interface PersonaJson { name: string; age?: number; gender?: string; occupation?: string; industry?: string; department?: string; role?: string; years_experience?: string; country?: string; education?: string; region?: string; background?: string; }
interface PersonaEntry { id: string; persona_json: PersonaJson; }
interface LibraryPersona { id: string; persona_json: PersonaJson; }
interface ProjectState { project_id: string; questionnaire_id: string; questions: Question[]; }

interface ColumnProfile {
  column_name: string;
  inferred_type: string;
  cardinality: number;
  missing_percentage: number;
  identifier_risk: "high" | "low";
  semantic_guess: string;
  sample_values: string[];
}

interface DatasetProfile {
  dataset_id: string;
  filename: string;
  row_count: number;
  column_count: number;
  profiles: ColumnProfile[];
  warnings: { identifier_columns_excluded: string[]; high_missing_columns: string[]; usable_column_count: number; };
}

interface MLPersonaData {
  id: string;
  cluster_id: number;
  cluster_size: number;
  cluster_percentage: number;
  confidence_score: number;
  status: "draft" | "approved" | "excluded";
  persona_id: string | null;
  persona_json: {
    persona_name?: string;
    dominant_signals?: string[];
    latent_features?: Record<string, string>;
    behavioral_interpretation?: string;
    likely_needs?: string[];
    likely_pain_points?: string[];
    purchase_drivers?: string[];
    knowledge_boundaries?: string[];
  };
}

const inputCls = "w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all";
const labelCls = "text-xs font-semibold text-white/70 uppercase tracking-wider pl-1";
const selectCls = "w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all";

const EDUCATION_OPTIONS = ["High School", "Associate's", "Bachelor's", "Master's", "PhD", "Other"];
const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Other"];
const PERSONA_COLORS = [
  "from-indigo-500 to-purple-500", "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500", "from-orange-500 to-amber-500",
  "from-pink-500 to-rose-500", "from-violet-500 to-indigo-500",
];

function emptyForm() {
  return { name: "", age: 30, gender: "Male", occupation: "", industry: "", department: "", role: "", years_experience: "", country: "", education: "Bachelor's", region: "", background: "" };
}

const TYPE_BADGE: Record<string, string> = {
  numeric: "bg-blue-500/20 text-blue-300",
  categorical: "bg-purple-500/20 text-purple-300",
  boolean: "bg-teal-500/20 text-teal-300",
  datetime: "bg-amber-500/20 text-amber-300",
  text_or_identifier: "bg-red-500/20 text-red-300",
};

export default function NewProject() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const datasetInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("info");
  const [uploadMode, setUploadMode] = useState<UploadMode>("extract");
  const [personaSource, setPersonaSource] = useState<PersonaSource>("manual");

  // Step 1
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  // Step 2 — questionnaire
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [project, setProject] = useState<ProjectState | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);

  // Step 3 — manual personas
  const [personas, setPersonas] = useState<PersonaEntry[]>([]);
  const [personaTab, setPersonaTab] = useState<"library" | "create">("library");
  const [libraryPersonas, setLibraryPersonas] = useState<LibraryPersona[]>([]);
  const [isAddingFromLibrary, setIsAddingFromLibrary] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [isAddingPersona, setIsAddingPersona] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [interviewerModel, setInterviewerModel] = useState("openai");

  // ML path state
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [isUploadingDataset, setIsUploadingDataset] = useState(false);
  const [datasetProfile, setDatasetProfile] = useState<DatasetProfile | null>(null);
  const [nClusters, setNClusters] = useState<number | "auto">("auto");
  const [isGenerating, setIsGenerating] = useState(false);
  const [mlPersonas, setMlPersonas] = useState<MLPersonaData[]>([]);
  const [mlDatasetStatus, setMlDatasetStatus] = useState<string | null>(null);
  const [mlDatasetId, setMlDatasetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editInterp, setEditInterp] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [mlInterviewerModel, setMlInterviewerModel] = useState("openai");

  // Load library personas when entering manual personas step
  useEffect(() => {
    if (step !== "personas") return;
    const token = localStorage.getItem("token");
    fetch("/api/personas", { headers: { "Authorization": `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setLibraryPersonas)
      .catch(() => {});
  }, [step]);

  // Poll ML status when in ml_running step
  const pollML = useCallback(async () => {
    if (!project) return;
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/ml-personas?project_id=${project.project_id}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.dataset) {
      setMlDatasetStatus(data.dataset.status);
      if (data.dataset.status === 'ready') {
        setMlPersonas(data.personas);
        setStep("ml_review");
      } else if (data.dataset.status === 'failed') {
        setStep("dataset_upload");
      }
    }
  }, [project]);

  useEffect(() => {
    if (step !== "ml_running") return;
    const interval = setInterval(pollML, 3000);
    pollML();
    return () => clearInterval(interval);
  }, [step, pollML]);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
  };

  const handleDatasetDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) setDatasetFile(e.dataTransfer.files[0]);
  };

  const processFile = async () => {
    if (!file || !name) return;
    setIsUploading(true);
    try {
      const token = localStorage.getItem("token");
      const auth = { "Authorization": `Bearer ${token}` };
      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ name, desc, project_type: uploadMode === "generate" ? "background_research" : "questionnaire_upload" }),
      });
      if (!projRes.ok) throw new Error("Failed to create project");
      const proj = await projRes.json();
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(`/api/projects/${proj.id}/upload?mode=${uploadMode}`, {
        method: "POST", headers: auth, body: formData,
      });
      if (!uploadRes.ok) throw new Error("Failed to process file");
      const data = await uploadRes.json();
      setProject({ project_id: data.project_id, questionnaire_id: data.questionnaire_id, questions: data.questions || [] });
      setStep("upload");
    } catch (err) {
      console.error(err);
      alert("Error processing document. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const uploadDataset = async () => {
    if (!datasetFile || !project) return;
    setIsUploadingDataset(true);
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("file", datasetFile);
      const res = await fetch(`/api/datasets/upload?project_id=${project.project_id}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      const data: DatasetProfile = await res.json();
      setDatasetProfile(data);
      setMlDatasetId(data.dataset_id);
    } catch (err: unknown) {
      alert((err as Error).message || "Dataset upload failed.");
    } finally {
      setIsUploadingDataset(false);
    }
  };

  const runMLSegmentation = async () => {
    if (!project || !mlDatasetId) return;
    setIsGenerating(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/ml-personas/generate", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.project_id,
          dataset_id: mlDatasetId,
          n_clusters: nClusters === "auto" ? null : nClusters,
        }),
      });
      if (!res.ok) throw new Error("Failed to start segmentation");
      setStep("ml_running");
    } catch (err) {
      console.error(err);
      alert("Failed to start ML segmentation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const approveMLPersona = async (id: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/ml-personas/${id}/approve`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return;
    setMlPersonas(prev => prev.map(p => p.id === id ? { ...p, status: "approved" } : p));
  };

  const excludeMLPersona = async (id: string) => {
    const token = localStorage.getItem("token");
    await fetch(`/api/ml-personas/${id}/exclude`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
    });
    setMlPersonas(prev => prev.map(p => p.id === id ? { ...p, status: "excluded" } : p));
  };

  const startEditMLPersona = (p: MLPersonaData) => {
    setEditingId(p.id);
    setEditName(p.persona_json.persona_name || "");
    setEditInterp(p.persona_json.behavioral_interpretation || "");
  };

  const saveEditMLPersona = async (id: string) => {
    setIsSavingEdit(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/ml-personas/${id}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ persona_name: editName, behavioral_interpretation: editInterp }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMlPersonas(prev => prev.map(p => p.id === id ? { ...p, persona_json: data.persona_json, status: data.status } : p));
      setEditingId(null);
    } catch {
      alert("Save failed.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const launchMLInterviews = async () => {
    if (!project) return;
    const approved = mlPersonas.filter(p => p.status === "approved");
    if (approved.length < 2) return;
    setIsLaunching(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/interviews/run", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.project_id, questionnaire_id: project.questionnaire_id, interviewer_model: mlInterviewerModel }),
      });
      if (!res.ok) throw new Error();
      setStep("queued");
    } catch {
      alert("Error launching interviews.");
    } finally {
      setIsLaunching(false);
    }
  };

  // Manual persona methods
  const addFromLibrary = async (libraryPersonaId: string) => {
    if (!project) return;
    setIsAddingFromLibrary(libraryPersonaId);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/personas/${libraryPersonaId}/use/${project.project_id}`, {
        method: "POST", headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPersonas(prev => [...prev, data]);
    } catch { alert("Failed to add persona from library."); }
    finally { setIsAddingFromLibrary(null); }
  };

  const submitPersona = async () => {
    if (!project) return;
    setIsAddingPersona(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/projects/${project.project_id}/personas`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPersonas(prev => [...prev, data]);
      setForm(emptyForm());
      setShowForm(false);
    } catch { alert("Error adding persona."); }
    finally { setIsAddingPersona(false); }
  };

  const deletePersona = async (personaId: string) => {
    if (!project) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/projects/${project.project_id}/personas/${personaId}`, {
        method: "DELETE", headers: { "Authorization": `Bearer ${token}` },
      });
      setPersonas(prev => prev.filter(p => p.id !== personaId));
    } catch { /* silent */ }
  };

  const launchInterviews = async () => {
    if (!project || personas.length < 2) return;
    setIsLaunching(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/interviews/run", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.project_id, questionnaire_id: project.questionnaire_id, interviewer_model: interviewerModel }),
      });
      if (!res.ok) throw new Error();
      setStep("queued");
    } catch { alert("Error launching interviews."); }
    finally { setIsLaunching(false); }
  };

  const approvedCount = mlPersonas.filter(p => p.status === "approved").length;

  const STEPS_MANUAL: Step[] = ["info", "upload", "persona_source", "personas"];
  const STEPS_ML: Step[] = ["info", "upload", "persona_source", "dataset_upload", "ml_review"];
  const activeSteps = personaSource === "ml" ? STEPS_ML : STEPS_MANUAL;

  const stepLabel = (s: Step) => {
    const map: Partial<Record<Step, string>> = {
      info: "Setup", upload: "Questions", persona_source: "Persona Source",
      personas: "Personas", dataset_upload: "Dataset", ml_review: "Review",
    };
    return map[s] ?? s;
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in zoom-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Create New Simulator</h1>
        <p className="text-white/60">Build a synthetic survey study — from questions through to AI-powered interviews.</p>
      </div>

      {/* Progress indicator */}
      {!["queued", "ml_running"].includes(step) && (
        <div className="flex items-center gap-2 text-xs text-white/40 flex-wrap">
          {activeSteps.map((s, i) => (
            <React.Fragment key={s}>
              <span className={step === s ? "text-indigo-400 font-semibold" : activeSteps.indexOf(step) > i ? "text-white/60" : ""}>
                {i + 1}. {stepLabel(s)}
              </span>
              {i < activeSteps.length - 1 && <span className="text-white/20">›</span>}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── Step 1: Info ──────────────────────────────────────────────────────────── */}
      {step === "info" && (
        <Card className="glass-card border-none bg-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50" />
          <CardHeader>
            <CardTitle className="text-xl text-white">Project Details</CardTitle>
            <CardDescription className="text-white/50">Name your project and choose how to provide survey questions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Project Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className={inputCls} placeholder="e.g. Q3 Consumer Telecom Validation" />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Description</label>
                <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
                  className={inputCls} placeholder="Optional brief description" />
              </div>
            </div>
            <div className="space-y-2">
              <label className={labelCls}>Question Source</label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { mode: "generate" as UploadMode, icon: Brain, title: "Generate from Background", desc: "Upload research briefs or product docs. AI generates targeted survey questions." },
                  { mode: "extract" as UploadMode, icon: FileQuestion, title: "Upload Questionnaire", desc: "Upload an existing survey. AI extracts and structures your questions." },
                ].map(({ mode, icon: Icon, title, desc: d }) => (
                  <button key={mode} onClick={() => setUploadMode(mode)}
                    className={`p-5 rounded-xl border text-left transition-all ${uploadMode === mode ? "border-indigo-500/60 bg-indigo-500/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}>
                    <Icon className={`w-8 h-8 mb-3 ${uploadMode === mode ? "text-indigo-400" : "text-white/40"}`} />
                    <div className={`font-semibold text-sm mb-1 ${uploadMode === mode ? "text-white" : "text-white/70"}`}>{title}</div>
                    <p className="text-white/40 text-xs leading-relaxed">{d}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep("upload")} disabled={!name}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-8 disabled:opacity-50 font-medium">
                Continue <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Questionnaire upload ─────────────────────────────────────────── */}
      {step === "upload" && !project && (
        <Card className="glass-card border-none bg-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50" />
          <CardHeader>
            <CardTitle className="text-xl text-white">
              {uploadMode === "generate" ? "Upload Background Document" : "Upload Questionnaire"}
            </CardTitle>
            <CardDescription className="text-white/50">
              {uploadMode === "generate"
                ? "Upload your research brief or context document. AI will generate survey questions."
                : "Upload your existing survey. AI will extract and structure the questions."}
              {" "}Supported: PDF, DOCX, TXT, CSV, JSON (max 10 MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.csv,.json" className="hidden"
              onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
            <div onDragOver={e => e.preventDefault()} onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center transition-all bg-white/5 cursor-pointer hover:bg-white/10 ${file ? "border-indigo-400 bg-indigo-500/10" : "border-white/20"}`}>
              {file ? (
                <><File className="w-12 h-12 text-indigo-400 mb-4" />
                  <p className="text-white font-medium mb-1">{file.name}</p>
                  <p className="text-white/50 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p></>
              ) : (
                <><UploadCloud className="w-12 h-12 text-white/40 mb-4" />
                  <p className="text-white/80 font-medium mb-1">Drag and drop your document here</p>
                  <p className="text-white/40 text-sm">or click to browse</p></>
              )}
            </div>
            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={() => setStep("info")}
                className="bg-white/5 border-white/10 text-white hover:bg-white/10">← Back</Button>
              <Button onClick={processFile} disabled={!file || isUploading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-8 disabled:opacity-50 font-medium">
                {isUploading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{uploadMode === "generate" ? "Generating..." : "Extracting..."}</>
                  : <>{uploadMode === "generate" ? "Generate Questions" : "Extract Questions"} <ArrowRight className="w-4 h-4 ml-2" /></>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions review */}
      {step === "upload" && project && (
        <>
          <Card className="glass-card border border-emerald-500/30 bg-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
            <CardContent className="pt-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 border border-emerald-500/30">
                <Sparkles className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {uploadMode === "generate" ? "Questions Generated!" : "Questions Extracted!"}
              </h2>
              <p className="text-white/70 mb-6 max-w-md">
                <strong className="text-white">{project.questions.length} questions</strong> are ready.
              </p>
              <div className="flex gap-4 w-full">
                <Button variant="outline" onClick={() => setShowQuestions(v => !v)}
                  className="flex-1 bg-white/5 border-white/10 text-white hover:bg-white/10">
                  {showQuestions ? <><ChevronUp className="w-4 h-4 mr-2" /> Hide</> : <><ChevronDown className="w-4 h-4 mr-2" /> Review Questions</>}
                </Button>
                <Button onClick={() => setStep("persona_source")}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20">
                  Build Personas <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
          {showQuestions && (
            <Card className="glass-card border-none bg-white/5">
              <CardHeader><CardTitle className="text-base text-white">Survey Questions</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3 max-h-80 overflow-y-auto">
                {project.questions.map((q, i) => (
                  <div key={q.question_id} className="flex gap-3 p-3 rounded-xl bg-white/5">
                    <span className="text-indigo-400 font-mono text-xs mt-0.5 shrink-0">{q.question_id || `Q${i + 1}`}</span>
                    <div>
                      <p className="text-white/90 text-sm">{q.question_text}</p>
                      <span className="text-white/40 text-xs">{q.question_type}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Step 3: Persona Source ────────────────────────────────────────────────── */}
      {step === "persona_source" && (
        <Card className="glass-card border-none bg-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50" />
          <CardHeader>
            <CardTitle className="text-xl text-white">Choose Persona Source</CardTitle>
            <CardDescription className="text-white/50">
              Build personas manually, or let ML discover segments from your customer data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button onClick={() => setPersonaSource("manual")}
                className={`p-6 rounded-xl border text-left transition-all ${personaSource === "manual" ? "border-indigo-500/60 bg-indigo-500/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}>
                <UserPlus className={`w-9 h-9 mb-4 ${personaSource === "manual" ? "text-indigo-400" : "text-white/40"}`} />
                <div className={`font-semibold text-sm mb-1.5 ${personaSource === "manual" ? "text-white" : "text-white/70"}`}>Manual Persona Builder</div>
                <p className="text-white/40 text-xs leading-relaxed">Create individual personas by hand or pick from your reusable library. Full control over demographics and backgrounds.</p>
              </button>
              <button onClick={() => setPersonaSource("ml")}
                className={`p-6 rounded-xl border text-left transition-all ${personaSource === "ml" ? "border-emerald-500/60 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}>
                <Database className={`w-9 h-9 mb-4 ${personaSource === "ml" ? "text-emerald-400" : "text-white/40"}`} />
                <div className={`font-semibold text-sm mb-1.5 ${personaSource === "ml" ? "text-white" : "text-white/70"}`}>ML-Generated from Dataset</div>
                <p className="text-white/40 text-xs leading-relaxed">Upload any customer dataset (CSV, XLSX, JSON). ML discovers latent segments and generates data-driven personas automatically.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["KMeans", "PCA", "Auto-profiling", "No PII to LLM"].map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">{t}</span>
                  ))}
                </div>
              </button>
            </div>
            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" onClick={() => setStep("upload")}
                className="bg-white/5 border-white/10 text-white hover:bg-white/10">← Back</Button>
              <Button onClick={() => setStep(personaSource === "ml" ? "dataset_upload" : "personas")}
                className={`px-8 text-white shadow-lg font-medium ${personaSource === "ml" ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20"}`}>
                Continue <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ML Path: Dataset Upload + Profile ────────────────────────────────────── */}
      {step === "dataset_upload" && (
        <div className="flex flex-col gap-5">
          <Card className="glass-card border-none bg-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60" />
            <CardHeader>
              <CardTitle className="text-xl text-white">Upload Customer Dataset</CardTitle>
              <CardDescription className="text-white/50">
                Any tabular dataset with arbitrary fields. Identifiers are automatically excluded — no raw data is sent to LLMs.
                Supported: CSV, XLSX, JSON, Parquet (max 50 MB)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <input ref={datasetInputRef} type="file"
                accept=".csv,.xlsx,.xls,.json,.parquet" className="hidden"
                onChange={e => e.target.files?.[0] && setDatasetFile(e.target.files[0])} />

              {!datasetProfile ? (
                <>
                  <div onDragOver={e => e.preventDefault()} onDrop={handleDatasetDrop}
                    onClick={() => datasetInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-all bg-white/5 cursor-pointer hover:bg-white/10 ${datasetFile ? "border-emerald-400 bg-emerald-500/10" : "border-white/20"}`}>
                    {datasetFile ? (
                      <><Database className="w-12 h-12 text-emerald-400 mb-4" />
                        <p className="text-white font-medium mb-1">{datasetFile.name}</p>
                        <p className="text-white/50 text-sm">{(datasetFile.size / 1024 / 1024).toFixed(2)} MB</p></>
                    ) : (
                      <><UploadCloud className="w-12 h-12 text-white/40 mb-4" />
                        <p className="text-white/80 font-medium mb-1">Drag and drop your dataset here</p>
                        <p className="text-white/40 text-sm">or click to browse · CSV, XLSX, JSON, Parquet</p></>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep("persona_source")}
                      className="bg-white/5 border-white/10 text-white hover:bg-white/10">← Back</Button>
                    <Button onClick={uploadDataset} disabled={!datasetFile || isUploadingDataset}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 disabled:opacity-50 font-medium">
                      {isUploadingDataset
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Profiling dataset...</>
                        : <>Profile Dataset <ArrowRight className="w-4 h-4 ml-2" /></>}
                    </Button>
                  </div>
                </>
              ) : (
                /* Dataset profiled — show summary + config */
                <div className="space-y-5">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Rows", value: datasetProfile.row_count.toLocaleString() },
                      { label: "Columns", value: datasetProfile.column_count },
                      { label: "Usable Columns", value: datasetProfile.warnings.usable_column_count },
                    ].map(({ label, value }) => (
                      <div key={label} className="p-3 rounded-xl bg-white/5 border border-white/8 text-center">
                        <div className="text-xl font-bold text-white">{value}</div>
                        <div className="text-xs text-white/50 mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Warnings */}
                  {(datasetProfile.warnings.identifier_columns_excluded.length > 0 || datasetProfile.warnings.high_missing_columns.length > 0) && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-300/90 space-y-1">
                        {datasetProfile.warnings.identifier_columns_excluded.length > 0 && (
                          <p><strong>Excluded (identifiers):</strong> {datasetProfile.warnings.identifier_columns_excluded.join(", ")}</p>
                        )}
                        {datasetProfile.warnings.high_missing_columns.length > 0 && (
                          <p><strong>High missing data (&gt;50%):</strong> {datasetProfile.warnings.high_missing_columns.join(", ")}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Column profiles table */}
                  <div>
                    <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 pl-1">Column Profiles</p>
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white/5 sticky top-0">
                            <tr>
                              {["Column", "Type", "Cardinality", "Missing", "Risk"].map(h => (
                                <th key={h} className="text-left px-3 py-2 text-white/50 font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {datasetProfile.profiles.map((p, i) => (
                              <tr key={p.column_name} className={`border-t border-white/5 ${p.identifier_risk === 'high' ? 'opacity-40' : ''} ${i % 2 === 0 ? 'bg-white/2' : ''}`}>
                                <td className="px-3 py-2 text-white font-mono">{p.column_name}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_BADGE[p.inferred_type] || 'bg-white/10 text-white/50'}`}>
                                    {p.inferred_type}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-white/60">{p.cardinality}</td>
                                <td className="px-3 py-2">
                                  <span className={p.missing_percentage > 50 ? 'text-amber-400' : 'text-white/60'}>
                                    {p.missing_percentage}%
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={p.identifier_risk === 'high' ? 'text-red-400' : 'text-emerald-400'}>
                                    {p.identifier_risk === 'high' ? '⛔ excluded' : '✓ usable'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* n_clusters config */}
                  <div className="space-y-2">
                    <label className={labelCls}>Number of Personas (Clusters)</label>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setNClusters("auto")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${nClusters === "auto" ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/8"}`}>
                        Auto (recommended)
                      </button>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(k => (
                        <button key={k} onClick={() => setNClusters(k)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${nClusters === k ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/8"}`}>
                          {k}
                        </button>
                      ))}
                    </div>
                    <p className="text-white/30 text-xs pl-1">Auto uses silhouette scoring to find the optimal number.</p>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="outline"
                      onClick={() => { setDatasetProfile(null); setDatasetFile(null); setMlDatasetId(null); }}
                      className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                      ← Upload Different File
                    </Button>
                    <Button onClick={runMLSegmentation} disabled={isGenerating || datasetProfile.warnings.usable_column_count < 2}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 disabled:opacity-50 font-medium shadow-lg shadow-emerald-500/20">
                      {isGenerating
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting...</>
                        : <><Layers className="w-4 h-4 mr-2" /> Run ML Segmentation</>}
                    </Button>
                  </div>
                  {datasetProfile.warnings.usable_column_count < 2 && (
                    <p className="text-red-400 text-xs text-center">Not enough usable columns for clustering. Dataset needs at least 2 non-identifier columns.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── ML Running ───────────────────────────────────────────────────────────── */}
      {step === "ml_running" && (
        <Card className="glass-card border-none bg-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60 animate-pulse" />
          <CardContent className="pt-16 pb-16 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-6">
              <BarChart2 className="w-10 h-10 text-emerald-400 animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">ML Segmentation Running</h2>
            <p className="text-white/60 max-w-md mb-6">
              Profiling features · Engineering variables · Running PCA + KMeans · Generating behavioral personas via LLM
            </p>
            <div className="flex items-center gap-2 text-sm text-white/40">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Status: {mlDatasetStatus || "queued"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ML Review ────────────────────────────────────────────────────────────── */}
      {step === "ml_review" && (
        <div className="flex flex-col gap-5">
          <Card className="glass-card border-none bg-white/5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-60" />
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-white">Review ML-Generated Personas</CardTitle>
                  <CardDescription className="text-white/50">
                    {mlPersonas.length} customer segments discovered. Approve, edit, or exclude each persona.
                  </CardDescription>
                </div>
                <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${approvedCount >= 2 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-white/40 border-white/10 bg-white/5"}`}>
                  {approvedCount} approved
                </span>
              </div>
            </CardHeader>
          </Card>

          {mlPersonas.map((p) => {
            const isEditing = editingId === p.id;
            const isExcluded = p.status === "excluded";
            const isApproved = p.status === "approved";
            return (
              <Card key={p.id} className={`glass-card border bg-white/5 relative overflow-hidden transition-all ${isExcluded ? "opacity-40 border-white/5" : isApproved ? "border-emerald-500/30" : "border-white/10"}`}>
                {isApproved && <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 opacity-70" />}
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-4">
                    {/* Cluster badge */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0 text-white font-bold text-sm">
                      S{p.cluster_id + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name + confidence */}
                      {isEditing ? (
                        <input value={editName} onChange={e => setEditName(e.target.value)}
                          className={`${inputCls} mb-2 text-base font-semibold`} placeholder="Segment name" />
                      ) : (
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-white font-semibold text-base">
                            {p.persona_json.persona_name || `Segment ${p.cluster_id + 1}`}
                          </h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                            ${p.confidence_score >= 0.7 ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : p.confidence_score >= 0.5 ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              : "bg-white/5 text-white/40 border-white/10"}`}>
                            {Math.round(p.confidence_score * 100)}% confidence
                          </span>
                        </div>
                      )}

                      {/* Cluster stats */}
                      <p className="text-white/40 text-xs mb-2">
                        {p.cluster_size.toLocaleString()} customers · {p.cluster_percentage}% of dataset
                      </p>

                      {/* Interpretation */}
                      {isEditing ? (
                        <textarea value={editInterp} onChange={e => setEditInterp(e.target.value)}
                          rows={2}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none mb-3"
                          placeholder="Behavioral interpretation" />
                      ) : (
                        p.persona_json.behavioral_interpretation && (
                          <p className="text-white/70 text-sm mb-3">{p.persona_json.behavioral_interpretation}</p>
                        )
                      )}

                      {/* Dominant signals */}
                      {!isEditing && p.persona_json.dominant_signals && p.persona_json.dominant_signals.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {p.persona_json.dominant_signals.map((s, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-300/90 border border-emerald-500/20">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Needs + Pain points (collapsed) */}
                      {!isEditing && (p.persona_json.likely_needs?.length || p.persona_json.likely_pain_points?.length) ? (
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {p.persona_json.likely_needs?.length ? (
                            <div>
                              <p className="text-white/40 font-semibold uppercase tracking-wider mb-1">Needs</p>
                              <ul className="space-y-0.5">
                                {p.persona_json.likely_needs.map((n, i) => <li key={i} className="text-white/60">• {n}</li>)}
                              </ul>
                            </div>
                          ) : null}
                          {p.persona_json.likely_pain_points?.length ? (
                            <div>
                              <p className="text-white/40 font-semibold uppercase tracking-wider mb-1">Pain Points</p>
                              <ul className="space-y-0.5">
                                {p.persona_json.likely_pain_points.map((n, i) => <li key={i} className="text-white/60">• {n}</li>)}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <Button size="sm" onClick={() => saveEditMLPersona(p.id)} disabled={isSavingEdit}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3">
                            {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" />Save</>}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}
                            className="bg-white/5 border-white/10 text-white/60 text-xs px-3 hover:bg-white/10">
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          {!isExcluded && (
                            <Button size="sm" onClick={() => isApproved ? null : approveMLPersona(p.id)}
                              className={`text-xs px-3 ${isApproved ? "bg-emerald-700 text-white cursor-default" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}>
                              <Check className="w-3 h-3 mr-1" />{isApproved ? "Approved" : "Approve"}
                            </Button>
                          )}
                          {!isExcluded && !isApproved && (
                            <Button size="sm" variant="outline" onClick={() => startEditMLPersona(p)}
                              className="bg-white/5 border-white/10 text-white/60 text-xs px-3 hover:bg-white/10">
                              <Edit2 className="w-3 h-3 mr-1" />Edit
                            </Button>
                          )}
                          <Button size="sm" variant="outline"
                            onClick={() => isExcluded ? approveMLPersona(p.id) : excludeMLPersona(p.id)}
                            className={`text-xs px-3 border ${isExcluded ? "border-white/10 text-white/30 hover:bg-white/5" : "border-red-500/20 text-red-400/70 hover:bg-red-500/10"}`}>
                            {isExcluded ? <><Check className="w-3 h-3 mr-1" />Restore</> : <><X className="w-3 h-3 mr-1" />Exclude</>}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Launch config */}
          {approvedCount >= 2 && (
            <Card className="glass-card border border-emerald-500/20 bg-white/5">
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Interviewer Model</label>
                  <select value={mlInterviewerModel} onChange={e => setMlInterviewerModel(e.target.value)} className={selectCls}>
                    <option value="openai">GPT-4o Mini (OpenAI)</option>
                    <option value="kimi">Kimi K2.5 (Moonshot)</option>
                  </select>
                  <p className="text-white/30 text-xs pl-1">Respondents are drawn randomly from the full multi-model pool.</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-white/60"><strong className="text-white">{approvedCount}</strong> personas approved — ready to launch</p>
                  <Button onClick={launchMLInterviews} disabled={isLaunching}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 font-medium shadow-lg shadow-emerald-500/20 disabled:opacity-50">
                    {isLaunching
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Launching...</>
                      : <><Play className="w-4 h-4 mr-2" />Launch {approvedCount} Interviews</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {approvedCount < 2 && (
            <p className="text-center text-white/40 text-xs">Approve at least 2 personas to launch interviews.</p>
          )}
        </div>
      )}

      {/* ── Step 3 Manual: Personas ──────────────────────────────────────────────── */}
      {step === "personas" && (
        <Card className="glass-card border-none bg-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-50" />
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl text-white">Build Participant Personas</CardTitle>
                <CardDescription className="text-white/50">Create 2–50 individual personas. Each will be interviewed independently.</CardDescription>
              </div>
              <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${personas.length >= 2 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-white/40 border-white/10 bg-white/5"}`}>
                {personas.length} / 50
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {personas.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wider pl-1">Added to this project</p>
                {personas.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/8">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${PERSONA_COLORS[i % PERSONA_COLORS.length]} flex items-center justify-center shrink-0`}>
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm">{p.persona_json.name}</p>
                      <p className="text-white/50 text-xs truncate">
                        {[p.persona_json.age && `${p.persona_json.age}y`, p.persona_json.gender, p.persona_json.role || p.persona_json.occupation, p.persona_json.department, p.persona_json.industry, p.persona_json.country || p.persona_json.region, p.persona_json.years_experience && `${p.persona_json.years_experience} yrs exp`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <button onClick={() => deletePersona(p.id)} className="text-white/30 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {personas.length < 50 && (
              <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                {[{ key: "library" as const, icon: BookUser, label: "From Library" }, { key: "create" as const, icon: UserPlus, label: "Create New" }].map(({ key, icon: Icon, label }) => (
                  <button key={key} onClick={() => { setPersonaTab(key); setShowForm(false); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${personaTab === key ? "bg-indigo-600 text-white shadow-lg" : "text-white/50 hover:text-white"}`}>
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
            )}

            {personaTab === "library" && personas.length < 50 && (
              libraryPersonas.length === 0 ? (
                <div className="py-8 flex flex-col items-center text-center gap-3">
                  <BookUser className="w-8 h-8 text-white/20" />
                  <p className="text-white/40 text-sm">Your persona library is empty.</p>
                  <p className="text-white/30 text-xs">Add reusable personas at <span className="text-indigo-400">/personas</span>, or use &ldquo;Create New&rdquo; tab.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                  {libraryPersonas.map((lp) => {
                    const alreadyAdded = personas.some(p => p.persona_json.name === lp.persona_json.name && p.persona_json.occupation === lp.persona_json.occupation);
                    return (
                      <div key={lp.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8 hover:border-white/15 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium">{lp.persona_json.name}</p>
                          <p className="text-white/50 text-xs truncate">{[lp.persona_json.age && `${lp.persona_json.age}y`, lp.persona_json.gender, lp.persona_json.role || lp.persona_json.occupation, lp.persona_json.industry].filter(Boolean).join(" · ")}</p>
                        </div>
                        <button onClick={() => addFromLibrary(lp.id)} disabled={!!isAddingFromLibrary || alreadyAdded}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${alreadyAdded ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 cursor-default" : "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 disabled:opacity-50"}`}>
                          {isAddingFromLibrary === lp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : alreadyAdded ? "Added" : "+ Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {personaTab === "create" && personas.length < 50 && (
              showForm ? (
                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5 space-y-4">
                  <p className="text-sm font-semibold text-white/80">New Persona</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Name (optional)", key: "name", placeholder: "Auto-generated if blank", type: "text" },
                      { label: "Age", key: "age", placeholder: "", type: "number" },
                    ].map(({ label, key, placeholder, type }) => (
                      <div key={key} className="space-y-1">
                        <label className={labelCls}>{label}</label>
                        <input type={type} min={type === "number" ? 18 : undefined} max={type === "number" ? 80 : undefined}
                          value={form[key as keyof typeof form]}
                          onChange={e => setForm(f => ({ ...f, [key]: type === "number" ? parseInt(e.target.value) || 30 : e.target.value }))}
                          className={inputCls} placeholder={placeholder} />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <label className={labelCls}>Gender</label>
                      <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className={selectCls}>
                        {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Education</label>
                      <select value={form.education} onChange={e => setForm(f => ({ ...f, education: e.target.value }))} className={selectCls}>
                        {EDUCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    {[
                      { label: "Job Title / Occupation", key: "occupation", placeholder: "e.g. Product Manager" },
                      { label: "Role", key: "role", placeholder: "e.g. Individual Contributor" },
                      { label: "Department", key: "department", placeholder: "e.g. Engineering, Sales" },
                      { label: "Industry", key: "industry", placeholder: "e.g. Healthcare, Telecom" },
                      { label: "Years of Experience", key: "years_experience", placeholder: "e.g. 12" },
                      { label: "Country", key: "country", placeholder: "e.g. UAE, United Kingdom" },
                    ].map(({ label, key, placeholder }) => (
                      <div key={key} className="space-y-1">
                        <label className={labelCls}>{label}</label>
                        <input value={form[key as keyof typeof form] as string}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          className={inputCls} placeholder={placeholder} />
                      </div>
                    ))}
                    <div className="col-span-2 space-y-1">
                      <label className={labelCls}>Region / Location</label>
                      <input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} className={inputCls} placeholder="e.g. Middle East, Southeast Asia" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className={labelCls}>Background & Personality</label>
                      <textarea value={form.background} onChange={e => setForm(f => ({ ...f, background: e.target.value }))} rows={3}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
                        placeholder="Background, attitudes, relevant knowledge, and personality traits..." />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm()); }}
                      className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</Button>
                    <Button onClick={submitPersona} disabled={isAddingPersona || personas.length >= 50}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">
                      {isAddingPersona ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : "Add to Project"}
                    </Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowForm(true)}
                  className="w-full py-4 rounded-xl border-2 border-dashed border-white/15 text-white/50 hover:border-indigo-500/50 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all flex items-center justify-center gap-2 text-sm font-medium">
                  <UserPlus className="w-4 h-4" /> Create Persona for this Project
                </button>
              )
            )}

            {personas.length < 2 && !showForm && (
              <p className="text-center text-white/40 text-xs">Add at least 2 personas to launch interviews.</p>
            )}

            {personas.length >= 2 && (
              <div className="pt-4 border-t border-white/10 space-y-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Interviewer Model</label>
                  <select value={interviewerModel} onChange={e => setInterviewerModel(e.target.value)} className={selectCls}>
                    <option value="openai">GPT-4o Mini (OpenAI)</option>
                    <option value="kimi">Kimi K2.5 (Moonshot)</option>
                  </select>
                  <p className="text-white/30 text-xs pl-1">Respondents are drawn randomly from the full multi-model pool.</p>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <Button variant="outline" onClick={() => setStep("persona_source")}
                className="bg-white/5 border-white/10 text-white hover:bg-white/10">← Back</Button>
              <Button onClick={launchInterviews} disabled={isLaunching || personas.length < 2}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-8 disabled:opacity-50 font-medium">
                {isLaunching
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Launching...</>
                  : <><Play className="w-4 h-4 mr-2" />Launch {personas.length} Interview{personas.length !== 1 ? "s" : ""}</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Queued ─────────────────────────────────────────────────────────────────── */}
      {step === "queued" && project && (
        <Card className="glass-card border border-indigo-500/30 bg-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500" />
          <CardContent className="pt-10 flex flex-col items-center text-center pb-10">
            <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-6 border border-indigo-500/30">
              <CheckCircle2 className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Interviews Queued!</h2>
            <p className="text-white/70 mb-8 max-w-md">
              <strong className="text-white">{personaSource === "ml" ? approvedCount : personas.length} synthetic interviews</strong> are now running in the background.
              {personaSource === "ml" && <span className="block text-white/50 text-sm mt-1">Personas generated from ML segmentation of your customer dataset.</span>}
            </p>
            <Button onClick={() => router.push(`/monitor?project_id=${project.project_id}`)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-8 font-medium">
              Go to Monitor <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
