const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const db = new sqlite3.Database('./launches.db');

//CREAR TABLA CON TODO
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS launches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    date TEXT NOT NULL,
    market TEXT NOT NULL,
    status TEXT DEFAULT 'Draft',
    created_by TEXT DEFAULT 'creator',
    assets TEXT DEFAULT '',
    image TEXT DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    launch_id INTEGER,
    old_status TEXT,
    new_status TEXT,
    changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(launch_id) REFERENCES launches(id)
  )`);
});

//SEED DE DATOS PARA VER
db.get("SELECT COUNT(*) as count FROM launches", (err, row) => {
  if (!err && row && row.count === 0) {
    const sample = [
      ['Adidas Ultraboost 2026', 'The most comfortable running shoe', '2026-08-15', 'Colombia', 'Approved', 'ultraboost.jpg', ''],
      ['Adidas Campus 2026', 'Classic street style', '2026-09-01', 'USA', 'In Review', 'campus.mp4', ''],
      ['Adidas Stan Smith', 'Iconic tennis shoe', '2026-10-20', 'Europa', 'Draft', 'stan-smith.png', ''],
      ['Adidas Superstar', 'Legendary shell-toe sneaker', '2026-11-05', 'México', 'Published', 'superstar.jpg', ''],
      ['Adidas Gazelle', 'Retro style for everyday', '2026-12-10', 'Brasil', 'Draft', 'gazelle.png', '']
    ];
    const insert = db.prepare('INSERT INTO launches (name, description, date, market, status, assets, image) VALUES (?,?,?,?,?,?,?)');
    sample.forEach(s => insert.run(s));
    insert.finalize();
    console.log('Datos de ejemplo cargados (con descripción)');
  }
});

//RUTAS

// GET - Listar lanzamientos
app.get('/api/launches', (req, res) => {
  const { market, status, date } = req.query;
  let sql = 'SELECT * FROM launches WHERE 1=1';
  const params = [];
  if (market) { sql += ' AND market LIKE ?'; params.push(`%${market}%`); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (date) { sql += ' AND date = ?'; params.push(date); }
  
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET - Historial
app.get('/api/launches/:id/history', (req, res) => {
  db.all(
    'SELECT * FROM status_history WHERE launch_id = ? ORDER BY changed_at DESC',
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// POST - Crear lanzamiento (CON LOGS)
app.post('/api/launches', (req, res) => {
  console.log('📥 Datos recibidos en POST:');
  console.log('  name:', req.body.name);
  console.log('  description:', req.body.description);
  console.log('  date:', req.body.date);
  console.log('  market:', req.body.market);
  console.log('  assets:', req.body.assets);
  console.log('  image:', req.body.image ? '✅ TIENE IMAGEN' : '❌ SIN IMAGEN');
  
  const { name, description, date, market, assets, image } = req.body;
  
  if (!name || !date || !market) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  
  db.run(
    'INSERT INTO launches (name, description, date, market, assets, image) VALUES (?,?,?,?,?,?)',
    [name, description || '', date, market, assets || '', image || ''],
    function(err) {
      if (err) {
        console.error('❌ Error en INSERT:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log('✅ Lanzamiento creado con ID:', this.lastID);
      res.json({ id: this.lastID, message: 'Creado' });
    }
  );
});

// PUT - Actualizar lanzamiento
app.put('/api/launches/:id', (req, res) => {
  console.log('📥 Datos recibidos en PUT:');
  console.log('  description:', req.body.description);
  console.log('  image:', req.body.image ? '✅ TIENE IMAGEN' : '❌ SIN IMAGEN');
  
  const { name, description, date, market, assets, image } = req.body;
  db.run(
    'UPDATE launches SET name=?, description=?, date=?, market=?, assets=?, image=? WHERE id=?',
    [name, description || '', date, market, assets || '', image || '', req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'No encontrado' });
      res.json({ updated: this.changes });
    }
  );
});

// DELETE - Eliminar
app.delete('/api/launches/:id', (req, res) => {
  db.get('SELECT status FROM launches WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    if (row.status === 'Published') {
      return res.status(403).json({ error: 'No se puede eliminar un lanzamiento publicado' });
    }
    
    db.run('DELETE FROM launches WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes });
    });
  });
});

// PUT - Cambiar estado (con historial)
app.put('/api/launches/:id/status', (req, res) => {
  const { status, user_role } = req.body;
  
  db.get('SELECT status FROM launches WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    
    const currentStatus = row.status;
    const targetStatus = status;
    
    // CREADOR: que solo pueda enviar a revisar (Draft → In Review)
    if (user_role === 'creator' || user_role === 'creador') {
      if (currentStatus === 'Draft' && targetStatus === 'In Review') {
        // Permitido
      } else {
        return res.status(403).json({ 
          error: `❌ Los creadores solo pueden enviar a revisión (Draft → In Review). Estado actual: ${currentStatus}` 
        });
      }
    } 
    // APROBADOR: puede aprobar y publicar
    else if (user_role === 'approver' || user_role === 'aprobador') {
      const allowed = { 
        'In Review': ['Approved'], 
        'Approved': ['Published'] 
      };
      if (!allowed[currentStatus]?.includes(targetStatus)) {
        return res.status(400).json({ 
          error: `❌ No puedes pasar de "${currentStatus}" a "${targetStatus}"` 
        });
      }
    } 
    else {
      return res.status(403).json({ 
        error: '❌ Rol no autorizado para cambiar estados' 
      });
    }
    
    // Actualizar estado y guardar historial
    db.run('UPDATE launches SET status = ? WHERE id = ?', [targetStatus, req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.run(
        'INSERT INTO status_history (launch_id, old_status, new_status) VALUES (?,?,?)',
        [req.params.id, currentStatus, targetStatus]
      );
      
      res.json({ success: true, new_status: targetStatus });
    });
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend funcionando' });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend en http://localhost:${PORT}`);
  console.log(`Base de datos: launches.db`);
});