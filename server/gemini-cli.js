import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sessionManager from './sessionManager.js';

let activeGeminiProcesses = new Map(); // Track active processes by session ID

async function spawnGemini(command, options = {}, ws) {
  return new Promise(async (resolve, reject) => {
    const { sessionId, projectPath, cwd, resume, toolsSettings, permissionMode, images } = options;
    let capturedSessionId = sessionId; // Track session ID throughout the process
    let sessionCreatedSent = false; // Track if we've already sent session-created event
    let fullResponse = ''; // Accumulate the full response
    
    // Use tools settings passed from frontend, or defaults
    const settings = toolsSettings || {
      allowedTools: [],
      disallowedTools: [],
      skipPermissions: false
    };
    
    // Build Gemini CLI command
    const args = [];
    
    // Add prompt flag with command if we have a command
    if (command && command.trim()) {
      args.push('--prompt', command);
    }
    
    // Use native --resume if sessionId is provided
    if (sessionId) {
      args.push('--resume', sessionId);
    }

    // Set output format to stream-json for robust parsing
    args.push('--output-format', 'stream-json');
    
    // Use cwd (actual project directory)
    const cleanPath = (cwd || process.cwd()).replace(/[^\x20-\x7E]/g, '').trim();
    const workingDir = cleanPath;
    
    // Handle images by saving them to temporary files and passing paths to Gemini
    const tempImagePaths = [];
    let tempDir = null;
    if (images && images.length > 0) {
      try {
        tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString());
        await fs.mkdir(tempDir, { recursive: true });
        
        for (const [index, image] of images.entries()) {
          const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches) continue;
          
          const [, mimeType, base64Data] = matches;
          const extension = mimeType.split('/')[1] || 'png';
          const filename = `image_${index}.${extension}`;
          const filepath = path.join(tempDir, filename);
          
          await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
          tempImagePaths.push(filepath);
        }
        
        if (tempImagePaths.length > 0 && command && command.trim()) {
          const imageNote = `\n\n[Attached images: ${tempImagePaths.length} images are saved at:]\n${tempImagePaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
          
          const promptIndex = args.indexOf('--prompt');
          if (promptIndex !== -1) {
            args[promptIndex + 1] += imageNote;
          }
        }
      } catch (error) {
        // console.error('Error processing images:', error);
      }
    }
    
    if (options.debug) {
      args.push('--debug');
    }
    
    // Add approval mode
    if (settings.skipPermissions) {
      args.push('--approval-mode', 'yolo');
    } else {
      args.push('--approval-mode', 'default');
    }
    
    // Model selection
    const modelToUse = options.model || 'auto-gemini-3';
    args.push('--model', modelToUse);
    
    const geminiPath = process.env.GEMINI_PATH || 'gemini';
    
    const geminiProcess = spawn(geminiPath, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    
    geminiProcess.tempImagePaths = tempImagePaths;
    geminiProcess.tempDir = tempDir;
    
    const processKey = capturedSessionId || sessionId || Date.now().toString();
    activeGeminiProcesses.set(processKey, geminiProcess);
    geminiProcess.sessionId = processKey;
    geminiProcess.stdin.end();
    
    let hasReceivedOutput = false;
    const timeoutMs = 60000; // 60 seconds for initial response
    const timeout = setTimeout(() => {
      if (!hasReceivedOutput) {
        ws.send(JSON.stringify({
          type: 'gemini-error',
          error: 'Gemini CLI timeout - no response received within 60s'
        }));
        geminiProcess.kill('SIGTERM');
      }
    }, timeoutMs);
    
    // Save user message to session when starting
    if (command && capturedSessionId) {
      sessionManager.addMessage(capturedSessionId, 'user', command);
    }
    
    let stdoutBuffer = '';
    
    geminiProcess.stdout.on('data', (data) => {
      hasReceivedOutput = true;
      clearTimeout(timeout);
      
      const chunk = data.toString();
      stdoutBuffer += chunk;
      
      // Process buffer line by line (each line is a JSON object in stream-json mode)
      let lineEndIndex;
      while ((lineEndIndex = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, lineEndIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(lineEndIndex + 1);
        
        if (!line) continue;
        
        try {
          const event = JSON.parse(line);
          
          switch (event.type) {
            case 'init':
              // Capture the real session ID from the CLI
              if (event.session_id && !capturedSessionId) {
                capturedSessionId = event.session_id;
                sessionCreatedSent = true;
                
                sessionManager.createSession(capturedSessionId, cwd || process.cwd());
                if (command) {
                  sessionManager.addMessage(capturedSessionId, 'user', command);
                }
                
                // Update process mapping
                activeGeminiProcesses.delete(processKey);
                activeGeminiProcesses.set(capturedSessionId, geminiProcess);
                geminiProcess.sessionId = capturedSessionId;

                ws.send(JSON.stringify({
                  type: 'session-created',
                  sessionId: capturedSessionId
                }));
              }
              // Send init info to frontend
              ws.send(JSON.stringify({
                type: 'gemini-response',
                data: {
                  type: 'system',
                  subtype: 'init',
                  session_id: event.session_id,
                  model: event.model
                }
              }));
              break;
              
            case 'message':
              if (event.role === 'assistant') {
                if (event.delta) {
                  // Incremental update
                  fullResponse += event.content;
                } else {
                  // Full message (if not using delta)
                  fullResponse = event.content;
                }
                
                ws.send(JSON.stringify({
                  type: 'gemini-response',
                  data: {
                    type: 'message',
                    role: 'assistant',
                    content: event.content,
                    delta: event.delta
                  }
                }));
              }
              break;
              
            case 'tool_use':
              ws.send(JSON.stringify({
                type: 'gemini-response',
                data: {
                  type: 'tool_use',
                  name: event.tool_name,
                  id: event.tool_id,
                  input: event.parameters
                }
              }));
              break;
              
            case 'tool_result':
              ws.send(JSON.stringify({
                type: 'gemini-response',
                data: {
                  type: 'tool_result',
                  tool_use_id: event.tool_id,
                  content: event.content,
                  is_error: event.status === 'error'
                }
              }));
              break;
              
            case 'status':
              ws.send(JSON.stringify({
                type: 'gemini-status',
                data: {
                  message: event.message,
                  tokens: event.tokens,
                  can_interrupt: event.can_interrupt
                }
              }));
              break;
              
            case 'result':
              // Final result with stats
              break;
          }
        } catch (e) {
          // If not valid JSON, it might be legacy text output or a warning
          // console.warn('Non-JSON output from Gemini CLI:', line);
        }
      }
    });
    
    geminiProcess.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      if (errorMsg.includes('DeprecationWarning')) return;
      
      ws.send(JSON.stringify({
        type: 'gemini-error',
        error: errorMsg
      }));
    });

    geminiProcess.on('close', async (code) => {
      clearTimeout(timeout);
      
      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeGeminiProcesses.delete(finalSessionId);
      
      if (finalSessionId && fullResponse) {
        sessionManager.addMessage(finalSessionId, 'assistant', fullResponse);
      }
      
      ws.send(JSON.stringify({
        type: 'gemini-complete',
        exitCode: code,
        isNewSession: !sessionId && !!command
      }));
      
      if (geminiProcess.tempImagePaths) {
        for (const imagePath of geminiProcess.tempImagePaths) {
          await fs.unlink(imagePath).catch(() => {});
        }
        if (geminiProcess.tempDir) {
          await fs.rm(geminiProcess.tempDir, { recursive: true, force: true }).catch(() => {});
        }
      }
      
      if (code === 0) resolve();
      else reject(new Error(`Gemini CLI exited with code ${code}`));
    });
    
    geminiProcess.on('error', (error) => {
      const finalSessionId = capturedSessionId || sessionId || processKey;
      activeGeminiProcesses.delete(finalSessionId);
      ws.send(JSON.stringify({ type: 'gemini-error', error: error.message }));
      reject(error);
    });
  });
}

function abortGeminiSession(sessionId) {
  // Debug - Attempting to abort Gemini session
  // Debug - Active processes
  
  // Try to find the process by session ID or any key that contains the session ID
  let process = activeGeminiProcesses.get(sessionId);
  let processKey = sessionId;
  
  if (!process) {
    // Search for process with matching session ID in keys
    for (const [key, proc] of activeGeminiProcesses.entries()) {
      if (key.includes(sessionId) || sessionId.includes(key)) {
        process = proc;
        processKey = key;
        break;
      }
    }
  }
  
  if (process) {
    // Debug - Found process for session
    try {
      // First try SIGTERM
      process.kill('SIGTERM');
      
      // Set a timeout to force kill if process doesn't exit
      setTimeout(() => {
        if (activeGeminiProcesses.has(processKey)) {
          // Debug - Process didn't terminate, forcing kill
          try {
            process.kill('SIGKILL');
          } catch (e) {
            // console.error('Error force killing process:', e);
          }
        }
      }, 2000); // Wait 2 seconds before force kill
      
      activeGeminiProcesses.delete(processKey);
      return true;
    } catch (error) {
      // console.error('Error killing process:', error);
      activeGeminiProcesses.delete(processKey);
      return false;
    }
  }
  
  // Debug - No process found for session
  return false;
}

export {
  spawnGemini,
  abortGeminiSession,
  getGeminiSpec
};

async function getGeminiSpec(type, context) {
  return new Promise(async (resolve, reject) => {
    let fullResponse = '';
    const args = [];

    const prompt = `Generate a ${type} for a new feature. Here is the context:\n\n${context}`;
    args.push('--prompt', prompt);

    const geminiPath = process.env.GEMINI_PATH || 'gemini';
    const geminiProcess = spawn(geminiPath, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    geminiProcess.stdin.end();

    geminiProcess.stdout.on('data', (data) => {
      fullResponse += data.toString();
    });

    geminiProcess.stderr.on('data', (data) => {
      console.error(`Gemini CLI stderr: ${data}`);
    });

    geminiProcess.on('close', (code) => {
      if (code === 0) {
        resolve(fullResponse);
      } else {
        reject(new Error(`Gemini CLI exited with code ${code}`));
      }
    });

    geminiProcess.on('error', (error) => {
      reject(error);
    });
  });
}