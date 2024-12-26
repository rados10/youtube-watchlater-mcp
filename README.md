# YouTube Watch Later MCP Server

A Model Context Protocol (MCP) server that provides access to a custom YouTube playlist. The server exposes a simple tool to retrieve URLs of videos added to the specified playlist within a specified timeframe.

## Features

- Get URLs of videos added to a custom playlist within a configurable number of days
- Simple interface that returns just the video URLs
- OAuth2 authentication for secure access to your YouTube data

## Installation

1. Clone this repository:
```bash
git clone https://github.com/rados10/youtube-watchlater-mcp.git
cd youtube-watchlater
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Set Application Type to "Web application"
6. Add "http://localhost:3000/oauth2callback" to Authorized redirect URIs
7. Copy your Client ID and Client Secret

### 2. Get Refresh Token

Run the provided script with your Google Cloud credentials:

```bash
OAUTH_CLIENT_ID="your_client_id" OAUTH_CLIENT_SECRET="your_client_secret" node get-refresh-token.js
```

The script will:
- Open your default browser to the Google authorization page
- Ask you to sign in and authorize the application
- Display your refresh token in the terminal

### 3. Configure MCP Settings

Add the server configuration to your MCP settings file:

For VSCode (Claude Dev Extension):
`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

For Claude Desktop App:
`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "youtube-watchlater": {
      "command": "node",
      "args": ["/path/to/youtube-watchlater/build/index.js"],
      "env": {
        "OAUTH_CLIENT_ID": "your_client_id",
        "OAUTH_CLIENT_SECRET": "your_client_secret",
        "OAUTH_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

## Usage

The server provides a single tool `get_watch_later_urls` that accepts an optional `daysBack` parameter:

```typescript
// Get videos added in the last day (default)
{ "daysBack": 1 }

// Get videos added in the last week
{ "daysBack": 7 }
```

The server will return an array of YouTube URLs for the matching videos:

```json
[
  "https://youtube.com/watch?v=video1",
  "https://youtube.com/watch?v=video2",
  ...
]
```

## Token Refresh

The refresh token doesn't expire unless you explicitly revoke access. You only need to get a new one if you:
- Revoke the application's access in your Google Account settings
- Reset your Google account's security settings
- The token becomes invalid for any other reason

To get a new refresh token, simply run the get-refresh-token.js script again as described in the Setup section.

## Development

The server is built with:
- TypeScript
- @modelcontextprotocol/sdk
- googleapis (YouTube Data API v3)

To modify the server:
1. Make your changes in `src/index.ts`
2. Run `npm run build` to compile
3. Restart the MCP server to apply changes
