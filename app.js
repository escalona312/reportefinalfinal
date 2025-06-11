require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql');
const session = require('express-session');

const app = express();
const port = 3000;

// Configuración sesión
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));

// Conexión a la base de datos
let connection;

function handleDisconnect() {
    connection = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    connection.connect(function(err) {
        if (err) {
            console.error('Error al conectar a la base de datos:', err);
            setTimeout(handleDisconnect, 2000); // Reintenta después de 2 segundos
        } else {
            console.log('Conectado a la base de datos MySQL');
        }
    });

    connection.on('error', function(err) {
        console.error('DB error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

handleDisconnect();

// Middleware para archivos estáticos y parseo de formularios
app.use(express.static(path.join(__dirname, 'pagina_principal')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Middleware para proteger rutas
function authMiddleware(req, res, next) {
    if (req.session && req.session.user === 'root') {
        next();
    } else {
        // Si es una petición AJAX (fetch), responde con 401 para que el frontend maneje redirección
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(401).json({ error: 'No autorizado' });
        }
        // Si es petición normal, redirige a login
        res.redirect('/login.html');
    }
}

// Ruta para login POST
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'root' && password === '123') {
        req.session.user = 'root';
        res.redirect('/admin/reportes');
    } else {
        res.send('<h2>Usuario o contraseña incorrectos</h2><a href="/login.html">Volver al login</a>');
    }
});

// Ruta para logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// Ruta para guardar un nuevo reporte
app.post('/guardar_reporte', (req, res) => {
    const { tipo, ubicacion, descripcion, urgencia, nombre, correo } = req.body;
    const sql = `
        INSERT INTO REPORTES 
        (tipo, ubicacion, descripcion, urgencia, nombre, correo) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    connection.query(sql, [tipo, ubicacion, descripcion, urgencia, nombre, correo], (err, result) => {
        if (err) {
            console.error('Error al guardar el reporte:', err);
            return res.status(500).send('Error al guardar el reporte');
        }
        console.log('Reporte guardado en la base de datos');
        res.redirect('/');
    });
});
app.get('/reportes/json', (req, res) => {
    connection.query('SELECT * FROM REPORTES', (err, results) => {
        if (err) {
            console.error('Error al obtener reportes:', err);
            return res.status(500).json({ error: 'Error al obtener reportes' });
        }
        res.json(results);
    });
});


// Página principal protegida con reportes (solo para usuario root)
app.get('/admin/reportes', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'pagina_principal', 'reportes.html'));
});

// Obtener reportes en JSON (protegido)
app.get('/admin/reportes/json', authMiddleware, (req, res) => {
    connection.query('SELECT * FROM REPORTES', (err, results) => {
        if (err) {
            console.error('Error al obtener reportes:', err);
            return res.status(500).json({ error: 'Error al obtener reportes' });
        }
        res.json(results);
    });
});

// Editar reporte (solo descripción) - protegido
app.post('/admin/reportes/editar', authMiddleware, (req, res) => {
    const { id, descripcion } = req.body;
    const sql = 'UPDATE REPORTES SET descripcion = ? WHERE id = ?';
    connection.query(sql, [descripcion, id], (err, result) => {
        if (err) {
            console.error('Error al actualizar reporte:', err);
            return res.status(500).json({ error: 'Error al actualizar reporte' });
        }
        res.json({ mensaje: 'Reporte actualizado' });
    });
});

// Servir login.html
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'pagina_principal', 'login.html'));
});

// Página principal (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pagina_principal', 'index.html'));
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});
// Eliminar reporte
app.delete('/admin/reportes/eliminar', authMiddleware, (req, res) => {
    const { id } = req.body;
    const sql = 'DELETE FROM REPORTES WHERE id = ?';
    connection.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar reporte:', err);
            return res.status(500).json({ error: 'Error al eliminar reporte' });
        }
        res.json({ mensaje: 'Reporte eliminado' });
    });
});

// Marcar reporte como resuelto
app.post('/admin/reportes/resuelto', authMiddleware, (req, res) => {
    const { id } = req.body;
    const sql = 'UPDATE REPORTES SET estado = "Resuelto" WHERE id = ?';
    connection.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error al marcar como resuelto:', err);
            return res.status(500).json({ error: 'Error al marcar como resuelto' });
        }
        res.json({ mensaje: 'Reporte marcado como resuelto' });
    });
});

// Bloquear acceso directo a reportes.html
app.get('/pagina_principal/reportes.html', (req, res) => {
    res.redirect('/login.html');
});
