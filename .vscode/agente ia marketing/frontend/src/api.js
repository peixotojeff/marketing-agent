import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_URL + '/api',
});

export const taskAPI = {
  getAll: (params) => api.get('/tasks', { params }),
  getUnassigned: () => api.get('/tasks/unassigned'),
  getOne: (id) => api.get(`/tasks/${id}`),
  distribute: (taskId) => api.post(`/tasks/${taskId}/distribute`),
  distributeAll: () => api.post('/tasks/distribute-all'),
  assign: (taskId, memberId) => api.post(`/tasks/${taskId}/assign`, { member_id: memberId }),
  reassign: (taskId, memberId) => api.post(`/tasks/${taskId}/reassign`, { member_id: memberId }),
};

export const memberAPI = {
  getAll: () => api.get('/members'),
  getOne: (id) => api.get(`/members/${id}`),
  getTasks: (id) => api.get(`/members/${id}/tasks`),
  update: (id, data) => api.put(`/members/${id}`, data),
  getWorkload: (department) => api.get('/members/workload/by-department', { params: { department } }),
  sync: () => api.post('/members/sync'),
};

export const dashboardAPI = {
  getOverview: () => api.get('/dashboard'),
  getBottlenecks: () => api.get('/dashboard/bottlenecks'),
  getLogs: (limit) => api.get('/dashboard/logs', { params: { limit } }),
  sync: () => api.post('/dashboard/sync'),
};

export const slaAPI = {
  getViolations: () => api.get('/sla/violations'),
  getStats: () => api.get('/sla/stats'),
  check: () => api.post('/sla/check'),
  resolve: (id) => api.put(`/sla/violations/${id}/resolve`),
};
