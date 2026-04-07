import React, { useState, useEffect } from 'react';
import { dashboardAPI, taskAPI, api } from '../api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = async () => {
    try {
      const overview = await dashboardAPI.getOverview();
      setData(overview);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await dashboardAPI.sync();
      fetchData();
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleDistributeAll = async () => {
    try {
      const result = await taskAPI.distributeAll();
      alert(`Distribuição completa! ${result.data.assigned} tarefas atribuídas, ${result.data.failed} falharam.`);
      fetchData();
    } catch (err) {
      alert('Erro ao distribuir tarefas: ' + (err.response?.data?.error || err.message));
    }
  };

  if (loading) return <div className="loading">Carregando dashboard...</div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 24 }}>
        <h1>Dashboard</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSync} disabled={syncing} className="secondary">
            {syncing ? 'Sincronizando...' : '🔄 Sincronizar'}
          </button>
          <button onClick={handleDistributeAll}>🤖 Distribuir Todas</button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Total de Tarefas" value={data?.totalTasks || 0} color="info" />
        <StatCard label="Não Atribuídas" value={data?.unassignedTasks || 0} color="warning" />
        <StatCard label="Atrasadas (SLA)" value={data?.overdueTasks || 0} color="danger" />
        <StatCard label="Membros Ativos" value={data?.workloadByMember?.filter(m => m.active_tasks > 0).length || 0} color="success" />
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Carga por Membro</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Membro</th>
              <th>Departamento</th>
              <th>Tarefas Ativas</th>
              <th>Capacidade</th>
              <th>Atrasadas</th>
              <th>Carga</th>
            </tr>
          </thead>
          <tbody>
            {data?.workloadByMember?.map(member => {
              const pct = Math.round((member.active_tasks / member.max_capacity) * 100);
              const barColor = pct >= 80 ? 'red' : pct >= 60 ? 'yellow' : 'green';
              return (
                <tr key={member.id}>
                  <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{member.name}</td>
                  <td><span className="badge badge-purple">{member.department || 'N/A'}</span></td>
                  <td>{member.active_tasks}</td>
                  <td>{member.active_tasks}/{member.max_capacity}</td>
                  <td>{member.overdue_tasks > 0 ? <span className="badge badge-red">{member.overdue_tasks}</span> : '—'}</td>
                  <td style={{ minWidth: 100 }}>
                    <div className="progress-bar">
                      <div className={`progress-fill ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{pct}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="section">
          <h2 style={{ marginBottom: 16 }}>Tarefas por Departamento</h2>
          {data?.tasksByDepartment?.map(d => (
            <div key={d.department} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #334155' }}>
              <span className="badge badge-blue">{d.department}</span>
              <span style={{ fontWeight: 600 }}>{d.count}</span>
            </div>
          ))}
        </div>

        <div className="section">
          <h2 style={{ marginBottom: 16 }}>Violações SLA Recentes</h2>
          {data?.slaViolations?.length > 0 ? (
            data.slaViolations.map(v => (
              <div key={v.id} style={{ padding: '8px 0', borderBottom: '1px solid #334155' }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{v.task_name || 'Task'}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {v.member_name || 'Sem responsável'} — {new Date(v.detected_at).toLocaleString('pt-BR')}
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: '#64748b', fontSize: 14 }}>Nenhuma violação ativa</p>
          )}
        </div>
      </div>

      <div className="section">
        <h2 style={{ marginBottom: 16 }}>Atividade do Agente</h2>
        {data?.recentLogs?.map(log => {
          let details = {};
          try { details = JSON.parse(log.details); } catch {}
          return (
            <div key={log.id} className="log-entry">
              <div className="log-action">{log.action}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {details && details.taskId && `Tarefa: ${details.taskId}`}
                {details && details.memberId && ` → ${details.memberName || details.memberId}`}
                {details && details.reason && ` — ${details.reason}`}
              </div>
              <div className="log-time">{new Date(log.created_at).toLocaleString('pt-BR')}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colorMap = {
    info: 'info', warning: 'warning', danger: 'danger', success: 'success'
  };
  return (
    <div className={`stat-card ${colorMap[color] || ''}`}>
      <h3>{label}</h3>
      <div className="value">{value}</div>
    </div>
  );
}
