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
const PLAYLIST_ID = process.env.PLAYLIST_ID;

if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN || !PLAYLIST_ID) {
  throw new Error('Required environment variables missing (OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN, PLAYLIST_ID)');
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
      interface PlaylistItem {
        contentDetails?: {
          videoId?: string;
        };
        snippet?: {
          title?: string;
          publishedAt?: string;
        };
      }

      // First verify we can access the API with our credentials
      try {
        const testResponse = await this.youtube.channels.list({
          part: ['id'],
          mine: true
        });
        console.error('Auth test response:', JSON.stringify(testResponse.data, null, 2));
      } catch (error) {
        console.error('Auth test error:', error);
        throw new Error('Failed to authenticate with YouTube API');
      }

      // Get all videos from configured playlist
      let allItems: PlaylistItem[] = [];
      let nextPageToken: string | undefined = undefined;

      try {
        do {
          const playlistResponse: {
            data: {
              items?: PlaylistItem[];
              nextPageToken?: string;
              error?: {
                message?: string;
              };
            }
          } = await this.youtube.playlistItems.list({
            part: ['snippet,contentDetails'],
            playlistId: PLAYLIST_ID,
            maxResults: 50,
            pageToken: nextPageToken,
            headers: {
              Authorization: `Bearer ${this.oauth2Client.credentials.access_token}`
            }
          });

          console.error('Playlist response:', JSON.stringify(playlistResponse.data, null, 2));

          if (playlistResponse.data.error) {
            throw new Error(`YouTube API error: ${playlistResponse.data.error.message}`);
          }

          if (playlistResponse.data.items) {
            allItems = allItems.concat(playlistResponse.data.items);
          }

          nextPageToken = playlistResponse.data.nextPageToken;
        } while (nextPageToken);
      } catch (error) {
        console.error('Playlist fetch error:', error);
        throw error;
      }

      // Log all items for debugging
      console.error('All items:', allItems.map(item => ({
        videoId: item.contentDetails?.videoId,
        title: item.snippet?.title,
        addedAt: item.snippet?.publishedAt
      })));

      // Try getting all videos from the last 7 days instead of just today
      const daysBack = 7;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);

      const urls = allItems
        .map((item: any) => {
          const videoId = item.contentDetails?.videoId;
          const addedAt = new Date(item.snippet?.publishedAt);
          console.error(`Video ${videoId} (${item.snippet?.title}) added at ${addedAt}`);
          if (videoId) {
            return `https://youtube.com/watch?v=${videoId}`;
          }
          return null;
        })
        .filter(Boolean);

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
