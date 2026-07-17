// Vercel serverless function entry point
// This wraps the Express app to work with Vercel's serverless architecture

let appInitialized = false;
let app = null;

// Export the Express app as a serverless function handler
module.exports = async (req, res) => {
  try {
    // Initialize app on first request
    if (!appInitialized) {
      const serverModule = require('../dist/index.js');

      // Initialize the app if needed
      if (serverModule.initializeApp) {
        app = await serverModule.initializeApp();
      } else if (serverModule.app) {
        app = serverModule.app;
      }

      appInitialized = true;
    }

    // Handle the request
    if (app) {
      return app(req, res);
    }

    // Fallback error
    res.status(500).json({
      error: 'Server not properly configured for serverless deployment'
    });
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

