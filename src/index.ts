#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as chrono from 'chrono-node';

// Time report response types
interface TimeReportResult {
  client_id?: number;
  client_name?: string;
  project_id?: number;
  project_name?: string;
  task_id?: number;
  task_name?: string;
  user_id?: number;
  user_name?: string;
  weekly_capacity?: number;
  avatar_url?: string;
  is_contractor?: boolean;
  total_hours: number;
  billable_hours: number;
  currency: string;
  billable_amount: number;
}

interface TimeReportResponse {
  results: TimeReportResult[];
  per_page: number;
  total_pages: number;
  total_entries: number;
  next_page: number | null;
  previous_page: number | null;
  page: number;
}

// Timer response types
interface TimerEntry {
  id: number;
  spent_date: string;
  hours?: number;
  notes: string;
  is_running: boolean;
  is_locked: boolean;
  is_closed: boolean;
  is_billed: boolean;
  timer_started_at: string | null;
  started_time: string | null;
  ended_time: string | null;
  project: {
    id: number;
    name: string;
    code: string;
  };
  task: {
    id: number;
    name: string;
  };
  user: {
    id: number;
    name: string;
  };
  client: {
    id: number;
    name: string;
  };
}

const HARVEST_ACCESS_TOKEN = process.env.HARVEST_ACCESS_TOKEN;
const HARVEST_ACCOUNT_ID = process.env.HARVEST_ACCOUNT_ID;
const STANDARD_WORK_DAY_HOURS = parseFloat(process.env.STANDARD_WORK_DAY_HOURS || '7.5');
const TIMEZONE = process.env.TIMEZONE || 'Australia/Perth';

if (!HARVEST_ACCESS_TOKEN || !HARVEST_ACCOUNT_ID) {
  throw new Error('HARVEST_ACCESS_TOKEN and HARVEST_ACCOUNT_ID environment variables are required');
}

// Special patterns for leave requests
const LEAVE_PATTERNS = {
  sick: {
    triggers: ['sick', 'ill', 'unwell'],
    project: '[LV] Leave',
    task: "Person (Sick/Carer's) Leave",
  },
  annual: {
    triggers: ['annual leave', 'vacation', 'holiday', 'time off'],
    project: '[LV] Leave',
    task: 'Annual Leave',
  }
};

class HarvestServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'harvest-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: 'https://api.harvestapp.com/v2',
      headers: {
        'Authorization': `Bearer ${HARVEST_ACCESS_TOKEN}`,
        'Harvest-Account-Id': HARVEST_ACCOUNT_ID,
        'User-Agent': 'Harvest MCP Server (cline@example.com)',
      },
    });

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private isLeaveRequest(text: string): { isLeave: boolean; type?: keyof typeof LEAVE_PATTERNS } {
    const lowercaseText = text.toLowerCase();
    for (const [type, pattern] of Object.entries(LEAVE_PATTERNS)) {
      if (pattern.triggers.some(trigger => lowercaseText.includes(trigger))) {
        return { isLeave: true, type: type as keyof typeof LEAVE_PATTERNS };
      }
    }
    return { isLeave: false };
  }

  private parseDateRange(text: string): { from: string; to: string } {
    const lowercaseText = text.toLowerCase();

    // Helper to get date in YYYY-MM-DD format for the configured timezone
    const getDateString = (date: Date): string => {
      return date.toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
    };

    const now = new Date();
    
    // Handle common time ranges
    if (lowercaseText.includes('last month')) {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        from: getDateString(from),
        to: getDateString(to)
      };
    }

    if (lowercaseText.includes('this month')) {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = now;
      return {
        from: getDateString(from),
        to: getDateString(to)
      };
    }

    if (lowercaseText.includes('this week')) {
      const from = new Date(now);
      from.setDate(now.getDate() - now.getDay());
      return {
        from: getDateString(from),
        to: getDateString(now)
      };
    }

    if (lowercaseText.includes('last week')) {
      const from = new Date(now);
      from.setDate(now.getDate() - now.getDay() - 7);
      const to = new Date(from);
      to.setDate(from.getDate() + 6);
      return {
        from: getDateString(from),
        to: getDateString(to)
      };
    }

    // Default to parsing with chrono
    const dates = chrono.parse(text);
    if (dates.length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'Could not parse date range from input');
    }

    return {
      from: getDateString(dates[0].start.date()),
      to: getDateString(dates[0].end?.date() || dates[0].start.date())
    };
  }

  private async parseTimeEntry(text: string) {
    const lowercaseText = text.toLowerCase();
    const now = new Date();

    // Helper to get date in YYYY-MM-DD format for the configured timezone
    const getDateString = (date: Date): string => {
      return date.toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
    };

    // Check if this is a leave request
    const leaveCheck = this.isLeaveRequest(text);
    if (leaveCheck.isLeave && leaveCheck.type) {
      // For leave requests, use the full work day
      return {
        spent_date: getDateString(now),
        hours: STANDARD_WORK_DAY_HOURS,
        isLeave: true,
        leaveType: leaveCheck.type
      };
    }

    // For regular time entries
    let date: Date;
    if (lowercaseText.includes('today')) {
      date = now;
    } else {
      const parsed = chrono.parseDate(text);
      if (!parsed) {
        throw new McpError(ErrorCode.InvalidParams, 'Could not parse date from input');
      }
      date = parsed;
    }

    // Extract hours/minutes
    const durationMatch = text.match(/(\d+)\s*(hour|hr|h|minute|min|m)s?/i);
    if (!durationMatch) {
      throw new McpError(ErrorCode.InvalidParams, 'Could not parse duration from input');
    }

    const amount = parseInt(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    const hours = unit.startsWith('h') ? amount : amount / 60;

    return {
      spent_date: getDateString(date),
      hours,
      isLeave: false
    };
  }

  private async findProject(text: string, isLeave: boolean = false, leaveType?: keyof typeof LEAVE_PATTERNS): Promise<number> {
    // Get only projects assigned to the authenticated user
    const response = await this.axiosInstance.get('/users/me/project_assignments', {
      params: {
        is_active: true
      }
    });
    
    const projectAssignments = response.data.project_assignments;
    
    if (isLeave && leaveType) {
      // For leave requests, look for the specific leave project
      const leaveProject = projectAssignments.find((pa: any) => 
        pa.project.name === LEAVE_PATTERNS[leaveType].project
      );
      if (leaveProject) {
        return leaveProject.project.id;
      }
    }
    
    // For regular entries or if leave project not found
    // Match project name case-insensitively
    const projectMatch = projectAssignments.find((pa: any) => 
      text.toLowerCase().includes(pa.project.name.toLowerCase())
    );

    if (!projectMatch) {
      // Provide helpful error with available project names
      const availableProjects = projectAssignments
        .map((pa: any) => pa.project.name)
        .slice(0, 5)  // Show first 5 projects
        .join(', ');
      
      throw new McpError(
        ErrorCode.InvalidParams, 
        `Could not find matching project in your assignments. Input: "${text}". Available projects (first 5): ${availableProjects}. Try "List my projects" to see all.`
      );
    }

    return projectMatch.project.id;
  }


  private async findTask(projectId: number, text: string, isLeave: boolean = false, leaveType?: keyof typeof LEAVE_PATTERNS): Promise<number> {
    const response = await this.axiosInstance.get(`/projects/${projectId}/task_assignments`);
    const tasks = response.data.task_assignments;

    if (isLeave && leaveType) {
      // For leave requests, look for the specific leave task
      const leaveTask = tasks.find((t: { task: { name: string; id: number } }) => 
        t.task.name === LEAVE_PATTERNS[leaveType].task
      );
      if (leaveTask) {
        return leaveTask.task.id;
      }
    }

    // For regular entries or if leave task not found
    const taskMatch = tasks.find((t: { task: { name: string; id: number } }) => 
      text.toLowerCase().includes(t.task.name.toLowerCase())
    );

    if (!taskMatch) {
      // Default to first task if no match found
      return tasks[0].task.id;
    }

    return taskMatch.task.id;
  }

  /**
   * Get the currently running timer for the authenticated user
   * @returns The running timer entry or null if no timer is running
   */
  private async getRunningTimer(): Promise<TimerEntry | null> {
    try {
      // Harvest API returns running timers with is_running=true
      const response = await this.axiosInstance.get<{ time_entries: TimerEntry[] }>('/time_entries', {
        params: {
          is_running: true
        }
      });
      
      const runningTimers = response.data.time_entries;
      if (runningTimers.length === 0) {
        return null;
      }
      
      // Should only be one running timer per user in Harvest
      return runningTimers[0];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to get running timer: ${error.response?.data?.message ?? error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Start a running timer
   * @param projectId The project ID
   * @param taskId The task ID
   * @param notes Optional notes for the timer
   * @returns The created timer entry
   */
  private async startTimerForEntry(projectId: number, taskId: number, notes: string): Promise<TimerEntry> {
    try {
      // Check if a timer is already running
      const runningTimer = await this.getRunningTimer();
      if (runningTimer) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `A timer is already running (ID: ${runningTimer.id}). Please stop it before starting a new timer.`
        );
      }

      // Get current date in the configured timezone (YYYY-MM-DD format)
      const spent_date = new Date().toLocaleDateString('sv-SE', { timeZone: TIMEZONE });

      // Create timer by not specifying hours (Harvest interprets this as starting a timer)
      const response = await this.axiosInstance.post<TimerEntry>('/time_entries', {
        project_id: projectId,
        task_id: taskId,
        spent_date: spent_date,
        notes: notes
        // Note: NOT including 'hours' parameter starts a timer
      });

      return response.data;
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        const errorDetails = error.response?.data?.error_description || 
                           error.response?.data?.error || 
                           error.response?.data?.message || 
                           error.message;
        const statusCode = error.response?.status || 'unknown';
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to start timer (HTTP ${statusCode}): ${errorDetails}`
        );
      }
      throw error;
    }
  }

  /**
   * Stop a running timer
   * @param timerId Optional timer ID. If not provided, stops the currently running timer
   * @returns The completed time entry
   */
  private async stopTimerById(timerId?: number): Promise<TimerEntry> {
    try {
      let timerToStop = timerId;
      
      if (!timerToStop) {
        const runningTimer = await this.getRunningTimer();
        if (!runningTimer) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'No timer is currently running'
          );
        }
        timerToStop = runningTimer.id;
      }

      // Stop the timer using the PATCH endpoint
      const response = await this.axiosInstance.patch<TimerEntry>(
        `/time_entries/${timerToStop}/stop`
      );

      return response.data;
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to stop timer: ${error.response?.data?.message ?? error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Restart a timer (creates a new timer with the same project/task)
   * @param timerId Optional timer ID. If not provided, restarts the most recent timer
   * @returns The new running timer entry
   */
  private async restartTimerById(timerId?: number): Promise<TimerEntry> {
    try {
      // Check if a timer is already running
      const runningTimer = await this.getRunningTimer();
      if (runningTimer) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `A timer is already running (ID: ${runningTimer.id}). Please stop it before restarting another timer.`
        );
      }

      if (timerId) {
        // Restart specific timer using Harvest API
        const response = await this.axiosInstance.patch<TimerEntry>(
          `/time_entries/${timerId}/restart`
        );
        return response.data;
      } else {
        // Get most recent time entry and restart it
        const response = await this.axiosInstance.get<{ time_entries: TimerEntry[] }>('/time_entries', {
          params: {
            per_page: 1
          }
        });
        
        if (response.data.time_entries.length === 0) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'No previous time entries found to restart'
          );
        }
        
        const mostRecentEntry = response.data.time_entries[0];
        const restartResponse = await this.axiosInstance.patch<TimerEntry>(
          `/time_entries/${mostRecentEntry.id}/restart`
        );
        return restartResponse.data;
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to restart timer: ${error.response?.data?.message ?? error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Delete a running timer without creating a time entry
   * @param timerId Optional timer ID. If not provided, deletes the currently running timer
   * @returns Confirmation message
   */
  private async deleteTimerById(timerId?: number): Promise<string> {
    try {
      let timerToDelete = timerId;
      
      if (!timerToDelete) {
        const runningTimer = await this.getRunningTimer();
        if (!runningTimer) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'No timer is currently running'
          );
        }
        timerToDelete = runningTimer.id;
      }

      await this.axiosInstance.delete(`/time_entries/${timerToDelete}`);
      return `Timer ${timerToDelete} deleted successfully`;
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to delete timer: ${error.response?.data?.message ?? error.message}`
        );
      }
      throw error;
    }
  }


  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'log_time',
          description: 'Log time entry using natural language',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Natural language time entry (e.g. "2 hours on Project X doing development work yesterday")',
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'list_projects',
          description: 'List available Harvest projects',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'list_tasks',
          description: 'List available tasks for a project',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'number',
                description: 'Project ID',
              },
            },
            required: ['project_id'],
          },
        },
        {
          name: 'list_entries',
          description: 'List recent time entries',
          inputSchema: {
            type: 'object',
            properties: {
              from: {
                type: 'string',
                description: 'Start date (YYYY-MM-DD)',
              },
              to: {
                type: 'string',
                description: 'End date (YYYY-MM-DD)',
              },
            },
          },
        },
        {
          name: 'get_time_report',
          description: 'Get time reports using natural language',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Natural language query (e.g., "Show time report for last month", "Get time summary for Project X")',
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'start_timer',
          description: 'Start a running timer for a specific project and task',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'number',
                description: 'The ID of the project to track time for',
              },
              task_id: {
                type: 'number',
                description: 'The ID of the task to track time for',
              },
              notes: {
                type: 'string',
                description: 'Optional notes for the timer',
              },
            },
            required: ['project_id', 'task_id'],
          },
        },
        {
          name: 'stop_timer',
          description: 'Stop the currently running timer',
          inputSchema: {
            type: 'object',
            properties: {
              timer_id: {
                type: 'number',
                description: 'Optional timer ID to stop (uses current if not provided)',
              },
            },
          },
        },
        {
          name: 'get_running_timer',
          description: 'Get details of currently running timer',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'restart_timer',
          description: 'Restart a previous timer',
          inputSchema: {
            type: 'object',
            properties: {
              timer_id: {
                type: 'number',
                description: 'Optional timer ID to restart (uses most recent if not provided)',
              },
            },
          },
        },
        {
          name: 'delete_timer',
          description: 'Delete a running timer without creating a time entry',
          inputSchema: {
            type: 'object',
            properties: {
              timer_id: {
                type: 'number',
                description: 'Optional timer ID to delete (uses current if not provided)',
              },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'log_time': {
          const { text } = request.params.arguments as { text: string };
          
          try {
            // Parse time entry details
            const { spent_date, hours, isLeave, leaveType } = await this.parseTimeEntry(text);
            
            // Find matching project
            const project_id = await this.findProject(text, isLeave, leaveType);
            
            // Find matching task
            const task_id = await this.findTask(project_id, text, isLeave, leaveType);
            
            // Create time entry
            const response = await this.axiosInstance.post('/time_entries', {
              project_id,
              task_id,
              spent_date,
              hours,
              notes: text,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error) {
            if (error instanceof McpError) {
              throw error;
            }
            if (axios.isAxiosError(error)) {
              throw new McpError(
                ErrorCode.InternalError,
                `Harvest API error: ${error.response?.data?.message ?? error.message}`
              );
            }
            throw error;
          }
        }

        case 'list_projects': {
          // Get only active project assignments for the authenticated user
          // This returns projects the user can actually track time on
          const response = await this.axiosInstance.get('/users/me/project_assignments', {
            params: {
              is_active: true  // Only active project assignments
            }
          });
          
          // Map to a simpler format showing projects and available tasks
          const projects = response.data.project_assignments.map((pa: any) => ({
            project_id: pa.project.id,
            project_name: pa.project.name,
            project_code: pa.project.code,
            client_name: pa.client.name,
            is_active: pa.is_active,
            is_project_manager: pa.is_project_manager,
            task_count: pa.task_assignments.length
          }));
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(projects, null, 2),
              },
            ],
          };
        }



        case 'list_tasks': {
          const { project_id } = request.params.arguments as { project_id: number };

          // Use the user-specific endpoint to avoid permission issues
          const response = await this.axiosInstance.get('/users/me/project_assignments', {
            params: {
              is_active: true
            }
          });

          // Find the project assignment for the requested project
          const projectAssignment = response.data.project_assignments.find(
            (pa: any) => pa.project.id === project_id
          );

          if (!projectAssignment) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Project ${project_id} not found in your assignments. Use list_projects to see available projects.`
            );
          }

          // Extract and return the task assignments for this project
          const tasks = projectAssignment.task_assignments.map((t: { task: { id: number; name: string }; is_active: boolean; billable: boolean }) => ({
            id: t.task.id,
            name: t.task.name,
            is_active: t.is_active,
            billable: t.billable
          }));

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(tasks, null, 2),
              },
            ],
          };
        }

        case 'list_entries': {
          const { from, to } = request.params.arguments as { from?: string; to?: string };
          const params: Record<string, string> = {};
          if (from) params.from = from;
          if (to) params.to = to;
          
          const response = await this.axiosInstance.get('/time_entries', { params });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data.time_entries.map((e: { id: number; spent_date: string; hours: number; notes: string; project: { name: string }; task: { name: string } }) => ({
                  id: e.id,
                  spent_date: e.spent_date,
                  hours: e.hours,
                  notes: e.notes,
                  project: e.project.name,
                  task: e.task.name,
                })), null, 2),
              },
            ],
          };
        }

        case 'get_time_report': {
          const { text } = request.params.arguments as { text: string };
          
          try {
            const { from, to } = this.parseDateRange(text);
            const lowercaseText = text.toLowerCase();
            
            let endpoint = '/reports/time/projects'; // default to project report
            
            if (lowercaseText.includes('by client') || lowercaseText.includes('for client')) {
              endpoint = '/reports/time/clients';
            } else if (lowercaseText.includes('by task') || lowercaseText.includes('tasks')) {
              endpoint = '/reports/time/tasks';
            } else if (lowercaseText.includes('by team') || lowercaseText.includes('by user')) {
              endpoint = '/reports/time/team';
            }
            
            const response = await this.axiosInstance.get<TimeReportResponse>(endpoint, {
              params: { from, to }
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error) {
            if (error instanceof McpError) {
              throw error;
            }
            if (axios.isAxiosError(error)) {
              throw new McpError(
                ErrorCode.InternalError,
                `Harvest API error: ${error.response?.data?.message ?? error.message}`
              );
            }
            throw error;
          }
        }

        case 'start_timer': {
          const { project_id, task_id, notes } = request.params.arguments as {
            project_id: number;
            task_id: number;
            notes?: string
          };

          try {
            // Start the timer with explicit project_id and task_id
            const timer = await this.startTimerForEntry(project_id, task_id, notes || '');

            // Calculate a friendly response
            const response = {
              id: timer.id,
              project: timer.project.name,
              task: timer.task.name,
              notes: timer.notes,
              started_at: timer.timer_started_at,
              is_running: timer.is_running,
              message: `Timer started for ${timer.project.name} - ${timer.task.name}`
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          } catch (error) {
            if (error instanceof McpError) {
              throw error;
            }
            if (axios.isAxiosError(error)) {
              // Enhanced error message with details about what we tried
              const errorDetails = error.response?.data?.error_description ||
                                 error.response?.data?.error ||
                                 error.response?.data?.message ||
                                 error.message;
              const statusCode = error.response?.status || 'unknown';

              throw new McpError(
                ErrorCode.InternalError,
                `Failed to start timer (HTTP ${statusCode}): ${errorDetails}. Use list_projects and list_tasks to find valid project_id and task_id values.`
              );
            }
            throw error;
          }
        }


        case 'stop_timer': {
          const { timer_id } = request.params.arguments as { timer_id?: number };
          
          try {
            const timeEntry = await this.stopTimerById(timer_id);
            
            // Calculate elapsed time for display
            const response = {
              id: timeEntry.id,
              project: timeEntry.project.name,
              task: timeEntry.task.name,
              hours: timeEntry.hours,
              notes: timeEntry.notes,
              spent_date: timeEntry.spent_date,
              message: `Timer stopped. Logged ${timeEntry.hours} hours to ${timeEntry.project.name} - ${timeEntry.task.name}`
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          } catch (error) {
            if (error instanceof McpError) {
              throw error;
            }
            if (axios.isAxiosError(error)) {
              throw new McpError(
                ErrorCode.InternalError,
                `Harvest API error: ${error.response?.data?.message ?? error.message}`
              );
            }
            throw error;
          }
        }

        case 'get_running_timer': {
          try {
            const timer = await this.getRunningTimer();
            
            if (!timer) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      is_running: false,
                      message: 'No timer is currently running'
                    }, null, 2),
                  },
                ],
              };
            }

            // Calculate elapsed time
            let elapsedHours = 0;
            if (timer.timer_started_at) {
              const startTime = new Date(timer.timer_started_at);
              const now = new Date();
              const elapsedMs = now.getTime() - startTime.getTime();
              elapsedHours = Math.round((elapsedMs / (1000 * 60 * 60)) * 100) / 100;
            }

            const response = {
              id: timer.id,
              project: timer.project.name,
              task: timer.task.name,
              notes: timer.notes,
              started_at: timer.timer_started_at,
              elapsed_hours: elapsedHours,
              is_running: timer.is_running,
              message: `Timer running for ${timer.project.name} - ${timer.task.name} (${elapsedHours} hours elapsed)`
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          } catch (error) {
            if (error instanceof McpError) {
              throw error;
            }
            if (axios.isAxiosError(error)) {
              throw new McpError(
                ErrorCode.InternalError,
                `Harvest API error: ${error.response?.data?.message ?? error.message}`
              );
            }
            throw error;
          }
        }

        case 'restart_timer': {
          const { timer_id } = request.params.arguments as { timer_id?: number };
          
          try {
            const timer = await this.restartTimerById(timer_id);
            
            const response = {
              id: timer.id,
              project: timer.project.name,
              task: timer.task.name,
              notes: timer.notes,
              started_at: timer.timer_started_at,
              is_running: timer.is_running,
              message: `Timer restarted for ${timer.project.name} - ${timer.task.name}`
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          } catch (error) {
            if (error instanceof McpError) {
              throw error;
            }
            if (axios.isAxiosError(error)) {
              throw new McpError(
                ErrorCode.InternalError,
                `Harvest API error: ${error.response?.data?.message ?? error.message}`
              );
            }
            throw error;
          }
        }

        case 'delete_timer': {
          const { timer_id } = request.params.arguments as { timer_id?: number };
          
          try {
            const message = await this.deleteTimerById(timer_id);
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: message
                  }, null, 2),
                },
              ],
            };
          } catch (error) {
            if (error instanceof McpError) {
              throw error;
            }
            if (axios.isAxiosError(error)) {
              throw new McpError(
                ErrorCode.InternalError,
                `Harvest API error: ${error.response?.data?.message ?? error.message}`
              );
            }
            throw error;
          }
        }


        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Harvest MCP server running on stdio');
  }
}

const server = new HarvestServer();
server.run().catch(console.error);
