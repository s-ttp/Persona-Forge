"use client";

import React, { useEffect, useState } from "react";
import {
  UserPlus, Trash2, User, Pencil, X, Check, Loader2, BookmarkPlus, FolderOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PersonaJson {
  name: string;
  age: number;
  gender: string;
  occupation: string;
  company?: string;
  industry: string;
  department?: string;
  role?: string;
  years_experience?: string;
  country?: string;
  education: string;
  region: string;
  background: string;
}

interface LibraryPersona {
  id: string;
  participant_id: string;
  is_library: boolean;
  project_id: string | null;
  project_name: string | null;
  created_at: string;
  persona_json: PersonaJson;
}

const inputCls = "w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all";
const labelCls = "text-xs font-semibold text-white/70 uppercase tracking-wider pl-1";
const selectCls = "w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all";

const EDUCATION_OPTIONS = ["High School", "Associate's", "Bachelor's", "Master's", "PhD", "Other"];
const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Other"];

const PERSONA_COLORS = [
  "from-indigo-500 to-purple-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-amber-500",
  "from-pink-500 to-rose-500",
  "from-violet-500 to-indigo-500",
];

function emptyForm(): PersonaJson {
  return {
    name: "", age: 30, gender: "Male", occupation: "", company: "", industry: "",
    department: "", role: "", years_experience: "", country: "",
    education: "Bachelor's", region: "", background: "",
  };
}

function PersonaForm({
  initial, onSave, onCancel, isSaving,
}: {
  initial: PersonaJson;
  onSave: (data: PersonaJson) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<PersonaJson>(initial);
  const f = (field: keyof PersonaJson) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: field === "age" ? parseInt((e.target as HTMLInputElement).value) || 30 : e.target.value }));

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={labelCls}>Name (optional)</label>
          <input value={form.name} onChange={f("name")} className={inputCls} placeholder="Auto-generated if blank" />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Age</label>
          <input type="number" min={18} max={80} value={form.age} onChange={f("age")} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Gender</label>
          <select value={form.gender} onChange={f("gender")} className={selectCls}>
            {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Education</label>
          <select value={form.education} onChange={f("education")} className={selectCls}>
            {EDUCATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Job Title / Occupation</label>
          <input value={form.occupation} onChange={f("occupation")} className={inputCls} placeholder="e.g. Product Manager" />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Company</label>
          <input value={form.company ?? ""} onChange={f("company")} className={inputCls} placeholder="e.g. Acme Corp" />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Role</label>
          <input value={form.role ?? ""} onChange={f("role")} className={inputCls} placeholder="e.g. Individual Contributor" />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Department / Function</label>
          <input value={form.department ?? ""} onChange={f("department")} className={inputCls} placeholder="e.g. Engineering, Sales" />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Industry</label>
          <input value={form.industry} onChange={f("industry")} className={inputCls} placeholder="e.g. Healthcare, Telecom" />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Years of Experience</label>
          <input value={form.years_experience ?? ""} onChange={f("years_experience")} className={inputCls} placeholder="e.g. 12" />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Country of Operation</label>
          <input value={form.country ?? ""} onChange={f("country")} className={inputCls} placeholder="e.g. UAE, United Kingdom" />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Region / Location</label>
          <input value={form.region} onChange={f("region")} className={inputCls} placeholder="e.g. Middle East, Southeast Asia" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className={labelCls}>Background & Personality</label>
          <textarea value={form.background} onChange={f("background")} rows={3}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
            placeholder="Describe their background, attitudes, relevant knowledge, and personality traits..." />
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <Button variant="outline" onClick={onCancel} className="bg-white/5 border-white/10 text-white hover:bg-white/10">
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button onClick={() => onSave(form)} disabled={isSaving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50">
          {isSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : <><Check className="w-4 h-4 mr-2" /> Save Persona</>}
        </Button>
      </div>
    </div>
  );
}

function PersonaCard({
  p, index, onEdit, onDelete, onSaveToLibrary, savingId,
}: {
  p: LibraryPersona;
  index: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveToLibrary: (id: string) => void;
  savingId: string | null;
}) {
  const pj = p.persona_json;
  const subtitle = [
    pj.age && `${pj.age}y`,
    pj.gender,
    pj.role || pj.occupation,
    pj.company,
    pj.department,
    pj.industry,
    pj.country || pj.region,
    pj.years_experience && `${pj.years_experience} yrs exp`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/8 hover:border-white/15 transition-colors">
      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${PERSONA_COLORS[index % PERSONA_COLORS.length]} flex items-center justify-center shrink-0`}>
        <User className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-medium text-sm">{pj.name}</p>
          {!p.is_library && p.project_name && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 text-xs border border-blue-500/20">
              <FolderOpen className="w-2.5 h-2.5" />
              {p.project_name}
            </span>
          )}
          {p.is_library && (
            <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 text-xs border border-purple-500/20">Library</span>
          )}
        </div>
        <p className="text-white/50 text-xs truncate">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!p.is_library && (
          <button
            onClick={() => onSaveToLibrary(p.id)}
            disabled={savingId === p.id}
            title="Save to Library"
            className="text-white/30 hover:text-purple-400 transition-colors p-1.5 rounded-lg hover:bg-purple-500/10 disabled:opacity-40"
          >
            {savingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
          </button>
        )}
        <button onClick={() => onEdit(p.id)}
          className="text-white/30 hover:text-indigo-400 transition-colors p-1.5 rounded-lg hover:bg-indigo-500/10">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={() => onDelete(p.id)}
          className="text-white/30 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function PersonaLibrary() {
  const [personas, setPersonas] = useState<LibraryPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingToLibraryId, setSavingToLibraryId] = useState<string | null>(null);

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    fetch("/api/personas", { headers: auth() })
      .then(r => r.ok ? r.json() : [])
      .then(setPersonas)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const createPersona = async (data: PersonaJson) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setPersonas(prev => [created, ...prev]);
      setShowForm(false);
    } catch { alert("Failed to save persona."); }
    finally { setIsSaving(false); }
  };

  const updatePersona = async (id: string, data: PersonaJson) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/personas/${id}`, {
        method: "PUT",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setPersonas(prev => prev.map(p => p.id === id ? updated : p));
      setEditingId(null);
    } catch { alert("Failed to update persona."); }
    finally { setIsSaving(false); }
  };

  const deletePersona = async (id: string) => {
    if (!confirm("Delete this persona?")) return;
    try {
      await fetch(`/api/personas/${id}`, { method: "DELETE", headers: auth() });
      setPersonas(prev => prev.filter(p => p.id !== id));
    } catch { alert("Failed to delete persona."); }
  };

  const saveToLibrary = async (id: string) => {
    setSavingToLibraryId(id);
    try {
      const res = await fetch(`/api/personas/${id}/save-to-library`, {
        method: "POST",
        headers: auth(),
      });
      if (!res.ok) throw new Error();
      const copy = await res.json();
      setPersonas(prev => [copy, ...prev]);
    } catch { alert("Failed to save persona to library."); }
    finally { setSavingToLibraryId(null); }
  };

  const libraryPersonas = personas.filter(p => p.is_library);
  const projectPersonas = personas.filter(p => !p.is_library);

  const renderGroup = (group: LibraryPersona[], startIndex: number) =>
    group.map((p, i) =>
      editingId === p.id ? (
        <PersonaForm
          key={p.id}
          initial={p.persona_json}
          onSave={(data) => updatePersona(p.id, data)}
          onCancel={() => setEditingId(null)}
          isSaving={isSaving}
        />
      ) : (
        <PersonaCard
          key={p.id}
          p={p}
          index={startIndex + i}
          onEdit={setEditingId}
          onDelete={deletePersona}
          onSaveToLibrary={saveToLibrary}
          savingId={savingToLibraryId}
        />
      )
    );

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in zoom-in duration-500 max-w-4xl mx-auto">

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Persona Library</h1>
          <p className="text-white/60">
            All personas — library and project-linked. Use{" "}
            <BookmarkPlus className="inline w-3.5 h-3.5 text-purple-400" /> to promote a project persona to your reusable library.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-6 h-11 rounded-xl">
            <UserPlus className="w-4 h-4 mr-2" /> Add Persona
          </Button>
        )}
      </div>

      {showForm && (
        <PersonaForm
          initial={emptyForm()}
          onSave={createPersona}
          onCancel={() => setShowForm(false)}
          isSaving={isSaving}
        />
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
        </div>
      ) : personas.length === 0 ? (
        <Card className="glass-card border-none bg-white/5">
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <User className="w-10 h-10 text-white/20" />
            <div>
              <p className="text-white/50 text-sm font-medium">No personas yet</p>
              <p className="text-white/30 text-xs mt-1">Create personas here and reuse them across multiple projects.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {libraryPersonas.length > 0 && (
            <Card className="glass-card border-none bg-white/5">
              <CardHeader>
                <CardTitle className="text-lg text-white">Library</CardTitle>
                <CardDescription className="text-white/50">
                  {libraryPersonas.length} reusable persona{libraryPersonas.length !== 1 ? "s" : ""} — available to any project
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {renderGroup(libraryPersonas, 0)}
                </div>
              </CardContent>
            </Card>
          )}

          {projectPersonas.length > 0 && (
            <Card className="glass-card border-none bg-white/5">
              <CardHeader>
                <CardTitle className="text-lg text-white">Project Personas</CardTitle>
                <CardDescription className="text-white/50">
                  {projectPersonas.length} persona{projectPersonas.length !== 1 ? "s" : ""} tied to specific projects
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {renderGroup(projectPersonas, libraryPersonas.length)}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
