Authentication
All proxy endpoints accept API key authentication via either header:

Header Options

x-api-key: YOUR_API_KEY
# OR
Authorization: Bearer YOUR_API_KEY
Dashboard endpoints use JWT tokens obtained from the /auth/login endpoint.

Messages
POST
/api/v1/messages
API Key
Create a message. Supports streaming via stream: true. Anthropic-compatible request/response format.

Request

{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "Hello, Claude!" }
  ],
  "stream": false
}
Response

{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4-6",
  "content": [
    { "type": "text", "text": "Hello! How can I help you today?" }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 12,
    "output_tokens": 15
  }
}
Streaming: When stream: true, returns Server-Sent Events (SSE) with message_start, content_block_delta, and message_stop events.

Models
GET
/api/v1/models
None
List all available models.

Response

{
  "data": [
    {
      "id": "claude-opus-4-8",
      "object": "model",
      "display_name": "Claude Opus 4.8",
      "created_at": "2026-05-28T00:00:00Z"
    },
    {
      "id": "claude-opus-4-7",
      "object": "model",
      "display_name": "Claude Opus 4.7",
      "created_at": "2026-04-16T00:00:00Z"
    },
    {
      "id": "claude-sonnet-4-6",
      "object": "model",
      "display_name": "Claude Sonnet 4.6",
      "created_at": "2025-01-01T00:00:00Z"
    },
    {
      "id": "claude-haiku-4-5-20251001",
      "object": "model",
      "display_name": "Claude Haiku 4.5",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
Token Counting
POST
/api/v1/messages/count_tokens
API Key
Count tokens for a message without sending it.

Request

{
  "model": "claude-sonnet-4-6",
  "messages": [
    { "role": "user", "content": "How many tokens is this?" }
  ]
}
Key Status
GET
/api/key-status?key=
None
Check the status, usage, and limits of an API key.

Response

{
  "status": "found",
  "name": "My Key",
  "isActive": true,
  "windowTokenLimit": "5000000",
  "windowTokensUsed": "1234567",
  "windowActive": true,
  "windowResetAt": "2026-03-19T15:00:00.000Z",
  "planName": "Pro",
  "expiresAt": "2026-06-19T00:00:00.000Z",
  "totalRequests": 142,
  "last24h": {
    "requests": 28,
    "tokensIn": 45000,
    "tokensOut": 12000,
    "totalTokens": 57000,
    "avgLatencyMs": 1250
  }
}
Web Search
POST
/tools/web_search
API Key
Search the web for real-time information. Use 3-5 keywords for best results.

Request

{
  "query": "latest Node.js release 2026"
}
Image Analysis
POST
/tools/understand_image
API Key
Analyze images with AI. Accepts HTTP URLs, local file paths, or base64 data URLs. Max 18MB.

Request

{
  "prompt": "Describe what you see in this image",
  "image_url": "https://example.com/photo.jpg"
}
