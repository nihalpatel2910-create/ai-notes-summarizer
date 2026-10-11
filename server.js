const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const {
  initializeDb,
  getUserByEmail,
  getUserById,
  createUser,
  createDocument,
  getMyDocuments,
  getDocumentById,
  saveSummary,
  getMySummaries,
  getAdminDashboard,
  getAllUsers
} = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

initializeDb();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".txt", ".pdf", ".doc", ".docx"];
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(extension)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Use .txt, .pdf, .doc, or .docx"));
    }
  }
});

function cleanText(text) {
  return String(text || "")
    .replace(/\r\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractTextFromFile(filePath, fileType) {
  const extension = fileType.toLowerCase();

  if (extension === "txt") {
    return fs.readFileSync(filePath, "utf8");
  }

  if (extension === "pdf") {
    const data = await pdfParse(filePath);
    return data.text || "";
  }

  if (extension === "docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }

  if (extension === "doc") {
    return "DOC files are not fully supported in this basic app. Please upload a .txt, .pdf, or .docx file.";
  }

  return "";
}

function splitIntoSentences(text) {
  return (text.match(/[^.!?]+[.!?]?/g) || []).map(sentence => sentence.trim()).filter(Boolean);
}

function computeWordFrequency(text) {
  const stopWords = new Set([
    "the", "is", "a", "an", "and", "or", "but", "if", "then", "else", "for", "to", "of", "in",
    "on", "at", "by", "with", "as", "it", "its", "that", "this", "these", "those", "from", "be",
    "are", "was", "were", "has", "have", "had", "will", "would", "could", "should", "into", "over",
    "under", "about", "after", "before", "between", "through", "during", "while", "we", "you", "they",
    "he", "she", "it", "i", "our", "your", "their", "their", "them", "us"
  ]);

  const words = cleanText(text).toLowerCase().match(/[a-zA-Z0-9']+/g) || [];
  const frequency = {};

  words.forEach(word => {
    if (word.length < 3 || stopWords.has(word)) return;
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return frequency;
}

function generateSummary(text) {
  const cleanedText = cleanText(text);
  if (!cleanedText) return "No text available for summarization.";

  const sentences = splitIntoSentences(cleanedText);
  if (sentences.length === 0) return cleanedText.slice(0, 500);

  const freq = computeWordFrequency(cleanedText);
  const scoredSentences = sentences.map(sentence => {
    const words = (sentence.toLowerCase().match(/[a-zA-Z0-9']+/g) || []);
    let score = 0;

    words.forEach(word => {
      if (word.length > 2 && freq[word]) score += freq[word];
    });

    return { sentence, score };
  });

  const topSentences = scoredSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => item.sentence);

  return topSentences.join(" ") || sentences.slice(0, 3).join(" ");
}

function extractKeywords(text, limit = 8) {
  const frequency = computeWordFrequency(text);
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }

  const existingUser = getUserByEmail(email);
  if (existingUser) {
    return res.status(409).json({ error: "User already exists." });
  }

  const createdUser = createUser({ name, email, password });
  return res.status(201).json({
    message: "Registration successful.",
    user: {
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      role: createdUser.role
    }
  });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const isMatch = require("bcryptjs").compareSync(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  return res.json({
    message: "Login successful.",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

app.get("/api/users", (req, res) => {
  const users = getAllUsers();
  res.json({ users });
});

app.get("/api/documents/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const user = getUserById(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const documents = getMyDocuments(userId);
  return res.json({ documents });
});

app.post("/api/upload", upload.single("document"), async (req, res) => {
  try {
    const { userId } = req.body;
    const user = getUserById(Number(userId));

    if (!user) {
      return res.status(401).json({ error: "Login required to upload documents." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file selected." });
    }

    const fileType = path.extname(req.file.originalname).replace(".", "");
    const extractedText = await extractTextFromFile(req.file.path, fileType);

    const savedDocument = createDocument({
      userId: Number(userId),
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileType,
      fileSize: req.file.size,
      extractedText
    });

    return res.status(201).json({
      message: "Document uploaded successfully.",
      document: savedDocument
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Upload failed." });
  }
});

app.post("/api/summarize", (req, res) => {
  const { documentId, userId } = req.body;
  const user = getUserById(Number(userId));

  if (!user) {
    return res.status(401).json({ error: "User not found." });
  }

  const document = getDocumentById(Number(documentId));
  if (!document) {
    return res.status(404).json({ error: "Document not found." });
  }

  const summaryText = generateSummary(document.extracted_text || "");
  const keywords = extractKeywords(document.extracted_text || "");

  const savedSummary = saveSummary({
    documentId: Number(documentId),
    userId: Number(userId),
    summaryText,
    keywords: keywords.join(", ")
  });

  return res.json({
    summary: summaryText,
    keywords,
    savedSummary
  });
});

app.get("/api/summaries/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const user = getUserById(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const summaries = getMySummaries(userId);
  return res.json({ summaries });
});

app.get("/api/admin/dashboard/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const user = getUserById(userId);

  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const dashboard = getAdminDashboard();
  return res.json({ dashboard });
});

app.listen(PORT, () => {
  console.log(`AI Notes Summarizer server is running on http://localhost:${PORT}`);
});
