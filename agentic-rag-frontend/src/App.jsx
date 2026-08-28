import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Send,
  Layers, 
  Database,
  Loader2,
  Trash2,
  Copy,
  Check,
  Folder,
  RefreshCw,
  Plus,
  X,
  LogIn,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

function getOrCreateSessionId() {
  let sessionId = localStorage.getItem('rag_session_id');
  if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36).substring(4);
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

  // Documents State
  const [files, setFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState('ALL');
  const [deletingFilename, setDeletingFilename] = useState(null);

  // Upload State
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Search & Chat State
  const [question, setQuestion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [chatHistory, setChatHistory] = useState(() => getStoredChatHistory(getOrCreateSessionId()));
  const [searchError, setSearchError] = useState('');
  const [expandedSources, setExpandedSources] = useState({});
  const [copiedAnswerIdx, setCopiedAnswerIdx] = useState(null);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Save chat history
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('rag_chat_' + sessionId, JSON.stringify(chatHistory));
    }
  }, [chatHistory, sessionId]);

  // Fetch document library
  const fetchFiles = async (currentSessionId = sessionId) => {
    setIsLoadingFiles(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/files`, {
        params: { sessionId: currentSessionId }
      });
      setFiles(res.data.files || []);
    } catch (err) {
      console.error('Failed to fetch files:', err);
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

  // Session Handlers
  const handleNewSession = () => {
    if (confirm('Create a new workspace session?')) {
      const newId = 'session_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36).substring(4);
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
    if (confirm('Clear the chat conversation for this workspace?')) {
      setChatHistory([]);
      localStorage.removeItem('rag_chat_' + sessionId);
    }
  };

  // Drag & Drop
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
    setUploadStep('Extracting text from PDF...');

    const timer1 = setTimeout(() => setUploadStep('Computing vector embeddings...'), 900);
    const timer2 = setTimeout(() => setUploadStep('Saving chunks to database...'), 2200);

    try {
      const response = await axios.post(`${BACKEND_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploadSuccess(`Saved "${response.data.filename}" (${response.data.totalchunks} chunks)`);
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

  // Delete Document
  const handleDeleteFile = async (filenameToDelete, e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${filenameToDelete}" from your database?`)) return;

    setDeletingFilename(filenameToDelete);
    try {
      await axios.delete(`${BACKEND_URL}/files/${encodeURIComponent(filenameToDelete)}`, {
        params: { sessionId }
      });
      if (selectedFile === filenameToDelete) setSelectedFile('ALL');
      await fetchFiles(sessionId);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to delete file.');
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
      const errMsg = err.response?.data?.error || 'Failed to process question.';
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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const toggleSourceExpand = (id) => {
    setExpandedSources((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyAnswer = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedAnswerIdx(idx);
    setTimeout(() => setCopiedAnswerIdx(null), 2000);
  };

  const suggestedPrompts = [
    "What are the main key points in this document?",
    "Summarize the key conclusions and action items.",
    "List all numbers, critical dates, and metrics mentioned."
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans antialiased overflow-hidden">
      
      {/* TOP NAVBAR (Fixed Height) */}
      <header className="h-14 shrink-0 border-b border-zinc-800 bg-zinc-900 px-4 sm:px-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-blue-400">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              Agentic RAG
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
                pgvector
              </span>
            </h1>
          </div>
        </div>

        {/* Workspace Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs text-zinc-400">
            <span className="text-[11px] text-zinc-500">Workspace:</span>
            <span className="font-mono text-zinc-300 truncate max-w-[120px]">{sessionId}</span>
            <button 
              onClick={copySessionId}
              title="Copy Workspace ID"
              className="text-zinc-500 hover:text-zinc-300 transition-colors ml-1"
            >
              {copiedSession ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            onClick={() => setShowSwitchModal(true)}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-zinc-700 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Load Workspace</span>
            <span className="sm:hidden">Load</span>
          </button>

          <button
            onClick={handleNewSession}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Session</span>
          </button>
        </div>
      </header>

      {/* Switch Session Modal */}
      {showSwitchModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 max-w-sm w-full space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                <LogIn className="w-4 h-4 text-blue-400" />
                Resume Workspace
              </h3>
              <button 
                onClick={() => setShowSwitchModal(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-normal">
              Enter your Workspace ID to restore your uploaded files and chat progress:
            </p>

            <form onSubmit={handleSwitchSession} className="space-y-3">
              <input
                type="text"
                value={inputSessionId}
                onChange={(e) => setInputSessionId(e.target.value)}
                placeholder="e.g. session_abc123_xyz"
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-blue-500 focus:outline-none text-zinc-100 rounded-lg py-2 px-3 text-xs font-mono placeholder:text-zinc-600"
              />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSwitchModal(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!inputSessionId.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors"
                >
                  Load
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE BODY (Full Remaining Height) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT SIDEBAR: Document Management (w-80 or w-96) */}
        <aside className="w-80 lg:w-96 shrink-0 border-r border-zinc-800 bg-zinc-900/50 flex flex-col h-full overflow-hidden">
          
          {/* Upload Area Header */}
          <div className="p-4 border-b border-zinc-800 shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                Upload PDF
              </h2>
              <span className="text-[10px] text-zinc-500 font-mono">Max 25MB</span>
            </div>

            <form onSubmit={handleUpload} className="space-y-2.5">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-lg p-3.5 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1.5 ${
                  isDragOver 
                    ? 'border-blue-500 bg-blue-500/10' 
                    : file 
                    ? 'border-emerald-500/60 bg-emerald-500/5' 
                    : 'border-zinc-700 hover:border-zinc-600 bg-zinc-950/60 hover:bg-zinc-900'
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
                    <FileText className="w-5 h-5 text-emerald-400" />
                    <p className="text-xs font-medium text-zinc-200 truncate max-w-[200px]">{file.name}</p>
                    <p className="text-[10px] text-zinc-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-zinc-500" />
                    <p className="text-xs font-medium text-zinc-300">Choose PDF or drop here</p>
                    <p className="text-[10px] text-zinc-500">Vectorized locally (all-MiniLM-L6-v2)</p>
                  </>
                )}
              </div>

              {uploadError && (
                <div className="flex items-start gap-2 text-rose-300 text-xs bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              {uploadSuccess && (
                <div className="flex items-start gap-2 text-emerald-300 text-xs bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading || !file}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium py-2 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{uploadStep || 'Processing PDF...'}</span>
                  </>
                ) : (
                  <span>Process & Index Document</span>
                )}
              </button>
            </form>
          </div>

          {/* Document Library Section Header */}
          <div className="px-4 py-2.5 border-b border-zinc-800 shrink-0 flex items-center justify-between bg-zinc-900/30">
            <div className="flex items-center gap-2">
              <Folder className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-300">Uploaded Documents</span>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.2 rounded border border-zinc-700">
                {files.length}
              </span>
            </div>

            <button
              onClick={() => fetchFiles(sessionId)}
              title="Refresh document list"
              className="text-zinc-500 hover:text-zinc-300 p-1 rounded"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Scrollable File List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {isLoadingFiles && files.length === 0 ? (
              <div className="h-32 flex items-center justify-center gap-2 text-zinc-500 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span>Loading documents...</span>
              </div>
            ) : files.length === 0 ? (
              <div className="h-40 border border-dashed border-zinc-800 rounded-lg flex flex-col items-center justify-center p-4 text-center text-zinc-500 text-xs">
                <FileText className="w-6 h-6 mb-1 opacity-30" />
                <p className="font-medium text-zinc-400">No documents yet</p>
                <p className="text-[11px] text-zinc-600 mt-0.5">Upload a PDF above to start querying.</p>
              </div>
            ) : (
              <>
                {/* Target All Files Button */}
                <div
                  onClick={() => setSelectedFile('ALL')}
                  className={`p-2.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-between ${
                    selectedFile === 'ALL'
                      ? 'bg-blue-950/40 border-blue-600/60 text-blue-200'
                      : 'bg-zinc-950 border-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs font-medium">Search All Documents</span>
                  </div>
                  {selectedFile === 'ALL' && (
                    <span className="text-[9px] font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                      Active
                    </span>
                  )}
                </div>

                {/* Individual File Items */}
                {files.map((f) => {
                  const isSelected = selectedFile === f.filename;
                  const isDeleting = deletingFilename === f.filename;

                  return (
                    <div
                      key={f.filename}
                      onClick={() => setSelectedFile(isSelected ? 'ALL' : f.filename)}
                      className={`p-2.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-blue-950/40 border-blue-600/60 text-blue-200'
                          : 'bg-zinc-950 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-zinc-500'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{f.filename}</p>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                            <span>{f.chunkCount} chunks</span>
                            <span>•</span>
                            <span>{new Date(f.uploadedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {isSelected && (
                          <span className="text-[9px] font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                            Active
                          </span>
                        )}
                        <button
                          onClick={(e) => handleDeleteFile(f.filename, e)}
                          disabled={isDeleting}
                          title={`Delete ${f.filename}`}
                          className="p-1 text-zinc-600 hover:text-rose-400 transition-colors"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* RIGHT MAIN CHAT AREA (Flex Column, Full Height) */}
        <section className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950">
          
          {/* Active Filter Scope Subheader */}
          <div className="h-11 shrink-0 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-900/30">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">Query Target:</span>
              <span className={`font-mono text-xs px-2 py-0.5 rounded border ${
                selectedFile === 'ALL'
                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
              }`}>
                {selectedFile === 'ALL' ? 'All Uploaded Documents' : selectedFile}
              </span>
              {selectedFile !== 'ALL' && (
                <button
                  onClick={() => setSelectedFile('ALL')}
                  title="Reset filter to all documents"
                  className="text-zinc-500 hover:text-zinc-300 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {chatHistory.length > 0 && (
              <button
                onClick={clearChatHistory}
                title="Clear conversation messages"
                className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 px-2 py-1 rounded transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear Chat</span>
              </button>
            )}
          </div>

          {/* Messages Scroll Feed (Takes All Free Height) */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-5">
            {chatHistory.length === 0 ? (
              <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-4 space-y-4">
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
                  <Database className="w-5 h-5" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Grounded Document Intelligence
                  </h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Upload your PDF documents on the left. The system indexes text into pgvector chunks and generates answers grounded strictly in your content.
                  </p>
                </div>

                {files.length > 0 && (
                  <div className="w-full max-w-md space-y-2 pt-2 text-left">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Suggested questions:
                    </p>
                    <div className="space-y-1.5">
                      {suggestedPrompts.map((promptText, i) => (
                        <button
                          key={i}
                          onClick={() => setQuestion(promptText)}
                          className="w-full text-left text-xs bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 p-2.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-between group"
                        >
                          <span>{promptText}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-blue-400" />
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
                  className={`flex flex-col gap-1.5 max-w-4xl mx-auto ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 px-1">
                    <span>{msg.sender === 'user' ? 'You' : 'Grounded Assistant'}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[90%] sm:max-w-[85%] rounded-xl p-4 text-xs sm:text-sm leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-none'
                        : msg.isError
                        ? 'bg-rose-950/40 border border-rose-500/30 text-rose-200 rounded-tl-none'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.text}</div>

                    {msg.sender === 'ai' && !msg.isError && (
                      <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
                        <button
                          onClick={() => copyAnswer(msg.text, index)}
                          className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                        >
                          {copiedAnswerIdx === index ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        {msg.sources && msg.sources.length > 0 && (
                          <button
                            onClick={() => toggleSourceExpand(msg.id || index)}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium transition-colors"
                          >
                            <Layers className="w-3 h-3" />
                            <span>{msg.sources.length} Context Sources</span>
                            {expandedSources[msg.id || index] ? (
                              <ChevronDown className="w-3 h-3 rotate-180 transition-transform" />
                            ) : (
                              <ChevronDown className="w-3 h-3 transition-transform" />
                            )}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Collapsible Sources Drawer */}
                    {msg.sender === 'ai' && expandedSources[msg.id || index] && msg.sources && (
                      <div className="mt-3 space-y-2 pt-2 border-t border-zinc-800">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                          Retrieved pgvector Evidence Chunks:
                        </span>
                        {msg.sources.map((src, sIdx) => (
                          <div
                            key={sIdx}
                            className="bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-zinc-400 font-mono text-[11px]">
                              <span>{src.filename} (Chunk #{src.chunkIndex + 1})</span>
                              {src.similarity && (
                                <span className="text-blue-400">
                                  Score: {src.similarity}
                                </span>
                              )}
                            </div>
                            <p className="text-zinc-400 font-sans text-xs leading-normal">
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
              <div className="max-w-4xl mx-auto flex items-start gap-2">
                <div className="bg-zinc-900 border border-zinc-800 p-3.5 rounded-xl text-xs text-zinc-400 flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Searching pgvector database & generating response...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* PERMANENTLY PINNED BOTTOM SEARCH INPUT BAR */}
          <div className="shrink-0 p-4 sm:px-8 sm:pb-6 border-t border-zinc-800 bg-zinc-950 z-10">
            <div className="max-w-4xl mx-auto">
              {searchError && (
                <div className="mb-2 flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}

              <form onSubmit={handleSearch} className="relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={
                    files.length === 0
                      ? "Upload a PDF document first on the left..."
                      : selectedFile === 'ALL'
                      ? "Ask anything across all documents (e.g. summarize findings)..."
                      : `Ask question specific to "${selectedFile}"...`
                  }
                  disabled={isSearching || files.length === 0}
                  className="w-full bg-zinc-900 border border-zinc-700/80 focus:border-blue-500 focus:outline-none text-zinc-100 rounded-xl py-3.5 pl-4 pr-12 text-xs sm:text-sm placeholder:text-zinc-500 transition-colors shadow-sm"
                />
                <button
                  type="submit"
                  disabled={isSearching || !question.trim() || files.length === 0}
                  className="absolute right-2 p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg transition-colors"
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </form>
            </div>
          </div>

        </section>

      </div>
    </div>
  );
}