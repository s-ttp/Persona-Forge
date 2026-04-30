"use client";

import React, { useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Download, Loader2, BookOpen, FileSearch, UploadCloud, File, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type OutputTab = "transcripts" | "insights" | "correlate";
type DocFormat = "html" | "docx";

const FORMAT_LABELS: Record<DocFormat, string> = { html: "HTML", docx: "Word (.docx)" };

function FormatPicker({ value, onChange }: { value: DocFormat; onChange: (f: DocFormat) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/40 text-xs">Download as:</span>
      {(["html", "docx"] as DocFormat[]).map(f => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
            value === f
              ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
              : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
          }`}
        >
          {FORMAT_LABELS[f]}
        </button>
      ))}
    </div>
  );
}

export default function OutputPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [activeTab, setActiveTab] = useState<OutputTab>("transcripts");
  const [format, setFormat] = useState<DocFormat>("html");

  const [isDownloadingTranscripts, setIsDownloadingTranscripts] = useState(false);
  const [isDownloadingInsights, setIsDownloadingInsights] = useState(false);
  const [isDownloadingCorrelation, setIsDownloadingCorrelation] = useState(false);

  const refFileInputRef = useRef<HTMLInputElement>(null);
  const [refFile, setRefFile] = useState<File | null>(null);

  const authHeader = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  // ── Download transcripts ──────────────────────────────────────────────────
  const downloadTranscripts = async () => {
    setIsDownloadingTranscripts(true);
    try {
      const res = await fetch(`/api/output/${projectId}/transcripts?format=${format}`, {
        headers: authHeader(),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = cd.match(/filename="(.+)"/)?.[1] ?? `transcripts.${format}`;
      triggerDownload(blob, name);
    } catch (err) {
      console.error(err);
      alert(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDownloadingTranscripts(false);
    }
  };

  // ── Download insights ─────────────────────────────────────────────────────
  const downloadInsights = async () => {
    setIsDownloadingInsights(true);
    try {
      const res = await fetch(`/api/output/${projectId}/insights?format=${format}`, {
        headers: authHeader(),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = cd.match(/filename="(.+)"/)?.[1] ?? `insights.${format}`;
      triggerDownload(blob, name);
    } catch (err) {
      console.error(err);
      alert(`Insights failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDownloadingInsights(false);
    }
  };

  // ── Download correlation ──────────────────────────────────────────────────
  const downloadCorrelation = async () => {
    if (!refFile) return;
    setIsDownloadingCorrelation(true);
    try {
      const formData = new FormData();
      formData.append("file", refFile);
      const res = await fetch(`/api/output/${projectId}/correlate?format=${format}`, {
        method: "POST",
        headers: authHeader(),
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = cd.match(/filename="(.+)"/)?.[1] ?? `correlation.${format}`;
      triggerDownload(blob, name);
    } catch (err) {
      console.error(err);
      alert(`Correlation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDownloadingCorrelation(false);
    }
  };

  const tabs: { key: OutputTab; label: string; icon: React.ReactNode; desc: string }[] = [
    { key: "transcripts", icon: <Download className="w-5 h-5" />, label: "Download Transcripts",       desc: "Export all interview Q&A as HTML or Word" },
    { key: "insights",    icon: <BookOpen className="w-5 h-5" />,  label: "Transcripts + Key Insights", desc: "AI-synthesized thematic report" },
    { key: "correlate",   icon: <FileSearch className="w-5 h-5" />, label: "Reference Correlation",     desc: "Correlate interview data with an uploaded document" },
  ];

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in zoom-in duration-500 max-w-4xl mx-auto">

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Interview Results</h1>
        <p className="text-white/60">Choose how you want to explore and export your interview data.</p>
      </div>

      {/* Output option cards */}
      <div className="grid grid-cols-3 gap-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`p-5 rounded-xl border text-left transition-all ${activeTab === tab.key ? "border-indigo-500/60 bg-indigo-500/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}
          >
            <div className={`mb-3 ${activeTab === tab.key ? "text-indigo-400" : "text-white/40"}`}>{tab.icon}</div>
            <p className={`text-sm font-semibold mb-1 ${activeTab === tab.key ? "text-white" : "text-white/70"}`}>{tab.label}</p>
            <p className="text-white/40 text-xs leading-relaxed">{tab.desc}</p>
          </button>
        ))}
      </div>

      {/* ── Tab: Transcripts ────────────────────────────────────────────────── */}
      {activeTab === "transcripts" && (
        <Card className="glass-card border-none bg-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-white">Download Transcripts</CardTitle>
            <CardDescription className="text-white/50">
              Full Q&amp;A for every interview, including persona profiles and assigned respondent model.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-sm text-white/60 space-y-1">
              <p>Each interview includes:</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5">
                <li>Persona profile (name, age, occupation, background)</li>
                <li>Assigned respondent model</li>
                <li>All question and answer turns in order</li>
              </ul>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <FormatPicker value={format} onChange={setFormat} />
              <Button
                onClick={downloadTranscripts}
                disabled={isDownloadingTranscripts}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-8 disabled:opacity-50 font-medium"
              >
                {isDownloadingTranscripts
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing...</>
                  : <><Download className="w-4 h-4 mr-2" /> Download Transcripts</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Key Insights ──────────────────────────────────────────────── */}
      {activeTab === "insights" && (
        <Card className="glass-card border-none bg-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-white">Transcripts + Key Insights</CardTitle>
            <CardDescription className="text-white/50">
              AI synthesizes your interview corpus into a structured thematic report — themes, patterns, quotes, and implications.
              Generating the report takes 20–40 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4 flex-wrap">
              <FormatPicker value={format} onChange={setFormat} />
              <Button
                onClick={downloadInsights}
                disabled={isDownloadingInsights}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-8 disabled:opacity-50 font-medium"
              >
                {isDownloadingInsights
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating report...</>
                  : <><BookOpen className="w-4 h-4 mr-2" /> Generate &amp; Download Insights</>}
              </Button>
            </div>
            <p className="text-white/30 text-xs">
              The report is generated fresh each time from your interview data. Open the downloaded file in your browser (HTML) or Word.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Reference Correlation ─────────────────────────────────────── */}
      {activeTab === "correlate" && (
        <Card className="glass-card border-none bg-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-white">Reference Correlation</CardTitle>
            <CardDescription className="text-white/50">
              Upload a reference document (report, brief, hypothesis, literature) and AI identifies what the interview data supports, contradicts, or adds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <input
              ref={refFileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.csv,.json"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) setRefFile(e.target.files[0]); }}
            />

            <div
              onClick={() => refFileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.[0]) setRefFile(e.dataTransfer.files[0]); }}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${
                refFile ? "border-indigo-400 bg-indigo-500/10" : "border-white/20 bg-white/5 hover:bg-white/8"
              }`}
            >
              {refFile ? (
                <>
                  <File className="w-10 h-10 text-indigo-400 mb-3" />
                  <p className="text-white font-medium text-sm mb-1">{refFile.name}</p>
                  <p className="text-white/40 text-xs">{(refFile.size / 1024 / 1024).toFixed(2)} MB · click to change</p>
                </>
              ) : (
                <>
                  <UploadCloud className="w-10 h-10 text-white/30 mb-3" />
                  <p className="text-white/70 text-sm font-medium mb-1">Upload reference document</p>
                  <p className="text-white/40 text-xs">PDF, DOCX, TXT, CSV, JSON · max 10 MB</p>
                </>
              )}
            </div>

            {refFile && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-white/60 text-xs">{refFile.name} ready</span>
              </div>
            )}

            <div className="flex items-center gap-4 flex-wrap">
              <FormatPicker value={format} onChange={setFormat} />
              <Button
                onClick={downloadCorrelation}
                disabled={!refFile || isDownloadingCorrelation}
                className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-8 disabled:opacity-50 font-medium"
              >
                {isDownloadingCorrelation
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing &amp; generating...</>
                  : <><FileSearch className="w-4 h-4 mr-2" /> Run Correlation &amp; Download</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
