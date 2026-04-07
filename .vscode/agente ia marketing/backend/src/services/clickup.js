const axios = require('axios');
const db = require('../db');

const CLICKUP_API = 'https://api.clickup.com/api/v2';
const API_KEY = process.env.CLICKUP_API_KEY;
const TEAM_ID = process.env.CLICKUP_TEAM_ID;

const clickUpClient = axios.create({
  baseURL: CLICKUP_API,
  headers: {
    'Authorization': API_KEY,
    'Content-Type': 'application/json'
  }
});

async function syncMembers() {
  try {
    if (!TEAM_ID) {
      console.log('No TEAM_ID configured, skipping member sync');
      return;
    }

    const response = await clickUpClient.get(`/team/${TEAM_ID}/group`);
    const members = response.data.groups || [];

    for (const group of members) {
      // Each group can represent a team/department
      const inGroupMembers = group.members || group.team?.members || [];

      for (const member of inGroupMembers) {
        await db.run(
          `INSERT OR REPLACE INTO members (id, name, email, department, specialty, max_capacity, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [
            member.id.toString(),
            member.username,
            member.email || '',
            group.name || 'unassigned',
            '', // specialty will be set manually
            process.env.MAX_TASKS_PER_MEMBER || 5
          ]
        );
      }
    }

    // Also fetch all tasks and extract unique assignees
    const tasksResponse = await clickUpClient.get(`/team/${TEAM_ID}/task`, {
      params: {
        show_closed_tasks: false,
        page: 0,
        include_subtasks: true
      }
    });

    const allMembers = new Map();
    for (const task of tasksResponse.data.tasks || []) {
      if (task.assignees && task.assignees.length > 0) {
        for (const assignee of task.assignees) {
          if (!allMembers.has(assignee.id)) {
            allMembers.set(assignee.id, assignee);
          }
        }
      }
    }

    for (const [id, member] of allMembers) {
      await db.run(
        `INSERT OR IGNORE INTO members (id, name, email, department, specialty, max_capacity, is_active)
         VALUES (?, ?, ?, '', '', ?, 1)`,
        [id.toString(), member.username, member.email || '', process.env.MAX_TASKS_PER_MEMBER || 5]
      );
    }

    console.log(`Synced members from ClickUp`);
  } catch (error) {
    console.error('Error syncing members:', error.message);
  }
}

async function syncTasks() {
  try {
    if (!TEAM_ID) {
      console.log('No TEAM_ID configured, skipping task sync');
      return;
    }

    const response = await clickUpClient.get(`/team/${TEAM_ID}/task`, {
      params: {
        show_closed_tasks: false,
        page: 0,
        include_subtasks: true
      }
    });

    let synced = 0;
    for (const task of response.data.tasks || []) {
      const assignedTo = task.assignees?.[0]?.id?.toString() || null;
      const listName = task.list?.name || task.project?.name || '';

      // Extract department from list name or tags
      let department = 'general';
      if (task.tags && task.tags.length > 0) {
        const deptTag = task.tags.find(t => t.name && ['marketing', 'design', 'content', 'seo', 'social', 'ads', 'email'].includes(t.name.toLowerCase()));
        if (deptTag) department = deptTag.name.toLowerCase();
      }

      // Extract requesting area from custom fields or description
      let requestingArea = '';
      if (task.custom_fields) {
        const areaField = task.custom_fields.find(f => f.name?.toLowerCase().includes('area') || f.name?.toLowerCase().includes('solicitante'));
        if (areaField) requestingArea = areaField.value || '';
      }

      // Determine task type from tags or name
      let taskType = 'general';
      if (task.tags && task.tags.length > 0) {
        const typeTag = task.tags.find(t => t.name && ['criativo', 'copy', 'campanha', 'video', 'design'].includes(t.name.toLowerCase()));
        if (typeTag) taskType = typeTag.name.toLowerCase();
      }

      const slaDeadline = task.due_date ? calculateSLADeadline(task.due_date, task.priority) : null;

      await db.run(
        `INSERT OR REPLACE INTO tasks (
          id, clickup_id, name, description, status, priority,
          due_date, created_at, assigned_to, department,
          list_id, list_name, sla_deadline, sla_status,
          task_type, requesting_area, tags, url, sync_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          task.id.toString(),
          task.id.toString(),
          task.name,
          (task.description || '').substring(0, 500),
          task.status?.status || 'open',
          task.priority?.id || 0,
          task.due_date || null,
          task.date_created || null,
          assignedTo,
          department,
          task.list?.id?.toString() || '',
          listName,
          slaDeadline,
          'on_track',
          taskType,
          requestingArea,
          JSON.stringify(task.tags?.map(t => t.name) || []),
          task.url || ''
        ]
      );

      // Log assignment if it's a new task
      if (assignedTo) {
        const existing = await db.get(
          'SELECT id FROM task_assignments WHERE task_id = ? AND member_id = ?',
          [task.id.toString(), assignedTo]
        );
        if (!existing) {
          const workload = await getCurrentWorkload(assignedTo);
          await db.run(
            `INSERT INTO task_assignments (task_id, member_id, assigned_at, assigned_by, reason, workload_at_assignment)
             VALUES (?, ?, datetime('now'), 'clickup', 'Existing assignment from ClickUp', ?)`,
            [task.id.toString(), assignedTo, workload]
          );
        }
      }

      synced++;
    }

    console.log(`Synced ${synced} tasks from ClickUp`);
  } catch (error) {
    console.error('Error syncing tasks:', error.message);
  }
}

async function getUnassignedTasks(limit = 20) {
  return await db.query(
    `SELECT * FROM tasks
     WHERE assigned_to IS NULL AND status != 'closed' AND status != 'complete'
     ORDER BY priority DESC, created_at ASC
     LIMIT ?`,
    [limit]
  );
}

async function getCurrentWorkload(memberId) {
  const result = await db.get(
    `SELECT COUNT(*) as count FROM tasks
     WHERE assigned_to = ? AND status NOT IN ('closed', 'complete')`,
    [memberId]
  );
  return result?.count || 0;
}

async function getMemberWorkloadByDepartment(department) {
  return await db.query(
    `SELECT m.id, m.name, m.max_capacity,
            COUNT(t.id) as current_tasks,
            m.max_capacity - COUNT(t.id) as available_capacity
     FROM members m
     LEFT JOIN tasks t ON m.id = t.assigned_to
       AND t.status NOT IN ('closed', 'complete')
     WHERE m.department = ? AND m.is_active = 1
     GROUP BY m.id
     ORDER BY available_capacity DESC`,
    [department]
  );
}

async function assignTask(taskId, memberId, reason) {
  const workload = await getCurrentWorkload(memberId);
  const member = await db.get('SELECT * FROM members WHERE id = ?', [memberId]);

  if (!member) {
    return { success: false, error: 'Member not found' };
  }

  if (member.is_active !== 1) {
    return { success: false, error: 'Member is not active' };
  }

  if (workload >= member.max_capacity) {
    return { success: false, error: 'Member at max capacity', workload, maxCapacity: member.max_capacity };
  }

  // Update task assignment
  await db.run(
    `UPDATE tasks SET assigned_to = ?, sync_updated_at = datetime('now') WHERE id = ?`,
    [memberId, taskId]
  );

  // Log the assignment
  await db.run(
    `INSERT INTO task_assignments (task_id, member_id, assigned_at, assigned_by, reason, workload_at_assignment)
     VALUES (?, ?, datetime('now'), 'agent', ?, ?)`,
    [taskId, memberId, reason, workload]
  );

  // Log action
  await db.run(
    `INSERT INTO agent_logs (action, details) VALUES ('assign_task', ?)`,
    [JSON.stringify({ taskId, memberId, reason, workload })]
  );

  // Try to update in ClickUp via API
  try {
    await clickUpClient.put(`/task/${taskId}`, {
      assignees: { add: [memberId] }
    });
  } catch (error) {
    console.error('Failed to update ClickUp assignment:', error.message);
  }

  return { success: true, memberId, memberName: member.name, workload: workload + 1 };
}

async function checkOverdueTasks() {
  const overdueTasks = await db.query(
    `SELECT t.*, m.name as member_name
     FROM tasks t
     LEFT JOIN members m ON t.assigned_to = m.id
     WHERE t.assigned_to IS NOT NULL
       AND t.status NOT IN ('closed', 'complete')
       AND t.due_date IS NOT NULL
       AND datetime(t.due_date) < datetime('now')
       AND t.sla_status != 'violated'`
  );

  for (const task of overdueTasks) {
    // Mark as violated
    await db.run(
      `UPDATE tasks SET sla_status = 'violated' WHERE id = ?`,
      [task.id]
    );

    // Log violation
    await db.run(
      `INSERT INTO sla_violations (task_id, member_id, violation_type, detected_at)
       VALUES (?, ?, 'overdue', datetime('now'))`,
      [task.id, task.assigned_to]
    );

    // Attempt reassignment if workload allows
    if (task.department) {
      await attemptReassignment(task);
    }

    console.log(`SLA violation: Task "${task.name}" is overdue (assigned to ${task.member_name || 'nobody'})`);
  }

  return overdueTasks;
}

async function attemptReassignment(task) {
  if (!task.department) return null;

  const workload = await getMemberWorkloadByDepartment(task.department);
  const availableMember = workload.find(m => m.available_capacity > 0 && m.id !== task.assigned_to);

  if (availableMember) {
    await db.run(
      `UPDATE tasks SET assigned_to = ?, sla_status = 'reassigned', sync_updated_at = datetime('now') WHERE id = ?`,
      [availableMember.id, task.id]
    );

    await db.run(
      `INSERT INTO agent_logs (action, details) VALUES ('auto_reassign', ?)`,
      [JSON.stringify({
        taskId: task.id,
        from: task.assigned_to,
        to: availableMember.id,
        reason: 'SLA violation - overdue task'
      })]
    );

    return { reassignedTo: availableMember.id, memberName: availableMember.name };
  }

  return null;
}

function calculateSLADeadline(dueDate, priority) {
  const defaultSLA = parseInt(process.env.DEFAULT_SLA_HOURS) || 48;
  const slaHours = priority === 1 ? defaultSLA / 2 : priority === 2 ? defaultSLA * 0.75 : defaultSLA;

  const base = new Date(dueDate || Date.now());
  base.setHours(base.getHours() - slaHours);
  return base.toISOString();
}

async function getDashboardData() {
  const totalTasks = await db.get(
    `SELECT COUNT(*) as count FROM tasks WHERE status NOT IN ('closed', 'complete')`
  );

  const unassignedTasks = await db.get(
    `SELECT COUNT(*) as count FROM tasks WHERE assigned_to IS NULL AND status NOT IN ('closed', 'complete')`
  );

  const overdueTasks = await db.get(
    `SELECT COUNT(*) as count FROM tasks WHERE sla_status = 'violated' AND status NOT IN ('closed', 'complete')`
  );

  const tasksByDepartment = await db.query(
    `SELECT department, COUNT(*) as count
     FROM tasks WHERE status NOT IN ('closed', 'complete')
     GROUP BY department ORDER BY count DESC`
  );

  const workloadByMember = await db.query(
    `SELECT m.id, m.name, m.department,
            COUNT(CASE WHEN t.status NOT IN ('closed', 'complete') THEN 1 END) as active_tasks,
            m.max_capacity,
            COUNT(CASE WHEN t.sla_status = 'violated' THEN 1 END) as overdue_tasks
     FROM members m
     LEFT JOIN tasks t ON m.id = t.assigned_to
     WHERE m.is_active = 1
     GROUP BY m.id
     ORDER BY active_tasks DESC`
  );

  const recentLogs = await db.query(
    `SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 20`
  );

  const slaViolations = await db.query(
    `SELECT v.*, t.name as task_name, m.name as member_name
     FROM sla_violations v
     LEFT JOIN tasks t ON v.task_id = t.id
     LEFT JOIN members m ON v.member_id = m.id
     WHERE v.resolved = 0
     ORDER BY v.detected_at DESC
     LIMIT 10`
  );

  return {
    totalTasks: totalTasks?.count || 0,
    unassignedTasks: unassignedTasks?.count || 0,
    overdueTasks: overdueTasks?.count || 0,
    tasksByDepartment,
    workloadByMember,
    recentLogs,
    slaViolations
  };
}

async function getBottleneckAnalysis() {
  // Find members with consistently high workload
  const overloadedMembers = await db.query(
    `SELECT m.id, m.name, m.department, m.max_capacity,
            COUNT(t.id) as current_tasks,
            GROUP_CONCAT(DISTINCT t.status) as task_statuses
     FROM members m
     JOIN tasks t ON m.id = t.assigned_to
     WHERE t.status NOT IN ('closed', 'complete')
     GROUP BY m.id
     HAVING COUNT(t.id) >= m.max_capacity * 0.8
     ORDER BY current_tasks DESC`
  );

  // Find departments with most unassigned tasks
  const bottleneckDepartments = await db.query(
    `SELECT department,
            COUNT(CASE WHEN assigned_to IS NULL THEN 1 END) as unassigned,
            COUNT(*) as total,
            COUNT(CASE WHEN sla_status = 'violated' THEN 1 END) as overdue
     FROM tasks
     WHERE status NOT IN ('closed', 'complete')
     GROUP BY department
     HAVING unassigned > 0 OR overdue > 0
     ORDER BY unassigned DESC, overdue DESC`
  );

  // Trend of assignments over last 7 days
  const assignmentTrend = await db.query(
    `SELECT DATE(assigned_at) as day, COUNT(*) as assignments
     FROM task_assignments
     WHERE assigned_at >= datetime('now', '-7 days')
     GROUP BY day
     ORDER BY day`
  );

  return {
    overloadedMembers,
    bottleneckDepartments,
    assignmentTrend
  };
}

module.exports = {
  syncMembers,
  syncTasks,
  getUnassignedTasks,
  getCurrentWorkload,
  getMemberWorkloadByDepartment,
  assignTask,
  checkOverdueTasks,
  getDashboardData,
  getBottleneckAnalysis,
  attemptReassignment,
  clickUpClient
};
