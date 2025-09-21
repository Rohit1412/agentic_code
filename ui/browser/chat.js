// Align behavior with ADK browser: send inlineData; avoid extra client logic by default
const ENABLE_DOCX_EXTRACTION = true; // set true to include client-side DOCX->text
const ADD_GUIDANCE_PARTS = false; // set true to inject helper guidance parts

class ChatInterface {
  constructor() {
    this.chatMessages = document.getElementById("chatMessages");
    this.chatInput = document.getElementById("chatInput");
    this.sendButton = document.getElementById("sendButton");
    this.chatForm = document.getElementById("chatForm");
    this.typingIndicator = document.getElementById("typingIndicator");

    // File upload elements
    this.fileUploadBtn = document.getElementById("fileUploadBtn");
    this.fileInput = document.getElementById("fileInput");
    this.filePreview = document.getElementById("filePreview");
    this.filePreviewInfo = document.getElementById("filePreviewInfo");
    this.filePreviewContent = document.getElementById("filePreviewContent");
    this.removeFileBtn = document.getElementById("removeFileBtn");

    // Tool buttons
    this.clearChatBtn = document.getElementById("clearChatBtn");
    this.exportChatBtn = document.getElementById("exportChatBtn");

    this.userId = "user_" + Math.random().toString(36).substr(2, 9);
    this.sessionId = null; // Will be created when first needed
    this.appName = "startup_investor_agent";

    // File handling
    this.selectedFiles = [];
    this.failedFiles = [];
    this.chatHistory = [];

    this.setupEventListeners();
    this.adjustTextareaHeight();

    // Initialize session
    this.initializeSession();

    // Log connection details for debugging
    console.log("Chat initialized with:", {
      userId: this.userId,
      appName: this.appName,
    });
  }

  setupEventListeners() {
    this.chatForm.addEventListener("submit", (e) => this.handleSubmit(e));
    this.chatInput.addEventListener("input", () => this.adjustTextareaHeight());
    this.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSubmit(e);
      }
    });

    // File upload listeners
    this.fileUploadBtn.addEventListener("click", () => this.fileInput.click());
    this.fileInput.addEventListener("change", (e) => this.handleFileSelect(e));
    this.removeFileBtn.addEventListener("click", () =>
      this.clearFileSelection()
    );

    // Tool button listeners
    this.clearChatBtn.addEventListener("click", () => this.clearChat());
    this.exportChatBtn.addEventListener("click", () => this.exportChat());

    // Drag and drop listeners
    this.chatMessages.addEventListener("dragover", (e) =>
      this.handleDragOver(e)
    );
    this.chatMessages.addEventListener("drop", (e) => this.handleDrop(e));

    // Suggestions click-to-fill
    document.addEventListener("click", (e) => {
      const sug = e.target.closest(".suggestion");
      if (!sug) return;
      const text = sug.getAttribute("data-text") || sug.textContent || "";
      this.chatInput.value = text;
      this.chatInput.focus();
      this.adjustTextareaHeight();
    });
  }

  adjustTextareaHeight() {
    this.chatInput.style.height = "auto";
    this.chatInput.style.height =
      Math.min(this.chatInput.scrollHeight, 120) + "px";
  }

  async initializeSession() {
    try {
      const response = await fetch(
        `/apps/${this.appName}/users/${this.userId}/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (response.ok) {
        const session = await response.json();
        this.sessionId = session.id;
        console.log("Session created:", this.sessionId);
        this.addStatusMessage("Connected to startup investor agent!");
      } else {
        throw new Error(`Failed to create session: ${response.status}`);
      }
    } catch (error) {
      console.error("Error creating session:", error);
      this.addStatusMessage(
        "Failed to connect to agent. Please refresh the page."
      );
    }
  }

  async ensureSession() {
    if (!this.sessionId) {
      await this.initializeSession();
    }
    return this.sessionId;
  }

  async handleSubmit(e) {
    e.preventDefault();

    const message = this.chatInput.value.trim();
    const hasFiles = this.selectedFiles.length > 0;
    // Remove welcome on first interaction
    const existingWelcome = this.chatMessages.querySelector('.welcome-message');
    if (existingWelcome) existingWelcome.remove();

    // Remove welcome section on first interaction
    const existingWelcome = this.chatMessages.querySelector('.welcome-message');
    if (existingWelcome) existingWelcome.remove();

    // Fail fast if user tried to upload unsupported/failed files with no text
    if (!message && !hasFiles) {
      if (this.failedFiles.length > 0) {
        const details = this.failedFiles
          .map((f) => `${f.name} — ${f.reason}`)
          .join("; ");
        this.addStatusMessage(
          `Upload failed: no supported files attached. ${details}`
        );
      }
      return;
    }

    // If there are failed files but user also has text or other files, inform and continue
    if (this.failedFiles.length > 0) {
      const details = this.failedFiles
        .map((f) => `${f.name} — ${f.reason}`)
        .join("; ");
      this.addStatusMessage(`Some attachments were not sent: ${details}`);
    }

    // Prepare message with files if any
    let messageData = { text: message, files: [...this.selectedFiles] };

    // Add user message to chat
    this.addMessage(messageData, "user");
    this.chatInput.value = "";
    this.adjustTextareaHeight();
    this.clearFileSelection();

    // Disable input while processing
    this.setInputEnabled(false);
    this.showTypingIndicator();

    try {
      await this.sendMessage(messageData);
    } catch (error) {
      console.error("Error sending message:", error);
      this.addMessage(
        { text: "Sorry, I encountered an error. Please try again.", files: [] },
        "error"
      );
    } finally {
      this.setInputEnabled(true);
      this.hideTypingIndicator();
    }
  }

  async sendMessage(messageData) {
    // Ensure we have a valid session
    const sessionId = await this.ensureSession();
    if (!sessionId) {
      throw new Error("Failed to create or get session");
    }

    // Prepare message parts
    const parts = [];

    // Add text part if present
    if (messageData.text) {
      parts.push({ text: messageData.text });
    }

    // Add file parts if present
    if (messageData.files && messageData.files.length > 0) {
      for (const file of messageData.files) {
        const lowerName = (file.name || "").toLowerCase();
        if (file.base64Data) {
          parts.push({
            inlineData: {
              mimeType: file.type,
              data: file.base64Data,
            },
          });

          // Optionally add document-specific guidance (disabled by default)
          if (ADD_GUIDANCE_PARTS) {
            const isWord =
              (file.type || "").includes("word") ||
              lowerName.endsWith(".doc") ||
              lowerName.endsWith(".docx");
            const isPpt =
              (file.type || "").includes("presentation") ||
              lowerName.endsWith(".ppt") ||
              lowerName.endsWith(".pptx");
            const isXls =
              (file.type || "").includes("spreadsheet") ||
              lowerName.endsWith(".xls") ||
              lowerName.endsWith(".xlsx");
            const isImage =
              (file.type || "").startsWith("image/") ||
              [
                ".png",
                ".jpg",
                ".jpeg",
                ".gif",
                ".webp",
                ".bmp",
                ".tif",
                ".tiff",
                ".svg",
              ].some((ext) => lowerName.endsWith(ext));
            if (isWord || isPpt || isXls) {
              try {
                const guidance = this.getDocumentAnalysisContext(file);
                if (guidance) parts.push({ text: guidance });
              } catch (e) {
                console.warn("Failed to add document analysis context", e);
              }
            } else if (isImage) {
              parts.push({
                text: `Attached image: ${file.name}. Please analyze any product screenshots, UI/UX cues, charts, or branding elements relevant to an investment memo.`,
              });
            }
          }

          // If we extracted DOCX text on the client, include it
          if (ENABLE_DOCX_EXTRACTION && file.convertedText) {
            parts.push({
              text: `CLIENT-SIDE DOCX TEXT (${file.name}):\n\n${file.convertedText}`,
            });
          }
        } else {
          console.warn(
            "Skipping file without base64 data:",
            file?.name || "[unnamed]"
          );
        }
      }
    }

    // If files were intended but none could be attached, notify and optionally abort when no text
    if (
      (!messageData.text || messageData.text.length === 0) &&
      messageData.files?.length > 0
    ) {
      const inlineCount = parts.filter((p) => p.inlineData).length;
      if (inlineCount === 0) {
        this.addStatusMessage(
          "Upload failed: files could not be attached. Please use PDF, image, TXT/CSV, or Office files (DOCX, PPTX, XLSX)."
        );
        throw new Error("No attachable files in request");
      }
    }

    const payload = {
      appName: this.appName,
      userId: this.userId,
      sessionId: sessionId,
      newMessage: {
        role: "user",
        parts: parts,
      },
      streaming: true,
    };

    console.log("Sending message:", payload);

    try {
      // Try streaming first
      const response = await fetch("/run_sse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(
          `HTTP ${response.status}: ${errText || "streaming endpoint error"}`
        );
      }

      // Handle Server-Sent Events
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMessage = "";
      let messageElement = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log("Received SSE data:", data);

              if (data.content && data.content.parts) {
                for (const part of data.content.parts) {
                  if (part.text) {
                    assistantMessage += part.text;
                    if (!messageElement) {
                      messageElement = this.addMessage("", "assistant");
                    }
                    messageElement.textContent = assistantMessage;
                    this.scrollToBottom();
                  }
                }
              }
            } catch (e) {
              console.log("Could not parse SSE data:", line);
            }
          }
        }
      }

      if (!assistantMessage && !messageElement) {
        console.log("No streaming response, trying non-streaming API...");
        throw new Error("No streaming response received");
      }
    } catch (error) {
      console.error("Streaming error:", error);

      // Fallback to non-streaming API
      try {
        const fallbackPayload = { ...payload, streaming: false };
        console.log("Trying non-streaming API with payload:", fallbackPayload);

        const fallbackResponse = await fetch("/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fallbackPayload),
        });

        if (fallbackResponse.ok) {
          const result = await fallbackResponse.json();
          console.log("Non-streaming API response:", result);

          let responseText = "";

          if (result.content && result.content.parts) {
            responseText = result.content.parts
              .filter((part) => part.text)
              .map((part) => part.text)
              .join("");
          } else if (result.candidates && result.candidates.length > 0) {
            // Handle Gemini API format
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts) {
              responseText = candidate.content.parts
                .filter((part) => part.text)
                .map((part) => part.text)
                .join("");
            }
          } else if (typeof result === "string") {
            responseText = result;
          } else {
            console.log("Unexpected response format:", result);
            responseText =
              "I received your message but the response format was unexpected. Please try again.";
          }

          if (responseText) {
            this.addMessage(responseText, "assistant");
          } else {
            this.addMessage(
              "I received your message but couldn't generate a proper response. Please try again.",
              "error"
            );
          }
        } else {
          const errorText = await fallbackResponse.text();
          console.error(
            "Fallback API error:",
            fallbackResponse.status,
            errorText
          );
          this.addStatusMessage(
            `Server error: ${fallbackResponse.status} — ${
              errorText || "unknown error"
            }`
          );
          throw new Error(`API error: ${fallbackResponse.status}`);
        }
      } catch (fallbackError) {
        console.error("Fallback error:", fallbackError);
        throw fallbackError;
      }
    }
  }

  addMessage(messageData, type) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${type}`;

    // Handle different message formats
    let text = "";
    let files = [];

    if (typeof messageData === "string") {
      text = messageData;
    } else if (messageData && typeof messageData === "object") {
      text = messageData.text || "";
      files = messageData.files || [];
    }

    // Add message actions for user and assistant messages
    if (type === "user" || type === "assistant") {
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "message-actions";
      actionsDiv.innerHTML = `
                <button class="message-action copy-btn" title="Copy message">📋</button>
            `;
      messageDiv.appendChild(actionsDiv);

      // Add copy functionality
      const copyBtn = actionsDiv.querySelector(".copy-btn");
      copyBtn.addEventListener("click", () => this.copyMessage(text));
    }

    // Add text content
    if (text) {
      const textDiv = document.createElement("div");
      textDiv.textContent = text;
      messageDiv.appendChild(textDiv);
    }

    // Add file content
    if (files && files.length > 0) {
      const filesDiv = document.createElement("div");
      filesDiv.className = "message-files";

      files.forEach((file) => {
        const fileDiv = document.createElement("div");
        fileDiv.className = "message-file";

        const fileInfo = document.createElement("div");
        fileInfo.className = "message-file-info";
        const icon = file.isConverted ? "📝" : "📎";
        const status = file.isConverted ? " (structured analysis)" : "";
        const originalType =
          file.isConverted && file.originalType
            ? ` (${file.originalType})`
            : "";
        fileInfo.innerHTML = `${icon} ${
          file.name
        }${status} (${this.formatFileSize(file.size)})${originalType}`;
        fileDiv.appendChild(fileInfo);

        // Show image preview for image files
        if (file.type.startsWith("image/") && file.preview) {
          const img = document.createElement("img");
          img.src = file.preview;
          img.alt = file.name;
          fileDiv.appendChild(img);
        }

        filesDiv.appendChild(fileDiv);
      });

      messageDiv.appendChild(filesDiv);
    }

    // Add to chat history
    this.chatHistory.push({ messageData, type, timestamp: new Date() });

    this.chatMessages.appendChild(messageDiv);
    this.scrollToBottom();

    return messageDiv;
  }

  showTypingIndicator() {
    this.typingIndicator.style.display = "block";
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    this.typingIndicator.style.display = "none";
  }

  setInputEnabled(enabled) {
    this.chatInput.disabled = !enabled;
    this.sendButton.disabled = !enabled;
    if (enabled) {
      this.chatInput.focus();
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }, 100);
  }

  // File handling methods
  async handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    this.selectedFiles = [];
    this.failedFiles = [];

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        // 10MB limit
        this.addStatusMessage(`File ${file.name} is too large (max 10MB)`);
        this.failedFiles.push({
          name: file.name,
          reason: "too large (max 10MB)",
        });
        continue;
      }

      // Check if file type is supported for direct upload
      const supportedTypes = [
        "image/",
        "text/",
        "application/pdf",
        // Microsoft Office
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ];
      const supportedExtensions = [
        ".txt",
        ".csv",
        ".pdf",
        // Images
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".bmp",
        ".tif",
        ".tiff",
        ".svg",
        // Office
        ".doc",
        ".docx",
        ".ppt",
        ".pptx",
        ".xls",
        ".xlsx",
      ];
      const isSupported =
        supportedTypes.some((type) => file.type.startsWith(type)) ||
        supportedExtensions.some((ext) =>
          file.name.toLowerCase().endsWith(ext)
        );

      if (!isSupported) {
        this.addStatusMessage(
          `Upload failed for "${file.name}": unsupported file type (${
            file.type || "unknown"
          }). Please use PDF, image, TXT/CSV, or Office files (DOCX, PPTX, XLSX).`
        );
        this.failedFiles.push({
          name: file.name,
          reason: `unsupported type (${file.type || "unknown"})`,
        });
        continue;
      }

      // Handle supported file types normally
      const fileData = {
        name: file.name,
        type: file.type,
        size: file.size,
        file: file,
      };

      try {
        fileData.base64Data = await this.fileToBase64(file);

        // Generate preview for images
        if (file.type.startsWith("image/")) {
          fileData.preview = await this.generateImagePreview(file);
        }

        // Client-side DOCX -> text extraction (best-effort)
        if (ENABLE_DOCX_EXTRACTION && this.isDocxFile(file)) {
          try {
            const extracted = await this.extractDocxText(file);
            if (extracted && extracted.trim().length > 0) {
              // Cap extremely large text to avoid huge payloads
              const MAX_TEXT = 100000;
              fileData.convertedText =
                extracted.length > MAX_TEXT
                  ? extracted.slice(0, MAX_TEXT) + "\n...[truncated]..."
                  : extracted;
              fileData.isConverted = true;
            }
          } catch (docxErr) {
            console.warn("DOCX text extraction failed:", docxErr);
            this.addStatusMessage(
              `DOCX text extraction failed for ${file.name}. Sending original file.`
            );
          }
        }

        this.selectedFiles.push(fileData);
      } catch (error) {
        console.error("Error processing file:", error);
        this.addStatusMessage(`Error processing ${file.name}`);
        this.failedFiles.push({ name: file.name, reason: "processing error" });
      }
    }

    this.updateFilePreview();

    // If all files failed, provide a consolidated reason
    if (this.selectedFiles.length === 0 && this.failedFiles.length > 0) {
      const details = this.failedFiles
        .map((f) => `${f.name} — ${f.reason}`)
        .join("; ");
      this.addStatusMessage(`No files attached. ${details}`);
    }
  }

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(",")[1]; // Remove data:image/jpeg;base64, prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async generateImagePreview(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  updateFilePreview() {
    if (this.selectedFiles.length === 0) {
      this.filePreview.classList.remove("show");
      return;
    }

    this.filePreview.classList.add("show");

    // Update info
    const fileCount = this.selectedFiles.length;
    const totalSize = this.selectedFiles.reduce(
      (sum, file) => sum + file.size,
      0
    );
    this.filePreviewInfo.innerHTML = `📎 ${fileCount} file${
      fileCount > 1 ? "s" : ""
    } selected (${this.formatFileSize(totalSize)})`;

    // Update preview content
    this.filePreviewContent.innerHTML = "";
    this.selectedFiles.forEach((file) => {
      const fileDiv = document.createElement("div");
      fileDiv.style.marginBottom = "8px";

      if (file.type.startsWith("image/") && file.preview) {
        const img = document.createElement("img");
        img.src = file.preview;
        img.className = "file-preview-image";
        img.alt = file.name;
        fileDiv.appendChild(img);
      } else {
        const icon = file.isConverted
          ? "📝"
          : file.type.startsWith("image/")
          ? "🖼️"
          : "📄";
        const status = file.isConverted ? " (text extracted)" : "";
        fileDiv.innerHTML = `${icon} ${file.name}${status}`;
        fileDiv.style.fontSize = "12px";
        fileDiv.style.color = file.isConverted ? "#f59e0b" : "#6b7280";
      }

      this.filePreviewContent.appendChild(fileDiv);
    });
  }

  // Helpers to detect DOCX by type or extension
  isDocxFile(file) {
    const name = (file?.name || "").toLowerCase();
    const type = (file?.type || "").toLowerCase();
    return name.endsWith(".docx") || type.includes("wordprocessingml.document");
  }

  // Client-side DOCX -> text extraction (best-effort, no external libs)
  async extractDocxText(file) {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    // Locate End Of Central Directory (EOCD)
    const eocdOffset = this._findEOCDOffset(view);
    if (eocdOffset < 0) throw new Error("EOCD not found");
    const cdSize = view.getUint32(eocdOffset + 12, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const total = view.getUint16(eocdOffset + 10, true);

    // Iterate central directory to find word/document.xml
    const decoder = new TextDecoder("utf-8");
    let pos = cdOffset;
    let docLocalOffset = null;
    let docCompressedSize = null;
    for (let i = 0; i < total && pos < cdOffset + cdSize; i++) {
      const sig = view.getUint32(pos, true);
      if (sig !== 0x02014b50) break; // central dir signature
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      const localHeaderOffset = view.getUint32(pos + 42, true);
      const nameStart = pos + 46;
      const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLen));
      if (name === "word/document.xml") {
        docLocalOffset = localHeaderOffset;
        // We can read compressed size from local header later
      }
      pos = nameStart + nameLen + extraLen + commentLen;
    }
    if (docLocalOffset == null) throw new Error("word/document.xml not found");

    // Read local file header and get compressed data
    const localSig = view.getUint32(docLocalOffset, true);
    if (localSig !== 0x04034b50)
      throw new Error("Local header signature mismatch");
    const compMethod = view.getUint16(docLocalOffset + 8, true);
    const compSize = view.getUint32(docLocalOffset + 18, true);
    const nameLen = view.getUint16(docLocalOffset + 26, true);
    const extraLen = view.getUint16(docLocalOffset + 28, true);
    const dataStart = docLocalOffset + 30 + nameLen + extraLen;
    const compBytes = new Uint8Array(
      buffer,
      dataStart,
      compSize || buffer.byteLength - dataStart
    );

    // Decompress if needed
    let xmlBytes;
    if (compMethod === 0) {
      xmlBytes = compBytes;
    } else if (compMethod === 8) {
      // deflate
      xmlBytes = await this._inflate(compBytes);
    } else {
      throw new Error(`Unsupported compression method: ${compMethod}`);
    }

    const xml = new TextDecoder("utf-8").decode(xmlBytes);
    return this._wordXmlToText(xml);
  }

  _findEOCDOffset(view) {
    const len = view.byteLength;
    // EOCD min size is 22 bytes, max comment 65535 -> search last ~66KB
    const start = Math.max(0, len - 22 - 65536);
    for (let i = len - 22; i >= start; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  async _inflate(bytes) {
    // Try deflate-raw first, then deflate
    const blob = new Blob([bytes]);
    const tryAlgo = async (algo) => {
      const ds = new DecompressionStream(algo);
      const stream = blob.stream().pipeThrough(ds);
      const ab = await new Response(stream).arrayBuffer();
      return new Uint8Array(ab);
    };
    try {
      return await tryAlgo("deflate-raw");
    } catch (_) {
      try {
        return await tryAlgo("deflate");
      } catch (e2) {
        throw e2;
      }
    }
  }

  _wordXmlToText(xmlString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, "application/xml");
      const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

      // If parsererror, fall back to stripping tags
      if (doc.getElementsByTagName("parsererror").length) {
        return xmlString
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const paragraphs = Array.from(doc.getElementsByTagNameNS(ns, "p"));
      const lines = [];
      for (const p of paragraphs) {
        // Gather text nodes from w:t, and handle line breaks w:br
        let parts = [];
        const texts = p.getElementsByTagNameNS(ns, "t");
        for (const t of texts) {
          parts.push(t.textContent);
        }
        // Also handle tabs and breaks lightly
        const brs = p.getElementsByTagNameNS(ns, "br");
        let line = parts.join("");
        if (brs.length > 0 && !line.endsWith("\n")) line += "\n";
        if (line.trim().length > 0) lines.push(line.trim());
      }
      const text = lines.join("\n\n");
      return (
        text ||
        xmlString
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      );
    } catch (e) {
      console.warn("Failed to parse Word XML:", e);
      return xmlString
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  clearFileSelection() {
    this.selectedFiles = [];
    this.fileInput.value = "";
    this.filePreview.classList.remove("show");
    this.failedFiles = [];
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Drag and drop handling
  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  handleDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Simulate file input change
      Object.defineProperty(this.fileInput, "files", {
        value: e.dataTransfer.files,
        writable: false,
      });
      this.handleFileSelect({ target: { files: e.dataTransfer.files } });
    }
  }

  // Utility methods
  copyMessage(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.addStatusMessage("Message copied to clipboard");
      })
      .catch(() => {
        this.addStatusMessage("Failed to copy message");
      });
  }

  clearChat() {
    if (confirm("Are you sure you want to clear the chat history?")) {
      this.chatMessages.innerHTML = `
                <div class="welcome-message">
                  <h1 class="gradient-text">Welcome</h1>
                  <p>
                    This tool helps analyze startups and produce investor‑grade insights by orchestrating specialized agents
                    (data, product/tech, and risk) into a concise memo.
                  </p>
                  <p class="meta">
                    Supported files: Images, PDF, TXT/CSV, and Office (DOCX/PPTX/XLSX). Max 10MB each. Drag & drop works.
                  </p>
                  <div class="suggestions">
                    <div class="suggestion" data-text="Analyze this startup: [name], market, traction, risks.">Analyze a startup</div>
                    <div class="suggestion" data-text="Summarize this pitch deck into an investor memo.">Summarize a deck</div>
                    <div class="suggestion" data-text="Compare [Startup A] vs [Startup B] with a verdict.">Compare competitors</div>
                  </div>
                </div>
            `;
      this.chatHistory = [];
      this.sessionId = null; // Reset session to create a new one
      this.addStatusMessage("Chat cleared");
      // Initialize new session
      this.initializeSession();
    }
  }

  exportChat() {
    if (this.chatHistory.length === 0) {
      this.addStatusMessage("No chat history to export");
      return;
    }

    const chatData = {
      sessionId: this.sessionId,
      userId: this.userId,
      exportDate: new Date().toISOString(),
      messages: this.chatHistory.map((entry) => ({
        type: entry.type,
        text:
          typeof entry.messageData === "string"
            ? entry.messageData
            : entry.messageData.text,
        files:
          typeof entry.messageData === "object"
            ? entry.messageData.files?.map((f) => ({
                name: f.name,
                type: f.type,
                size: f.size,
              }))
            : [],
        timestamp: entry.timestamp,
      })),
    };

    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `startup-agent-chat-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.addStatusMessage("Chat exported successfully");
  }

  addStatusMessage(text) {
    const statusDiv = document.createElement("div");
    statusDiv.className = "status-message";
    statusDiv.textContent = text;
    this.chatMessages.appendChild(statusDiv);
    this.scrollToBottom();

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (statusDiv.parentNode) {
        statusDiv.parentNode.removeChild(statusDiv);
      }
    }, 3000);
  }

  async extractTextFromDocument(file) {
    const fileType = file.type;
    const fileName = file.name;
    const fileSize = this.formatFileSize(file.size);

    // Try to read actual content for text-based files
    if (
      fileType === "text/plain" ||
      fileType === "text/csv" ||
      fileName.endsWith(".txt") ||
      fileName.endsWith(".csv")
    ) {
      try {
        const text = await this.fileToText(file);
        return `DOCUMENT CONTENT ANALYSIS:

FILENAME: ${fileName}
SIZE: ${fileSize}
TYPE: ${fileType}

ACTUAL FILE CONTENT:
${text}

Please analyze the above document content as a startup investor. Provide comprehensive analysis based on the actual content above.`;
      } catch (error) {
        return this.createDocumentDescription(fileName, fileType, fileSize);
      }
    }

    // For document formats that we can't directly read, create analysis framework
    return this.createDocumentDescription(fileName, fileType, fileSize);
  }

  async fileToText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  createDocumentDescription(fileName, fileType, fileSize) {
    let documentType = "Unknown Document";
    let analysisRequest = "";

    // Determine document type and create appropriate description
    if (
      fileType.includes("word") ||
      fileName.endsWith(".doc") ||
      fileName.endsWith(".docx")
    ) {
      documentType = "Microsoft Word Document";
      analysisRequest = `I am analyzing a Word document (${fileName}) that likely contains business information, startup documentation, or project proposals. 
            
As an expert startup investor agent, I should provide a comprehensive analysis covering:
- Executive Summary and Investment Recommendation
- Business Model Assessment  
- Market Opportunity Analysis
- Team and Execution Capability
- Financial Projections Review
- Risk Analysis and Mitigation
- Competitive Landscape
- Technology and Product Evaluation
- Go-to-Market Strategy Assessment

Please provide a detailed investment memo format analysis based on typical content found in startup business documents.`;
    } else if (
      fileType.includes("presentation") ||
      fileName.endsWith(".ppt") ||
      fileName.endsWith(".pptx")
    ) {
      documentType = "Microsoft PowerPoint Presentation";
      analysisRequest = `I am analyzing a PowerPoint presentation (${fileName}) which is likely a startup pitch deck or business presentation.

As an expert startup investor, I should provide a comprehensive pitch deck analysis covering:
- Executive Summary & Investment Thesis
- Problem Statement and Market Need
- Solution and Unique Value Proposition  
- Market Size and Opportunity (TAM/SAM/SOM)
- Business Model and Revenue Streams
- Go-to-Market Strategy and Sales Process
- Competitive Analysis and Differentiation
- Team Background and Expertise
- Financial Projections and Unit Economics
- Funding Requirements and Use of Funds
- Risk Assessment and Mitigation Strategies
- Investment Recommendation and Terms

Please provide a detailed investment committee presentation analysis based on typical startup pitch deck content.`;
    } else if (
      fileType.includes("spreadsheet") ||
      fileName.endsWith(".xls") ||
      fileName.endsWith(".xlsx")
    ) {
      documentType = "Microsoft Excel Spreadsheet";
      analysisRequest = `I am analyzing an Excel spreadsheet (${fileName}) that likely contains financial data, business metrics, or projections.

As a startup investor, I should provide comprehensive financial analysis covering:
- Revenue Model and Growth Projections
- Unit Economics and Key Metrics (LTV, CAC, Churn, etc.)
- Financial Statements Analysis (P&L, Cash Flow, Balance Sheet)
- Burn Rate and Runway Analysis
- Market Size and Penetration Metrics
- Operational Efficiency Indicators  
- Funding Requirements and Use of Capital
- Scenario Analysis and Sensitivity Testing
- Competitive Benchmarking
- Investment Valuation and Returns Analysis

Please provide a detailed financial due diligence analysis based on typical startup financial models.`;
    } else if (fileType.includes("pdf")) {
      documentType = "PDF Document";
      analysisRequest = `I am analyzing a PDF document (${fileName}) which may contain business plans, financial statements, pitch materials, or other startup documentation.

As an expert investor, I should provide comprehensive analysis covering:
- Executive Summary and Investment Recommendation  
- Business Model and Value Proposition Analysis
- Market Opportunity and Competitive Positioning
- Financial Performance and Projections Review
- Team Assessment and Execution Capability
- Technology and Product Evaluation
- Risk Analysis and Mitigation Strategies
- Strategic Recommendations and Next Steps

Please provide a thorough investment evaluation based on typical PDF business documents.`;
    } else if (fileName.endsWith(".csv")) {
      documentType = "CSV Data File";
      analysisRequest = `I am analyzing a CSV data file (${fileName}) that contains structured business data, metrics, or analytics.

As a data-driven investor, I should provide comprehensive data analysis covering:
- Key Performance Indicators (KPIs) and Trends
- Customer Acquisition and Retention Metrics
- Revenue Growth and Financial Performance
- User Behavior and Engagement Analysis
- Market Penetration and Growth Opportunities
- Operational Efficiency Metrics
- Competitive Benchmarking Data
- Predictive Analytics and Forecasting
- Data Quality and Business Intelligence Insights

Please provide a detailed data-driven investment analysis based on typical startup metrics and KPIs.`;
    }

    return `DOCUMENT UPLOADED FOR ANALYSIS:
        
DOCUMENT NAME: ${fileName}
DOCUMENT TYPE: ${documentType}
FILE SIZE: ${fileSize}
MIME TYPE: ${fileType}

ANALYSIS INSTRUCTION:
${analysisRequest}

IMPORTANT: This document has been converted to text format for analysis. Based on the document type (${documentType}), please provide a comprehensive investment analysis. Even though the specific content details are not available, you should:

1. Provide a detailed analysis framework appropriate for this document type
2. Outline what specific areas you would evaluate if this were a real ${documentType.toLowerCase()}
3. Give actionable insights and recommendations based on typical ${documentType.toLowerCase()} characteristics
4. Structure your response as a complete investment memo

Please proceed with your full startup investment analysis for this ${documentType.toLowerCase()}.`;
  }

  getDocumentAnalysisContext(file) {
    const fileName = file.name;
    const fileType = file.originalType || file.type;

    if (
      fileType.includes("word") ||
      fileName.endsWith(".doc") ||
      fileName.endsWith(".docx")
    ) {
      return `DOCUMENT ANALYSIS INSTRUCTION:

I have uploaded a Microsoft Word document (${fileName}) that contains business content. This document is being sent directly to you for analysis.

As an expert startup investor, please:
1. Extract and analyze all text content from this Word document
2. Identify key business information (business model, financials, market analysis, etc.)
3. Provide a comprehensive investment analysis based on the actual document content
4. Structure your response as a professional investment memo

Please read and analyze the complete content of this Word document.`;
    }

    if (
      fileType.includes("presentation") ||
      fileName.endsWith(".ppt") ||
      fileName.endsWith(".pptx")
    ) {
      return `PITCH DECK ANALYSIS INSTRUCTION:

I have uploaded a PowerPoint presentation (${fileName}) which is likely a startup pitch deck. This presentation is being sent directly to you for analysis.

As an expert startup investor, please:
1. Extract and analyze all content from each slide
2. Identify the key pitch components (problem, solution, market, team, financials, ask)
3. Evaluate the investment opportunity based on the actual presentation content
4. Provide specific feedback on the pitch deck structure and content
5. Give an investment recommendation with detailed rationale

Please analyze the complete PowerPoint presentation content.`;
    }

    if (
      fileType.includes("spreadsheet") ||
      fileName.endsWith(".xls") ||
      fileName.endsWith(".xlsx")
    ) {
      return `FINANCIAL DATA ANALYSIS INSTRUCTION:

I have uploaded an Excel spreadsheet (${fileName}) containing financial or business data. This spreadsheet is being sent directly to you for analysis.

As an expert startup investor, please:
1. Extract and analyze all numerical data, formulas, and content from the spreadsheet
2. Identify key financial metrics, projections, and business indicators
3. Evaluate the financial health and viability of the business
4. Assess the quality and reasonableness of financial projections
5. Provide investment insights based on the actual financial data

Please analyze the complete Excel spreadsheet content and data.`;
    }

    return `DOCUMENT ANALYSIS INSTRUCTION:

I have uploaded a business document (${fileName}) for your analysis. This document is being sent directly to you.

As an expert startup investor, please:
1. Extract and analyze all content from this document
2. Identify relevant business information for investment evaluation
3. Provide comprehensive analysis based on the actual document content
4. Give actionable investment insights and recommendations

Please analyze the complete document content.`;
  }
}

// Initialize chat interface when page loads
document.addEventListener("DOMContentLoaded", () => {
  new ChatInterface();
});
