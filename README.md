<div align="center">
  <h1>Gemini CLI Web UI</h1>
  <p><strong>A modern, full-stack autonomous engineering interface for Google Gemini CLI</strong></p>

  ![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=white)
  ![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
  ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwind-css&logoColor=white)
  ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
  ![Google Gemini](https://img.shields.io/badge/Google_Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white)
</div>

---

## 🚀 Overview

Gemini CLI Web UI is an advanced, responsive web interface for [Gemini CLI](https://github.com/google-gemini/gemini-cli), Google's official autonomous agent for software engineering. It provides a rich, IDE-like experience that bridges the gap between the command line and a visual workspace, accessible from any desktop or mobile device.

This fork has been extensively modernized with native-style mobile interfaces, robust project management, and synchronized integration with the latest Gemini 3.1 and 2.5 models.

## ✨ Key Features

### 💻 Professional Workspace
- **Responsive Design**: Mobile-first architecture with a native iOS-style text entry and navigation.
- **Project Discovery**: Automated synchronization with `~/.gemini/projects.json` for seamless project switching.
- **Visual File Browser**: Navigate your server's filesystem and add existing projects with a built-in directory explorer.

### 🤖 Advanced Agent Integration
- **Real-time Streaming**: Full support for `stream-json` output, providing instant feedback as Gemini thinks and acts.
- **Model Selector**: Quick-switch between Gemini 3.1 Pro, 3.0 Flash, 2.5 Pro, and automated selection modes.
- **Specification Generator**: Transform high-level ideas into complete Design Documents, Requirements, and Task lists autonomously.
- **Tool Orchestration**: Granular control over allowed tools and "YOLO mode" for uninterrupted autonomous operations.

### 🛠️ Developer Tools
- **Monaco Editor**: High-performance code editing (the engine behind VS Code) with full syntax highlighting.
- **Integrated Terminal**: Fully interactive shell for direct command execution.
- **Git Explorer**: Real-time status visualization, staging, and committing directly from the UI.
- **Vision Support**: Upload images directly into chat for visual debugging and UI analysis.

## 🛠️ Technologies Used

- **Frontend**: React 18, Vite, Tailwind CSS v4, Monaco Editor, Lucide Icons, Framer Motion.
- **Backend**: Node.js, Express, Better-SQLite3, WebSockets (ws), node-pty.
- **Authentication**: Secure JWT-based system with local SQLite persistence.

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v20 or higher.
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) installed and configured on your system.

### Installation

1. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Gemini-CLI-Web.git
   cd Gemini-CLI-Web
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Generate a secure JWT secret:
   # openssl rand -base64 32
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:4009`
   - Backend: `http://localhost:4008`

---

## 🌐 Production & Auto-start

For permanent use or setting up the UI on a remote server, it is recommended to run the application in production mode.

### 1. Build the Frontend
Generate the optimized production files:
```bash
npm run build
```
In production mode, the server listens on port **4008** and serves both the API and the UI from that single port.

### 2. Set up as a System Service (systemd)
To ensure the server starts automatically at boot:

1. Create a service file:
   ```bash
   sudo nano /etc/systemd/system/gemini-ui.service
   ```
2. Paste the following configuration (update `/path/to/Gemini-CLI-Web` and `your-user`):
   ```ini
   [Unit]
   Description=Gemini CLI Web UI
   After=network.target

   [Service]
   Type=simple
   User=your-user
   WorkingDirectory=/path/to/Gemini-CLI-Web
   ExecStart=/usr/bin/node server/index.js
   Restart=on-failure
   Environment=NODE_ENV=production
   Environment=PORT=4008

   [Install]
   WantedBy=multi-user.target
   ```
3. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable gemini-ui
   sudo systemctl start gemini-ui
   ```

### 3. Alternative: Using PM2
If you prefer [PM2](https://pm2.keymetrics.io/):
```bash
npm install -g pm2
pm2 start server/index.js --name "gemini-ui"
pm2 startup
pm2 save
```

---

## 🔒 Security

- **Single-User System**: Built-in authentication ensures only you can access your server's files and Gemini CLI.
- **Tool Permissions**: Every tool (Bash, Read, Write) is disabled by default. Enable them selectively in the **Tools Settings** menu.
- **Local Persistence**: All project mappings and credentials are stored securely on your own machine.

---

## 📂 Project Structure

```text
├── server/            # Node.js backend & Gemini CLI bridge
├── src/               # React frontend components & state
│   ├── components/    # Reusable UI elements
│   ├── contexts/      # Auth and Theme providers
│   └── hooks/         # Custom React logic
├── public/            # Static assets & screenshots
└── specs/             # Generated feature specifications
```

---

## 📄 License

GNU General Public License v3.0 - see [LICENSE](LICENSE) file for details.

### Acknowledgments
Original project based on [Claude Code UI](https://github.com/siteboon/claudecodeui) with extensive customizations for the Gemini ecosystem.

---
<div align="center">
  <sub>Built with ❤️ for the Gemini Developer Community</sub>
</div>
