import React, { useState, useEffect, useRef } from 'react';
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
  Loader2,
  Trash2,
  Copy,
  Check,
  FolderOpen,
  ShieldCheck,
  RefreshCw,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  X,
  Target,
  LogIn,
  RotateCcw
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

function getOrCreateSessionId() {
  let sessionId = localStorage.getItem('rag_session_id');
  if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    localStorage.setItem('rag_session_id', sessionId);
  }
  return sessionId;
}

function getStoredChatHistory(sessionId) {
  try {
    const saved = localStorage.getItem('rag_chat_' + sessionId);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export default function App() {
  // Session State
  const [sessionId, setSessionId] = useState(getOrCreateSessionId);
  const [copiedSession, setCopiedSession] = useState(false);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [inputSessionId, setInputSessionId] = useState('');

  // Document Library State
  const [files, setFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState('ALL'); // 'ALL' or specific filename
  const [deletingFilename, setDeletingFilename] = useState(null);

  // Upload State
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Search & Chat State (persisted in localStorage)
  const [question, setQuestion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [chatHistory, setChatHistory] = useState(() => getStoredChatHistory(getOrCreateSessionId()));
  const [searchError, setSearchError] = useState('');
  const [expandedSources, setExpandedSources] = useState({});
  const [copiedAnswerIdx, setCopiedAnswerIdx] = useState(null);

  const chatEndRef = useRef(null);

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('rag_chat_' + sessionId, JSON.stringify(chatHistory));
    }
  }, [chatHistory, sessionId]);

  // Load uploaded files list from backend
  const fetchFiles = async (currentSessionId = sessionId) => {
    setIsLoadingFiles(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/files`, {
        params: { sessionId: currentSessionId }
      });
      setFiles(res.data.files || []);
    } catch (err) {
      console.error('Failed to fetch document files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchFiles(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isSearching]);

  // Create a new session
  const handleNewSession = () => {
    if (confirm('Create a new workspace session? Your current file list and chat will start fresh for the new workspace.')) {
      const newId = 'session_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      localStorage.setItem('rag_session_id', newId);
      setSessionId(newId);
      setSelectedFile('ALL');
      setChatHistory([]);
      setUploadSuccess('');
      setUploadError('');
      setSearchError('');
      fetchFiles(newId);
    }
  };

  // Switch to an existing session (e.g. from yesterday or another device)
  const handleSwitchSession = (e) => {
    e.preventDefault();
    const targetId = inputSessionId.trim();
    if (!targetId) return;

    localStorage.setItem('rag_session_id', targetId);
    setSessionId(targetId);
    setSelectedFile('ALL');
    setChatHistory(getStoredChatHistory(targetId));
    setUploadSuccess('');
    setUploadError('');
    setSearchError('');
    setShowSwitchModal(false);
    setInputSessionId('');
    fetchFiles(targetId);
  };

  const copySessionId = () => {
    navigator.clipboard.writeText(sessionId);
    setCopiedSession(true);
    setTimeout(() => setCopiedSession(false), 2000);
  };

  const clearChatHistory = () => {
    if (confirm('Clear the chat history for this workspace? (Your uploaded files will remain intact)')) {
      setChatHistory([]);
      localStorage.removeItem('rag_chat_' + sessionId);
    }
  };

  // Handle File Drag & Drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf' || droppedFile.name.endsWith('.pdf')) {
        setFile(droppedFile);
        setUploadError('');
      } else {
        setUploadError('Only PDF files are supported.');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type === 'application/pdf' || selected.name.endsWith('.pdf')) {
        setFile(selected);
        setUploadError('');
      } else {
        setUploadError('Please select a valid .pdf file.');
      }
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
    formData.append('sessionId', sessionId);

    setIsUploading(true);
    setUploadError('');
    setUploadSuccess('');
    setUploadStep('Parsing PDF & Extracting Text...');

    const timer1 = setTimeout(() => setUploadStep('Generating 384-dim Vector Embeddings locally...'), 1200);
    const timer2 = setTimeout(() => setUploadStep('Saving Chunks to Supabase pgvector...'), 2800);

    try {
      const response = await axios.post(`${BACKEND_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploadSuccess(`Successfully indexed "${response.data.filename}" into ${response.data.totalchunks} vector chunks.`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchFiles(sessionId);
    } catch (err) {
      console.error(err);
      setUploadError(err.response?.data?.error || 'Failed to upload and vectorize PDF.');
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setIsUploading(false);
      setUploadStep('');
    }
  };

  // Delete Document Handler
  const handleDeleteFile = async (filenameToDelete, e) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${filenameToDelete}" from your vector database?`)) {
      return;
    }

    setDeletingFilename(filenameToDelete);
    try {
      await axios.delete(`${BACKEND_URL}/files/${encodeURIComponent(filenameToDelete)}`, {
        params: { sessionId }
      });
      if (selectedFile === filenameToDelete) {
        setSelectedFile('ALL');
      }
      await fetchFiles(sessionId);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to delete document.');
    } finally {
      setDeletingFilename(null);
    }
  };

  // Query & Chat Handler
  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!question.trim() || isSearching) return;

    const currentQuery = question.trim();
    setQuestion('');
    setSearchError('');
    setIsSearching(true);

    const targetScope = selectedFile === 'ALL' ? 'All Documents' : selectedFile;

    // Optimistically add user question to chat
    const tempId = Date.now();
    setChatHistory((prev) => [
      ...prev,
      {
        id: tempId,
        sender: 'user',
        text: currentQuery,
        target: targetScope,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    try {
      const response = await axios.post(`${BACKEND_URL}/query`, {
        question: currentQuery,
        sessionId: sessionId,
        filename: selectedFile === 'ALL' ? null : selectedFile,
      });

      setChatHistory((prev) => [
        ...prev,
        {
          id: tempId + 1,
          sender: 'ai',
          text: response.data.answer,
          sources: response.data.sources || [],
          targetDocument: response.data.targetDocument,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || 'Failed to generate answer. Please verify your connection.';
      setSearchError(errMsg);
      setChatHistory((prev) => [
        ...prev,
        {
          id: tempId + 1,
          sender: 'ai',
          isError: true,
          text: errMsg,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSourceExpand = (messageId) => {
    setExpandedSources((prev) => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const copyAnswer = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedAnswerIdx(idx);
    setTimeout(() => setCopiedAnswerIdx(null), 2000);
  };

  const suggestedPrompts = [
    "What are the main key takeaways in this document?",
    "Summarize the conclusions and action items.",
    "List the critical numbers, dates, and metrics mentioned."
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-indigo-500/30">
      
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl sticky top-0 z-40 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Database className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
              Agentic RAG Intelligence
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Private Vector Search & Grounded Gemini Q&A
            </p>
          </div>
        </div>

        {/* Session Isolation Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Workspace:</span>
            <span className="font-mono text-indigo-300 font-medium truncate max-w-[120px]">{sessionId}</span>
            <button 
              onClick={copySessionId}
              title="Copy workspace ID"
              className="ml-1 text-slate-400 hover:text-white transition-colors"
            >
              {copiedSession ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            onClick={() => setShowSwitchModal(true)}
            className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700/60 transition-all hover:border-slate-600 shadow-sm"
          >
            <LogIn className="w-3.5 h-3.5 text-blue-400" />
            <span>Load Workspace</span>
          </button>

          <button
            onClick={handleNewSession}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-sm shadow-indigo-600/30 transition-all"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Session</span>
          </button>
        </div>
      </header>

      {/* Switch Session Modal */}
      {showSwitchModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <LogIn className="w-4 h-4 text-indigo-400" />
                Resume Previous Workspace Session
              </h3>
              <button 
                onClick={() => setShowSwitchModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Paste your saved Workspace / Session ID below to restore all your uploaded files and chat progress from yesterday or another browser:
            </p>

            <form onSubmit={handleSwitchSession} className="space-y-4">
              <input
                type="text"
                value={inputSessionId}
                onChange={(e) => setInputSessionId(e.target.value)}
                placeholder="e.g. session_abc123_xyz"
                className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white rounded-xl py-2.5 px-3.5 text-xs font-mono placeholder:text-slate-600"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSwitchModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!inputSessionId.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-xl transition-all shadow-md"
                >
                  Load Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* LEFT COLUMN: Document Hub & Upload (5 cols) */}
        <aside className="lg:col-span-5 space-y-6 flex flex-col">
          
          {/* Upload Dropzone Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl backdrop-blur-md relative overflow-hidden group">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-400" />
                Upload PDF Document
              </h2>
              <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">
                pgvector (384-dim)
              </span>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                  isDragOver 
                    ? 'border-indigo-500 bg-indigo-500/10' 
                    : file 
                    ? 'border-emerald-500/60 bg-emerald-500/5' 
                    : 'border-slate-800 hover:border-indigo-500/50 bg-slate-950/40 hover:bg-slate-900/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isUploading}
                />
                
                {file ? (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-slate-200 truncate max-w-[240px]">{file.name}</p>
                      <p className="text-xs text-slate-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-xl bg-slate-800/80 text-slate-400 flex items-center justify-center border border-slate-700/40 group-hover:text-indigo-400 transition-colors">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-slate-300">Click to upload or drag & drop</p>
                      <p className="text-xs text-slate-500">PDF documents up to 25MB</p>
                    </div>
                  </>
                )}
              </div>

              {uploadError && (
                <div className="flex items-start gap-2.5 text-rose-300 text-xs bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadSuccess && (
                <div className="flex items-start gap-2.5 text-emerald-300 text-xs bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading || !file}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>{uploadStep || 'Processing Document...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-indigo-200" />
                    <span>Index & Vectorize Document</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Document Library Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl backdrop-blur-md flex-1 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Your Document Library
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                  {files.length} {files.length === 1 ? 'file' : 'files'}
                </span>
                <button
                  onClick={() => fetchFiles(sessionId)}
                  title="Refresh library"
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Scope Filter Buttons */}
            {files.length > 0 && (
              <div className="mb-3 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 uppercase font-semibold mr-1 flex items-center gap-1">
                  <Target className="w-3 h-3 text-indigo-400" /> Target:
                </span>
                <button
                  onClick={() => setSelectedFile('ALL')}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                    selectedFile === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/50'
                  }`}
                >
                  All Documents ({files.length})
                </button>
              </div>
            )}

            {/* File List Items */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar max-h-[300px]">
              {isLoadingFiles && files.length === 0 ? (
                <div className="h-40 flex items-center justify-center flex-col gap-2 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                  <span className="text-xs">Fetching your documents...</span>
                </div>
              ) : files.length === 0 ? (
                <div className="h-44 border border-dashed border-slate-800/80 rounded-xl flex flex-col items-center justify-center p-4 text-center text-slate-500">
                  <FileText className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-xs font-medium text-slate-400">No documents in this workspace yet</p>
                  <p className="text-[11px] text-slate-600 mt-1">Upload a PDF above to start querying.</p>
                </div>
              ) : (
                files.map((f) => {
                  const isSelected = selectedFile === f.filename;
                  const isDeleting = deletingFilename === f.filename;

                  return (
                    <div
                      key={f.filename}
                      onClick={() => setSelectedFile(isSelected ? 'ALL' : f.filename)}
                      className={`group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-indigo-950/40 border-indigo-500/50 ring-1 ring-indigo-500/30'
                          : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`p-2 rounded-lg ${isSelected ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800/60 text-slate-400'}`}>
                          <FileText className="w-4 h-4 shrink-0" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate">{f.filename}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.2 rounded">
                              {f.chunkCount} chunks
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(f.uploadedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isSelected && (
                          <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                        <button
                          onClick={(e) => handleDeleteFile(f.filename, e)}
                          disabled={isDeleting}
                          title={`Delete ${f.filename}`}
                          className="opacity-60 group-hover:opacity-100 p-1.5 hover:bg-rose-500/10 hover:text-rose-400 text-slate-500 rounded-lg transition-all"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </aside>

        {/* RIGHT COLUMN: Chat & Q&A Workspace (7 cols) */}
        <section className="lg:col-span-7 flex flex-col bg-slate-900/70 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden min-h-[600px]">
          
          {/* Chat Workspace Header */}
          <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-slate-200">
                Grounded Document Assistant
              </h2>
            </div>
            
            <div className="flex items-center gap-2">
              {chatHistory.length > 0 && (
                <button
                  onClick={clearChatHistory}
                  title="Clear chat messages"
                  className="text-xs text-slate-400 hover:text-rose-300 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors mr-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Clear Chat</span>
                </button>
              )}

              <span className="text-xs text-slate-400">Target:</span>
              <span className={`text-xs font-mono font-medium px-2.5 py-1 rounded-full border ${
                selectedFile === 'ALL' 
                  ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' 
                  : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
              }`}>
                {selectedFile === 'ALL' ? 'All Uploaded Files' : selectedFile}
              </span>
              {selectedFile !== 'ALL' && (
                <button
                  onClick={() => setSelectedFile('ALL')}
                  title="Clear file focus"
                  className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1 hover:underline"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Conversation Message Feed */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar max-h-[560px]">
            {chatHistory.length === 0 ? (
              <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-6 space-y-5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Bot className="w-6 h-6" />
                </div>
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-base font-bold text-slate-200">
                    Ask Questions Grounded in Your Documents
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Upload a PDF on the left, then ask specific questions. The system performs vector similarity search in pgvector and synthesizes an answer using Gemini.
                  </p>
                </div>

                {files.length > 0 && (
                  <div className="w-full max-w-md space-y-2 pt-2 text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Suggested prompts:
                    </p>
                    <div className="space-y-1.5">
                      {suggestedPrompts.map((promptText, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setQuestion(promptText);
                          }}
                          className="w-full text-left text-xs bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/40 p-2.5 rounded-xl text-slate-300 transition-all flex items-center justify-between group"
                        >
                          <span>{promptText}</span>
                          <Sparkles className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              chatHistory.map((msg, index) => (
                <div
                  key={msg.id || index}
                  className={`flex flex-col gap-2 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  {/* Sender Header */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 px-1">
                    {msg.sender === 'user' ? (
                      <>
                        <span>You</span>
                        <User className="w-3 h-3 text-blue-400" />
                        <span className="text-slate-600">• {msg.timestamp}</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-3 h-3 text-indigo-400" />
                        <span className="font-semibold text-indigo-300">Gemini Grounded Agent</span>
                        <span className="text-slate-600">• {msg.timestamp}</span>
                      </>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[90%] sm:max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none shadow-md'
                        : msg.isError
                        ? 'bg-rose-950/40 border border-rose-500/30 text-rose-200 rounded-tl-none'
                        : 'bg-slate-800/80 border border-slate-700/60 text-slate-200 rounded-tl-none shadow-md'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {/* AI Answer Toolbar */}
                    {msg.sender === 'ai' && !msg.isError && (
                      <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-400">
                        <button
                          onClick={() => copyAnswer(msg.text, index)}
                          className="flex items-center gap-1 hover:text-slate-200 transition-colors"
                        >
                          {copiedAnswerIdx === index ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Answer</span>
                            </>
                          )}
                        </button>

                        {msg.sources && msg.sources.length > 0 && (
                          <button
                            onClick={() => toggleSourceExpand(msg.id || index)}
                            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span>{msg.sources.length} Context Sources</span>
                            {expandedSources[msg.id || index] ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Collapsible Retrieved Sources Accordion */}
                    {msg.sender === 'ai' && expandedSources[msg.id || index] && msg.sources && (
                      <div className="mt-3 space-y-2 pt-2 border-t border-slate-700/40 animate-fadeIn">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          Retrieved pgvector Document Chunks:
                        </span>
                        {msg.sources.map((src, sIdx) => (
                          <div
                            key={sIdx}
                            className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px] text-indigo-300 font-mono">
                              <span className="font-semibold">{src.filename} (Chunk #{src.chunkIndex + 1})</span>
                              {src.similarity && (
                                <span className="bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">
                                  Match Score: {src.similarity}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-300 leading-relaxed font-sans text-[11px] line-clamp-4">
                              {src.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {isSearching && (
              <div className="flex items-start gap-2 animate-fadeIn">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl rounded-tl-none flex items-center gap-3 text-xs text-slate-300">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Searching vector database & synthesizing grounded answer...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Search Query Input Form */}
          <div className="p-4 bg-slate-900/90 border-t border-slate-800/80">
            {searchError && (
              <div className="mb-3 flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{searchError}</span>
              </div>
            )}

            <form onSubmit={handleSearch} className="relative flex items-center">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  files.length === 0
                    ? "Upload a PDF document first to ask questions..."
                    : selectedFile === 'ALL'
                    ? "Ask anything across all uploaded documents..."
                    : `Ask question specific to "${selectedFile}"...`
                }
                disabled={isSearching || files.length === 0}
                className="w-full bg-slate-950 border border-slate-700/80 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 text-white rounded-xl py-3 pl-4 pr-12 text-xs sm:text-sm placeholder:text-slate-500 transition-all shadow-inner"
              />
              <button
                type="submit"
                disabled={isSearching || !question.trim() || files.length === 0}
                className="absolute right-2 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-all shadow-md"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>

        </section>

      </main>
    </div>
  );
}