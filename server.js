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
const { stringSimilarity } = require('string-similarity-js');
const data = require('./data.json')
const apicache = require('apicache')
const Simulation = require("./models/Simulation"); // adjust path as needed
const User = require("./models/User"); 
const cache = apicache.middleware
let cacheMem = {etag: null, lastModified: null}

const app = express();
const server = http.createServer(app); 
const wss = new WebSocket.Server({ server }); // Attach WebSocket server

// Middleware
app.use(express.json());
app.use(cors());


// const User = mongoose.model("User", userSchema);

app.get("/data", cache("5 minutes"), async (req, res)=>{
  try {
    const {etag, lastModified} = cacheMem
    const headers = {}
    if (etag){
      headers['If-None-Match'] = etag;
    }

    if (lastModified){
      headers['If-Modified-Since'] = lastModified
    }

    const response = await fetch("http://myUrl.com", {headers})

    if (response.status === 304){
      return res.status(200).json(apicache.getIndex()[req.originalUrl]?.value)
    } 

    const newResponse = await res.json()

    cacheMem.etag = newResponse.headers.get("etag") 
    cacheMem.lastModified = newResponse.headers.get("last-modified")

    return res.status(200).json(newResponse)


  } catch (e){
    console.error(`${e.message}`)
  }
});

// Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/login-system", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));
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

app.get("/:userId/simulations", cache('5 minutes'), async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  const userId = req.params.userId 
  try {
  
      const verified = jwt.verify(token, process.env.JWT_SECRET)
      if (verified.id !== userId){
        return res.status(403).json({ message: "Forbidden: You can only access your own simulations" });
      }
      const headers = {}
      const {etag, lastModified} = cacheMem;
     
      if (etag){
        headers['If-None-Match'] = etag
      }
  
      if (lastModified){
        headers['If-Modified-Since'] = lastModified
      }

      if (res.status === 304){
        // Fetch the cached response from apicache
        const cachedResponse = apicache.getIndex()[req.originalUrl]?.value;
        if (cachedResponse) {
          return res.status(200).json(cachedResponse);
        } else {
          return res.status(304).end();
        }
      }

      const simulations = await Simulation.find({ userId });

      const newEtag = `"${Buffer.from(JSON.stringify(simulations)).toString('base64')}"`;
      res.setHeader("ETag", newEtag);

      cacheMem.etag = newEtag;
      cacheMem.lastModified = new Date().toUTCString();

      return res.status(200).json({ simulations });
  } catch (err) {
      res.status(401).json({ message: "Invalid token" });
  }
});

app.post("/simulations", async (req, res) => {
  const { userId, data } = req.body;
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    
    if (verified.id !== userId) {
      return res.status(403).json({ message: "Forbidden: Invalid user" });
    }

    const simulation = new Simulation({
      userId,
      data,
    });

    const saved = await simulation.save();

    res.status(201).json({
      message: "Simulation saved successfully",
      data: saved,
    });
  } catch (error) {
    console.error("Save error:", error.message);
    res.status(400).json({ message: "Failed to save simulation", error: error.message });
  }
});

app.delete('/simulations/:simulationId', async (req, res) =>{
  const token = req.headers['authorization'];
  const { simulationId } = req.params;
  const { userId } = req.query

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);

    if (verified.id !== userId) {
      return res.status(403).json({ message: 'Forbidden: Invalid user' });
    }

    const deleted = await Simulation.findOneAndDelete({
      _id: simulationId,
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Simulation not found' });
    }

    return res.status(200).json({ message: 'Simulation deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(400).json({ message: 'Failed to delete simulation', error: err.message });
  }
})

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
  wss.clients.forEach((client) => {
    handleWelcomeOrConversation(client);
  })
  // Listen for messages from clients
  ws.on("message", (message) => {
    console.log(`Received: ${message}`);
    // Broadcast the message to all clients
    wss.clients.forEach((client) => {
      handleWelcomeOrConversation(client, message);
    });
  });

  // Handle WebSocket closing
  ws.on("close", () => console.log("Client disconnected"));
});

const genUserNameFromEmail = (email) => {
    return email.split("@")[0]
}

const handleWelcomeOrConversation = (client, message) => {
  if (client.readyState === WebSocket.OPEN) {
    let messageStr = message ? message.toString() : null
    if (messageStr){
      // send back initial message for chat recording
      client.send(`${message}`)
      // send a response message based on input 
      let res = findResponse(`${message}`)
      if (res.indexOf("I'm sorry") > -1 || res.indexOf("No problemo!") > -1){
        client.send(res);
      } else {
        client.send(res + "\n Can I help you with anything else?");
      }
    } else {
      client.send("Hello! I am your SimStock Assistant. How can I help you today? You start by asking how to use SimStock, how is allocation re-calculation performed, how to upgrade to pro, and more!")
    }
  } else {
    console.log("CLIENT NOT READY: ", client.readyState === WebSocket.OPEN )
  }
}

const findResponse = (message) => {
  let highest = 0;
  let index = -1;
  let {questions} = data;
  questions.forEach((q, i)=>{
    let question = q.question
    let match = message.length < 10 ? stringSimilarity(message, question, 1) : stringSimilarity(message, question)
    index = match > highest ? i : index 
    highest = match > highest ? match : highest 
  })


  if (highest > 0.5) { // Adjust the threshold as needed
    return questions[index].answer;
  } else {
    return "I'm sorry, I don't understand your question. Could you rephrase it?";
  }
}

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
server.listen(1999, () => console.log("WebSocket Server running on port 1999"));