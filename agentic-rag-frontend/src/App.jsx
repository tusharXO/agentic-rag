import React, { useState } from 'react';
import axios from 'axios';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Sparkles, 
  Layers, 
  Database,
  Loader2 
} from 'lucide-react';

export default function App() {
  // Upload State
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadData, setUploadData] = useState(null);
  const [uploadError, setUploadError] = useState('');

  // Search State
  const [question, setQuestion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [chatResult, setChatResult] = useState(null);
  const [searchError, setSearchError] = useState('');

  // Handle File Drop / Select
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadError('');
      setUploadSuccess(false);
    }
  };

  // Upload PDF Handler
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setUploadError('Please select a PDF file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    setUploadError('');
    setUploadSuccess(false);

    try {
      const response = await axios.post('http://localhost:3000/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploadData(response.data);
      setUploadSuccess(true);
    } catch (err) {
      console.error(err);
      setUploadError(err.response?.data?.error || 'Failed to upload and process PDF.');
    } finally {
      setIsUploading(false);
    }
  };

  // Search / Query Handler
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsSearching(true);
    setSearchError('');

    try {
      const response = await axios.post('http://localhost:3000/query', {
        question: question,
      });

      setChatResult(response.data);
    } catch (err) {
      console.error(err);
      setSearchError(err.response?.data?.error || 'Failed to generate answer.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="border-b border-slate-800 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
              <Database className="w-8 h-8 text-blue-400" />
              RAG Document Intelligence
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Upload PDFs, generate vector embeddings, and query context using Postgres + Gemini.
            </p>
          </div>
          <span className="bg-blue-500/10 text-blue-400 text-xs font-semibold px-3 py-1.5 rounded-full border border-blue-500/20">
            pgvector Ready
          </span>
        </header>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Upload & Chunk Inspector (5 cols) */}
          <section className="lg:col-span-5 space-y-6">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <Upload className="w-5 h-5 text-blue-400" />
                1. Upload & Vectorize
              </h2>

              <form onSubmit={handleUpload} className="space-y-4">
                <label className="border-2 border-dashed border-slate-700 hover:border-blue-500/50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-900/40">
                  <FileText className="w-10 h-10 text-slate-500 mb-2" />
                  <span className="text-sm font-medium text-slate-300">
                    {file ? file.name : 'Click to select PDF'}
                  </span>
                  <span className="text-xs text-slate-500 mt-1">PDF up to 10MB</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>

                {uploadError && (
                  <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {uploadSuccess && (
                  <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Processed & saved to Postgres!</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUploading || !file}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Parsing, Chunking & Embedding...
                    </>
                  ) : (
                    'Process PDF'
                  )}
                </button>
              </form>
            </div>

            {/* Chunk Viewer Card */}
            {uploadData && (
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    Generated Chunks
                  </h3>
                  <span className="text-xs font-mono bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded">
                    {uploadData.totalchunks} total
                  </span>
                </div>

                <div className="max-h-72 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {uploadData.chunks.map((chunk) => (
                    <div
                      key={chunk.chunkIndex}
                      className="bg-slate-900/60 border border-slate-700/40 p-3 rounded-xl space-y-1 text-xs"
                    >
                      <span className="font-semibold text-blue-400 font-mono">
                        [Chunk #{chunk.chunkIndex + 1}]
                      </span>
                      <p className="text-slate-300 line-clamp-3 leading-relaxed">
                        {chunk.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* RIGHT COLUMN: Search & Answers (7 cols) */}
          <section className="lg:col-span-7 space-y-6">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm shadow-xl space-y-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-400" />
                2. Vector Search & RAG Q&A
              </h2>

              <form onSubmit={handleSearch} className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask something about your document..."
                    disabled={isSearching}
                    className="w-full bg-slate-900/80 border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white rounded-xl py-3 pl-4 pr-12 text-sm placeholder:text-slate-500 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !question.trim()}
                    className="absolute right-2 top-1.2/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors"
                  >
                    {isSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </form>

              {searchError && (
                <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}

              {/* AI Generated Answer Box */}
              {chatResult && (
                <div className="space-y-6 pt-2 border-t border-slate-700/60">
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Grounded Answer
                    </span>
                    <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-4 text-slate-200 text-sm leading-relaxed">
                      {chatResult.answer}
                    </div>
                  </div>

                  {/* Context Sources Box */}
                  <div className="space-y-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Retrieved Context Chunks (pgvector Top Matches)
                    </span>
                    <div className="space-y-3">
                      {chatResult.sources.map((sourceText, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-900/80 border-l-2 border-indigo-500 p-3.5 rounded-r-xl text-xs space-y-1"
                        >
                          <span className="text-indigo-300 font-semibold font-mono">
                            Match #{idx + 1}
                          </span>
                          <p className="text-slate-300 leading-relaxed">
                            {sourceText}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}