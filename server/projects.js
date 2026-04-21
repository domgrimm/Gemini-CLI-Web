import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';

// Cache for extracted project directories
const projectDirectoryCache = new Map();
let cacheTimestamp = Date.now();

// Clear cache when needed (called when project files change)
function clearProjectDirectoryCache() {
  projectDirectoryCache.clear();
  cacheTimestamp = Date.now();
}

// Load project configuration file
async function loadProjectConfig() {
  const configPath = path.join(process.env.HOME, '.gemini', 'project-config.json');
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    // Return empty config if file doesn't exist
    return {};
  }
}

// Save project configuration file
async function saveProjectConfig(config) {
  const configPath = path.join(process.env.HOME, '.gemini', 'project-config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

// Generate better display name from path
async function generateDisplayName(projectName, actualProjectDir = null) {
  // Use actual project directory if provided, otherwise decode from project name
  let projectPath = actualProjectDir || projectName.replace(/-/g, '/');
  // Try to read package.json from the project path
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData);
    // Return the name from package.json if it exists
    if (packageJson.name) {
      return packageJson.name;
    }
  } catch (error) {
    // Fall back to path-based naming if package.json doesn't exist or can't be read
  }
  // If it starts with /, it's an absolute path
  if (projectPath.startsWith('/')) {
    const parts = projectPath.split('/').filter(Boolean);
    if (parts.length > 3) {
      // Show last 2 folders with ellipsis: "...projects/myapp"
      return `.../${parts.slice(-2).join('/')}`;
    } else {
      // Show full path if short: "/home/user"
      return projectPath;
    }
  }
  return projectPath;
}

// Extract the actual project directory from projects.json mapping
async function extractProjectDirectory(projectName) {
  // Normalize project name for consistent lookup
  const searchName = projectName.trim();
  
  // Check cache first
  if (projectDirectoryCache.has(searchName)) {
    return projectDirectoryCache.get(searchName);
  }

  const projectsConfigPath = path.join(os.homedir(), '.gemini', 'projects.json');
  
  try {
    if (fsSync.existsSync(projectsConfigPath)) {
      const configData = fsSync.readFileSync(projectsConfigPath, 'utf8');
      const config = JSON.parse(configData);
      
      if (config.projects) {
        // Find the entry that matches the projectName (value)
        for (const [dir, name] of Object.entries(config.projects)) {
          if (name === searchName) {
            // Normalize path (handle tilde, resolve to absolute)
            let absolutePath = dir.replace(/^~/, os.homedir());
            absolutePath = path.resolve(absolutePath);
            
            projectDirectoryCache.set(searchName, absolutePath);
            return absolutePath;
          }
        }
      }
    }
  } catch (error) {
    // console.error('Error reading projects.json in extractProjectDirectory:', error);
  }

  // Fallback: If not found, it might be an absolute path passed directly or old format
  // If it starts with / or ~, it's likely a path, not a name
  if (searchName.startsWith('/') || searchName.startsWith('~')) {
    let fallbackPath = searchName.replace(/^~/, os.homedir());
    fallbackPath = path.resolve(fallbackPath);
    return fallbackPath;
  }

  // Last resort fallback
  const dashFallback = path.resolve(searchName.replace(/-/g, '/'));
  return dashFallback;
}

async function getProjects() {
  const projectsConfigPath = path.join(os.homedir(), '.gemini', 'projects.json');
  const projects = [];

  try {
    if (fsSync.existsSync(projectsConfigPath)) {
      const configData = fsSync.readFileSync(projectsConfigPath, 'utf8');
      const config = JSON.parse(configData);
      
      if (config.projects) {
        for (const [dir, name] of Object.entries(config.projects)) {
          // Normalize directory path
          const absolutePath = path.resolve(dir.replace('~', os.homedir()));
          
          projects.push({
            id: name,
            name: name,
            path: absolutePath,
            displayName: name,
            fullPath: absolutePath,
            sessions: [], // Initialize with empty array
            sessionMeta: { total: 0, hasMore: false }
          });
        }
      }
    }
    
    // Fallback: If no projects in projects.json, try to check current directory
    if (projects.length === 0) {
      const cwd = process.cwd();
      projects.push({
        id: path.basename(cwd),
        name: path.basename(cwd),
        path: cwd,
        displayName: path.basename(cwd),
        fullPath: cwd,
        sessions: [],
        sessionMeta: { total: 0, hasMore: false }
      });
    }
  } catch (error) {
    // console.error('Error reading projects.json:', error);
  }

  return projects;
}

async function getSessions(projectName, limit = 5, offset = 0) {
  const projects = await getProjects();
  const project = projects.find(p => p.name === projectName);
  if (!project) return { sessions: [], hasMore: false, total: 0 };

  return new Promise((resolve) => {
    const geminiPath = process.env.GEMINI_PATH || 'gemini';
    const child = spawn(geminiPath, ['--list-sessions'], {
      cwd: project.path,
      env: { ...process.env }
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', () => {
      const sessions = [];
      const lines = output.split('\n');
      
      // Parse output like: "  1. summary (time) [UUID]"
      const sessionRegex = /^\s*(\d+)\.\s+(.+)\s+\((.+)\)\s+\[(.+)\]$/;
      
      for (const line of lines) {
        const match = line.match(sessionRegex);
        if (match) {
          sessions.push({
            id: match[4],
            summary: match[2],
            lastActivity: match[3],
            projectName: projectName
          });
        }
      }
      
      const total = sessions.length;
      const paginatedSessions = sessions.slice(offset, offset + limit);
      const hasMore = offset + limit < total;
      
      resolve({
        sessions: paginatedSessions,
        hasMore,
        total,
        offset,
        limit
      });
    });
  });
}

async function parseJsonlSessions(filePath) {
  const sessions = new Map();
  try {
    const fileStream = fsSync.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    // Debug - [JSONL Parser] Reading file
    let lineCount = 0;
    for await (const line of rl) {
      if (line.trim()) {
        lineCount++;
        try {
          const entry = JSON.parse(line);
          if (entry.sessionId) {
            if (!sessions.has(entry.sessionId)) {
              sessions.set(entry.sessionId, {
                id: entry.sessionId,
                summary: 'New Session',
                messageCount: 0,
                lastActivity: new Date(),
                cwd: entry.cwd || ''
              });
            }
            const session = sessions.get(entry.sessionId);
            // Update summary if this is a summary entry
            if (entry.type === 'summary' && entry.summary) {
              session.summary = entry.summary;
            } else if (entry.message?.role === 'user' && entry.message?.content && session.summary === 'New Session') {
              // Use first user message as summary if no summary entry exists
              const {content} = entry.message;
              if (typeof content === 'string' && content.length > 0 && !content.startsWith('<command-name>')) {
                    session.summary = content.length > 50 ? content.substring(0, 50) + '...' : content;
              }
            }
            // Count messages instead of storing them all
            session.messageCount = (session.messageCount || 0) + 1;
            // Update last activity
            if (entry.timestamp) {
              session.lastActivity = new Date(entry.timestamp);
            }
          }
        } catch (parseError) {
          // console.warn(`[JSONL Parser] Error parsing line ${lineCount}:`, parseError.message);
        }
      }
    }
    // Debug - [JSONL Parser] Processed lines and found sessions
  } catch (error) {
    // console.error('Error reading JSONL file:', error);
  }
  // Convert Map to Array and sort by last activity
  return Array.from(sessions.values()).sort((a, b) =>
    new Date(b.lastActivity) - new Date(a.lastActivity)
  );
}

// Get messages for a specific session
async function getSessionMessages(projectName, sessionId) {
  const projectDir = path.join(process.env.HOME, '.gemini', 'projects', projectName);
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
    if (jsonlFiles.length === 0) {
      return [];
    }
    const messages = [];
    // Process all JSONL files to find messages for this session
    for (const file of jsonlFiles) {
      const jsonlFile = path.join(projectDir, file);
      const fileStream = fsSync.createReadStream(jsonlFile);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      for await (const line of rl) {
        if (line.trim()) {
          try {
            const entry = JSON.parse(line);
            if (entry.sessionId === sessionId) {
              messages.push(entry);
            }
          } catch (parseError) {
            // console.warn('Error parsing line:', parseError.message);
          }
        }
      }
    }
    // Sort messages by timestamp
    return messages.sort((a, b) =>
      new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
    );
  } catch (error) {
    // console.error(`Error reading messages for session ${sessionId}:`, error);
    return [];
  }
}

// Rename a project's display name
async function renameProject(projectName, newDisplayName) {
  const config = await loadProjectConfig();
  if (!newDisplayName || newDisplayName.trim() === '') {
    // Remove custom name if empty, will fall back to auto-generated
    delete config[projectName];
  } else {
    // Set custom display name
    config[projectName] = {
      displayName: newDisplayName.trim()
    };
  }
  await saveProjectConfig(config);
  return true;
}

// Delete a session from a project
async function deleteSession(projectName, sessionId) {
  const projects = await getProjects();
  const project = projects.find(p => p.name === projectName);
  if (!project) throw new Error(`Project ${projectName} not found`);

  return new Promise((resolve, reject) => {
    const geminiPath = process.env.GEMINI_PATH || 'gemini';
    
    // First, list sessions to find the index for the given UUID
    const listChild = spawn(geminiPath, ['--list-sessions'], {
      cwd: project.path,
      env: { ...process.env }
    });

    let output = '';
    listChild.stdout.on('data', (data) => {
      output += data.toString();
    });

    listChild.on('close', (code) => {
      const lines = output.split('\n');
      const sessionRegex = /^\s*(\d+)\.\s+.+\[(.+)\]$/;
      let indexToDelete = null;

      for (const line of lines) {
        const match = line.match(sessionRegex);
        if (match && match[2] === sessionId) {
          indexToDelete = match[1];
          break;
        }
      }

      if (!indexToDelete) {
        return reject(new Error(`Session ${sessionId} not found in project ${projectName}`));
      }

      // Now delete by index
      const deleteChild = spawn(geminiPath, ['--delete-session', indexToDelete], {
        cwd: project.path,
        env: { ...process.env }
      });

      deleteChild.on('close', (deleteCode) => {
        if (deleteCode === 0) {
          resolve(true);
        } else {
          reject(new Error(`Gemini CLI failed to delete session with code ${deleteCode}`));
        }
      });
    });
  });
}

// Delete a project mapping
async function deleteProject(projectName) {
  const projectsConfigPath = path.join(os.homedir(), '.gemini', 'projects.json');
  
  try {
    if (!fsSync.existsSync(projectsConfigPath)) {
      return true;
    }

    const configData = fsSync.readFileSync(projectsConfigPath, 'utf8');
    const config = JSON.parse(configData);
    
    if (!config.projects) {
      return true;
    }

    // Find and remove the project by name
    let found = false;
    for (const [dir, name] of Object.entries(config.projects)) {
      if (name === projectName) {
        delete config.projects[dir];
        found = true;
        break;
      }
    }

    if (found) {
      await fs.writeFile(projectsConfigPath, JSON.stringify(config, null, 2), 'utf8');
    }
    
    return true;
  } catch (error) {
    // console.error(`Error deleting project ${projectName}:`, error);
    throw error;
  }
}

// Add a project manually to the config
async function addProjectManually(projectPath, displayName = null) {
  const absolutePath = path.resolve(projectPath.replace('~', os.homedir()));
  const projectsConfigPath = path.join(os.homedir(), '.gemini', 'projects.json');
  
  try {
    // Check if the path exists
    await fs.access(absolutePath);
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Path does not exist: ${absolutePath}`);
    }
    throw error;
  }

  try {
    let config = { projects: {} };
    if (fsSync.existsSync(projectsConfigPath)) {
      const configData = fsSync.readFileSync(projectsConfigPath, 'utf8');
      config = JSON.parse(configData);
    }

    if (!config.projects) {
      config.projects = {};
    }

    // Check if path is already registered
    if (config.projects[absolutePath]) {
      // Already exists, just return the existing info
      const name = config.projects[absolutePath];
      return {
        id: name,
        name: name,
        path: absolutePath,
        fullPath: absolutePath,
        displayName: name,
        sessions: []
      };
    }

    // Generate a unique project name (slugified basename)
    let projectName = path.basename(absolutePath).toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Ensure uniqueness
    const existingNames = new Set(Object.values(config.projects));
    let suffix = 1;
    let finalName = projectName;
    while (existingNames.has(finalName)) {
      finalName = `${projectName}-${suffix}`;
      suffix++;
    }

    // Add to config
    config.projects[absolutePath] = finalName;
    
    // Save updated config
    await fs.writeFile(projectsConfigPath, JSON.stringify(config, null, 2), 'utf8');

    return {
      id: finalName,
      name: finalName,
      path: absolutePath,
      fullPath: absolutePath,
      displayName: finalName,
      sessions: []
    };
  } catch (error) {
    // console.error('Error in addProjectManually:', error);
    throw new Error(`Failed to update projects configuration: ${error.message}`);
  }
}


export {
  getProjects,
  getSessions,
  getSessionMessages,
  parseJsonlSessions,
  renameProject,
  deleteSession,
  deleteProject,
  addProjectManually,
  loadProjectConfig,
  saveProjectConfig,
  extractProjectDirectory,
  clearProjectDirectoryCache
};