# AI SDR Agent - Powered by LiveAvatar

Create an instant AI Sales Development Representative (SDR) using [LiveAvatar](https://liveavatar.com) technology. This app lets you spin up a real-time video avatar for natural voice conversations.

**Try it now:** Create an AI sales rep in minutes with a free [LiveAvatar API key](https://app.liveavatar.com/developers).

## Features

- Real-time video avatar with voice chat
- Conversation transcript panel
- 2-minute demo session limit
- Custom avatar selection
- Context reuse for faster subsequent sessions

## Quick Start

### Prerequisites

- Node.js 18+
- LiveAvatar API key ([Get your free key here](https://app.liveavatar.com/developers) - sign in with HeyGen account)

### Installation

```bash
# Clone the repository
git clone https://github.com/eNNNo/liveavatar-ai-sdr.git
cd liveavatar-ai-sdr

# Install dependencies
npm install

# Configure your API key
cp .env.example .env.local
# Edit .env.local and add your LIVEAVATAR_API_KEY
```

### Running

```bash
npm run dev
```

Open http://localhost:3001 in your browser.

## Configuration

### Environment Variables

Create a `.env.local` file with:

```bash
# Required: Your LiveAvatar API key
LIVEAVATAR_API_KEY=your-api-key-here

# Required: Supabase connection for participant lookup
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Required: OpenAI key for automatic conversation summaries/reports
OPENAI_API_KEY=your-openai-api-key

# Optional: Auto-start mode (skip the onboarding form)
NEXT_PUBLIC_AUTO_START=false
NEXT_PUBLIC_PARTICIPANT_ID=4711
```

### Auto-Start Mode

To skip the onboarding form and immediately start a session:

```bash
NEXT_PUBLIC_AUTO_START=true
NEXT_PUBLIC_PARTICIPANT_ID=4711
```

## Using with Claude Code

### Quick Install (Recommended)

Install the skill with one command:

```bash
npx skills add eNNNo/liveavatar-ai-sdr
```

**Important**: After installing, restart Claude Code to load the new skill.

Then in any Claude Code session:
```
/ai-sdr-agent
```

Claude will prompt you for your LiveAvatar API key and set everything up automatically.

### Manual Installation

If you prefer to set it up manually:

1. Open Claude Code in any project
2. Run: `/ai-sdr-agent`
3. Claude will clone this repo, configure your API key, and run the app for you

## How It Works

1. **Context Creation**: Creates a LiveAvatar context with a coaching-oriented sales persona
2. **Avatar Session**: Starts a real-time video session with voice chat capabilities
3. **Conversation**: Users can speak or type to interact with the AI SDR

## Tech Stack

- Next.js 15 with App Router
- [LiveAvatar SDK](https://liveavatar.com) by HeyGen
- Tailwind CSS
- TypeScript

## Links

- [LiveAvatar](https://liveavatar.com) - Real-time AI avatar platform
- [Get API Key](https://app.liveavatar.com/developers) - Free LiveAvatar API key
- [HeyGen](https://heygen.com) - AI video generation platform

## License

MIT
