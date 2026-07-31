import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { useDropzone } from 'react-dropzone';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './App.css';

// Importar las imagenes de assets
import logoAdidas from './assets/logo-adidas.png';
import logoAdidasWhite from './assets/logo-adidas-white.png';
import iconCreator from './assets/icon-creator.png';
import iconApprover from './assets/icon-approver.png';
import iconDraft from './assets/icon-draft.png';
import iconReview from './assets/icon-review.png';
import iconApproved from './assets/icon-approved.png';
import iconPublished from './assets/icon-published.png';

const localizer = momentLocalizer(moment);
const API_URL = 'http://localhost:5000/api';

// Funcion para comprimir imagens
const compressImage = (file, maxWidth = 600, quality = 0.7) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Comprimir como JPEG con calidad reducida
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

function App() {
  // ESTADOS
  const [launches, setLaunches] = useState([]);
  const [view, setView] = useState('list');
  const [userRole, setUserRole] = useState('creator');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ 
    name: '', 
    description: '',
    date: '', 
    market: '', 
    assets: '',
    image: null
  });
  const [filters, setFilters] = useState({ market: '', status: '', date: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [historyVisible, setHistoryVisible] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState('month');
  const [reviewModal, setReviewModal] = useState(null);
  const [uploading, setUploading] = useState(false);

  // NOTIFICACIONES 
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // DROPZONE
  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': [] },
    onDrop: (acceptedFiles) => {
      setForm({ ...form, image: acceptedFiles[0] });
    },
    maxFiles: 1
  });

  // CRUD 
  const fetchLaunches = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(filters);
      const res = await axios.get(`${API_URL}/launches?${params}`);
      setLaunches(res.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLaunches();
  }, [filters]);

  const filteredLaunches = launches.filter(launch =>
    launch.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    launch.market?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    launch.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // HANDLE SUBMIT CON COMPRESION
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.date || !form.market) {
      showNotification('Please fill all fields', 'error');
      return;
    }

    setUploading(true);

    try {
      let imageData = '';
      
      // Comprimir imagen si existe
      if (form.image) {
        try {
          imageData = await compressImage(form.image, 500, 0.6);
          console.log('✅ Imagen comprimida correctamente');
        } catch (err) {
          console.error('Error comprimiendo imagen:', err);
          showNotification('⚠️ Error processing image, using without it', 'error');
        }
      }

      const formData = {
        name: form.name,
        description: form.description || '',
        date: form.date,
        market: form.market,
        assets: form.assets || '',
        image: imageData
      };

      if (editingId) {
        await axios.put(`${API_URL}/launches/${editingId}`, formData);
        showNotification('✅ Launch updated successfully');
      } else {
        await axios.post(`${API_URL}/launches`, formData);
        showNotification('✅ Launch created successfully');
      }
      
      resetForm();
      fetchLaunches();
    } catch (error) {
      console.error('Error:', error);
      if (error.response?.status === 413) {
        showNotification('❌ Image too large. Please use a smaller image (under 200KB)', 'error');
      } else {
        showNotification('❌ Error: ' + (error.response?.data?.error || error.message), 'error');
      }
    } finally {
      setUploading(false);
    }
  };

  const sendLaunchData = async (data) => {
    try {
      if (editingId) {
        await axios.put(`${API_URL}/launches/${editingId}`, data);
        showNotification('✅ Launch updated successfully');
      } else {
        await axios.post(`${API_URL}/launches`, data);
        showNotification('✅ Launch created successfully');
      }
      resetForm();
      fetchLaunches();
    } catch (error) {
      showNotification('❌ Error: ' + error.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this launch?')) return;
    try {
      await axios.delete(`${API_URL}/launches/${id}`);
      showNotification('🗑️ Launch deleted');
      fetchLaunches();
    } catch (error) {
      showNotification('❌ ' + error.response?.data?.error || 'Error deleting', 'error');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const roleForBackend = userRole === 'approver' ? 'approver' : 'creator';
      await axios.put(`${API_URL}/launches/${id}/status`, {
        status: newStatus,
        user_role: roleForBackend
      });
      showNotification(`✅ Status changed to "${newStatus}"`);
      fetchLaunches();
      setReviewModal(null);
    } catch (error) {
      showNotification('❌ ' + error.response?.data?.error || 'Error changing status', 'error');
    }
  };

  const viewHistory = async (id) => {
    try {
      if (historyVisible === id) {
        setHistoryVisible(null);
        return;
      }
      const res = await axios.get(`${API_URL}/launches/${id}/history`);
      setHistoryData(res.data);
      setHistoryVisible(id);
    } catch (error) {
      showNotification('❌ Error loading history', 'error');
    }
  };

  const handleEdit = (launch) => {
    setEditingId(launch.id);
    setForm({
      name: launch.name,
      description: launch.description || '',
      date: launch.date,
      market: launch.market,
      assets: launch.assets || '',
      image: null
    });
    window.scrollTo(0, 0);
  };

  const resetForm = () => {
    setForm({ 
      name: '', 
      description: '',
      date: '', 
      market: '', 
      assets: '',
      image: null
    });
    setEditingId(null);
  };

  const openReviewModal = (launch) => {
    setReviewModal(launch);
  };

  // COLORES
  const getStatusColor = (status) => {
    const colors = {
      'Draft': '#9CA3AF',
      'In Review': '#F59E0B',
      'Approved': '#10B981',
      'Published': '#3B82F6'
    };
    return colors[status] || '#6B7280';
  };

  const getStatusColorForCalendar = (status) => {
    const colors = {
      'Draft': '#9CA3AF',
      'In Review': '#F59E0B',
      'Approved': '#10B981',
      'Published': '#3B82F6'
    };
    return colors[status] || '#6B7280';
  };

  const getStatusIcon = (status) => {
    const icons = {
      'Draft': iconDraft,
      'In Review': iconReview,
      'Approved': iconApproved,
      'Published': iconPublished
    };
    return icons[status] || iconDraft;
  };

  // EVENTOS DEL CALENDARIO 
  const calendarEvents = filteredLaunches
    .filter(l => l && l.date)
    .map(l => {
      const date = new Date(l.date);
      const validDate = isNaN(date.getTime()) ? new Date() : date;
      return {
        title: l.name || 'Sin nombre',
        start: validDate,
        end: validDate,
        resource: l,
        status: l.status,
        style: {
          backgroundColor: getStatusColorForCalendar(l.status),
          borderColor: getStatusColorForCalendar(l.status),
          borderRadius: '6px',
          padding: '4px 8px',
          fontSize: '13px',
          fontWeight: '600',
          color: 'white'
        }
      };
    });

  // JSX 
  return (
    <div className={`app ${userRole === 'creator' ? 'role-creator' : 'role-approver'}`}>
      {/* HEADER */}
      <header className={`header ${userRole === 'creator' ? 'header-creator' : 'header-approver'}`}>
        <div className="header-content">
          <div className="logo-section">
            <img 
              src={userRole === 'creator' ? logoAdidas : logoAdidasWhite} 
              alt="Adidas" 
              className="logo-img" 
            />
            <div>
              <h1 className="text-white">Launch Manager</h1>
              <p className="subtitle text-white-light">Product Launch Management Platform</p>
            </div>
          </div>
          <div className="role-selector">
            <div className={`role-badge ${userRole === 'creator' ? 'badge-creator' : 'badge-approver'}`}>
              <img src={userRole === 'creator' ? iconCreator : iconApprover} alt="Role" className="role-icon" />
              <span>{userRole === 'creator' ? 'Creator' : 'Approver'}</span>
            </div>
            <select value={userRole} onChange={(e) => setUserRole(e.target.value)}
              className={userRole === 'creator' ? 'select-creator' : 'select-approver'}>
              <option value="creator">Creator</option>
              <option value="approver">Approver</option>
            </select>
          </div>
        </div>
      </header>

      {/* STATS */}
      <div className="stats-grid">
        <div className="stat-card"><span className="stat-number">{filteredLaunches.length}</span><span className="stat-label">Total</span></div>
        <div className="stat-card">
          <span className="stat-number">{filteredLaunches.filter(l => l.status === 'Draft').length}</span>
          <span className="stat-label"><img src={iconDraft} alt="Draft" className="stat-icon" /> Draft</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{filteredLaunches.filter(l => l.status === 'In Review').length}</span>
          <span className="stat-label"><img src={iconReview} alt="Review" className="stat-icon" /> In Review</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{filteredLaunches.filter(l => l.status === 'Approved').length}</span>
          <span className="stat-label"><img src={iconApproved} alt="Approved" className="stat-icon" /> Approved</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{filteredLaunches.filter(l => l.status === 'Published').length}</span>
          <span className="stat-label"><img src={iconPublished} alt="Published" className="stat-icon" /> Published</span>
        </div>
      </div>

      {/* FILTROS */}
      <div className="filters">
        <input type="text" placeholder="🔍 Search by name, market or description..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input-filter" />
        <select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})}>
          <option value="">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="In Review">In Review</option>
          <option value="Approved">Approved</option>
          <option value="Published">Published</option>
        </select>
        <input type="date" value={filters.date} onChange={(e) => setFilters({...filters, date: e.target.value})} />
        <button className="btn-secondary" onClick={() => { setFilters({ market: '', status: '', date: '' }); setSearchTerm(''); }}>
          Clear Filters
        </button>
      </div>

      {/* VIEW TOGGLE */}
      <div className="view-toggle">
        <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>📋 List</button>
        <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>📅 Calendar</button>
      </div>

      {/* FORMULARIO */}
      {userRole === 'creator' && (
        <div className="form-container">
          <h2>{editingId ? '✏️ Edit Launch' : '➕ Create New Launch'}</h2>
          <form onSubmit={handleSubmit}>
            <input type="text" placeholder="Product name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
            <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} required />
            <input type="text" placeholder="Market (e.g., Colombia, USA)" value={form.market} onChange={(e) => setForm({...form, market: e.target.value})} required />
            
            <textarea 
              placeholder="Product description"
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
              rows="3"
              className="textarea-field"
              style={{ gridColumn: '1 / -1' }}
            />
            
            <div {...getRootProps()} className="dropzone" style={{ gridColumn: '1 / -1', border: '2px dashed #6C3CE1', borderRadius: '12px', padding: '20px', textAlign: 'center', cursor: 'pointer', background: '#f8f9fa' }}>
              <input {...getInputProps()} />
              {form.image ? (
                <div>
                  <img src={URL.createObjectURL(form.image)} alt="Preview" style={{ maxHeight: '150px', borderRadius: '8px' }} />
                  <p style={{ marginTop: '8px', fontSize: '14px', color: '#6C3CE1' }}>✅ Image selected ({Math.round(form.image.size / 1024)} KB)</p>
                </div>
              ) : (
                <p>📸 Drag & drop an image here, or click to select (max 500KB recommended)</p>
              )}
            </div>
            {form.image && (
              <button type="button" className="btn-secondary" onClick={() => setForm({...form, image: null})} style={{ gridColumn: '1 / -1' }}>
                ❌ Remove image
              </button>
            )}
            
            <input type="text" placeholder="Assets (e.g., video.mp4, image.jpg)" value={form.assets} onChange={(e) => setForm({...form, assets: e.target.value})} />
            <div className="form-buttons">
              <button type="submit" className="btn-primary" disabled={uploading}>
                {uploading ? '⏳ Uploading...' : (editingId ? '💾 Update' : '➕ Create')}
              </button>
              {editingId && <button type="button" className="btn-secondary" onClick={resetForm}>❌ Cancel</button>}
            </div>
          </form>
        </div>
      )}

      {userRole === 'approver' && (
        <div className="approver-message"><p>🔍 <strong>Review Mode</strong> - You can approve or reject launches</p></div>
      )}

      {/* LOADING */}
      {loading ? (
        <div className="spinner-container"><div className="spinner"></div></div>
      ) : (
        <>
          {/* VISTA LISTA */}
          {view === 'list' && (
            <div className="launches-list">
              <h2>📋 Launches ({filteredLaunches.length})</h2>
              {filteredLaunches.length === 0 ? (
                <p className="empty-message">No launches found. Create one!</p>
              ) : (
                filteredLaunches.map(launch => (
                  <div key={launch.id} className="launch-card">
                    <div className="launch-header">
                      <h3>{launch.name}</h3>
                      <span className="status-badge" style={{ backgroundColor: getStatusColor(launch.status) }}>
                        <img src={getStatusIcon(launch.status)} alt={launch.status} className="status-icon" />
                        {launch.status}
                      </span>
                    </div>
                    <div className="launch-info">
                      <p>📅 {new Date(launch.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      <p>🌍 {launch.market}</p>
                      {launch.description && <p>📝 {launch.description}</p>}
                      {launch.assets && <p>📎 {launch.assets}</p>}
                      {launch.image && <p>🖼️ Has image</p>}
                    </div>
                    <div className="launch-actions">
                      {userRole === 'creator' && (
                        <>
                          <button className="btn-edit" onClick={() => handleEdit(launch)}>✏️ Edit</button>
                          <button className="btn-delete" onClick={() => handleDelete(launch.id)}>🗑️ Delete</button>
                          {launch.status === 'Draft' && (
                            <button 
                              className="btn-send-review" 
                              onClick={() => handleStatusChange(launch.id, 'In Review')}
                            >
                              📤 Send to Review
                            </button>
                          )}
                          {launch.status === 'In Review' && (
                            <span className="info-text">⏳ Waiting for approver</span>
                          )}
                          {launch.status === 'Approved' && (
                            <span className="info-text">✅ Approved - Ready for publication</span>
                          )}
                          {launch.status === 'Published' && (
                            <span className="info-text">🚀 Published</span>
                          )}
                        </>
                      )}

                      {userRole === 'approver' && (
                        <>
                          {launch.status === 'In Review' && (
                            <button 
                              className="btn-status" 
                              onClick={() => openReviewModal(launch)}
                              style={{ background: '#8B5CF6' }}
                            >
                              👁️ Review
                            </button>
                          )}
                          {launch.status === 'Approved' && (
                            <button 
                              className="btn-status" 
                              onClick={() => handleStatusChange(launch.id, 'Published')}
                              style={{ background: '#3B82F6' }}
                            >
                              🚀 Publish
                            </button>
                          )}
                          {launch.status === 'Draft' && (
                            <span className="info-text">📝 Waiting for creator to send for review</span>
                          )}
                          {launch.status === 'Published' && (
                            <span className="info-text">🚀 Published</span>
                          )}
                        </>
                      )}

                      <button className="btn-history" onClick={() => viewHistory(launch.id)}>📜 History</button>
                    </div>

                    {historyVisible === launch.id && (
                      <div className="history-container">
                        <h4>📜 Status History</h4>
                        {historyData.length === 0 ? (
                          <p>No history yet</p>
                        ) : (
                          <ul>
                            {historyData.map(h => {
                              const date = new Date(h.changed_at);
                              date.setHours(date.getHours() - 5);
                              const formattedDate = date.toLocaleString('es-CO', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              });
                              return (
                                <li key={h.id}>
                                  {h.old_status} → {h.new_status}
                                  <span className="history-date">{formattedDate}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* VISTA CALENDARIO */}
          {view === 'calendar' && (
            <div className="calendar-container">
              <h2>📅 Launch Calendar</h2>
              <div className="calendar-legend">
                <div className="legend-item"><span className="legend-color" style={{ background: '#9CA3AF' }}></span><span>Draft</span></div>
                <div className="legend-item"><span className="legend-color" style={{ background: '#F59E0B' }}></span><span>In Review</span></div>
                <div className="legend-item"><span className="legend-color" style={{ background: '#10B981' }}></span><span>Approved</span></div>
                <div className="legend-item"><span className="legend-color" style={{ background: '#3B82F6' }}></span><span>Published</span></div>
              </div>
              {calendarEvents.length === 0 ? (
                <div className="empty-message"><p>📭 No launches to display in calendar</p></div>
              ) : (
                <div style={{ height: '550px' }}>
                  <Calendar
                    localizer={localizer}
                    events={calendarEvents}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: 550 }}
                    popup
                    views={['month', 'week', 'day']}
                    view={calendarView}
                    onView={(view) => setCalendarView(view)}
                    defaultView="month"
                    date={calendarDate}
                    onNavigate={(date) => setCalendarDate(date)}
                    toolbar={true}
                    eventPropGetter={(event) => ({
                      style: event.style || {
                        backgroundColor: '#6B7280',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'white',
                        border: 'none'
                      }
                    })}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL DE REVISIÓN */}
      {reviewModal && (
        <div className="modal-overlay" onClick={() => setReviewModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setReviewModal(null)}>✕</button>
            
            <h2>📋 Review Launch</h2>
            
            <div className="modal-image">
              {reviewModal.image ? (
                <img src={reviewModal.image} alt={reviewModal.name} />
              ) : (
                <div className="modal-image-placeholder">📸 No image</div>
              )}
            </div>
            
            <div className="modal-details">
              <h3>{reviewModal.name}</h3>
              <p><strong>📝 Description:</strong> {reviewModal.description || 'No description'}</p>
              <p><strong>📅 Date:</strong> {new Date(reviewModal.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p><strong>🌍 Market:</strong> {reviewModal.market}</p>
              <p><strong>📎 Assets:</strong> {reviewModal.assets || 'No assets'}</p>
              <p><strong>📊 Status:</strong> <span className="status-badge" style={{ backgroundColor: getStatusColor(reviewModal.status) }}>{reviewModal.status}</span></p>
            </div>
            
            <div className="modal-actions">
              <button 
                className="btn-status" 
                onClick={() => handleStatusChange(reviewModal.id, 'Approved')}
                style={{ background: '#10B981', padding: '12px 30px', fontSize: '16px' }}
              >
                ✅ Approve
              </button>
              <button 
                className="btn-delete" 
                onClick={() => setReviewModal(null)}
                style={{ padding: '12px 30px', fontSize: '16px' }}
              >
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer"><p>© 2026 enGlobe_Connect • Built with ❤️ for the Product Launch Challenge</p></footer>

      {/* NOTIFICACIONES */}
      {notification && (
        <div className={`notification notification-${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}

export default App;