import { google } from 'googleapis';
import express from 'express';
import open from 'open';

const app = express();
const port = 3399;

// These will be provided by the user after creating a project in Google Cloud Console
const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const REDIRECT_URI = `http://localhost:${port}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Please set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET environment variables');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Generate the url that will be used for authorization
const authorizeUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/youtubepartner',
    'https://www.googleapis.com/auth/youtube'
  ],
  prompt: 'consent'  // Force to get refresh token
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code || typeof code !== 'string') {
    res.status(400).send('No code provided');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\nRefresh Token:', tokens.refresh_token);
    console.log('\nAdd this refresh token to your MCP settings configuration.');
    res.send('Authorization successful! You can close this window.');
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.status(500).send('Error getting tokens');
  } finally {
    // Close the server after handling the callback
    setTimeout(() => process.exit(0), 1000);
  }
});

// Start the server and open the auth URL
app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('\nOpening authorization page...');
  await open(authorizeUrl);
});
