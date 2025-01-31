require("dotenv").config();
const http = require("http");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const WebSocket = require("ws"); // Import WebSocket module

const app = express();
const server = http.createServer(app); 
const wss = new WebSocket.Server({ server }); // Attach WebSocket server

// Middleware
app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/login-system", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: {type: String, required: true, unique: true}
});

const User = mongoose.model("User", userSchema);
// Routes

// Register Route
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ email });

  if (existingUser) return res.status(400).json({ message: "User already exists" });

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create new user
  const newUser = new User({ email, username: genUserNameFromEmail(email), password: hashedPassword });
  await newUser.save();

  // Generate token
  const token = jwt.sign({ id: newUser._id, username: newUser.username, email: newUser.email }, process.env.JWT_SECRET, { expiresIn: "1h" });

  res.json({ token, user:{id: newUser._id, username: newUser.username, email: newUser.email} });
});

// Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Find the user
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "Invalid credentials" });

  // Check password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

  // Generate token
  const token = jwt.sign({ id: user._id, username: user.username, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });

  res.json({ token, user:{id: user._id, username: user.username, email: user.email} });
});

// Protected Route
app.get("/", (req, res) => {
    const token = req.headers["authorization"];
    if (!token) return res.status(401).json({ message: "Unauthorized" });
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET)
        res.json({ message: "Welcome to your profile", user: verified });
    } catch (err) {
        res.status(401).json({ message: "Invalid token" });
    }
});

app.post("/google-login", async (req, res) => {
    const { token } = req.body;

    try {
        // Verify token with Google API
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID, // Should match frontend clientId
        });

        const { email } = ticket.getPayload(); // sub is Google's unique user ID

        // Check if user exists in MongoDB
        let user = await User.findOne({ email });

        if (!user) {
            // Create a new user if not found
            user = new User({ email, username: genUserNameFromEmail(email), password: "GoogleOAuth" }); // No need for password
            await user.save();
        }

        // Generate JWT
        const jwtToken = jwt.sign(
            { id: user._id, username: user.username, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({ token: jwtToken, user: {id: user._id, username: user.username, email }});
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: "Invalid Google token" });
    }
});

// WebSocket connection handling
wss.on("connection", (ws) => {
  console.log("Client connected");

  // Listen for messages from clients
  ws.on("message", (message) => {
    console.log(`Received: ${message}`);

    // Broadcast the message to all clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(`Server Echo: ${message}`);
      }
    });
  });

  // Handle WebSocket closing
  ws.on("close", () => console.log("Client disconnected"));
});

const genUserNameFromEmail = (email) => {
    return email.split("@")[0]
}

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
server.listen(1999, () => console.log("WebSocket Server running on port 1999"));