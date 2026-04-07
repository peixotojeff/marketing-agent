import React, { useState, useEffect } from 'react';
import { taskAPI, memberAPI } from '../api';

const PRIORITY_LABELS = { 1: 'Urgente', 2: 'Alta', 3: 'Normal', 4: 'Baixa', 0: 'N/A' };
const PRIORITY_BADGE = { 1: 'badge-red', 2: 'badge-yellow', 3: 'badge-blue', 4: 'badge-gray', 0: 'badge-gray' };

export default function TaskList() {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [assignModal, setAssignModal] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksRes, membersRes] = await Promise.all([
        taskAPI.getAll(),
        memberAPI.getAll()
      ]);
      setTasks(tasksRes.data);
      setMembers(membersRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleDistribute = async (taskId) => {
    try {
      const result = await taskAPI.distribute(taskId);
      alert(result.data.success ? `Atribuída para ${result.data.memberName}` : `Erro: ${result.data.error}`);
      loadData();
    } catch (err) {
      alert('Erro: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleManualAssign = async (taskId, memberId) => {
    try {
      await taskAPI.assign(taskId, memberId);
      setAssignModal(null);
      loadData();
    } catch (err) {
      alert('Erro: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDistributeAll = async () => {
    try {
      const result = await taskAPI.distributeAll();
      alert(`Distribuição completa! ${result.data.assigned} atribuídas, ${result.data.failed} falharam.`);
      loadData();
    } catch (err) {
      alert('Erro: ' + (err.response?.data?.error || err.message));
    }
  };

  let filtered = tasks;
  if (filter === 'unassigned') filtered = filtered.filter(t => !t.assigned_to);
  else if (filter === 'assigned') filtered = filtered.filter(t => t.assigned_to);
  else if (filter === 'overdue') filtered = filtered.filter(t => t.sla_status === 'violated');

  if (deptFilter !== 'all') filtered = filtered.filter(t => t.department === deptFilter);

  const departments = [...new Set(tasks.map(t => t.department).filter(Boolean))];

  if (loading) return <div className="loading">Carregando tarefas...</div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 24 }}>
        <h1>Tarefas</h1>
        <button onClick={handleDistributeAll}>🤖 Distribuir Não Atribuídas</button>
      </div>

      <div className="flex-between gap-8" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={filter === 'all' ? '' : 'secondary'} onClick={() => setFilter('all')}>Todas</button>
          <button className={filter === 'unassigned' ? '' : 'secondary'} onClick={() => setFilter('unassigned')}>Não Atribuídas</button>
          <button className={filter === 'assigned' ? '' : 'secondary'} onClick={() => setFilter('assigned')}>Atribuídas</button>
          <button className={filter === 'overdue' ? '' : 'secondary'} onClick={() => setFilter('overdue')}>Atrasadas</button>
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="all">Todos Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="section">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Prioridade</th>
              <th>Departamento</th>
              <th>Status</th>
              <th>Atribuído a</th>
              <th>Due Date</th>
              <th>SLA</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(task => (
              <tr key={task.id}>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#f1f5f9' }}>
                  {task.name}
                </td>
                <td><span className={`badge ${PRIORITY_BADGE[task.priority] || 'badge-gray'}`}>{PRIORITY_LABELS[task.priority] || 'N/A'}</span></td>
                <td><span className="badge badge-purple">{task.department || '—'}</span></td>
                <td>{task.status}</td>
                <td>{task.assignee_name || <span className="badge badge-yellow">Não atribuída</span>}</td>
                <td>{task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                  {task.sla_status === 'violated' ? <span className="badge badge-red">Violado</span> :
                   task.sla_status === 'reassigned' ? <span className="badge badge-yellow">Reatribuída</span> :
                   <span className="badge badge-green">OK</span>}
                </td>
                <td style={{ display: 'flex', gap: 4 }}>
                  {!task.assigned_to && (
                    <>
                      <button onClick={() => handleDistribute(task.id)} style={{ fontSize: 11, padding: '4px 8px' }}>Auto</button>
                      <button className="secondary" onClick={() => setAssignModal(task)} style={{ fontSize: 11, padding: '4px 8px' }}>Manual</button>
                    </>
                  )}
                  {task.assigned_to && (
                    <button className="secondary" onClick={() => setAssignModal(task)} style={{ fontSize: 11, padding: '4px 8px' }}>Reatribuir</button>
                  )}
                  {task.url && (
                    <a href={task.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, padding: '4px 8px', color: '#a78bfa', textDecoration: 'none' }}>
                      ClickUp
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>Nenhuma tarefa encontrada</p>}
      </div>

      {/* Assign Modal */}
      {assignModal && (
        <AssignModal
          task={assignModal}
          members={members}
          onAssign={handleManualAssign}
          onClose={() => setAssignModal(null)}
        />
      )}
    </div>
  );
}

function AssignModal({ task, members, onAssign, onClose }) {
  const [selected, setSelected] = useState('');

  const dept = task.department;
  const deptMembers = members.filter(m => m.department === dept);
  const otherMembers = members.filter(m => m.department !== dept);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Atribuir: {task.name}</h3>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
          Departamento: {task.department || 'N/A'} — Prioridade: {PRIORITY_LABELS[task.priority] || 'N/A'}
        </p>

        {deptMembers.length > 0 && (
          <>
            <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>
              Membros do departamento ({dept}):
            </label>
            <select value={selected} onChange={e => setSelected(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
              <option value="">Selecione...</option>
              {deptMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.active_tasks}/{m.max_capacity} tarefas)</option>
              ))}
            </select>
          </>
        )}

        <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>
          Todos os membros:
        </label>
        <select value={selected} onChange={e => setSelected(e.target.value)} style={{ width: '100%', marginBottom: 16 }}>
          <option value="">Selecione...</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name} — {m.department} ({m.active_tasks}/{m.max_capacity})</option>
          ))}
        </select>

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button disabled={!selected} onClick={() => onAssign(task.id, selected)}>Atribuir</button>
        </div>
      </div>
    </div>
  );
}
