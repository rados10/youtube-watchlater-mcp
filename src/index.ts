#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import axios from 'axios';

interface WatchLaterArgs {
  daysBack?: number;
}

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_REFRESH_TOKEN = process.env.OAUTH_REFRESH_TOKEN;

if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
  throw new Error('Required environment variables missing');
}

class YouTubeWatchLaterServer {
  private server: Server;
  private youtube: any;
  private oauth2Client: any;

  constructor() {
    this.server = new Server(
      {
        name: 'youtube-watchlater',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      OAUTH_CLIENT_ID,
      OAUTH_CLIENT_SECRET
    );

    this.oauth2Client.setCredentials({
      refresh_token: OAUTH_REFRESH_TOKEN
    });

    // Initialize YouTube API client
    this.youtube = google.youtube({
      version: 'v3',
      auth: this.oauth2Client
    });

    this.setupToolHandlers();
    
    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_watch_later_urls',
          description: 'Get URLs of videos added to Watch Later within specified days',
          inputSchema: {
            type: 'object',
            properties: {
              daysBack: {
                type: 'number',
                description: 'Number of days to look back (default: 1)',
                default: 1
              }
            }
          }
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'get_watch_later_urls') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }
      return await this.handleGetWatchLaterUrls(request.params.arguments ?? {});
    });
  }

  private async handleGetWatchLaterUrls(args: Record<string, unknown>) {
    const typedArgs: WatchLaterArgs = {
      daysBack: typeof args.daysBack === 'number' ? args.daysBack : 1
    };

    try {
      // Get Watch Later playlist ID
      const response = await this.youtube.channels.list({
        part: ['contentDetails'],
        mine: true
      });

      const watchLaterPlaylistId = response.data.items?.[0]?.contentDetails?.relatedPlaylists?.watchLater;
      if (!watchLaterPlaylistId) {
        throw new Error('Could not find Watch Later playlist');
      }

      // Get playlist items
      const playlistItems = await this.youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId: watchLaterPlaylistId,
        maxResults: 50 // Get maximum items to filter by date
      });

      const daysBack = typedArgs.daysBack ?? 1;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);

      const urls = playlistItems.data.items
        ?.filter((item: any) => {
          const addedAt = new Date(item.snippet?.publishedAt);
          return addedAt >= cutoffDate;
        })
        .map((item: any) => `https://youtube.com/watch?v=${item.snippet?.resourceId?.videoId}`)
        .filter(Boolean) ?? [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(urls, null, 2)
        }]
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get Watch Later URLs: ${errorMessage}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('YouTube Watch Later MCP server running on stdio');
  }
}

const server = new YouTubeWatchLaterServer();
server.run().catch(console.error);
