import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import TaskList from './components/TaskList';
import MemberList from './components/MemberList';
import SLAMonitor from './components/SLAMonitor';
import BottleneckAnalysis from './components/BottleneckAnalysis';
import { api } from './api';
import './App.css';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'tasks', label: 'Tarefas', icon: '📋' },
    { id: 'members', label: 'Equipe', icon: '👥' },
    { id: 'sla', label: 'SLA Monitor', icon: '⏱️' },
    { id: 'bottlenecks', label: 'Gargalos', icon: '🔍' },
  ];

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">
          <h2>🤖 Marketing AI Agent</h2>
        </div>
        <ul className="nav-links">
          {navItems.map(item => (
            <li
              key={item.id}
              className={currentPage === item.id ? 'active' : ''}
              onClick={() => setCurrentPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </li>
          ))}
        </ul>
      </nav>
      <main className="content">
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'tasks' && <TaskList />}
        {currentPage === 'members' && <MemberList />}
        {currentPage === 'sla' && <SLAMonitor />}
        {currentPage === 'bottlenecks' && <BottleneckAnalysis />}
      </main>
    </div>
  );
}
