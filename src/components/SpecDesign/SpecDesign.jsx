
import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useWebSocket } from '../../utils/websocket';
import ThinkingIndicator from './ThinkingIndicator';
import ProgressIndicator from './ProgressIndicator';

function SpecDesign({ selectedProject }) {
  const { sendMessage, messages } = useWebSocket();
  const [stage, setStage] = useState('input'); // input, generating, review
  const [userQuery, setUserQuery] = useState(''); // The actual user input/query
  const [design, setDesign] = useState('');
  const [requirements, setRequirements] = useState('');
  const [tasks, setTasks] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isLoading, setIsLoading] = useState({ design: false, requirements: false, tasks: false, save: false });
  const [currentGenerationType, setCurrentGenerationType] = useState(null);
  const [generationQueue, setGenerationQueue] = useState([]);
  const [completedSpecs, setCompletedSpecs] = useState({ design: false, requirements: false, tasks: false });

  // Get tools settings from localStorage (same pattern as ChatInterface)
  const getToolsSettings = () => {
    try {
      const savedSettings = localStorage.getItem('gemini-tools-settings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        return {
          allowedTools: settings.allowedTools || [],
          disallowedTools: settings.disallowedTools || [],
          skipPermissions: settings.skipPermissions || false,
          selectedModel: settings.selectedModel || 'gemini-2.5-flash'
        };
      }
    } catch (error) {
      console.error('Error loading tools settings:', error);
    }
    return {
      allowedTools: [],
      disallowedTools: [],
      skipPermissions: false,
      selectedModel: 'gemini-2.5-flash'
    };
  };

  // Generate folder name from user query
  const generateSpecName = (query) => {
    return query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .substring(0, 50) // Limit length
      .replace(/-+$/, ''); // Remove trailing hyphens
  };

  // Handle WebSocket messages (same pattern as ChatInterface)
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.type === 'gemini-response' && currentGenerationType) {
        const content = (lastMessage.content || '').replace(/Loaded cached credentials.\n/g, '');

        if (currentGenerationType === 'design') {
          setDesign(content);
          setCompletedSpecs(prev => ({ ...prev, design: true }));
        } else if (currentGenerationType === 'requirements') {
          setRequirements(content);
          setCompletedSpecs(prev => ({ ...prev, requirements: true }));
        } else if (currentGenerationType === 'tasks') {
          setTasks(content);
          setCompletedSpecs(prev => ({ ...prev, tasks: true }));
        }

        setIsLoading(prev => ({ ...prev, [currentGenerationType]: false }));

        // Check if we need to generate the next spec in sequence
        if (generationQueue.length > 0) {
          const nextType = generationQueue[0];
          setGenerationQueue(prev => prev.slice(1));
          setTimeout(() => {
            handleGenerate(nextType);
          }, 1000); // Small delay between generations
        } else {
          setCurrentGenerationType(null);
          // All specs completed, move to review stage
          if (completedSpecs.design && completedSpecs.requirements && completedSpecs.tasks) {
            setStage('review');
          }
        }
      }

      if (lastMessage.type === 'gemini-error' && currentGenerationType) {
        console.error('Gemini error:', lastMessage.error);
        setIsLoading(prev => ({ ...prev, [currentGenerationType]: false }));
        setCurrentGenerationType(null);
        setGenerationQueue([]); // Clear queue on error
      }
    }
  }, [messages, currentGenerationType, generationQueue, completedSpecs]);

  const generateSpec = async (type, context) => {
    setIsLoading(prev => ({ ...prev, [type]: true }));
    let prompt = '';
    if (type === 'design') {
      prompt = `Generate a comprehensive Design Document following the professional format and structure shown in the example. Create content relevant to the user's specific needs, not a workflow builder.

Required sections (follow this structure but adapt content):
1. **Overview** - Clear description with key design decisions
2. **Architecture** - High-level and component architecture with diagrams
3. **Components and Interfaces** - Core data models and TypeScript interfaces
4. **User Interface Design** - Interface and visual design
5. **Performance Considerations** - Optimization strategies
6. **Security and Access Control** - Security measures
7. **Testing Strategy** - Testing approaches
8. **Deployment and Monitoring** - Pipeline and monitoring

Format as professional markdown with code blocks, interfaces, and technical specifications. Include mermaid diagrams where appropriate.

User Input: ${context || 'Please describe what you want to design'}

# Design Document`;
    } else if (type === 'requirements') {
      prompt = `Based on the following design document, generate a comprehensive Requirements Document following the professional format shown in the example.

Required structure:
1. **Introduction** - Brief overview connecting to the design
2. **Requirements** - Generate 5-10 numbered requirements (Requirement 1, 2, 3, etc.) depending on the complexity and scope of the system

Each requirement must follow this format:
- **User Story:** As a [user type], I want [goal] so that [benefit]
- **Acceptance Criteria:**
  - WHEN [condition] THEN the system SHALL [expected behavior]
  - (5 detailed acceptance criteria per requirement)
  - Use "SHALL" for mandatory requirements

Generate the appropriate number of requirements (5-10) based on:
- Simple features: 5-6 requirements
- Medium complexity: 7-8 requirements
- Complex systems: 9-10 requirements

Focus on functional, integration, performance, security, and user experience requirements based on the design.

Design Document:
\`\`\`markdown
${context}
\`\`\`

# Requirements Document`;
    } else if (type === 'tasks') {
      prompt = `Based on the following design and requirements documents, generate a detailed Implementation Plan following the checklist format shown in the example.

The tasks should be:
- Organized as numbered checklist items with nested sub-tasks
- Detailed enough for implementation
- Include specific references to requirements (e.g., "_Requirements: 1.1, 2.4_")
- Logically ordered with dependencies
- Cover setup, core functionality, testing, deployment

Format as markdown checklist with clear task hierarchy and requirement references.

Design Document:
\`\`\`markdown
${design}
\`\`\`

Requirements Document:
\`\`\`markdown
${requirements}
\`\`\`

# Implementation Plan`;
    }

    try {
      const toolsSettings = getToolsSettings();
      setCurrentGenerationType(type);

      // Send command to Gemini CLI via WebSocket (same pattern as ChatInterface)
      sendMessage({
        type: 'gemini-command',
        command: prompt,
        options: {
          projectPath: selectedProject.path,
          cwd: selectedProject.path,
          toolsSettings: toolsSettings,
          model: toolsSettings.selectedModel || 'gemini-2.5-flash'
        }
      });

      // WebSocket response will be handled in useEffect
      return null;
    } catch (error) {
      console.error(`Error generating ${type}:`, error);
      setIsLoading(prev => ({ ...prev, [type]: false }));
      return `Error generating ${type} spec: ${error.message}`;
    }
  };

  const handleGenerate = (type) => {
    let context = userQuery; // Use userQuery for design
    if (type === 'requirements') {
      context = design;
    } else if (type === 'tasks') {
      context = `Design:\n${design}\n\nRequirements:\n${requirements}`;
    }
    // Call generateSpec without awaiting - WebSocket response will be handled in useEffect
    generateSpec(type, context);
  };

  const handleGenerateAll = () => {
    if (!userQuery.trim()) {
      return;
    }

    // Reset all states
    setDesign('');
    setRequirements('');
    setTasks('');
    setCompletedSpecs({ design: false, requirements: false, tasks: false });

    // Set up generation queue
    setGenerationQueue(['requirements', 'tasks']);
    setStage('generating');

    // Start with design
    handleGenerate('design');
  };

  const handleRetry = (type) => {
    if (type === 'design') {
      setDesign('');
      setCompletedSpecs(prev => ({ ...prev, design: false }));
    } else if (type === 'requirements') {
      setRequirements('');
      setCompletedSpecs(prev => ({ ...prev, requirements: false }));
    } else if (type === 'tasks') {
      setTasks('');
      setCompletedSpecs(prev => ({ ...prev, tasks: false }));
    }
    handleGenerate(type);
  };



  const handleSaveSpecs = async () => {
    if (!selectedProject || !userQuery.trim()) {
      setSaveStatus('Please enter a query and select a project.');
      return;
    }

    setIsLoading(prev => ({ ...prev, save: true }));
    setSaveStatus('');

    const specName = generateSpecName(userQuery);
    const baseDir = `specs/${specName}`;

    try {
      const designResponse = await api.saveFile(selectedProject.name, `${baseDir}/design.md`, design);
      if (!designResponse.ok) {
        throw new Error('Failed to save design.md');
      }

      const requirementsResponse = await api.saveFile(selectedProject.name, `${baseDir}/requirements.md`, requirements);
      if (!requirementsResponse.ok) {
        throw new Error('Failed to save requirements.md');
      }

      const tasksResponse = await api.saveFile(selectedProject.name, `${baseDir}/tasks.md`, tasks);
      if (!tasksResponse.ok) {
        throw new Error('Failed to save tasks.md');
      }

      setSaveStatus(`Specs saved successfully to specs/${specName}/`);
    } catch (error) {
      console.error('Error saving specs:', error);
      setSaveStatus(`Failed to save specs: ${error.message}`);
    } finally {
      setIsLoading(prev => ({ ...prev, save: false }));
    }
  };

  return (
    <div className="h-full flex flex-col bg-linear-to-br from-slate-50 via-white to-gemini-50 dark:from-slate-900 dark:via-slate-800 dark:to-gemini-900/20 overflow-y-auto">
      {/* Progress Indicator */}
      {stage !== 'input' && (
        <div className="p-4 sm:p-6 border-b border-slate-200/60 dark:border-slate-700/60 shrink-0">
          <ProgressIndicator
            currentStage={stage}
            isLoading={Object.values(isLoading).some(Boolean)}
            loadingStates={isLoading}
            onStageClick={(newStage) => {
              if (newStage === 'input') {
                setStage('input');
              } else if (newStage === 'review' && completedSpecs.design && completedSpecs.requirements && completedSpecs.tasks) {
                setStage('review');
              }
            }}
          />
        </div>
      )}

      {/* Input Stage */}
      {stage === 'input' && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden min-h-0">
          {/* Animated background elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 sm:-top-40 sm:-right-40 w-40 sm:h-80 h-40 sm:w-80 bg-linear-to-br from-gemini-600/30 to-gemini-800/30 rounded-full blur-3xl animate-pulse" />
            <div className="absolute -bottom-20 -left-20 sm:-bottom-40 sm:-left-40 w-40 sm:h-80 h-40 sm:w-80 bg-linear-to-br from-gemini-800/30 to-gemini-600/30 rounded-full blur-3xl animate-pulse delay-1000" />
          </div>

          <div className="relative w-full max-w-3xl space-y-6 sm:space-y-8 z-10 overflow-y-auto max-h-full py-4 px-2">
            <div className="text-center space-y-3 sm:space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-linear-to-br from-gemini-400 via-gemini-700 to-gemini-900 rounded-2xl sm:rounded-3xl shadow-xl shadow-violet-500/25 mb-2 sm:mb-6">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              <h1 className="text-3xl sm:text-5xl font-bold bg-linear-to-r from-slate-900 via-gemini-700 to-slate-900 dark:from-white dark:via-gemini-300 dark:to-white bg-clip-text text-transparent">
                Spec Generator
              </h1>
              <p className="text-base sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Describe your project and we'll generate a complete technical specification.
              </p>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <div className="relative group">
                <textarea
                  className="w-full h-40 sm:h-48 p-4 sm:p-6 border-2 border-slate-200 dark:border-slate-700 rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md dark:text-white text-base sm:text-lg resize-none focus:ring-4 focus:ring-gemini-500/20 focus:border-gemini-500 transition-all duration-300 shadow-xl placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Describe what you want to build...

Examples:
• User auth system with JWT tokens
• E-commerce platform with cart
• Real-time chat application"
                />
                <div className="absolute bottom-3 right-4 text-xs font-medium text-slate-400 dark:text-slate-500 group-focus-within:text-gemini-500 transition-colors">
                  {userQuery.length}/1000
                </div>
              </div>

              <button
                onClick={handleGenerateAll}
                disabled={!userQuery.trim()}
                className="group relative w-full py-4 sm:py-6 bg-linear-to-r from-gemini-400 via-gemini-600 to-gemini-800 hover:from-gemini-400 hover:via-gemini-600 hover:to-gemini-800 disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-lg sm:text-xl transition-all duration-300 shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.01] active:scale-95 disabled:shadow-none disabled:scale-100"
              >
                <span className="relative z-10 flex items-center justify-center gap-2 sm:gap-3">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Specification
                </span>

                {/* Animated background */}
                <div className="absolute inset-0 bg-linear-to-r from-gemini-600 via-gemini-800 to-gemini-900 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </button>
            </div>
            
            <div className="pb-8 hidden sm:block" /> {/* Extra spacing for mobile */}
          </div>
        </div>
      )}

      {/* Generating Stage */}
      {stage === 'generating' && (
        <div className="flex-1 flex flex-col p-4 sm:p-8 space-y-6 sm:space-y-8 overflow-y-auto">
          {/* Header */}
          <div className="text-center space-y-3 sm:space-y-4">
            <h2 className="text-2xl sm:text-3xl font-bold bg-linear-to-r from-slate-900 via-gemini-700 to-slate-900 dark:from-white dark:via-gemini-300 dark:to-white bg-clip-text text-transparent">
              Generating...
            </h2>
            <div className="max-w-3xl mx-auto p-3 sm:p-4 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 font-medium truncate">
                "{userQuery}"
              </p>
            </div>
          </div>

          {/* Thinking Indicator */}
          {Object.values(isLoading).some(Boolean) && (
            <ThinkingIndicator
              isThinking={Object.values(isLoading).some(Boolean)}
              currentThought={
                isLoading.design ? "Analyzing requirements and creating architecture..." :
                isLoading.requirements ? "Breaking down features into user stories..." :
                isLoading.tasks ? "Planning implementation steps..." :
                "Processing request..."
              }
              className="mb-2 sm:mb-6"
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Design Section */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-linear-to-br from-gemini-500 to-gemini-800 rounded-lg sm:rounded-xl flex items-center justify-center">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Design
                  </h3>
                </div>
                <div className="flex items-center space-x-2">
                  {isLoading.design && (
                    <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-2 border-gemini-500 border-t-transparent"></div>
                  )}
                  {completedSpecs.design && (
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              {design ? (
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 sm:p-4 max-h-60 sm:max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 shadow-inner">
                  <pre className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
                    {design}
                  </pre>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center">
                    {isLoading.design ? "Generating design..." : "Waiting..."}
                  </p>
                </div>
              )}
            </div>

            {/* Requirements Section */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-linear-to-br from-blue-500 to-cyan-600 rounded-lg sm:rounded-xl flex items-center justify-center">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Requirements
                  </h3>
                </div>
                <div className="flex items-center space-x-2">
                  {isLoading.requirements && (
                    <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-2 border-blue-500 border-t-transparent"></div>
                  )}
                  {completedSpecs.requirements && (
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              {requirements ? (
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 sm:p-4 max-h-60 sm:max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 shadow-inner">
                  <pre className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
                    {requirements}
                  </pre>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center">
                    {isLoading.requirements ? "Generating requirements..." : "Waiting..."}
                  </p>
                </div>
              )}
            </div>

            {/* Tasks Section */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-linear-to-br from-emerald-500 to-green-600 rounded-lg sm:rounded-xl flex items-center justify-center">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Tasks
                  </h3>
                </div>
                <div className="flex items-center space-x-2">
                  {isLoading.tasks && (
                    <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-2 border-emerald-500 border-t-transparent"></div>
                  )}
                  {completedSpecs.tasks && (
                    <div className="w-5 h-5 sm:w-6 sm:h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              {tasks ? (
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 sm:p-4 max-h-60 sm:max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 shadow-inner">
                  <pre className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
                    {tasks}
                  </pre>
                </div>
              ) : (
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-6 sm:p-8 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center">
                    {isLoading.tasks ? "Generating tasks..." : "Waiting..."}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="pb-20" /> {/* Extra spacing for mobile nav */}
        </div>
      )}

      {/* Review Stage */}
      {stage === 'review' && (
        <div className="flex-1 flex flex-col p-4 sm:p-8 space-y-6 sm:space-y-8 overflow-y-auto pb-24">
          <div className="mb-2 sm:mb-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Review & Save
            </h2>
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                {userQuery}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Design */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                  Design
                </h3>
                <button
                  onClick={() => handleRetry('design')}
                  className="px-3 py-1 text-xs font-medium text-gemini-600 dark:text-gemini-400 hover:bg-gemini-50 dark:hover:bg-gemini-900/30 rounded-full transition-colors"
                >
                  Retry
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 sm:p-4 h-64 sm:h-96 overflow-y-auto border border-zinc-100 dark:border-zinc-800">
                <pre className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                  {design}
                </pre>
              </div>
            </div>

            {/* Requirements */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                  Requirements
                </h3>
                <button
                  onClick={() => handleRetry('requirements')}
                  className="px-3 py-1 text-xs font-medium text-gemini-600 dark:text-gemini-400 hover:bg-gemini-50 dark:hover:bg-gemini-900/30 rounded-full transition-colors"
                >
                  Retry
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 sm:p-4 h-64 sm:h-96 overflow-y-auto border border-zinc-100 dark:border-zinc-800">
                <pre className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                  {requirements}
                </pre>
              </div>
            </div>

            {/* Tasks */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                  Tasks
                </h3>
                <button
                  onClick={() => handleRetry('tasks')}
                  className="px-3 py-1 text-xs font-medium text-gemini-600 dark:text-gemini-400 hover:bg-gemini-50 dark:hover:bg-gemini-900/30 rounded-full transition-colors"
                >
                  Retry
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 sm:p-4 h-64 sm:h-96 overflow-y-auto border border-zinc-100 dark:border-zinc-800">
                <pre className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                  {tasks}
                </pre>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-4 mt-8 flex flex-col sm:flex-row gap-3 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 z-10 mb-20 sm:mb-0">
            <button
              onClick={() => setStage('input')}
              className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-bold active:scale-95 transition-all"
            >
              Start Over
            </button>

            <button
              onClick={handleSaveSpecs}
              disabled={!design || !requirements || !tasks || isLoading.save}
              className="flex-[2] px-6 py-3 bg-gemini-600 hover:bg-gemini-700 disabled:bg-slate-300 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-gemini-500/30 active:scale-95 transition-all"
            >
              {isLoading.save ? 'Saving...' : 'Save to Project'}
            </button>
          </div>

          {saveStatus && (
            <div className={`mt-4 p-4 rounded-xl border ${
              saveStatus.includes('successfully') 
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            }`}>
              <p className="text-sm font-medium">{saveStatus}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SpecDesign;
