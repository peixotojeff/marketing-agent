import React, { useState, useEffect } from 'react';
import { dashboardAPI } from '../api';

export default function BottleneckAnalysis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await dashboardAPI.getBottlenecks();
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (loading) return <div className="loading">Carregando análise de gargalos...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Análise de Gargalos</h1>

      {/* Overloaded Members */}
      <div className="section">
        <div className="section-header">
          <h2>Membros Sobrecarregados</h2>
          <span className="badge badge-red">{data?.overloadedMembers?.length || 0} membros</span>
        </div>

        {data?.overloadedMembers?.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Membro</th>
                <th>Departamento</th>
                <th>Tarefas Atuais</th>
                <th>Capacidade Máxima</th>
                <th>Utilização</th>
              </tr>
            </thead>
            <tbody>
              {data.overloadedMembers.map(m => {
                const pct = Math.round((m.current_tasks / m.max_capacity) * 100);
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{m.name}</td>
                    <td><span className="badge badge-purple">{m.department}</span></td>
                    <td>{m.current_tasks}</td>
                    <td>{m.max_capacity}</td>
                    <td>
                      <div className="progress-bar">
                        <div className="progress-fill red" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{pct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>Nenhum membro sobrecarregado</p>
        )}
      </div>

      {/* Bottleneck Departments */}
      <div className="section">
        <div className="section-header">
          <h2>Departamentos com Acúmulo</h2>
        </div>

        {data?.bottleneckDepartments?.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Departamento</th>
                <th>Não Atribuídas</th>
                <th>Total Ativas</th>
                <th>Atrasadas</th>
              </tr>
            </thead>
            <tbody>
              {data.bottleneckDepartments.map(d => (
                <tr key={d.department}>
                  <td><span className="badge badge-purple">{d.department}</span></td>
                  <td>
                    {d.unassigned > 0 ? (
                      <span className="badge badge-yellow">{d.unassigned} pendentes</span>
                    ) : (
                      <span className="badge badge-green">Todas atribuídas</span>
                    )}
                  </td>
                  <td>{d.total}</td>
                  <td>
                    {d.overdue > 0 ? (
                      <span className="badge badge-red">{d.overdue} atrasadas</span>
                    ) : (
                      <span className="badge badge-green">No prazo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>Nenhum gargalo identificado</p>
        )}
      </div>

      {/* Assignment Trend */}
      <div className="section">
        <div className="section-header">
          <h2>Tendência de Atribuições (Últimos 7 dias)</h2>
        </div>

        {data?.assignmentTrend?.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150, padding: '0 10px' }}>
            {data.assignmentTrend.map(d => {
              const max = Math.max(...data.assignmentTrend.map(t => t.assignments));
              const height = Math.max(10, Math.round((d.assignments / max) * 120));
              return (
                <div key={d.day} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{d.assignments}</div>
                  <div
                    style={{
                      height: `${height}px`,
                      background: 'linear-gradient(to top, #7c3aed, #a78bfa)',
                      borderRadius: '4px 4px 0 0',
                      minHeight: 10
                    }}
                  />
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
                    {new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>Sem dados de atribuições recentes</p>
        )}
      </div>
    </div>
  );
}
