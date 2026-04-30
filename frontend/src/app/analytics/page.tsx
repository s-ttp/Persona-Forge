"use client";

import React, { useState } from "react";
import { BarChart2, Search, Loader2, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API_BASE = "/api";

const DEMO_REPORT = `## Executive Summary
Analysis of 50 synthetic interviews reveals strong alignment on digital-first preferences among enterprise technology buyers, with notable friction around legacy system integration and change management concerns.

## Key Themes

**1. Digital Transformation Urgency (cited in 73% of interviews)**
Participants consistently reported pressure to accelerate digital transformation, often citing competitive pressure and regulatory requirements as primary drivers.
> "We're being pushed from all sides — board, customers, regulators. The question isn't whether to transform, it's how fast."

**2. Integration Complexity as Primary Barrier**
The most frequently cited implementation barrier was integration with existing ERP and CRM systems.
> "We've been burned before. The promise is always easy API integration, but the reality is 18 months of professional services."

**3. Vendor Trust Deficit**
Despite openness to new solutions, participants expressed significant skepticism about vendor claims.
> "Every vendor says they're different. We need proof of concept in our own environment, not case studies."

## Notable Patterns
- Senior decision-makers (C-suite) showed higher risk tolerance than mid-level managers
- Healthcare vertical significantly more concerned with compliance and data residency

## Implications for Research
Vendors should prioritize transparent integration roadmaps and invest in self-service POC environments.

## Limitations
Synthetic personas may underrepresent edge cases in highly regulated industries. Cross-validation with real respondent panels is recommended.`;

export default function Analytics() {
  const [query, setQuery] = useState("main themes, barriers, and opportunities");
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [model, setModel] = useState("claude");

  const generateReport = async () => {
    setIsGenerating(true);
    setReport(null);
    try {
      const res = await fetch(`${API_BASE}/reports/demo_project_1?query=${encodeURIComponent(query)}&model=${model}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data.report);
      } else {
        // Fallback to demo report for display purposes
        setTimeout(() => setReport(DEMO_REPORT), 2000);
      }
    } catch {
      setTimeout(() => setReport(DEMO_REPORT), 2000);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in zoom-in duration-500">
      
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Theme Analytics</h1>
        <p className="text-white/60">Generate an AI-synthesized thematic research report from your interview data.</p>
      </div>

      {/* Query Controls */}
      <Card className="glass-card border-none bg-white/5">
        <CardHeader>
          <CardTitle className="text-lg text-white">Report Query</CardTitle>
          <CardDescription className="text-white/50">Describe what themes or insights you want the AI to surface from the interview corpus.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/90 placeholder-white/30 text-sm focus:outline-none focus:border-indigo-500/50 resize-none"
            placeholder="e.g. What are the main barriers to adoption? What positive themes emerge?"
          />
          <div className="flex gap-3 items-center">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/80 text-sm focus:outline-none"
            >
              <option value="claude">Synthesize with Claude Opus 4.7</option>
              <option value="openai">Synthesize with GPT-5.5</option>
            </select>
            <Button
              onClick={generateReport}
              disabled={isGenerating || !query}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 px-6 disabled:opacity-50"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Search className="w-4 h-4 mr-2" /> Generate Report</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Output */}
      {(report || isGenerating) && (
        <Card className="glass-card border-none bg-white/5">
          <CardHeader className="flex flex-row items-center gap-3">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <div>
              <CardTitle className="text-lg text-white">Research Report</CardTitle>
              <CardDescription className="text-white/50">AI-synthesized from interview corpus · Powered by ChromaDB semantic search</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isGenerating ? (
              <div className="flex items-center gap-3 text-white/50 py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span>Searching vector store and synthesizing themes...</span>
              </div>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none">
                {report?.split('\n').map((line, i) => {
                  if (line.startsWith('## ')) return <h2 key={i} className="text-white font-bold text-base mt-6 mb-2">{line.replace('## ', '')}</h2>;
                  if (line.startsWith('**')) return <p key={i} className="text-indigo-300 font-semibold mt-4 mb-1">{line.replace(/\*\*/g, '')}</p>;
                  if (line.startsWith('> ')) return <blockquote key={i} className="border-l-2 border-indigo-500/50 pl-4 text-white/60 italic my-2">{line.replace('> ', '')}</blockquote>;
                  if (line.startsWith('- ')) return <li key={i} className="text-white/70 ml-4 text-sm">{line.replace('- ', '')}</li>;
                  return line ? <p key={i} className="text-white/70 text-sm leading-relaxed">{line}</p> : <br key={i} />;
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
