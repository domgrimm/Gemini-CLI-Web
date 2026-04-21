/*
 * ChatInterface.jsx - Chat Component with Session Protection Integration
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';
import TodoList from './TodoList';
import GeminiLogo from './GeminiLogo.jsx';
import { ScrollArea } from './ui/scroll-area';

import GeminiStatus from './GeminiStatus';
import { MicButton } from './MicButton.jsx';
import { api } from '../utils/api';
import { playNotificationSound } from '../utils/notificationSound';
import { Plus, ArrowUp, X, Terminal, ChevronRight, FileText, Globe, Eye } from 'lucide-react';
import { cn } from '../lib/utils';

// Memoized message component to prevent unnecessary re-renders
const MessageComponent = memo(({ message, index, prevMessage, nextMessage, createDiff, onFileOpen, onShowSettings, autoExpandTools, showRawParameters }) => {
  const isUser = message.type === 'user';
  const isAssistant = message.type === 'assistant' || message.type === 'error' || message.isInteractivePrompt;
  const isSystem = message.type === 'system';
  
  // Grouping logic for iMessage-style clusters
  const isGroupedTop = prevMessage && prevMessage.type === message.type;
  const isGroupedBottom = nextMessage && nextMessage.type === message.type;
  
  if (isSystem) {
    return (
      <div className="flex justify-center my-6 px-4 animate-in fade-in duration-700">
        <div className="bg-zinc-200/40 dark:bg-zinc-800/40 backdrop-blur-sm px-4 py-1.5 rounded-full text-[11px] font-bold text-zinc-500 dark:text-zinc-400 border border-zinc-300/30 dark:border-zinc-700/30 uppercase tracking-[0.1em] shadow-xs">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex w-full px-2 sm:px-4 transition-all duration-300",
      isUser ? "justify-end" : "justify-start",
      !isGroupedTop && "mt-6",
      isGroupedTop && "mt-1"
    )}>
      <div className={cn(
        "max-w-[88%] sm:max-w-[80%] relative flex flex-col group",
        isUser ? "items-end" : "items-start"
      )}>
        {/* Name Label - only show for first message in group if it's Gemini */}
        {!isGroupedTop && !isUser && (
          <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 mb-1.5 ml-2 flex items-center gap-2 uppercase tracking-widest">
            <div className="w-1.5 h-1.5 rounded-full bg-gemini-500 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
            Gemini
          </span>
        )}

        {/* Message Bubble */}
        <div className={cn(
          "relative px-4 py-2.5 shadow-sm transition-all duration-200",
          isUser 
            ? "bg-linear-to-br from-gemini-600 to-violet-700 text-white shadow-violet-500/10" 
            : message.type === 'error'
              ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-200"
              : "bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 text-zinc-900 dark:text-zinc-100",
          
          isUser ? (
            cn(
              "rounded-[22px]",
              !isGroupedTop && !isGroupedBottom && "rounded-br-[4px]",
              !isGroupedTop && isGroupedBottom && "rounded-br-[4px]",
              isGroupedTop && isGroupedBottom && "rounded-tr-[4px] rounded-br-[4px]",
              isGroupedTop && !isGroupedBottom && "rounded-tr-[4px]"
            )
          ) : (
            cn(
              "rounded-[22px]",
              !isGroupedTop && !isGroupedBottom && "rounded-bl-[4px]",
              !isGroupedTop && isGroupedBottom && "rounded-bl-[4px]",
              isGroupedTop && isGroupedBottom && "rounded-tl-[4px] rounded-bl-[4px]",
              isGroupedTop && !isGroupedBottom && "rounded-tl-[4px]"
            )
          )
        )}>
          {/* Tool Use Indicator */}
          {message.isToolUse && (
            <div className={cn(
              "flex items-center gap-2 mb-2 pb-2 border-b",
              isUser ? "border-white/20 text-white/90" : "border-zinc-100 dark:border-zinc-700 text-gemini-600 dark:text-gemini-400"
            )}>
              <Terminal className="w-3 h-3 shrink-0" />
              <span className="text-[10px] font-bold font-mono tracking-wider uppercase">
                {message.toolName}
              </span>
            </div>
          )}

          {/* Core Content */}
          <div className="text-[16px] leading-[1.45] select-text">
            {message.isToolUse ? (
              <div className="space-y-3">
                <details className="group/details" open={autoExpandTools}>
                  <summary className={cn(
                    "cursor-pointer list-none flex items-center gap-2 font-mono text-[10px] font-bold select-none",
                    isUser ? "text-white/70" : "text-zinc-400"
                  )}>
                    <ChevronRight className="w-2.5 h-2.5 transition-transform group-open/details:rotate-90" />
                    PARAMETERS
                  </summary>
                  <pre className={cn(
                    "mt-2 p-2.5 rounded-xl font-mono text-[11px] overflow-x-auto border",
                    isUser ? "bg-black/20 border-white/10" : "bg-zinc-50 dark:bg-zinc-950 border-zinc-100 dark:border-zinc-900"
                  )}>
                    {message.toolInput}
                  </pre>
                </details>

                {message.toolResult && (
                  <div className={cn(
                    "mt-3 pt-3 border-t",
                    isUser ? "border-white/10" : "border-zinc-100 dark:border-zinc-700"
                  )}>
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-zinc">
                      <ReactMarkdown>{message.toolResult}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className={cn(
                "prose prose-sm max-w-none prose-zinc dark:prose-invert break-words",
                isUser && "[&_*]:text-white [&_pre]:!bg-black/30 [&_pre]:!border-white/10 [&_pre_code]:!text-white [&_a]:text-white"
              )}>
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        {!isGroupedBottom && (
          <div className={cn(
            "text-[9px] font-bold text-zinc-400 dark:text-zinc-500 mt-1 px-2 uppercase tracking-tighter",
            isUser ? "text-right mr-1" : "text-left ml-1"
          )}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
});

const ImageAttachment = ({ file, onRemove, uploadProgress, error }) => {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="relative group shrink-0">
      <img src={preview} alt={file.name} className="w-16 h-16 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm" />
      <button onClick={onRemove} className="absolute -top-1.5 -right-1.5 bg-zinc-800 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

function ChatInterface({ selectedProject, selectedSession, ws, sendMessage, messages, onFileOpen, onInputFocusChange, onSessionActive, onSessionInactive, onReplaceTemporarySession, onNavigateToSession, onShowSettings }) {
  if (!selectedProject) return null;

  const [input, setInput] = useState(() => {
    try {
      if (typeof window !== 'undefined' && selectedProject) {
        return localStorage.getItem(`draft_input_${selectedProject.name}`) || '';
      }
    } catch { return ''; }
    return '';
  });
  const [chatMessages, setChatMessages] = useState(() => {
    try {
      if (typeof window !== 'undefined' && selectedProject) {
        const saved = localStorage.getItem(`chat_messages_${selectedProject.name}`);
        return saved ? JSON.parse(saved) : [];
      }
    } catch { return []; }
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [sessionMessages, setSessionMessages] = useState([]);
  const [isYoloMode, setIsYoloMode] = useState(false);
  const [selectedModel, setSelectedModel] = useState('auto-gemini-3');
  const [autoExpandTools, setAutoExpandTools] = useState(false);
  const [showRawParameters, setShowRawParameters] = useState(false);
  const [autoScrollToBottom, setAutoScrollToBottom] = useState(true);
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [attachedImages, setAttachedImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(new Map());
  const [imageErrors, setImageErrors] = useState(new Map());
  const [fileList, setFileList] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [showFileDropdown, setShowFileDropdown] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(-1);
  const [atSymbolPosition, setAtSymbolPosition] = useState(-1);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [isSystemSessionChange, setIsSystemSessionChange] = useState(false);
  
  const scrollContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const previousSessionIdRef = useRef(null);

  // Update settings when localStorage changes
  useEffect(() => {
    const checkSettings = () => {
      try {
        const savedSettings = localStorage.getItem('gemini-tools-settings');
        const settings = savedSettings ? JSON.parse(savedSettings) : {};
        setIsYoloMode(settings.skipPermissions || false);
        setSelectedModel(settings.selectedModel || 'auto-gemini-3');
        setAutoExpandTools(settings.autoExpandTools !== undefined ? settings.autoExpandTools : false);
        setShowRawParameters(settings.showRawParameters !== undefined ? settings.showRawParameters : false);
        setAutoScrollToBottom(settings.autoScrollToBottom !== undefined ? settings.autoScrollToBottom : true);
      } catch {
        setIsYoloMode(false);
        setSelectedModel('auto-gemini-3');
        setAutoExpandTools(false);
        setShowRawParameters(false);
        setAutoScrollToBottom(true);
      }
    };
    checkSettings();
    window.addEventListener('storage', checkSettings);
    window.addEventListener('focus', checkSettings);
    return () => {
      window.removeEventListener('storage', checkSettings);
      window.removeEventListener('focus', checkSettings);
    };
  }, []);

  // Persist input draft
  useEffect(() => {
    if (selectedProject && input !== '') {
      localStorage.setItem(`draft_input_${selectedProject.name}`, input);
    } else if (selectedProject && input === '') {
      localStorage.removeItem(`draft_input_${selectedProject.name}`);
    }
  }, [input, selectedProject]);

  // Persist chat messages
  useEffect(() => {
    if (selectedProject && chatMessages.length > 0) {
      localStorage.setItem(`chat_messages_${selectedProject.name}`, JSON.stringify(chatMessages));
    }
  }, [chatMessages, selectedProject]);

  const calculateDiff = (oldStr, newStr) => {
    return [{ type: 'info', content: 'Diff view simplified' }];
  };

  const createDiff = useMemo(() => calculateDiff, []);

  const scrollToBottom = useCallback((instant = false) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      setIsUserScrolledUp(false);
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      setIsUserScrolledUp(scrollHeight - scrollTop - clientHeight > 100);
    }
  }, []);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  const loadSessionMessages = useCallback(async (projectName, sessionId) => {
    try {
      const response = await api.sessionMessages(projectName, sessionId);
      const data = await response.json();
      return data.messages || [];
    } catch { return []; }
  }, []);

  useEffect(() => {
    if (selectedSession && selectedProject) {
      if (previousSessionIdRef.current !== selectedSession.id) {
        previousSessionIdRef.current = selectedSession.id;
        setCurrentSessionId(selectedSession.id);
        if (!isSystemSessionChange) {
           loadSessionMessages(selectedProject.name, selectedSession.id).then(msgs => {
             // simplified message loading
             setChatMessages([]); 
           });
        }
      }
    }
  }, [selectedSession, selectedProject]);

  useEffect(() => {
    if (messages.length > 0) {
      const latest = messages[messages.length - 1];
      if (latest.type === 'gemini-response') {
        const eventData = latest.data;
        if (eventData?.type === 'message' && eventData.role === 'assistant') {
          setChatMessages(prev => {
            if (eventData.delta && prev.length > 0) {
              const last = prev[prev.length - 1];
              if (last.type === 'assistant') {
                return [...prev.slice(0,-1), { ...last, content: last.content + eventData.content }];
              }
            }
            return [...prev, { type: 'assistant', content: eventData.content, timestamp: new Date() }];
          });
        }
      } else if (latest.type === 'gemini-complete' || latest.type === 'gemini-error') {
        setIsLoading(false);
      }
    }
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const msg = { type: 'user', content: input, timestamp: new Date() };
    setChatMessages(prev => [...prev, msg]);
    setIsLoading(true);
    sendMessage({ 
      type: 'gemini-command', 
      command: input, 
      options: { 
        model: selectedModel, 
        projectPath: selectedProject.path,
        cwd: selectedProject.path,
        sessionId: currentSessionId,
        resume: !!currentSessionId
      } 
    });
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsTextareaExpanded(false);
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    onDrop: files => setAttachedImages(prev => [...prev, ...files])
  });

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden relative">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-2 py-4 space-y-2">
        {chatMessages.map((m, i) => (
          <MessageComponent 
            key={i} 
            message={m} 
            prevMessage={i > 0 ? chatMessages[i-1] : null}
            nextMessage={i < chatMessages.length - 1 ? chatMessages[i+1] : null}
          />
        ))}

        {isLoading && (
          <div className="flex w-full px-2 sm:px-4 mt-2 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-col items-start max-w-[80%]">
              <span className="text-[10px] font-bold text-zinc-400 mb-1.5 ml-2 uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gemini-500 animate-pulse" />
                Gemini is typing
              </span>
              <div className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 rounded-[20px] rounded-bl-[4px] px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div 
        className={cn(
          "p-2 sm:p-4 md:p-6 flex-shrink-0 transition-all duration-300",
          isInputFocused ? "pb-4" : "pb-24"
        )}
        style={{ paddingBottom: isInputFocused ? undefined : 'calc(env(safe-area-inset-bottom) + 80px)' }}
      >
        {/* Gemini Working Status */}
        <GeminiStatus
          status={geminiStatus}
          isLoading={isLoading}
        />

        {/* Gemini Mode Indicator */}
        <div className="max-w-4xl mx-auto mb-3">
          <div className="flex items-center justify-center gap-3">
            <div className={`px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold border transition-all duration-200 ${
              isYoloMode
                ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800'
                : 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isYoloMode ? 'bg-orange-500' : 'bg-cyan-500'}`} />
                <span>{isYoloMode ? 'GEMINI YOLO' : 'GEMINI DEFAULT'}</span>
                <span className="opacity-40">•</span>
                <span className="opacity-75">{
                  (() => {
                    const labels = {
                      'gemini-3.1-pro-preview': '3.1 Pro',
                      'gemini-3-flash-preview': '3 Flash',
                      'gemini-3.1-flash-lite-preview': '3.1 Lite',
                      'gemini-2.5-pro': '2.5 Pro',
                      'gemini-2.5-flash': '2.5 Flash',
                      'gemini-2.5-flash-lite': '2.5 Lite',
                      'auto-gemini-3': 'Gemini 3 Auto',
                      'auto-gemini-2.5': 'Gemini 2.5 Auto'
                    };
                    return labels[selectedModel] || selectedModel;
                  })()
                }</span>
              </div>
            </div>
            
            {isUserScrolledUp && (
              <button onClick={scrollToBottom} className="w-7 h-7 bg-gemini-600 text-white rounded-full shadow-lg flex items-center justify-center">
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
          <div {...getRootProps()} className={cn(
            "relative flex items-end gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all",
            isTextareaExpanded ? "rounded-2xl" : "rounded-[28px]",
            isInputFocused && "ring-4 ring-gemini-500/10 border-gemini-500/40 shadow-xl"
          )}>
            <input {...getInputProps()} />
            <button type="button" onClick={open} className="mb-1.5 ml-1.5 p-2 text-zinc-400 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <Plus className="w-6 h-6" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              onFocus={() => { setIsInputFocused(true); onInputFocusChange?.(true); }}
              onBlur={() => { setIsInputFocused(false); onInputFocusChange?.(false); }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
                const isExpanded = e.target.scrollHeight > 60;
                setIsTextareaExpanded(isExpanded);
              }}
              placeholder="Ask Gemini..."
              className="flex-1 py-3 bg-transparent focus:outline-none text-[16px] resize-none min-h-[48px] max-h-[300px]"
              rows={1}
            />
            <button type="submit" className={cn(
              "mb-1.5 mr-1.5 w-9 h-9 rounded-full flex items-center justify-center transition-all",
              input.trim() ? "bg-gemini-600 text-white shadow-lg scale-100" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-300 scale-95"
            )}>
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default memo(ChatInterface);
