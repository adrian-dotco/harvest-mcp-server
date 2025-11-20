# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Timer tracking functionality** - Five new MCP tools for managing running timers:
  - `start_timer` - Start a running timer with explicit `project_id` and `task_id` parameters
  - `stop_timer` - Stop the currently running timer and create a time entry
  - `get_running_timer` - View details of currently running timer with elapsed time
  - `restart_timer` - Restart the most recent timer or a specific timer
  - `delete_timer` - Cancel a running timer without creating a time entry
- User-specific `list_tasks` endpoint - Uses `/users/me/project_assignments` for better permission handling
- Improved timezone support with proper date handling using `toLocaleDateString('sv-SE', { timeZone })`
- Automatic collision detection (prevents starting multiple timers)
- Elapsed time calculation for running timers
- Comprehensive error handling for timer edge cases

### Changed
- Updated README.md with timer usage examples and comprehensive documentation
- Enhanced server description to highlight timer capabilities
- Improved error messages to guide users to use `list_projects` and `list_tasks`

### Technical Details
- Added `TimerEntry` TypeScript interface for type safety
- Implemented five private timer management methods
- Leveraged Harvest API v2 timer endpoints (start, stop, restart, delete)
- Improved timezone handling across `startTimerForEntry()`, `parseTimeEntry()`, and `parseDateRange()`
- All timer operations follow Harvest API requirements for required parameters

---
**Note**: This PR includes AI-generated features and improvements. Please review carefully before merging.

## [0.1.2] - Previous Release
- Natural language time entry logging
- Leave request handling
- Time report generation
- Project and task management
