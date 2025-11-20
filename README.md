# Harvest Natural Language Time Entry MCP Server

An MCP server that lets you log Harvest time entries and track time with running timers using natural language. This server makes time tracking more intuitive by understanding natural language inputs, supporting real-time timer tracking, and automatically handling common scenarios like leave requests.

<a href="https://glama.ai/mcp/servers/u2bir05hxy">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/u2bir05hxy/badge" alt="Harvest Natural Language Time Entry Server MCP server" />
</a>

## Features

- 🗣️ Natural language time entry parsing
- ⏱️ **Running timer support** (start, stop, view, restart, delete)
- 🏖️ Special leave request handling (e.g., "I'm off sick today")
- ⏰ Configurable work day hours
- 🌍 Timezone support
- 🎯 Automatic project and task matching
- 📅 Smart date parsing (today, yesterday, etc.)

## Prerequisites

- Node.js installed
- A Harvest account
- Personal access token from [Harvest Developer Tools](https://id.getharvest.com/developers)
- Account ID (shown on the same page as your token)

## Installation

### Installation

1. Install the [Claude desktop app](https://claude.ai/desktop)

2. Clone this repository:
```bash
git clone https://github.com/adrian-dotco/harvest-mcp-server.git
cd harvest-mcp-server
```

3. Install dependencies and build:
```bash
npm install
npm run build
```

4. Run the setup script:
```bash
node build/setup.js
```

5. Follow the prompts to enter your:
   - Harvest Personal Access Token (from https://id.getharvest.com/developers)
   - Harvest Account ID
   - Standard work day hours (default: 7.5)
   - Timezone (default: Australia/Perth)

6. Restart Claude desktop app

That's it! You can now use natural language time tracking in Claude.

### Staying Updated

To update to the latest version:
```bash
git pull
npm install
npm run build
```

The setup script will have configured Claude to use your local build of the server, so any updates you pull will be automatically available after rebuilding.

## Usage

The server provides several tools for interacting with Harvest:

### log_time
Log time entries using natural language. Examples:

Regular time entries:
```
"2 hours on Project X doing development work today"
"45 minutes on Project Y testing yesterday"
"3.5 hours on Project Z meetings last Friday"
```

Leave requests (automatically uses standard work day hours):
```
"I'm off sick today"
"I'm unwell today"
"Taking annual leave next week"
```

### Timer Tools

Track time in real-time with running timers:

#### start_timer
Start a running timer using natural language:
```
"Start timer for Project X doing development"
"Start working on Project Y bug fixes"
"Begin timer for Client ABC - Design work"
```

The timer will continue running until you stop it, tracking elapsed time automatically.

#### get_running_timer
Check your currently running timer:
```
"What timer is running?"
"Show my current timer"
"Check running timer"
```

Returns the project, task, notes, and elapsed time for the running timer.

#### stop_timer
Stop the currently running timer:
```
"Stop timer"
"Stop my current timer"
"End timer"
```

This converts the running timer to a completed time entry with the total hours tracked.

#### restart_timer
Restart your most recent timer or a specific timer:
```
"Restart my last timer"
"Restart timer"
"Resume previous timer"
```

This starts a new timer with the same project and task as before.

#### delete_timer
Cancel a running timer without saving it:
```
"Cancel current timer"
"Delete running timer"
"Remove timer"
```

This deletes the timer without creating a time entry.

### get_time_report
Get time reports using natural language queries. Examples:

1. Time Period Options:
```
"Show time report for last month"
"Get time summary for this week"
"Show hours from January 1st to January 31st"
"Report time for Q1"
"Show me yesterday's hours"
```

2. Report Types:
- By Project (default):
  ```
  "Show time report for last month"
  "Get project hours for this week"
  ```
- By Client:
  ```
  "Show time report by client for this month"
  "Get hours by client for Q1"
  ```
- By Task:
  ```
  "Show time summary by task for January"
  "Get task breakdown for last week"
  ```
- By Team Member:
  ```
  "Show team hours for last week"
  "Get time report by user for this month"
  ```

3. Report Details:
Each report includes:
- Total hours worked
- Billable vs non-billable hours
- Billable amounts (if you have permission)
- Project/client/task/user details based on report type

### list_projects
List all available Harvest projects:
```
List my projects
```

### list_tasks
List available tasks for a specific project:
```
Show tasks for Project X
```

### list_entries
View recent time entries:
```
Show my recent time entries
```

## Configuration

The server supports these environment variables:

- `HARVEST_ACCESS_TOKEN`: Your Harvest personal access token
- `HARVEST_ACCOUNT_ID`: Your Harvest account ID
- `STANDARD_WORK_DAY_HOURS`: Default hours for a full work day (default: 7.5)
- `TIMEZONE`: Your timezone (default: Australia/Perth)

## Development

The server is built using:
- TypeScript
- MCP SDK
- chrono-node for natural language date parsing
- Harvest API v2

To contribute:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details