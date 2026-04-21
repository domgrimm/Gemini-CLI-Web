import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import pty from 'node-pty';

class SessionManager {
  constructor() {
    // Store sessions in memory with conversation history
    this.sessions = new Map();
    this.usageStats = {
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      tool_calls: 0,
      plan: 'Gemini Code Assist',
      limits: {
        daily_requests: 500,
        requests_used: 0,
        token_limit: 1000000
      },
      models: {},
      quotas: [] // New field for /model output
    };
    this.sessionsDir = path.join(os.homedir(), '.gemini', 'sessions');
    this.statsFile = path.join(os.homedir(), '.gemini', 'usage_stats.json');
    this.initSessionsDir();
    this.loadStats();
    
    // Initial quota fetch
    this.refreshQuota();
  }

  // Manually trigger a quota refresh
  async refreshQuota() {
    try {
      await this.fetchQuota();
    } catch (e) {
      // console.error('Quota refresh failed:', e);
    }
  }

  // Fetch quota info from /model command
  async fetchQuota() {
    return new Promise((resolve) => {
      const gemini = 'gemini';
      const ptyProcess = pty.spawn(gemini, [], {
        name: 'xterm-256color',
        cols: 150,
        rows: 40,
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8' }
      });

      let output = '';
      let step = 0;
      
      const timeout = setTimeout(() => {
        ptyProcess.kill();
        resolve(null);
      }, 20000);

      ptyProcess.onData((data) => {
        output += data;
        
        // Step 0: Look for initial prompt
        if (step === 0 && (output.includes('?') || output.includes('Type your message'))) {
          step = 1;
          setTimeout(() => {
            ptyProcess.write('/model\r');
            step = 2;
          }, 1000);
        }
        
        // Step 2: Look for the Model Usage table and a subsequent prompt
        if (step === 2 && output.includes('Model usage')) {
          // Check if we have the prompt again AFTER the table
          const usageIndex = output.indexOf('Model usage');
          if (output.lastIndexOf('>') > usageIndex) {
            clearTimeout(timeout);
            this.parseQuotaOutput(output);
            ptyProcess.kill();
            resolve(this.usageStats.quotas);
          }
        }
      });
    });
  }

  parseQuotaOutput(raw) {
    // Strip ANSI codes and non-printable chars more aggressively
    const clean = raw.replace(/\x1B\[[0-9;]*[JKmsu]/g, '').replace(/[^\x20-\x7E\u2500-\u257F\u25AC]/g, ' ');
    const lines = clean.split('\n');
    const quotas = [];
    
    // Improved regex: handles different border characters and spacing
    // Matches: ModelName ... Percentage% ... Resets: Time
    const quotaRegex = /(Flash|Flash Lite|Pro)\s+[▬ ]+\s+(\d+)%\s+Resets:\s+([0-9:APM\s\(\)hmin]+)/i;
    
    for (const line of lines) {
      const match = line.match(quotaRegex);
      if (match) {
        quotas.push({
          model: match[1].trim(),
          percentage: parseInt(match[2]),
          resets: match[3].trim()
        });
      }
    }
    
    // Fallback Mock Data if CLI parsing failed (so user sees the UI)
    if (quotas.length === 0 && !this.usageStats.quotas.length) {
      this.usageStats.quotas = [
        { model: 'Flash', percentage: 0, resets: 'Unknown' },
        { model: 'Flash Lite', percentage: 0, resets: 'Unknown' },
        { model: 'Pro', percentage: 0, resets: 'Unknown' }
      ];
    } else if (quotas.length > 0) {
      this.usageStats.quotas = quotas;
    }
    
    this.saveStats();
  }

  async initSessionsDir() {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      // console.error('Error creating sessions directory:', error);
    }
  }

  // Add stats from a CLI run
  addStats(stats) {
    if (!stats) return;
    
    this.usageStats.total_tokens += (stats.total_tokens || 0);
    this.usageStats.input_tokens += (stats.input_tokens || 0);
    this.usageStats.output_tokens += (stats.output_tokens || 0);
    this.usageStats.tool_calls += (stats.tool_calls || 0);

    if (stats.models) {
      for (const [model, modelStats] of Object.entries(stats.models)) {
        if (!this.usageStats.models[model]) {
          this.usageStats.models[model] = { total_tokens: 0, input_tokens: 0, output_tokens: 0 };
        }
        this.usageStats.models[model].total_tokens += (modelStats.total_tokens || 0);
        this.usageStats.models[model].input_tokens += (modelStats.input_tokens || 0);
        this.usageStats.models[model].output_tokens += (modelStats.output_tokens || 0);
      }
    }
    this.saveStats();
  }

  async saveStats() {
    try {
      await fs.writeFile(this.statsFile, JSON.stringify(this.usageStats, null, 2));
    } catch (error) {}
  }

  async loadStats() {
    try {
      if (await fs.access(this.statsFile).then(() => true).catch(() => false)) {
        const data = await fs.readFile(this.statsFile, 'utf8');
        this.usageStats = JSON.parse(data);
      }
    } catch (error) {}
  }

  getStats() {
    return this.usageStats;
  }

  // Create a new session
  createSession(sessionId, projectPath) {
    const session = {
      id: sessionId,
      projectPath: projectPath,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date()
    };
    this.sessions.set(sessionId, session);
    this.saveSession(sessionId);
    return session;
  }
  // Add a message to session
  addMessage(sessionId, role, content) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      // Create session if it doesn't exist
      session = this.createSession(sessionId, '');
    }
    const message = {
      role: role, // 'user' or 'assistant'
      content: content,
      timestamp: new Date()
    };
    session.messages.push(message);
    session.lastActivity = new Date();
    this.saveSession(sessionId);
    return session;
  }
  // Get session by ID
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }
  // Get all sessions for a project
  getProjectSessions(projectPath) {
    const sessions = [];
    for (const [id, session] of this.sessions) {
      if (session.projectPath === projectPath) {
        sessions.push({
          id: session.id,
          summary: this.getSessionSummary(session),
          messageCount: session.messages.length,
          lastActivity: session.lastActivity
        });
      }
    }
    return sessions.sort((a, b) =>
      new Date(b.lastActivity) - new Date(a.lastActivity)
    );
  }

  // Get session summary
  getSessionSummary(session) {
    if (session.messages.length === 0) {
      return 'New Session';
    }
    // Find first user message
    const firstUserMessage = session.messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      const {content} = firstUserMessage;
      return content.length > 50 ? content.substring(0, 50) + '...' : content;
    }
    return 'New Session';
  }
  // Build conversation context for Gemini
  buildConversationContext(sessionId, maxMessages = 10) {
    const session = this.sessions.get(sessionId);
    if (!session || session.messages.length === 0) {
      return '';
    }

    // Get last N messages for context
    const recentMessages = session.messages.slice(-maxMessages);

    let context = '以下は過去の会話履歴です:\n\n';
    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        context += `ユーザー: ${msg.content}\n`;
      } else {
        context += `アシスタント: ${msg.content}\n`;
      }
    }

    context += '\n上記の会話履歴を踏まえて、次の質問に答えてください:\n';

    return context;
  }

  // Save session to disk
  async saveSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    } catch (error) {
      // console.error('Error saving session:', error);
    }
  }

  // Load sessions from disk
  async loadSessions() {
    try {
      const files = await fs.readdir(this.sessionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.sessionsDir, file);
            const data = await fs.readFile(filePath, 'utf8');
            const session = JSON.parse(data);
            // Convert dates
            session.createdAt = new Date(session.createdAt);
            session.lastActivity = new Date(session.lastActivity);
            session.messages.forEach(msg => {
              msg.timestamp = new Date(msg.timestamp);
            });
            this.sessions.set(session.id, session);
          } catch (error) {
            // console.error(`Error loading session ${file}:`, error);
          }
        }
      }
    } catch (error) {
      // console.error('Error loading sessions:', error);
    }
  }

  // Delete a session
  async deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      await fs.unlink(filePath);
    } catch (error) {
      // console.error('Error deleting session file:', error);
    }
  }

  // Get session messages for display
  getSessionMessages(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return session.messages.map(msg => ({
      type: 'message',
      message: {
        role: msg.role,
        content: msg.content
      },
      timestamp: msg.timestamp.toISOString()
    }));
  }
}

// Singleton instance
const sessionManager = new SessionManager();

// Load existing sessions on startup
sessionManager.loadSessions();

export default sessionManager;