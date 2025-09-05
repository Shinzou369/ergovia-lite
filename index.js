
// Entry point for Prismity AI application
// Main server logic is in server.js

const path = require('path');

// Check if we're being run directly vs required as a module
if (require.main === module) {
  console.log("Prismity AI - Starting application...");
  console.log("Main server is running from server.js");
  
  // If someone tries to run this directly, redirect to server.js
  try {
    require('./server.js');
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
} else {
  console.log("Prismity AI - index.js loaded as module");
}

module.exports = {};
