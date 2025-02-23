# Harvest Natural Language Time Entry MCP Server

An MCP server that lets you log Harvest time entries using natural language, including special handling for leave requests. This server makes time tracking more intuitive by understanding natural language inputs and automatically handling common scenarios like leave requests.

## Features

- 🗣️ Natural language time entry parsing
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

1. Install the [Claude desktop app](https://claude.ai/desktop)

2. Install the Harvest MCP server globally:
```bash
npm install -g @harvest-mcp/server
```

3. Run the setup command:
```bash
harvest-mcp-server setup
```

4. Follow the prompts to enter your:
   - Harvest Personal Access Token (from https://id.getharvest.com/developers)
   - Harvest Account ID
   - Standard work day hours (default: 7.5)
   - Timezone (default: Australia/Perth)

5. Restart Claude desktop app

That's it! You can now use natural language time tracking in Claude.

### Staying Updated

To update to the latest version:
```bash
npm update -g @harvest-mcp/server
```

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
